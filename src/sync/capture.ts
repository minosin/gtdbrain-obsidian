import { type ApiCard, captureCard, type CaptureVia } from '../api/board';
import { ApiError, type ClientContext, isMembershipRequired } from '../api/client';
import { ROLE_FOLDERS, safeFileName } from '../vault/layout';
import { renderNote } from '../vault/notes';
import type { VaultAdapter } from './engine';
import { type SnapshotEntry, snapshotEntryFor, untitledIfEmpty } from './plan';

// Capture: one item straight into the Inbox, without waiting for a sync. The item always ends
// up as a note in the vault's Inbox folder. When the board takes it, the note is written with
// the card's id and counts as synced. When it does not (no membership, signed out, offline),
// the note is written without an id, so the next sync that can send it creates the card.
// Nothing typed is ever lost.

export type CaptureInput = { title: string; notes: string };

export type CaptureOutcome =
	// snapshot is null when the card is on the board but its note could not be written: the next
	// sync's pull writes it.
	| { status: 'sent'; path: string; card: ApiCard; snapshot: SnapshotEntry | null }
	| { status: 'membership'; path: string; signupUrl: string | null }
	| { status: 'signed-out'; path: string }
	| { status: 'kept'; path: string; error: string };

// Longer titles are cut at a word and the full line moves into the notes, so the note's file
// name (which is the card title for a note the sync sends later) stays readable.
const MAX_TITLE = 120;

// "- [ ] Call Bob", "* Call Bob", "1. Call Bob", "## Call Bob" → "Call Bob".
function stripMarkup(line: string): string {
	return line
		.replace(/^\s*(?:[-*+]\s+\[[ xX]?\]\s*|[-*+]\s+|\d+[.)]\s+|#{1,6}\s+|>\s*)/, '')
		.trim();
}

function splitTitle(line: string): { title: string; overflow: string | null } {
	if (line.length <= MAX_TITLE) return { title: line, overflow: null };
	const cut = line.slice(0, MAX_TITLE);
	const space = cut.lastIndexOf(' ');
	return { title: (space > MAX_TITLE / 2 ? cut.slice(0, space) : cut).trim() + '…', overflow: line };
}

// Typed capture: the first non-empty line is the title, anything else is the notes.
export function captureFromText(title: string, notes = ''): CaptureInput | null {
	const lines = title.split(/\r?\n/).map(stripMarkup).filter(Boolean);
	const first = lines.shift();
	if (!first) return null;
	const { title: t, overflow } = splitTitle(first);
	const rest = [overflow, lines.join('\n'), notes.trim()].filter((s): s is string => !!s);
	return { title: t, notes: rest.join('\n\n') };
}

// Selected text: its first line is the title, the whole selection (when there is more to it)
// and a link back to the note it came from are the notes.
export function captureFromSelection(selection: string, sourceLink: string | null): CaptureInput | null {
	const text = selection.replace(/\r\n/g, '\n').trim();
	const lines = text.split('\n').map(stripMarkup).filter(Boolean);
	const first = lines[0];
	if (!first) return null;
	const { title, overflow } = splitTitle(first);
	const parts: string[] = [];
	if (lines.length > 1) parts.push(text);
	else if (overflow) parts.push(overflow);
	if (sourceLink) parts.push(`Captured from ${sourceLink}`);
	return { title, notes: parts.join('\n\n') };
}

export function inboxFolder(root: string): string {
	return `${root}/${ROLE_FOLDERS.inbox}`;
}

function uniquePath(vault: VaultAdapter, folder: string, basename: string): string {
	let candidate = `${folder}/${basename}.md`;
	let n = 2;
	while (vault.exists(candidate)) candidate = `${folder}/${basename} (${n++}).md`;
	return candidate;
}

function unsentNote(notes: string): string {
	return notes ? notes.replace(/\s+$/, '') + '\n' : '';
}

/**
 * Sends [input] to the board's Inbox (when [ctx] has a session) and writes its note. The card is
 * created before the note so an id-less note never sits in the vault while the board already
 * has the card (another device syncing the vault would create it a second time).
 */
export async function captureToInbox(ctx: ClientContext | null, vault: VaultAdapter, root: string, input: CaptureInput, via: CaptureVia): Promise<CaptureOutcome> {
	const folder = inboxFolder(root);
	await vault.ensureFolder(root);
	await vault.ensureFolder(folder);
	const path = uniquePath(vault, folder, untitledIfEmpty(safeFileName(input.title)));

	const keep = async (): Promise<void> => vault.create(path, unsentNote(input.notes));
	if (!ctx?.token) {
		await keep();
		return { status: 'signed-out', path };
	}

	let card: ApiCard;
	try {
		card = await captureCard(ctx, { title: input.title, ...(input.notes ? { notes: input.notes } : {}), via });
	} catch (e) {
		await keep();
		if (isMembershipRequired(e)) return { status: 'membership', path, signupUrl: e.signupUrl };
		if (e instanceof ApiError && e.status === 401) return { status: 'signed-out', path };
		return { status: 'kept', path, error: e instanceof Error ? e.message : String(e) };
	}

	const fields = { id: card.id, list: ROLE_FOLDERS.inbox, kind: card.kind ?? 'card', context: null, project: null, who: null, since: null };
	try {
		await vault.create(path, renderNote(fields, card.notes ?? input.notes));
	} catch {
		return { status: 'sent', path, card, snapshot: null };
	}
	return { status: 'sent', path, card, snapshot: snapshotEntryFor(card, path) };
}
