// One note per card. The GTD fields live in frontmatter under namespaced keys so they
// never collide with the user's own properties; the note body is the card's notes.

export const FM_ID = 'gtdbrain_id';
export const FM_LIST = 'list';
export const FM_KIND = 'kind';
export const FM_CONTEXT = 'context';
export const FM_PROJECT = 'project';
export const FM_WHO = 'who';
export const FM_SINCE = 'since';

export const CARD_KEYS = [FM_ID, FM_LIST, FM_KIND, FM_CONTEXT, FM_PROJECT, FM_WHO, FM_SINCE] as const;

export type CardFields = {
	id: string;
	list: string;
	kind: string;
	context: string | null; // the label, e.g. "@calls"
	project: string | null; // a wikilink, e.g. "[[Paint the bedroom]]"
	who: string | null;
	since: string | null;
};

export type Frontmatter = Record<string, unknown>;

const FM_BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function splitFrontmatter(content: string): { yaml: string | null; body: string } {
	const m = FM_BLOCK.exec(content);
	if (!m) return { yaml: null, body: content };
	return { yaml: m[1] ?? '', body: content.slice(m[0].length) };
}

// Fallback for a note the metadata cache has not indexed yet: only the flat
// `key: value` lines this plugin writes itself, which is all it needs to recognise a card.
export function parseSimpleFrontmatter(yaml: string): Frontmatter {
	const out: Frontmatter = {};
	for (const line of yaml.split(/\r?\n/)) {
		const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
		if (!m || !m[1]) continue;
		const value = (m[2] ?? '').trim();
		if (value === '') continue;
		out[m[1]] = unquote(value);
	}
	return out;
}

function unquote(v: string): string {
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
		return v.slice(1, -1).replace(/\\"/g, '"');
	}
	return v;
}

export function quote(v: string): string {
	return `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function fieldsToFrontmatter(f: CardFields): Frontmatter {
	const fm: Frontmatter = { [FM_ID]: f.id, [FM_LIST]: f.list, [FM_KIND]: f.kind };
	if (f.context) fm[FM_CONTEXT] = f.context;
	if (f.project) fm[FM_PROJECT] = f.project;
	if (f.who) fm[FM_WHO] = f.who;
	if (f.since) fm[FM_SINCE] = f.since;
	return fm;
}

// Serialises a whole new note. Strings are always quoted: "@calls" and "[[Project]]"
// are not valid plain YAML scalars.
export function renderNote(f: CardFields, body: string): string {
	const fm = fieldsToFrontmatter(f);
	const lines = Object.entries(fm).map(([k, v]) => `${k}: ${quote(typeof v === 'string' ? v : JSON.stringify(v))}`);
	const trimmed = body.replace(/\s+$/, '');
	return `---\n${lines.join('\n')}\n---\n${trimmed ? trimmed + '\n' : ''}`;
}

export function stringField(fm: Frontmatter | undefined, key: string): string | null {
	const raw = fm?.[key];
	const v: unknown = Array.isArray(raw) ? raw[0] : raw;
	if (v === undefined || v === null) return null;
	const s = typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v);
	return s.trim() === '' ? null : s.trim();
}

export function normalizeBody(body: string | null | undefined): string {
	return (body ?? '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
}
