import { beforeEach, describe, expect, it } from 'vitest';
import { captureFromSelection, captureFromText, captureToInbox } from '../src/sync/capture';
import { runSync } from '../src/sync/engine';
import { CTX, FakeBackend, MemoryVault, SIGNUP_URL } from './fakes';
import { setRequestHandler } from './obsidian-stub';

const ROOT = 'GTD Brain';
const OPTS = { root: ROOT, keepArchived: true };

let backend: FakeBackend;
let vault: MemoryVault;

beforeEach(() => {
	backend = new FakeBackend();
	backend.install();
	vault = new MemoryVault();
});

const writes = () => backend.requests.filter((r) => r.method !== 'GET');

describe('capture input', () => {
	it('takes the first line of typed text as the title and the rest as notes', () => {
		expect(captureFromText('  Call Sam about the quote  ')).toEqual({ title: 'Call Sam about the quote', notes: '' });
		expect(captureFromText('Call Sam\nhe asked for Friday', 'number is on the invoice')).toEqual({ title: 'Call Sam', notes: 'he asked for Friday\n\nnumber is on the invoice' });
		expect(captureFromText('   ')).toBeNull();
	});

	it('strips list, task and heading markup from the title', () => {
		expect(captureFromText('- [ ] Renew passport')!.title).toBe('Renew passport');
		expect(captureFromText('* Renew passport')!.title).toBe('Renew passport');
		expect(captureFromText('2. Renew passport')!.title).toBe('Renew passport');
		expect(captureFromText('## Renew passport')!.title).toBe('Renew passport');
	});

	it('cuts a long title at a word and keeps the whole line in the notes', () => {
		const long = 'Ask the landlord ' + 'about the broken heating in the back bedroom '.repeat(4);
		const input = captureFromText(long)!;
		expect(input.title.length).toBeLessThanOrEqual(121);
		expect(input.title.endsWith('…')).toBe(true);
		expect(input.notes).toBe(long.trim());
	});

	it('turns a selection into a title, the selected text and a link back to its note', () => {
		expect(captureFromSelection('- [ ] Book the venue', '[[Team offsite]]')).toEqual({ title: 'Book the venue', notes: 'Captured from [[Team offsite]]' });
		expect(captureFromSelection('Book the venue\nfor 12 people\n', '[[Team offsite]]')).toEqual({
			title: 'Book the venue',
			notes: 'Book the venue\nfor 12 people\n\nCaptured from [[Team offsite]]',
		});
		expect(captureFromSelection('Book the venue', null)).toEqual({ title: 'Book the venue', notes: '' });
		expect(captureFromSelection(' \n ', '[[x]]')).toBeNull();
	});
});

describe('capture to inbox', () => {
	it('sends a member’s capture to the top of the board Inbox and writes it as a synced note', async () => {
		backend.seed({ title: 'Renew passport', columnId: 'col-inbox' });
		const first = await runSync(CTX, vault, OPTS, {});

		const outcome = await captureToInbox(CTX, vault, ROOT, { title: 'Call Sam: re the "quote"', notes: 'he asked for Friday' }, 'command');

		expect(outcome.status).toBe('sent');
		if (outcome.status !== 'sent') return;
		const post = writes()[0]!;
		expect(post).toMatchObject({ method: 'POST', path: '/api/gtdbrain/v2/gtd/cards', body: { title: 'Call Sam: re the "quote"', notes: 'he asked for Friday', via: 'command', toIndex: 0 } });
		expect(post.body).not.toHaveProperty('columnId');
		expect(post.headers).toMatchObject({ 'x-platform': 'obsidian', 'x-install-id': 'install-1', 'User-Token': 'tok' });
		expect(backend.inbox.cardIds[0]).toBe(outcome.card.id);
		expect(outcome.path).toBe('GTD Brain/Inbox/Call Sam re the quote.md');
		expect(vault.frontmatter(outcome.path)).toMatchObject({ gtdbrain_id: outcome.card.id, list: 'Inbox', kind: 'card' });
		expect(vault.body(outcome.path)).toBe('he asked for Friday\n');

		// The next sync sees nothing to send and nothing to change in that note.
		backend.requests = [];
		vault.log = [];
		const next = await runSync(CTX, vault, OPTS, { ...first.snapshot, [outcome.card.id]: outcome.snapshot! });
		expect(next.errors).toEqual([]);
		expect(next.pushed).toBe(0);
		expect(writes()).toEqual([]);
		expect(vault.log.filter((l) => l.includes('Call Sam'))).toEqual([]);
		expect([...backend.cards.values()].filter((c) => c.title.startsWith('Call Sam'))).toHaveLength(1);
	});

	it('does not overwrite a note with the same name', async () => {
		vault.files.set('GTD Brain/Inbox/Buy milk.md', 'my own note\n');
		const outcome = await captureToInbox(CTX, vault, ROOT, { title: 'Buy milk', notes: '' }, 'selection');
		expect(outcome.path).toBe('GTD Brain/Inbox/Buy milk (2).md');
		expect(vault.files.get('GTD Brain/Inbox/Buy milk.md')).toBe('my own note\n');
		expect(writes()[0]!.body).toMatchObject({ via: 'selection' });

		// and the sync keeps it paired with its card despite the " (2)"
		const next = await runSync(CTX, vault, OPTS, outcome.status === 'sent' ? { [outcome.card.id]: outcome.snapshot! } : {});
		expect(next.errors).toEqual([]);
		expect(vault.files.has('GTD Brain/Inbox/Buy milk (2).md')).toBe(true);
	});

	it('keeps a non-member’s capture in the vault and hands back the checkout link', async () => {
		backend.member = false;

		const outcome = await captureToInbox(CTX, vault, ROOT, { title: 'Book the venue', notes: 'Captured from [[Team offsite]]' }, 'selection');

		expect(outcome).toEqual({ status: 'membership', path: 'GTD Brain/Inbox/Book the venue.md', signupUrl: SIGNUP_URL });
		expect(new URL(SIGNUP_URL).searchParams.get('source')).toBe('obsidian');
		expect(backend.cards.size).toBe(0);
		// no id: the note is an unsent change, and the sync holds it back
		expect(vault.frontmatter(outcome.path)).toEqual({});
		expect(vault.body(outcome.path)).toBe('Captured from [[Team offsite]]\n');
		const locked = await runSync(CTX, vault, OPTS, {});
		expect(locked.pending).toBe(1);
		expect(vault.files.has(outcome.path)).toBe(true);

		// ...and sends it once the membership starts.
		backend.member = true;
		const joined = await runSync(CTX, vault, OPTS, locked.snapshot);
		expect(joined.pushed).toBe(1);
		expect([...backend.cards.values()]).toEqual([expect.objectContaining({ title: 'Book the venue', columnId: 'col-inbox', notes: 'Captured from [[Team offsite]]' })]);
	});

	it('saves the note without sending when signed out, and the sync after sign-in sends it', async () => {
		const outcome = await captureToInbox(null, vault, ROOT, { title: 'Renew passport', notes: '' }, 'command');

		expect(outcome).toEqual({ status: 'signed-out', path: 'GTD Brain/Inbox/Renew passport.md' });
		expect(backend.requests).toEqual([]);

		await runSync(CTX, vault, OPTS, {});
		expect([...backend.cards.values()].map((c) => c.title)).toEqual(['Renew passport']);
	});

	it('treats an expired session as signed out and keeps the note', async () => {
		setRequestHandler(() => ({ status: 401, text: JSON.stringify({ error: { code: 'invalid_token', message: 'Sign in again' } }), json: null, headers: {}, arrayBuffer: new ArrayBuffer(0) }));
		const expired = await captureToInbox(CTX, vault, ROOT, { title: 'Call Bob', notes: '' }, 'command');
		expect(expired).toEqual({ status: 'signed-out', path: 'GTD Brain/Inbox/Call Bob.md' });
		expect(vault.files.has('GTD Brain/Inbox/Call Bob.md')).toBe(true);
	});

	it('keeps the note when GTD Brain cannot be reached', async () => {
		setRequestHandler(() => ({ status: 503, text: 'upstream down', json: null, headers: {}, arrayBuffer: new ArrayBuffer(0) }));

		const outcome = await captureToInbox(CTX, vault, ROOT, { title: 'Call Bob', notes: 'about Friday' }, 'command');

		expect(outcome).toEqual({ status: 'kept', path: 'GTD Brain/Inbox/Call Bob.md', error: 'Request failed (503)' });
		expect(vault.body('GTD Brain/Inbox/Call Bob.md')).toBe('about Friday\n');
	});
});
