// Runtime stand-ins for the handful of `obsidian` exports the pure modules import.
export function normalizePath(p: string): string {
	return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}

export type RequestUrlParam = { url: string; method?: string; headers?: Record<string, string>; body?: string; throw?: boolean };
export type RequestUrlResponse = { status: number; text: string; json: unknown; headers: Record<string, string>; arrayBuffer: ArrayBuffer };

// Tests install a handler here to fake the backend.
export let requestHandler: ((req: RequestUrlParam) => RequestUrlResponse | Promise<RequestUrlResponse>) | null = null;
export function setRequestHandler(h: typeof requestHandler): void {
	requestHandler = h;
}
export function requestUrl(req: RequestUrlParam): Promise<RequestUrlResponse> {
	if (!requestHandler) throw new Error('no request handler installed');
	return Promise.resolve(requestHandler(req));
}
