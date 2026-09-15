import { beforeEach, describe, expect, it } from 'vitest';
import { runSync, ensureScaffold, SignedOutError } from '../src/sync/engine';
import { planPush, type Snapshot } from '../src/sync/plan';
import { buildLayout, contextIdFor, safeFileName, wikilinkTarget } from '../src/vault/layout';
import { parseSimpleFrontmatter, renderNote, splitFrontmatter } from '../src/vault/notes';
import { CONTEXTS, CTX, FakeBackend, MemoryVault } from './fakes';

const ROOT = 'GTD Brain';
const OPTS = { root: ROOT, keepArchived: true };

let backend: FakeBackend;
let vault: MemoryVault;

beforeEach(() => {
	backend = new FakeBackend();
	backend.install();
	vault = new MemoryVault();
});

describe('note format', () => {
	it('round-trips frontmatter with special scalars', () => {
		const note = renderNote({ id: 'c1', list: 'Next Actions', kind: 'action', context: '@calls', project: '[[Paint the bedroom]]', who: null, since: null }, 'Body text\n');
		const { yaml, body } = splitFrontmatter(note);
		const fm = parseSimpleFrontmatter(yaml!);
		expect(fm).toEqual({ gtdbrain_id: 'c1', list: 'Next Actions', kind: 'action', context: '@calls', project: '[[Paint the bedroom]]' });
		expect(body).toBe('Body text\n');
	});

	it('maps titles to safe file names and contexts both ways', () => {
		expect(safeFileName('Call: Dr. Who? / re: "plan" #1')).toBe('Call Dr. Who re plan 1');
		expect(contextIdFor('@Calls', CONTEXTS)).toBe('calls');
		expect(contextIdFor('computer', CONTEXTS)).toBe('computer');
		expect(contextIdFor('', CONTEXTS)).toBeNull();
		expect(wikilinkTarget('[[Projects/Paint the bedroom|paint]]')).toBe('Paint the bedroom');
		expect(wikilinkTarget('Paint the bedroom')).toBe('Paint the bedroom');
	});
});

describe('first sync', () => {
	it('lays out one note per card in the right folder, the overviews and the weekly review', async () => {
		const project = backend.seed({ title: 'Paint the bedroom', columnId: 'col-projects' });
		backend.seed({ title: 'Pick up paint samples', columnId: 'col-next', context: 'errands', projectId: project.id, notes: 'From the hardware store' });
		backend.seed({ title: 'Call the dentist', columnId: 'col-next', context: 'calls' });
		backend.seed({ title: 'Renew passport', columnId: 'col-inbox' });
		backend.seed({ title: 'Quote from the plumber', columnId: 'col-waiting', who: 'Bob', since: '2026-09-01' });
		backend.seed({ title: 'Learn the cello', columnId: 'col-someday' });
		backend.seed({ title: 'Old thing', columnId: 'col-inbox', archived: true });

		const result = await runSync(CTX, vault, OPTS, {});

		expect(result.errors).toEqual([]);
		expect(result.pushed).toBe(0);
		expect([...vault.files.keys()].sort()).toEqual([
			'GTD Brain/Inbox.md',
			'GTD Brain/Inbox/Renew passport.md',
			'GTD Brain/Next Actions.md',
			'GTD Brain/Next Actions/Call the dentist.md',
			'GTD Brain/Next Actions/Pick up paint samples.md',
			'GTD Brain/Projects.md',
			'GTD Brain/Projects/Paint the bedroom.md',
			'GTD Brain/Someday Maybe.md',
			'GTD Brain/Someday Maybe/Learn the cello.md',
			'GTD Brain/Waiting For.md',
			'GTD Brain/Waiting For/Quote from the plumber.md',
			'GTD Brain/Weekly Review.md',
		]);
		expect(vault.folders.has('GTD Brain/Archive')).toBe(true);
		expect(vault.frontmatter('GTD Brain/Next Actions/Pick up paint samples.md')).toMatchObject({ list: 'Next Actions', kind: 'action', context: '@errands', project: '[[Paint the bedroom]]' });
		expect(vault.body('GTD Brain/Next Actions/Pick up paint samples.md')).toBe('From the hardware store\n');
		expect(vault.frontmatter('GTD Brain/Waiting For/Quote from the plumber.md')).toMatchObject({ who: 'Bob', since: '2026-09-01' });
		expect(vault.files.get('GTD Brain/Next Actions.md')).toContain('## @calls');
		expect(vault.files.get('GTD Brain/Next Actions.md')).toContain('[[Pick up paint samples]] · [[Paint the bedroom]]');
		expect(vault.files.get('GTD Brain/Waiting For.md')).toContain('| [[Quote from the plumber]] | Bob | 2026-09-01 |');
		expect(vault.files.get('GTD Brain/Projects.md')).toContain('[[Pick up paint samples]] (@errands)');
		expect(Object.keys(result.snapshot)).toHaveLength(6);
		// only board reads, no writes
		expect(backend.requests.filter((r) => r.method !== 'GET')).toEqual([]);
		// every request carries the standard client headers
		expect(backend.requests[0]!.headers).toMatchObject({ Client: 'gtdbrain', 'x-platform': 'obsidian', 'x-install-id': 'install-1', 'x-client-version': '1.0.0', 'User-Token': 'tok' });
	});

	it('is a no-op when nothing changed', async () => {
		backend.seed({ title: 'Renew passport', columnId: 'col-inbox' });
		const first = await runSync(CTX, vault, OPTS, {});
		vault.log = [];
		const second = await runSync(CTX, vault, OPTS, first.snapshot);
		expect(second.pushed).toBe(0);
		expect(second.pulled).toBe(0);
		expect(vault.log).toEqual([]);
	});

	it('scaffolds the five default folders without a board', async () => {
		await ensureScaffold(vault, ROOT, null);
		expect([...vault.folders].sort()).toEqual(['GTD Brain', 'GTD Brain/Archive', 'GTD Brain/Inbox', 'GTD Brain/Next Actions', 'GTD Brain/Projects', 'GTD Brain/Someday Maybe', 'GTD Brain/Waiting For']);
		expect(vault.files.get('GTD Brain/Weekly Review.md')).toContain('- [ ] Process [[Inbox]] to zero');
	});
});

describe('push', () => {
	it('creates a card for a new note in Inbox and stamps the id back', async () => {
		const first = await runSync(CTX, vault, OPTS, {});
		vault.files.set('GTD Brain/Inbox/Buy milk.md', 'Two litres\n');

		const result = await runSync(CTX, vault, OPTS, first.snapshot);

		expect(result.errors).toEqual([]);
		const created = [...backend.cards.values()].find((c) => c.title === 'Buy milk')!;
		expect(created).toMatchObject({ kind: 'card', columnId: 'col-inbox', notes: 'Two litres' });
		expect(vault.frontmatter('GTD Brain/Inbox/Buy milk.md')).toMatchObject({ gtdbrain_id: created.id, list: 'Inbox', kind: 'card' });
		expect(vault.body('GTD Brain/Inbox/Buy milk.md')).toBe('Two litres\n');
		expect(result.snapshot[created.id]!.path).toBe('GTD Brain/Inbox/Buy milk.md');
	});

	it('creates an action with context and project link for a new note in Next Actions', async () => {
		backend.seed({ title: 'Paint the bedroom', columnId: 'col-projects' });
		const first = await runSync(CTX, vault, OPTS, {});
		vault.files.set('GTD Brain/Next Actions/Buy rollers.md', '---\ncontext: "@errands"\nproject: "[[Paint the bedroom]]"\n---\n');

		const result = await runSync(CTX, vault, OPTS, first.snapshot);

		expect(result.errors).toEqual([]);
		const created = [...backend.cards.values()].find((c) => c.title === 'Buy rollers')!;
		expect(created).toMatchObject({ kind: 'action', columnId: 'col-next', context: 'errands', projectId: 'card-1' });
		expect(vault.files.get('GTD Brain/Projects.md')).toContain('[[Buy rollers]] (@errands)');
	});

	it('pushes only the fields that changed since the last sync', async () => {
		const card = backend.seed({ title: 'Call the dentist', columnId: 'col-next', context: 'calls', notes: 'ask about x-ray' });
		const first = await runSync(CTX, vault, OPTS, {});
		// someone changed the notes on the web meanwhile
		backend.cards.get(card.id)!.notes = 'ask about x-ray and cleaning';
		vault.files.set('GTD Brain/Next Actions/Call the dentist.md', '---\ngtdbrain_id: "card-1"\nlist: "Next Actions"\nkind: "action"\ncontext: "@computer"\n---\nask about x-ray\n');

		const result = await runSync(CTX, vault, OPTS, first.snapshot);

		expect(result.errors).toEqual([]);
		const patches = backend.requests.filter((r) => r.method === 'PATCH');
		expect(patches).toHaveLength(1);
		expect(patches[0]!.body).toEqual({ context: 'computer' });
		// the web's note change survives and is pulled into the vault
		expect(backend.cards.get(card.id)!.notes).toBe('ask about x-ray and cleaning');
		expect(vault.body('GTD Brain/Next Actions/Call the dentist.md')).toBe('ask about x-ray and cleaning\n');
	});

	it('moves a card when its note moves to another list folder, with kind conversion', async () => {
		backend.seed({ title: 'Renew passport', columnId: 'col-inbox' });
		const first = await runSync(CTX, vault, OPTS, {});
		await vault.rename('GTD Brain/Inbox/Renew passport.md', 'GTD Brain/Next Actions/Renew passport.md');

		const result = await runSync(CTX, vault, OPTS, first.snapshot);

		expect(result.errors).toEqual([]);
		expect(backend.cards.get('card-1')).toMatchObject({ columnId: 'col-next', kind: 'action' });
		expect(backend.next.cardIds).toEqual(['card-1']);
		expect(backend.inbox.cardIds).toEqual([]);
		expect(vault.frontmatter('GTD Brain/Next Actions/Renew passport.md')).toMatchObject({ list: 'Next Actions', kind: 'action' });
	});

	it('renames the card when the note is renamed', async () => {
		backend.seed({ title: 'Renew passport', columnId: 'col-inbox' });
		const first = await runSync(CTX, vault, OPTS, {});
		await vault.rename('GTD Brain/Inbox/Renew passport.md', 'GTD Brain/Inbox/Renew my passport.md');

		await runSync(CTX, vault, OPTS, first.snapshot);

		expect(backend.cards.get('card-1')!.title).toBe('Renew my passport');
		expect(vault.files.has('GTD Brain/Inbox/Renew my passport.md')).toBe(true);
	});

	it('archives the card when its note is deleted or moved into Archive', async () => {
		backend.seed({ title: 'Renew passport', columnId: 'col-inbox' });
		backend.seed({ title: 'Learn the cello', columnId: 'col-someday' });
		const first = await runSync(CTX, vault, OPTS, {});
		vault.files.delete('GTD Brain/Inbox/Renew passport.md');
		await vault.rename('GTD Brain/Someday Maybe/Learn the cello.md', 'GTD Brain/Archive/Learn the cello.md');

		const result = await runSync(CTX, vault, OPTS, first.snapshot);

		expect(result.errors).toEqual([]);
		expect(backend.cards.get('card-1')!.archived).toBe(true);
		expect(backend.cards.get('card-2')!.archived).toBe(true);
		expect(vault.files.has('GTD Brain/Archive/Learn the cello.md')).toBe(true);
		expect(result.snapshot['card-2']!.archived).toBe(true);
	});

	it('does not push when there is no snapshot to diff against', async () => {
		backend.seed({ title: 'Renew passport', columnId: 'col-inbox', notes: 'server notes' });
		vault.files.set('GTD Brain/Inbox/Renew passport.md', '---\ngtdbrain_id: "card-1"\n---\nstale local notes\n');

		await runSync(CTX, vault, OPTS, {});

		expect(backend.requests.filter((r) => r.method !== 'GET')).toEqual([]);
		expect(vault.body('GTD Brain/Inbox/Renew passport.md')).toBe('server notes\n');
	});

	it('warns about duplicate notes and unknown ids', () => {
		const known = backend.seed({ id: 'zz', title: 'x', columnId: 'col-inbox' });
		const layout = buildLayout(ROOT, backend.columns, [known], CONTEXTS);
		const note = (path: string, id: string | null) => ({ path, folder: path.slice(0, path.lastIndexOf('/')), basename: 'x', id, list: null, context: null, project: null, who: null, since: null, body: '' });
		const plan = planPush(layout, [note('GTD Brain/Inbox/a.md', 'zz'), note('GTD Brain/Inbox/b.md', 'zz'), note('GTD Brain/Inbox/c.md', 'nope')], {} as Snapshot);
		expect(plan.warnings).toEqual(['Duplicate card note ignored: GTD Brain/Inbox/b.md', 'Unknown card id in GTD Brain/Inbox/c.md; created as a new card']);
		expect(plan.ops.map((o) => o.type)).toEqual(['create']);
	});
});

describe('pull', () => {
	it('moves the note when the card moved on the board, and updates fields', async () => {
		const card = backend.seed({ title: 'Renew passport', columnId: 'col-inbox' });
		const first = await runSync(CTX, vault, OPTS, {});
		backend.inbox.cardIds = [];
		backend.waiting.cardIds = [card.id];
		Object.assign(backend.cards.get(card.id)!, { columnId: 'col-waiting', who: 'Embassy', since: '2026-09-10' });

		const result = await runSync(CTX, vault, OPTS, first.snapshot);

		expect(result.pulled).toBe(1);
		expect(vault.files.has('GTD Brain/Inbox/Renew passport.md')).toBe(false);
		expect(vault.frontmatter('GTD Brain/Waiting For/Renew passport.md')).toMatchObject({ list: 'Waiting For', who: 'Embassy', since: '2026-09-10' });
	});

	it('moves archived cards to Archive (or trashes them when configured)', async () => {
		backend.seed({ title: 'A', columnId: 'col-inbox' });
		backend.seed({ title: 'B', columnId: 'col-inbox' });
		const first = await runSync(CTX, vault, OPTS, {});
		for (const id of ['card-1', 'card-2']) {
			backend.cards.get(id)!.archived = true;
			backend.inbox.cardIds = backend.inbox.cardIds.filter((c) => c !== id);
		}

		const keep = await runSync(CTX, vault, OPTS, first.snapshot);
		expect(vault.files.has('GTD Brain/Archive/A.md')).toBe(true);
		expect(keep.snapshot['card-1']!.archived).toBe(true);

		const other = new MemoryVault();
		const again = await runSync(CTX, other, { root: ROOT, keepArchived: false }, {});
		expect(again.errors).toEqual([]);
		other.files.set('GTD Brain/Inbox/C.md', '');
		await runSync(CTX, other, { root: ROOT, keepArchived: false }, again.snapshot);
		const c = [...backend.cards.values()].find((x) => x.title === 'C')!;
		c.archived = true;
		backend.inbox.cardIds = [];
		await runSync(CTX, other, { root: ROOT, keepArchived: false }, again.snapshot);
		expect(other.files.has('GTD Brain/Inbox/C.md')).toBe(false);
		expect(other.log.some((l) => l.startsWith('trash '))).toBe(true);
	});

	it('gives duplicate titles distinct file names', async () => {
		backend.seed({ title: 'Follow up', columnId: 'col-inbox' });
		backend.seed({ title: 'Follow up', columnId: 'col-inbox' });
		await runSync(CTX, vault, OPTS, {});
		expect(vault.files.has('GTD Brain/Inbox/Follow up.md')).toBe(true);
		expect(vault.files.has('GTD Brain/Inbox/Follow up (2).md')).toBe(true);
	});

	it('keeps a user-added frontmatter property when rewriting the card fields', async () => {
		backend.seed({ title: 'Renew passport', columnId: 'col-inbox' });
		const first = await runSync(CTX, vault, OPTS, {});
		vault.files.set('GTD Brain/Inbox/Renew passport.md', '---\ngtdbrain_id: "card-1"\nlist: "Inbox"\nkind: "card"\npriority: "high"\n---\n');
		backend.cards.get('card-1')!.notes = 'new notes from the phone';

		await runSync(CTX, vault, OPTS, first.snapshot);

		expect(vault.frontmatter('GTD Brain/Inbox/Renew passport.md')).toMatchObject({ priority: 'high', gtdbrain_id: 'card-1' });
		expect(vault.body('GTD Brain/Inbox/Renew passport.md')).toBe('new notes from the phone\n');
	});

	it('signals a signed-out session', async () => {
		await expect(runSync({ ...CTX, token: null }, vault, OPTS, {})).rejects.toBeInstanceOf(SignedOutError);
	});
});
