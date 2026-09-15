import type { ApiCard, ApiColumn, ApiContext, Board } from '../src/api/board';
import type { VaultAdapter } from '../src/sync/engine';
import type { LocalNote } from '../src/sync/plan';
import { CARD_KEYS, type CardFields, fieldsToFrontmatter, FM_CONTEXT, FM_ID, FM_LIST, FM_PROJECT, FM_SINCE, FM_WHO, parseSimpleFrontmatter, quote, splitFrontmatter, stringField } from '../src/vault/notes';
import { type RequestUrlParam, setRequestHandler } from './obsidian-stub';

// ── In-memory vault ──
export class MemoryVault implements VaultAdapter {
	files = new Map<string, string>();
	folders = new Set<string>();
	log: string[] = [];

	exists(path: string): boolean {
		return this.files.has(path) || this.folders.has(path);
	}
	async ensureFolder(path: string): Promise<void> {
		this.folders.add(path);
	}
	async listCardNotes(root: string): Promise<LocalNote[]> {
		const out: LocalNote[] = [];
		for (const [path, content] of this.files) {
			if (!path.startsWith(root + '/') || !path.endsWith('.md')) continue;
			const folder = path.slice(0, path.lastIndexOf('/'));
			if (folder === root) continue;
			const { yaml, body } = splitFrontmatter(content);
			const fm = yaml !== null ? parseSimpleFrontmatter(yaml) : undefined;
			out.push({
				path,
				folder,
				basename: path.slice(folder.length + 1, -3),
				id: stringField(fm, FM_ID),
				list: stringField(fm, FM_LIST),
				context: stringField(fm, FM_CONTEXT),
				project: stringField(fm, FM_PROJECT),
				who: stringField(fm, FM_WHO),
				since: stringField(fm, FM_SINCE),
				body,
			});
		}
		return out;
	}
	async create(path: string, content: string): Promise<void> {
		if (this.files.has(path)) throw new Error('exists: ' + path);
		this.files.set(path, content);
		this.log.push('create ' + path);
	}
	async rename(path: string, newPath: string): Promise<void> {
		const c = this.files.get(path);
		if (c === undefined) throw new Error('missing: ' + path);
		this.files.delete(path);
		this.files.set(newPath, c);
		this.log.push(`rename ${path} -> ${newPath}`);
	}
	async writeCard(path: string, fields: CardFields | null, body: string | null): Promise<void> {
		const current = this.files.get(path);
		if (current === undefined) throw new Error('missing: ' + path);
		const { yaml, body: oldBody } = splitFrontmatter(current);
		const fm = yaml !== null ? parseSimpleFrontmatter(yaml) : {};
		if (fields) {
			for (const k of CARD_KEYS) delete fm[k];
			Object.assign(fm, fieldsToFrontmatter(fields));
		}
		const newBody = body === null ? oldBody : body ? body + '\n' : '';
		const lines = Object.entries(fm).map(([k, v]) => `${k}: ${quote(String(v))}`);
		this.files.set(path, `---\n${lines.join('\n')}\n---\n${newBody}`);
		this.log.push('writeCard ' + path);
	}
	async writeGenerated(path: string, content: string): Promise<void> {
		if (this.files.get(path) === content) return;
		this.files.set(path, content);
		this.log.push('generated ' + path);
	}
	async trash(path: string): Promise<void> {
		this.files.delete(path);
		this.log.push('trash ' + path);
	}
	frontmatter(path: string): Record<string, unknown> {
		const { yaml } = splitFrontmatter(this.files.get(path) ?? '');
		return yaml !== null ? parseSimpleFrontmatter(yaml) : {};
	}
	body(path: string): string {
		return splitFrontmatter(this.files.get(path) ?? '').body;
	}
}

// ── Fake GTD Brain backend with the same invariants as GtdFirestore ──
export const CONTEXTS: ApiContext[] = [
	{ id: 'calls', label: '@calls', color: '#d97444' },
	{ id: 'computer', label: '@computer', color: '#3a78c8' },
	{ id: 'errands', label: '@errands', color: '#4f9466' },
];

export class FakeBackend {
	columns: ApiColumn[];
	cards = new Map<string, ApiCard>();
	requests: { method: string; path: string; body: unknown; headers: Record<string, string> }[] = [];
	nextId = 1;
	inbox: ApiColumn;
	next: ApiColumn;
	projects: ApiColumn;
	waiting: ApiColumn;
	someday: ApiColumn;

	constructor() {
		this.inbox = { id: 'col-inbox', kind: 'normal', label: 'Inbox', order: 0, cardIds: [] };
		this.next = { id: 'col-next', kind: 'next', label: 'Next Actions', order: 1, cardIds: [] };
		this.projects = { id: 'col-projects', kind: 'projects', label: 'Projects', order: 2, cardIds: [] };
		this.waiting = { id: 'col-waiting', kind: 'flexible', label: 'Waiting For', order: 3, cardIds: [] };
		this.someday = { id: 'col-someday', kind: 'flexible', label: 'Someday / Maybe', order: 4, cardIds: [] };
		this.columns = [this.inbox, this.next, this.projects, this.waiting, this.someday];
	}

	seed(card: Partial<ApiCard> & { title: string; columnId: string }): ApiCard {
		const id = card.id ?? `card-${this.nextId++}`;
		const col = this.columns.find((c) => c.id === card.columnId)!;
		const kind = card.kind ?? (col.kind === 'next' ? 'action' : col.kind === 'projects' ? 'project' : 'card');
		const full: ApiCard = { id, kind, title: card.title, columnId: card.columnId, context: card.context ?? null, projectId: card.projectId ?? null, notes: card.notes ?? null, who: card.who ?? null, since: card.since ?? null, archived: card.archived ?? false, updatedAt: '2026-01-01T00:00:00Z' };
		this.cards.set(id, full);
		if (!full.archived) col.cardIds.push(id);
		return full;
	}

	board(): Board {
		return { columns: structuredClone(this.columns), cards: structuredClone([...this.cards.values()]), contexts: structuredClone(CONTEXTS) };
	}

	install(): void {
		setRequestHandler((req) => this.handle(req));
	}

	private json(status: number, body: unknown) {
		const text = JSON.stringify(body);
		return { status, text, json: body, headers: {}, arrayBuffer: new ArrayBuffer(0) };
	}
	private error(status: number, code: string, message: string) {
		return this.json(status, { error: { code, message } });
	}

	handle(req: RequestUrlParam) {
		const url = new URL(req.url);
		const method = req.method ?? 'GET';
		const body = req.body ? JSON.parse(req.body) : undefined;
		this.requests.push({ method, path: url.pathname, body, headers: req.headers ?? {} });
		if (!req.headers?.['User-Token']) return this.error(401, 'missing_token', 'Provide a valid User-Token in the header');
		const m = /^\/api\/gtdbrain\/v2\/gtd\/(.*)$/.exec(url.pathname);
		if (!m) return this.error(404, 'not_found', 'no route');
		const rest = m[1]!;
		if (rest === 'board') return this.json(200, this.board());
		if (rest === 'cards' && method === 'POST') {
			const col = this.columns.find((c) => c.id === body.columnId);
			if (!col) return this.error(400, 'invalid_request', 'Column does not exist');
			const kind = body.kind ?? 'card';
			const fits = col.kind === 'flexible' || (kind === 'action' && col.kind === 'next') || (kind === 'project' && col.kind === 'projects') || (kind === 'card' && col.kind === 'normal');
			if (!fits) return this.error(400, 'invalid_request', `A '${kind}' card cannot go in a '${col.kind}' column`);
			const card = this.seed({ title: body.title, columnId: col.id, kind, notes: body.notes ?? null, context: body.context ?? null, who: body.who ?? null, since: body.since ?? null });
			return this.json(201, card);
		}
		const cm = /^cards\/([^/]+)(?:\/(move|archive))?$/.exec(rest);
		if (!cm) return this.error(404, 'not_found', 'no route');
		const card = this.cards.get(cm[1]!);
		if (!card) return this.error(400, 'invalid_request', `Card '${cm[1]}' does not exist`);
		if (cm[2] === 'archive') {
			card.archived = true;
			for (const c of this.columns) c.cardIds = c.cardIds.filter((id) => id !== card.id);
			return this.json(200, card);
		}
		if (cm[2] === 'move') {
			const dest = this.columns.find((c) => c.id === body.toColumnId);
			if (!dest) return this.error(400, 'invalid_request', 'Column does not exist');
			const newKind = dest.kind === 'flexible' ? card.kind : dest.kind === 'next' ? 'action' : dest.kind === 'projects' ? 'project' : 'card';
			if (newKind !== card.kind) {
				card.kind = newKind;
				if (newKind === 'action' || newKind === 'project') card.projectId = null;
				if (newKind === 'project' || newKind === 'card') card.context = null;
			}
			for (const c of this.columns) c.cardIds = c.cardIds.filter((id) => id !== card.id);
			dest.cardIds.push(card.id);
			card.columnId = dest.id;
			return this.json(200, card);
		}
		if (method === 'PATCH') {
			const allowed = ['title', 'notes', 'context', 'who', 'since', 'projectId'];
			const keys = Object.keys(body).filter((k) => allowed.includes(k));
			if (keys.length === 0) return this.error(400, 'invalid_request', 'Nothing to update');
			if ('projectId' in body && body.projectId !== null) {
				if (card.kind !== 'action') return this.error(400, 'invalid_request', 'Only an action can belong to a project');
				const p = this.cards.get(body.projectId);
				if (!p || p.kind !== 'project' || p.archived) return this.error(400, 'invalid_request', `Project '${body.projectId}' does not exist`);
			}
			for (const k of keys) (card as unknown as Record<string, unknown>)[k] = body[k];
			return this.json(200, card);
		}
		return this.error(404, 'not_found', 'no route');
	}
}

export const CTX = { apiBase: 'https://api.test', version: '1.0.0', installId: 'install-1', token: 'tok' };
