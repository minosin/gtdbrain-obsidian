import type { ApiCard, ApiColumn, ApiContext, CardKind } from '../api/board';

export type Role = 'inbox' | 'next' | 'projects' | 'waiting' | 'someday' | 'other';

// The five classic GTD lists get fixed folder names; any extra column the user added on
// the board gets a folder named after its label.
export const ROLE_FOLDERS: Record<Exclude<Role, 'other'>, string> = {
	inbox: 'Inbox',
	next: 'Next Actions',
	projects: 'Projects',
	waiting: 'Waiting For',
	someday: 'Someday Maybe',
};

export const ARCHIVE_FOLDER = 'Archive';
export const WEEKLY_REVIEW_NOTE = 'Weekly Review';

export function sortedColumns(columns: ApiColumn[]): ApiColumn[] {
	return [...columns].sort((a, b) => a.order - b.order);
}

// Mirrors the backend's findColumnByRole: inbox is the first normal column, waiting /
// someday are recognised by label among the flexible columns.
export function columnRole(col: ApiColumn, columns: ApiColumn[]): Role {
	const label = (col.label ?? '').toLowerCase();
	if (col.kind === 'next') return 'next';
	if (col.kind === 'projects') return 'projects';
	if (col.kind === 'normal') {
		const firstNormal = sortedColumns(columns).find((c) => c.kind === 'normal');
		return firstNormal?.id === col.id ? 'inbox' : 'other';
	}
	if (label.includes('someday') || label.includes('maybe')) return 'someday';
	if (label.includes('waiting')) return 'waiting';
	return 'other';
}

export function folderNameFor(col: ApiColumn, columns: ApiColumn[]): string {
	const role = columnRole(col, columns);
	return role === 'other' ? safeFileName(col.label || 'List') || 'List' : ROLE_FOLDERS[role];
}

export function kindForColumn(col: ApiColumn): CardKind {
	if (col.kind === 'next') return 'action';
	if (col.kind === 'projects') return 'project';
	return 'card';
}

// Characters Obsidian refuses in file names, plus the ones that break wikilinks.
const FORBIDDEN = /[\\/:*?"<>|#^[\]]/g;

export function safeFileName(title: string): string {
	return title
		.replace(FORBIDDEN, ' ')
		.replace(/\s+/g, ' ')
		.replace(/^\.+/, '')
		.trim()
		.slice(0, 120)
		.trim();
}

export type Layout = {
	root: string;
	/** column id → folder path under the root */
	folderByColumn: Map<string, string>;
	/** folder path → column */
	columnByFolder: Map<string, ApiColumn>;
	columns: ApiColumn[];
	contexts: ApiContext[];
	cardsById: Map<string, ApiCard>;
};

export function buildLayout(root: string, columns: ApiColumn[], cards: ApiCard[], contexts: ApiContext[]): Layout {
	const folderByColumn = new Map<string, string>();
	const columnByFolder = new Map<string, ApiColumn>();
	const used = new Set<string>();
	for (const col of sortedColumns(columns)) {
		let name = folderNameFor(col, columns);
		let n = 2;
		while (used.has(name)) name = `${folderNameFor(col, columns)} ${n++}`;
		used.add(name);
		const path = `${root}/${name}`;
		folderByColumn.set(col.id, path);
		columnByFolder.set(path, col);
	}
	return {
		root,
		folderByColumn,
		columnByFolder,
		columns: sortedColumns(columns),
		contexts,
		cardsById: new Map(cards.map((c) => [c.id, c])),
	};
}

// Contexts are stored on the board by id ("calls") and shown as labels ("@calls").
// Notes may say either; both resolve to the id.
export function contextIdFor(value: string | null | undefined, contexts: ApiContext[]): string | null {
	if (!value) return null;
	const raw = String(value).trim();
	if (!raw) return null;
	const bare = raw.replace(/^@/, '').toLowerCase();
	const match = contexts.find(
		(c) => c.id.toLowerCase() === bare || c.label.replace(/^@/, '').toLowerCase() === bare,
	);
	return match ? match.id : bare;
}

export function contextLabelFor(id: string | null | undefined, contexts: ApiContext[]): string | null {
	if (!id) return null;
	return contexts.find((c) => c.id === id)?.label ?? `@${id}`;
}

// A wikilink target ("[[Paint the bedroom|the bedroom]]" → "Paint the bedroom").
export function wikilinkTarget(value: string | null | undefined): string | null {
	if (!value) return null;
	const m = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/.exec(String(value));
	const target = (m?.[1] ?? String(value)).trim();
	return target ? target.split('/').pop() ?? target : null;
}
