import { type App, Modal, Setting } from 'obsidian';

// Shown once after sign-in, when a manual sync had changes it could not send, and when a capture
// could not go to the board ([captured] is its title).
export class MembershipModal extends Modal {
	constructor(
		app: App,
		private readonly signupUrl: string,
		private readonly pending: number,
		private readonly captured: string | null = null,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle('Start your free month');
		contentEl.createEl('p', {
			text: this.captured
				? `“${this.captured}” is saved in the Inbox folder of your vault. Sending it to your GTD Brain Inbox — and on to the web, the phone apps and your assistants — needs a GTD Brain membership.`
				: 'Syncing this vault with your GTD Brain board — both ways, with the web, the phone apps and your assistants — needs a GTD Brain membership, the same one as on the web and the phone apps.',
		});
		contentEl.createEl('p', {
			text:
				this.pending > 0
					? `${this.pending} change(s) are waiting in your notes. They stay there and sync as soon as your membership starts.`
					: 'Changes you make here stay in your notes until then, and sync as soon as your membership starts.',
		});
		contentEl.createEl('p', {
			text: 'The yearly plan starts with one month free. Cancel before it ends and you pay nothing. Checkout opens in your browser.',
			cls: 'gtd-brain-muted',
		});
		new Setting(contentEl)
			.addButton((b) => b.setButtonText('Not now').onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText('Start your free month')
					.setCta()
					.onClick(() => {
						window.open(this.signupUrl);
						this.close();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
