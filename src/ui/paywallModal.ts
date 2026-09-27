import { type App, Modal, Setting } from 'obsidian';

export class PaywallModal extends Modal {
	constructor(
		app: App,
		private readonly message: string,
		private readonly signupUrl: string | null,
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle('Start your free month');
		const signupUrl = this.signupUrl;
		if (signupUrl) {
			contentEl.createEl('p', {
				text: 'GTD Brain is a membership. The yearly plan starts with one month free — cancel before it ends and you pay nothing.',
			});
			new Setting(contentEl).addButton((b) =>
				b
					.setButtonText('Start your free month →')
					.setCta()
					.onClick(() => {
						window.open(signupUrl);
						this.close();
					}),
			);
		} else {
			contentEl.createEl('p', { text: this.message });
		}
		contentEl.createEl('p', { text: 'Already a member? Your notes sync on their own.', cls: 'gtd-brain-muted' });
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
