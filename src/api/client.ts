import { requestUrl } from 'obsidian';

export const PRODUCTION_API_BASE = 'https://api.minosin.com';
export const CLIENT = 'gtdbrain';

// Every request carries the same client headers as the other GTD Brain clients
// (Client = the product, x-platform = this surface, x-install-id = one random id per
// vault install, User-Token when signed in). requestUrl runs in the Electron/native
// process, so the backend's browser CORS policy does not apply.
export type ClientContext = {
	apiBase: string;
	version: string;
	installId: string;
	token: string | null;
};

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		public readonly code: string,
		message: string,
	) {
		super(message);
		this.name = 'ApiError';
	}
}

export function standardHeaders(ctx: ClientContext): Record<string, string> {
	return {
		'Content-Type': 'application/json',
		Client: CLIENT,
		'x-platform': 'obsidian',
		'x-client-version': ctx.version,
		'x-install-id': ctx.installId,
		...(ctx.token ? { 'User-Token': ctx.token } : {}),
	};
}

// v2 convention: the HTTP status is the outcome and errors are {"error":{code,message}}.
export function parseError(status: number, text: string): ApiError {
	let code = 'http_' + status;
	let message = `Request failed (${status})`;
	try {
		const body = JSON.parse(text) as { error?: unknown };
		const err = body?.error;
		if (err && typeof err === 'object') {
			const e = err as { code?: unknown; message?: unknown };
			if (typeof e.code === 'string') code = e.code;
			if (typeof e.message === 'string') message = e.message;
		} else if (typeof err === 'string') {
			message = err;
		}
	} catch {
		// non-JSON body: keep the generic message
	}
	return new ApiError(status, code, message);
}

export async function apiJson<T>(
	ctx: ClientContext,
	method: 'GET' | 'POST' | 'PATCH',
	path: string,
	body?: unknown,
): Promise<T> {
	const res = await requestUrl({
		url: ctx.apiBase + path,
		method,
		headers: standardHeaders(ctx),
		body: body === undefined ? undefined : JSON.stringify(body),
		throw: false,
	});
	if (res.status >= 200 && res.status < 300) {
		if (res.status === 202 || res.status === 204 || !res.text) return undefined as T;
		return JSON.parse(res.text) as T;
	}
	throw parseError(res.status, res.text);
}
