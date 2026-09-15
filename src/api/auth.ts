import { apiJson, CLIENT, type ClientContext } from './client';

export type Session = { token: string; userId: string; email: string };

export function isValidEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Passwordless email login: request a code, then exchange email + code for a token.
// Signing in with an email GTD Brain has never seen creates the account.
export async function requestLoginCode(ctx: ClientContext, email: string): Promise<void> {
	await apiJson<void>(ctx, 'POST', `/api/${CLIENT}/v2/login-codes`, { email: email.trim() });
}

export async function verifyLoginCode(ctx: ClientContext, email: string, code: string): Promise<Session> {
	const res = await apiJson<{ token: string; user_id: string }>(ctx, 'POST', `/api/${CLIENT}/v2/sessions`, {
		email: email.trim(),
		code: code.trim(),
	});
	return { token: res.token, userId: res.user_id, email: email.trim() };
}
