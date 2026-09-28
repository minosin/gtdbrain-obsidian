import { apiJson, CLIENT, type ClientContext } from './client';

export type ColumnKind = 'normal' | 'next' | 'projects' | 'flexible';
export type CardKind = 'card' | 'action' | 'project';

export type ApiColumn = {
	id: string;
	kind: ColumnKind;
	label: string;
	order: number;
	cardIds: string[];
};

export type ApiCard = {
	id: string;
	kind: CardKind;
	title: string;
	columnId: string;
	context?: string | null;
	projectId?: string | null;
	notes?: string | null;
	who?: string | null;
	since?: string | null;
	archived?: boolean;
	createdAt?: string;
	updatedAt?: string;
};

export type ApiContext = { id: string; label: string; color: string; order?: number };

// Only sent to plugin builds that handle it. signupUrl comes with active: false.
export type Membership = { active: boolean; signupUrl?: string };

export type Board = { columns: ApiColumn[]; cards: ApiCard[]; contexts?: ApiContext[]; seeded?: boolean; membership?: Membership };

const GTD = `/api/${CLIENT}/v2/gtd`;

export function fetchBoard(ctx: ClientContext): Promise<Board> {
	return apiJson<Board>(ctx, 'GET', `${GTD}/board`);
}

// Seeds the starter board for a brand-new account (no-op otherwise) and returns it.
export function ensureBoard(ctx: ClientContext): Promise<Board> {
	return apiJson<Board>(ctx, 'POST', `${GTD}/board`);
}

export type CreateCardRequest = {
	title: string;
	columnId: string;
	kind: CardKind;
	notes?: string;
	context?: string;
	who?: string;
	since?: string;
};

export function createCard(ctx: ClientContext, req: CreateCardRequest): Promise<ApiCard> {
	return apiJson<ApiCard>(ctx, 'POST', `${GTD}/cards`, req);
}

// A capture from the capture commands. Without columnId the backend puts it in the Inbox, and
// toIndex 0 puts it on top, like a capture from every other GTD Brain client. `via` says which
// command sent it; it rides on the request the capture needs anyway (the backend's request log
// keeps it), so the plugin makes no separate analytics call.
export type CaptureVia = 'command' | 'selection';

export function captureCard(ctx: ClientContext, req: { title: string; notes?: string; via: CaptureVia }): Promise<ApiCard> {
	return apiJson<ApiCard>(ctx, 'POST', `${GTD}/cards`, { ...req, toIndex: 0 });
}

// Only the keys present are sent; a null value clears that field on the board.
export type CardPatch = Partial<Record<'title' | 'notes' | 'context' | 'who' | 'since' | 'projectId', string | null>>;

export function updateCard(ctx: ClientContext, cardId: string, patch: CardPatch): Promise<ApiCard> {
	return apiJson<ApiCard>(ctx, 'PATCH', `${GTD}/cards/${cardId}`, patch);
}

// The backend re-derives the card kind from the destination column (a plain card moved
// to Next Actions becomes an action, and so on), so a move needs only the target.
export function moveCard(ctx: ClientContext, cardId: string, toColumnId: string): Promise<ApiCard> {
	return apiJson<ApiCard>(ctx, 'POST', `${GTD}/cards/${cardId}/move`, { toColumnId });
}

export function archiveCard(ctx: ClientContext, cardId: string): Promise<ApiCard> {
	return apiJson<ApiCard>(ctx, 'POST', `${GTD}/cards/${cardId}/archive`);
}
