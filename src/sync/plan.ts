import type { ApiCard, CardKind, CardPatch } from '../api/board';
import { ARCHIVE_FOLDER, contextIdFor, kindForColumn, type Layout, safeFileName, wikilinkTarget } from '../vault/layout';
import { normalizeBody } from '../vault/notes';

export type LocalNote = {
	path: string;
	folder: string;
	basename: string;
	id: string | null;
	list: string | null;
	context: string | null;
	project: string | null;
	who: string | null;
	since: string | null;
	body: string;
};

// What the note looked like right after the last sync, in board terms. The push diff
// compares the note against this, so only fields the user actually changed are sent.
export type SnapshotEntry = {
	path: string;
	title: string;
	notes: string;
	context: string | null;
	projectId: string | null;
	who: string | null;
	since: string | null;
	columnId: string;
	archived: boolean;
};
export type Snapshot = Record<string, SnapshotEntry>;

export type PushOp =
	| {
			type: 'create';
			note: LocalNote;
			columnId: string;
			kind: CardKind;
			notes: string;
			context: string | null;
			who: string | null;
			since: string | null;
			projectId: string | null;
	  }
	| { type: 'patch'; id: string; path: string; patch: CardPatch }
	| { type: 'move'; id: string; path: string; toColumnId: string }
	| { type: 'archive'; id: string; path: string | null };

export type PushPlan = { ops: PushOp[]; warnings: string[] };

export function isArchiveFolder(layout: Layout, folder: string): boolean {
	return folder === `${layout.root}/${ARCHIVE_FOLDER}` || folder.startsWith(`${layout.root}/${ARCHIVE_FOLDER}/`);
}

export function untitledIfEmpty(title: string): string {
	return safeFileName(title) || 'Untitled';
}

// Resolves a note's `project:` wikilink to a project card id: by a project note's file
// name first, then by project title on the board.
export function resolveProjectId(link: string | null, locals: LocalNote[], layout: Layout): string | null {
	const target = wikilinkTarget(link);
	if (!target) return null;
	const byNote = locals.find((n) => n.id && n.basename.toLowerCase() === target.toLowerCase() && layout.cardsById.get(n.id)?.kind === 'project');
	if (byNote?.id) return byNote.id;
	const byTitle = [...layout.cardsById.values()].find((c) => c.kind === 'project' && !c.archived && untitledIfEmpty(c.title).toLowerCase() === target.toLowerCase());
	return byTitle?.id ?? null;
}

export function planPush(layout: Layout, locals: LocalNote[], snapshot: Snapshot): PushPlan {
	const ops: PushOp[] = [];
	const warnings: string[] = [];
	const seenIds = new Set<string>();
	const noteById = new Map<string, LocalNote>();

	for (const note of locals) {
		if (!note.id || !layout.cardsById.has(note.id)) continue;
		if (seenIds.has(note.id)) {
			warnings.push(`Duplicate card note ignored: ${note.path}`);
			continue;
		}
		seenIds.add(note.id);
		noteById.set(note.id, note);
	}

	for (const note of locals) {
		const inArchive = isArchiveFolder(layout, note.folder);
		const column = layout.columnByFolder.get(note.folder);
		if (!inArchive && !column) continue; // not a list folder (overviews, user folders)

		const server = note.id ? layout.cardsById.get(note.id) : undefined;
		if (!note.id || !server) {
			if (inArchive) continue;
			if (note.id && !server) warnings.push(`Unknown card id in ${note.path}; created as a new card`);
			ops.push({
				type: 'create',
				note,
				columnId: column!.id,
				kind: kindForColumn(column!),
				notes: normalizeBody(note.body),
				context: contextIdFor(note.context, layout.contexts),
				who: note.who,
				since: note.since,
				projectId: column!.kind === 'next' ? resolveProjectId(note.project, locals, layout) : null,
			});
			continue;
		}
		if (noteById.get(note.id) !== note) continue; // a duplicate, warned above

		if (inArchive) {
			if (!server.archived) ops.push({ type: 'archive', id: note.id, path: note.path });
			continue;
		}
		if (server.archived) continue; // archived on the board: the pull moves the note

		const base = snapshot[note.id];
		if (!base) continue; // no last-sync state to diff against: the board wins this round

		const patch: CardPatch = {};
		if (note.basename !== untitledIfEmpty(base.title) && note.basename !== base.title) patch.title = note.basename;
		const body = normalizeBody(note.body);
		if (body !== normalizeBody(base.notes)) patch.notes = body || null;
		const context = contextIdFor(note.context, layout.contexts);
		if ((context ?? null) !== (base.context ?? null)) patch.context = context;
		if ((note.who ?? null) !== (base.who ?? null)) patch.who = note.who;
		if ((note.since ?? null) !== (base.since ?? null)) patch.since = note.since;
		const projectId = resolveProjectId(note.project, locals, layout);
		if ((projectId ?? null) !== (base.projectId ?? null) && server.kind === 'action') patch.projectId = projectId;
		if (Object.keys(patch).length > 0) ops.push({ type: 'patch', id: note.id, path: note.path, patch });
		if (column!.id !== base.columnId) ops.push({ type: 'move', id: note.id, path: note.path, toColumnId: column!.id });
	}

	// A card note that vanished from every list folder since the last sync was deleted
	// (or moved out of the GTD folder): archive it — nothing is ever deleted on the board.
	for (const [id, entry] of Object.entries(snapshot)) {
		if (entry.archived || noteById.has(id)) continue;
		const server = layout.cardsById.get(id);
		if (server && !server.archived) ops.push({ type: 'archive', id, path: null });
	}

	return { ops, warnings };
}

export function snapshotEntryFor(card: ApiCard, path: string): SnapshotEntry {
	return {
		path,
		title: card.title,
		notes: normalizeBody(card.notes),
		context: card.context ?? null,
		projectId: card.projectId ?? null,
		who: card.who ?? null,
		since: card.since ?? null,
		columnId: card.columnId,
		archived: !!card.archived,
	};
}

// Where a live card's note belongs and what it should be called; null for a card whose
// column has no folder (should not happen — every column gets one).
export function targetFor(card: ApiCard, layout: Layout): { folder: string; basename: string } | null {
	const folder = layout.folderByColumn.get(card.columnId);
	if (!folder) return null;
	return { folder, basename: untitledIfEmpty(card.title) };
}

// "Title", "Title (2)", … all count as the same title for rename purposes.
export function basenameMatches(basename: string, wanted: string): boolean {
	if (basename === wanted) return true;
	const m = /^(.*) \((\d+)\)$/.exec(basename);
	return !!m && m[1] === wanted;
}
