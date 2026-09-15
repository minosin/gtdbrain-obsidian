import type { ApiCard, Board } from '../api/board';
import { archiveCard, createCard, fetchBoard, moveCard, updateCard } from '../api/board';
import { ApiError, type ClientContext } from '../api/client';
import { ARCHIVE_FOLDER, buildLayout, contextIdFor, contextLabelFor, kindForColumn, type Layout, ROLE_FOLDERS, sortedColumns, wikilinkTarget } from '../vault/layout';
import { type CardFields, normalizeBody, renderNote } from '../vault/notes';
import { overviewsFor, weeklyReviewNote } from '../vault/overviews';
import { basenameMatches, isArchiveFolder, type LocalNote, planPush, type Snapshot, snapshotEntryFor, targetFor } from './plan';

// The few vault operations the sync needs, so the engine runs against Obsidian and
// against an in-memory vault in tests.
export interface VaultAdapter {
	exists(path: string): boolean;
	ensureFolder(path: string): Promise<void>;
	/** Every Markdown note below the root's subfolders (not the root itself), parsed. */
	listCardNotes(root: string): Promise<LocalNote[]>;
	create(path: string, content: string): Promise<void>;
	rename(path: string, newPath: string): Promise<void>;
	/** Rewrites the card frontmatter keys (keeping the user's other properties) and/or the body. */
	writeCard(path: string, fields: CardFields | null, body: string | null): Promise<void>;
	/** Creates or replaces a generated note, only touching the file when the content differs. */
	writeGenerated(path: string, content: string): Promise<void>;
	trash(path: string): Promise<void>;
}

export type SyncOptions = {
	root: string;
	keepArchived: boolean;
};

export type SyncResult = {
	snapshot: Snapshot;
	pushed: number;
	pulled: number;
	warnings: string[];
	errors: string[];
};

export class SignedOutError extends Error {}

export async function ensureScaffold(vault: VaultAdapter, root: string, board: Board | null): Promise<string[]> {
	const folders = board
		? sortedColumns(board.columns).map((c) => buildLayout(root, board.columns, board.cards, board.contexts ?? []).folderByColumn.get(c.id)!)
		: Object.values(ROLE_FOLDERS).map((name) => `${root}/${name}`);
	await vault.ensureFolder(root);
	for (const f of folders) await vault.ensureFolder(f);
	await vault.ensureFolder(`${root}/${ARCHIVE_FOLDER}`);
	const review = weeklyReviewNote(root);
	if (!vault.exists(review.path)) await vault.create(review.path, review.content);
	return folders;
}

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

function isSignedOut(e: unknown): boolean {
	return e instanceof ApiError && e.status === 401;
}

export async function runSync(ctx: ClientContext, vault: VaultAdapter, opts: SyncOptions, snapshot: Snapshot): Promise<SyncResult> {
	const warnings: string[] = [];
	const errors: string[] = [];
	let board: Board;
	try {
		board = await fetchBoard(ctx);
	} catch (e) {
		if (isSignedOut(e)) throw new SignedOutError();
		throw e;
	}
	let layout = buildLayout(opts.root, board.columns, board.cards, board.contexts ?? []);
	await ensureScaffold(vault, opts.root, board);

	const locals = await vault.listCardNotes(opts.root);

	// ── Push: what changed in the vault since the last sync ──
	const plan = planPush(layout, locals, snapshot);
	warnings.push(...plan.warnings);
	let pushed = 0;
	const freshIds = new Set<string>();
	for (const op of plan.ops) {
		try {
			switch (op.type) {
				case 'create': {
					const created = await createCard(ctx, {
						title: op.note.basename,
						columnId: op.columnId,
						kind: op.kind,
						...(op.notes ? { notes: op.notes } : {}),
						...(op.context ? { context: op.context } : {}),
						...(op.who ? { who: op.who } : {}),
						...(op.since ? { since: op.since } : {}),
					});
					op.note.id = created.id;
					freshIds.add(created.id);
					if (op.projectId) await updateCard(ctx, created.id, { projectId: op.projectId });
					break;
				}
				case 'patch':
					await updateCard(ctx, op.id, op.patch);
					break;
				case 'move':
					await moveCard(ctx, op.id, op.toColumnId);
					break;
				case 'archive':
					await archiveCard(ctx, op.id);
					break;
			}
			pushed++;
		} catch (e) {
			if (isSignedOut(e)) throw new SignedOutError();
			const where = op.type === 'create' ? op.note.path : op.path ?? op.id;
			errors.push(`${op.type} failed for ${where}: ${errorMessage(e)}`);
		}
	}

	if (plan.ops.length > 0) {
		board = await fetchBoard(ctx);
		layout = buildLayout(opts.root, board.columns, board.cards, board.contexts ?? []);
	}

	// ── Pull: make the vault match the board ──
	const noteById = new Map<string, LocalNote>();
	for (const n of locals) if (n.id && !noteById.has(n.id)) noteById.set(n.id, n);
	const claimed = new Set<string>(locals.map((n) => n.path));
	const pathById = new Map<string, string>();
	let pulled = 0;

	const uniquePath = (folder: string, basename: string): string => {
		let candidate = `${folder}/${basename}.md`;
		let n = 2;
		while (claimed.has(candidate) || vault.exists(candidate)) candidate = `${folder}/${basename} (${n++}).md`;
		claimed.add(candidate);
		return candidate;
	};

	// Projects first so an action's `project:` link can point at the project's final note name.
	const cards = [...board.cards].sort((a, b) => (a.kind === 'project' ? 0 : 1) - (b.kind === 'project' ? 0 : 1));
	const archiveFolder = `${opts.root}/${ARCHIVE_FOLDER}`;

	for (const card of cards) {
		const note = noteById.get(card.id);
		try {
			if (card.archived) {
				if (!note) continue;
				if (isArchiveFolder(layout, note.folder)) {
					pathById.set(card.id, note.path);
					continue;
				}
				if (opts.keepArchived) {
					const target = uniquePath(archiveFolder, note.basename);
					claimed.delete(note.path);
					await vault.rename(note.path, target);
					note.path = target;
					note.folder = archiveFolder;
					pathById.set(card.id, target);
				} else {
					await vault.trash(note.path);
				}
				pulled++;
				continue;
			}

			const target = targetFor(card, layout);
			if (!target) {
				warnings.push(`No folder for column of "${card.title}"`);
				continue;
			}
			if (!note) {
				const path = uniquePath(target.folder, target.basename);
				await vault.create(path, renderNote(fieldsFor(card, layout, pathById), normalizeBody(card.notes)));
				pathById.set(card.id, path);
				pulled++;
				continue;
			}

			let changed = false;
			if (note.folder !== target.folder || !basenameMatches(note.basename, target.basename)) {
				const path = uniquePath(target.folder, target.basename);
				claimed.delete(note.path);
				await vault.rename(note.path, path);
				note.path = path;
				note.folder = target.folder;
				note.basename = path.split('/').pop()!.replace(/\.md$/, '');
				changed = true;
			}
			pathById.set(card.id, note.path);

			const fields = fieldsFor(card, layout, pathById);
			const fieldsDiffer =
				(contextIdFor(note.context, layout.contexts) ?? null) !== (card.context ?? null) ||
				(wikilinkTarget(note.project) ?? null) !== (wikilinkTarget(fields.project) ?? null) ||
				(note.who ?? null) !== (card.who ?? null) ||
				(note.since ?? null) !== (card.since ?? null) ||
				(note.list ?? null) !== fields.list ||
				freshIds.has(card.id);
			const bodyDiffers = normalizeBody(note.body) !== normalizeBody(card.notes);
			if (fieldsDiffer || bodyDiffers) {
				await vault.writeCard(note.path, fields, bodyDiffers ? normalizeBody(card.notes) : null);
				changed = true;
			}
			if (changed) pulled++;
		} catch (e) {
			errors.push(`Could not update the note for "${card.title}": ${errorMessage(e)}`);
		}
	}

	const overviews = overviewsFor(layout, pathById);
	for (const o of overviews) {
		try {
			await vault.writeGenerated(o.path, o.content);
		} catch (e) {
			errors.push(`Could not write ${o.path}: ${errorMessage(e)}`);
		}
	}

	const next: Snapshot = {};
	for (const card of board.cards) {
		const path = pathById.get(card.id);
		if (path) next[card.id] = snapshotEntryFor(card, path);
	}
	return { snapshot: next, pushed, pulled, warnings, errors };
}

export function fieldsFor(card: ApiCard, layout: Layout, pathById: Map<string, string>): CardFields {
	const folder = layout.folderByColumn.get(card.columnId) ?? '';
	const column = layout.columns.find((c) => c.id === card.columnId);
	const project = card.projectId ? layout.cardsById.get(card.projectId) : undefined;
	const projectPath = project ? pathById.get(project.id) : undefined;
	const projectName = projectPath ? projectPath.split('/').pop()!.replace(/\.md$/, '') : project?.title;
	return {
		id: card.id,
		list: folder.split('/').pop() ?? '',
		kind: column ? (card.kind ?? kindForColumn(column)) : card.kind,
		context: contextLabelFor(card.context, layout.contexts),
		project: projectName ? `[[${projectName}]]` : null,
		who: card.who ?? null,
		since: card.since ?? null,
	};
}
