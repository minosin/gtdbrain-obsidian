import { type App, Modal, Notice, Setting } from 'obsidian';
import { isValidEmail, requestLoginCode, verifyLoginCode } from '../api/auth';
import type GtdBrainPlugin from '../main';

// Two-step passwordless sign-in: email → 6-digit code from the email GTD Brain sends.
export class LoginModal extends Modal {
	private email = '';
	private code = '';
	private step: 'email' | 'code' = 'email';
	private busy = false;

	constructor(
		app: App,
		private readonly plugin: GtdBrainPlugin,
		private readonly onDone: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.setTitle('Sign in to GTD Brain');

		if (this.step === 'email') {
			contentEl.createEl('p', {
				text: 'Enter your email. We send you a one-time code — no password. A new email creates a free GTD Brain account.',
				cls: 'gtd-brain-muted',
			});
			new Setting(contentEl).setName('Email').addText((t) => {
				t.setPlaceholder('you@example.com')
					.setValue(this.email)
					.onChange((v) => (this.email = v));
				t.inputEl.type = 'email';
				t.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') void this.sendCode();
				});
				window.setTimeout(() => t.inputEl.focus(), 0);
			});
			new Setting(contentEl).addButton((b) =>
				b
					.setButtonText('Send code')
					.setCta()
					.onClick(() => void this.sendCode()),
			);
		} else {
			contentEl.createEl('p', { text: `We emailed a code to ${this.email}. Enter it below.`, cls: 'gtd-brain-muted' });
			new Setting(contentEl).setName('Code').addText((t) => {
				t.setPlaceholder('123456')
					.setValue(this.code)
					.onChange((v) => (this.code = v));
				t.inputEl.inputMode = 'numeric';
				t.inputEl.autocomplete = 'one-time-code';
				t.inputEl.addEventListener('keydown', (e) => {
					if (e.key === 'Enter') void this.verify();
				});
				window.setTimeout(() => t.inputEl.focus(), 0);
			});
			new Setting(contentEl)
				.addButton((b) =>
					b.setButtonText('Use another email').onClick(() => {
						this.step = 'email';
						this.code = '';
						this.render();
					}),
				)
				.addButton((b) => b.setButtonText('Resend code').onClick(() => void this.sendCode()))
				.addButton((b) =>
					b
						.setButtonText('Sign in')
						.setCta()
						.onClick(() => void this.verify()),
				);
		}
	}

	private async sendCode(): Promise<void> {
		if (this.busy) return;
		if (!isValidEmail(this.email)) {
			new Notice('Please enter a valid email address.');
			return;
		}
		this.busy = true;
		try {
			await requestLoginCode(this.plugin.clientContext(), this.email);
			this.step = 'code';
			this.render();
		} catch (e) {
			new Notice(`Could not send the code: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			this.busy = false;
		}
	}

	private async verify(): Promise<void> {
		if (this.busy) return;
		if (!this.code.trim()) {
			new Notice('Please enter the code from the email.');
			return;
		}
		this.busy = true;
		try {
			const session = await verifyLoginCode(this.plugin.clientContext(), this.email, this.code);
			await this.plugin.signIn(session);
			new Notice(`Signed in as ${session.email}`);
			this.close();
			this.onDone();
		} catch (e) {
			new Notice(`Sign-in failed: ${e instanceof Error ? e.message : String(e)}`);
		} finally {
			this.busy = false;
		}
	}
}
