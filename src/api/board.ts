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

export type Board = { columns: ApiColumn[]; cards: ApiCard[]; contexts?: ApiContext[]; seeded?: boolean };

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
