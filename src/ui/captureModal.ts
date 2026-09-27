import { type App, Modal, Notice, Platform, Setting } from 'obsidian';
import { captureFromText, type CaptureInput } from '../sync/capture';

// The quick-capture box: one line for the item, optional notes. Enter sends it; in the notes
// field Enter is a new line and Ctrl/Cmd+Enter sends.
export class CaptureModal extends Modal {
	private title = '';
	private notes = '';
	private sent = false;

	constructor(
		app: App,
		private readonly onSubmit: (input: CaptureInput) => void,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle('Capture to Inbox');
		contentEl.createEl('p', {
			text: 'Whatever has your attention. It goes to your GTD Brain Inbox; clarify it later.',
			cls: 'gtd-brain-muted',
		});

		new Setting(contentEl).setName('Item').addText((t) => {
			t.setPlaceholder('Renew the passport before the trip').onChange((v) => (this.title = v));
			t.inputEl.addClass('gtd-brain-capture-field');
			t.inputEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' && !e.isComposing) {
					e.preventDefault();
					this.submit();
				}
			});
			window.setTimeout(() => t.inputEl.focus(), 0);
		});

		new Setting(contentEl).setName('Notes').setDesc('Optional.').addTextArea((t) => {
			t.onChange((v) => (this.notes = v));
			t.inputEl.rows = 3;
			t.inputEl.addClass('gtd-brain-capture-field');
			t.inputEl.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' && (Platform.isMacOS ? e.metaKey : e.ctrlKey)) {
					e.preventDefault();
					this.submit();
				}
			});
		});

		new Setting(contentEl).addButton((b) =>
			b
				.setButtonText('Capture')
				.setCta()
				.onClick(() => this.submit()),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private submit(): void {
		if (this.sent) return;
		const input = captureFromText(this.title, this.notes);
		if (!input) {
			new Notice('Type what you want to capture first.');
			return;
		}
		this.sent = true;
		this.close();
		this.onSubmit(input);
	}
}
