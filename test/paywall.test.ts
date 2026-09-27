import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError, parseError } from '../src/api/client';
import { PaymentRequiredError, runSync } from '../src/sync/engine';
import { PaywallGate } from '../src/sync/paywall';
import { CTX, FakeBackend, MemoryVault } from './fakes';

const ROOT = 'GTD Brain';
const OPTS = { root: ROOT, keepArchived: true };
const SIGNUP = 'https://gtdbrain.com/buy?email=xx-test%40example.com&source=obsidian';

let backend: FakeBackend;
let vault: MemoryVault;

beforeEach(() => {
	backend = new FakeBackend();
	backend.install();
	vault = new MemoryVault();
});

describe('402 subscription_required', () => {
	it('keeps the signup link and the held flag', () => {
		const e = parseError(
			402,
			JSON.stringify({ error: { code: 'subscription_required', message: 'GTD Brain needs an active membership.', signupUrl: SIGNUP, held: true } }),
		);
		expect(e).toBeInstanceOf(ApiError);
		expect(e.status).toBe(402);
		expect(e.code).toBe('subscription_required');
		expect(e.message).toBe('GTD Brain needs an active membership.');
		expect(e.details).toEqual({ signupUrl: SIGNUP, held: true });
	});

	it('leaves the signup link out when the body has none', () => {
		const e = parseError(402, JSON.stringify({ error: { code: 'subscription_required', message: 'Needs a membership.', held: false } }));
		expect(e.details).toEqual({ held: false });
		expect(parseError(500, 'oops').details).toEqual({});
	});
});

describe('a non-member sync', () => {
	it('stops at the board read with nothing pushed or written, then syncs once after payment', async () => {
		const first = await runSync(CTX, vault, OPTS, {});
		vault.files.set('GTD Brain/Inbox/Buy milk.md', 'Two litres\n');
		const before = new Map(vault.files);
		backend.requests = [];
		backend.paywalled = () => true;
		backend.held = true;

		const err = await runSync(CTX, vault, OPTS, first.snapshot).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(PaymentRequiredError);
		expect((err as PaymentRequiredError).signupUrl).toBe(SIGNUP);
		expect(backend.requests.map((r) => `${r.method} ${r.path}`)).toEqual(['GET /api/gtdbrain/v2/gtd/board']);
		expect(vault.files).toEqual(before);

		backend.paywalled = null;
		const paid = await runSync(CTX, vault, OPTS, first.snapshot);

		expect(paid.errors).toEqual([]);
		expect([...backend.cards.values()].filter((c) => c.title === 'Buy milk')).toHaveLength(1);
		expect([...vault.files.keys()].filter((p) => p.startsWith('GTD Brain/Inbox/'))).toEqual(['GTD Brain/Inbox/Buy milk.md']);
	});

	it('stops at the first gated push without stamping an id on the note', async () => {
		const first = await runSync(CTX, vault, OPTS, {});
		vault.files.set('GTD Brain/Inbox/Buy milk.md', 'Two litres\n');
		vault.files.set('GTD Brain/Inbox/Call mum.md', '');
		backend.requests = [];
		backend.paywalled = (method) => method !== 'GET';
		backend.held = true;

		await expect(runSync(CTX, vault, OPTS, first.snapshot)).rejects.toBeInstanceOf(PaymentRequiredError);

		expect(backend.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
		expect(backend.cards.size).toBe(0);
		expect(vault.frontmatter('GTD Brain/Inbox/Buy milk.md')).toEqual({});
		expect(vault.frontmatter('GTD Brain/Inbox/Call mum.md')).toEqual({});
	});
});

describe('membership screen', () => {
	it('opens once per session for automatic syncs and every time the person asks', () => {
		const gate = new PaywallGate();
		expect(gate.active).toBe(false);
		expect(gate.blocked('startup')).toBe(true);
		expect(gate.active).toBe(true);
		expect(gate.blocked('interval')).toBe(false);
		expect(gate.blocked('interval')).toBe(false);
		expect(gate.blocked('manual')).toBe(true);
		expect(gate.blocked('sign-in')).toBe(true);
		expect(gate.blocked('startup')).toBe(false);
	});

	it('shows on the first interval sync when nothing opened it yet', () => {
		const gate = new PaywallGate();
		expect(gate.blocked('interval')).toBe(true);
		expect(gate.blocked('interval')).toBe(false);
	});

	it('starts over after a sync goes through', () => {
		const gate = new PaywallGate();
		gate.blocked('interval');
		gate.clear();
		expect(gate.active).toBe(false);
		expect(gate.blocked('interval')).toBe(true);
	});
});
