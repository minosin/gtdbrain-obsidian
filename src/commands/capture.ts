import { type Editor, type MarkdownFileInfo, type MarkdownView, Notice } from 'obsidian';
import type { CaptureVia } from '../api/board';
import type GtdBrainPlugin from '../main';
import { captureFromSelection, type CaptureInput, captureToInbox, inboxFolder } from '../sync/capture';
import { CaptureModal } from '../ui/captureModal';
import { LoginModal } from '../ui/loginModal';
import { ObsidianVaultAdapter } from '../vault/obsidianAdapter';

// "Capture to Inbox" (a quick-capture box) and "Capture selection to Inbox" (the selected text,
// from the palette or the editor's right-click menu). No default hotkeys, per Obsidian's plugin
// guidelines: users bind them in Settings → Hotkeys.
export function registerCaptureCommands(plugin: GtdBrainPlugin): void {
	const openBox = (): void => new CaptureModal(plugin.app, (input) => void capture(plugin, input, 'command')).open();

	plugin.addRibbonIcon('inbox', 'Capture to GTD Brain Inbox', openBox);
	plugin.addCommand({ id: 'capture', name: 'Capture to Inbox', icon: 'inbox', callback: openBox });
	plugin.addCommand({
		id: 'capture-selection',
		name: 'Capture selection to Inbox',
		icon: 'inbox',
		editorCheckCallback: (checking, editor, ctx) => {
			const input = selectionInput(plugin, editor, ctx);
			if (!input) return false;
			if (!checking) void capture(plugin, input, 'selection');
			return true;
		},
	});
	plugin.registerEvent(
		plugin.app.workspace.on('editor-menu', (menu, editor, ctx) => {
			const input = selectionInput(plugin, editor, ctx);
			if (!input) return;
			menu.addItem((item) =>
				item
					.setTitle('Capture selection to GTD Brain Inbox')
					.setIcon('inbox')
					.onClick(() => void capture(plugin, input, 'selection')),
			);
		}),
	);
}

function selectionInput(plugin: GtdBrainPlugin, editor: Editor, ctx: MarkdownView | MarkdownFileInfo): CaptureInput | null {
	const selection = editor.getSelection();
	if (!selection.trim()) return null;
	const file = ctx.file;
	const link = file ? plugin.app.fileManager.generateMarkdownLink(file, `${inboxFolder(plugin.prefs.rootFolder)}/capture.md`) : null;
	return captureFromSelection(selection, link);
}

export async function capture(plugin: GtdBrainPlugin, input: CaptureInput, via: CaptureVia): Promise<void> {
	const signedIn = plugin.data.session !== null;
	try {
		const outcome = await plugin.exclusive(() => captureToInbox(signedIn ? plugin.clientContext() : null, new ObsidianVaultAdapter(plugin.app), plugin.prefs.rootFolder, input, via));
		switch (outcome.status) {
			case 'sent':
				if (outcome.snapshot) {
					plugin.data.snapshot[outcome.card.id] = outcome.snapshot;
					await plugin.saveAll();
				}
				new Notice(`Captured to your GTD Brain Inbox: ${input.title}`);
				break;
			case 'membership':
				plugin.membership = { signupUrl: outcome.signupUrl ?? plugin.membership?.signupUrl ?? null, pending: (plugin.membership?.pending ?? 0) + 1 };
				plugin.updateStatus();
				plugin.openMembership(input.title);
				break;
			case 'signed-out':
				if (signedIn) {
					plugin.data.session = null;
					await plugin.saveAll();
					plugin.updateStatus();
				}
				new Notice(`Saved to Inbox in your vault. ${signedIn ? 'Your GTD Brain session expired: sign in' : 'Sign in'} to send it to GTD Brain.`, 8000);
				new LoginModal(plugin.app, plugin, () => plugin.updateStatus()).open();
				break;
			case 'kept':
				console.error('[GTD Brain] capture not sent', outcome.error);
				new Notice(`Saved to Inbox in your vault. Could not reach GTD Brain (${outcome.error}); the next sync sends it.`, 8000);
				break;
		}
	} catch (e) {
		console.error('[GTD Brain] capture failed', e);
		new Notice(`Could not capture: ${e instanceof Error ? e.message : String(e)}`, 8000);
	}
}
