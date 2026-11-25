import { afterEach, describe, expect, it } from 'vitest';
import { signedInUrl } from '../src/api/auth';
import type { ClientContext } from '../src/api/client';
import { setRequestHandler } from './obsidian-stub';

const page = 'https://dashboard.gtdbrain.com/?source=obsidian';
const ctx: ClientContext = { apiBase: 'https://api.minosin.com', version: '1.2.0', installId: 'i1', token: 'tok' };

afterEach(() => setRequestHandler(null));

describe('signedInUrl', () => {
	it('asks for a one-time sign-in link to the page', async () => {
		const seen: { url: string; body?: string; headers?: Record<string, string> }[] = [];
		setRequestHandler((req) => {
			seen.push({ url: req.url, body: req.body as string, headers: req.headers });
			return { status: 200, text: JSON.stringify({ url: page + '&sc=c&su=u' }), json: null, headers: {}, arrayBuffer: new ArrayBuffer(0) };
		});
		expect(await signedInUrl(ctx, page)).toBe(page + '&sc=c&su=u');
		expect(seen[0]?.url).toBe('https://api.minosin.com/api/gtdbrain/v2/sign-in-links');
		expect(JSON.parse(seen[0]!.body!)).toEqual({ url: page });
		expect(seen[0]?.headers?.['User-Token']).toBe('tok');
	});

	it('is the plain page when signed out or refused', async () => {
		let calls = 0;
		setRequestHandler(() => {
			calls++;
			return { status: 503, text: '{"error":{"code":"unavailable","message":"x"}}', json: null, headers: {}, arrayBuffer: new ArrayBuffer(0) };
		});
		expect(await signedInUrl({ ...ctx, token: null }, page)).toBe(page);
		expect(calls).toBe(0);
		expect(await signedInUrl(ctx, page)).toBe(page);
	});
});
