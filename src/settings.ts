import { type App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type { Session } from './api/auth';
import { PRODUCTION_API_BASE } from './api/client';
import type { Snapshot } from './sync/plan';
import type GtdBrainPlugin from './main';
import { LoginModal } from './ui/loginModal';

export interface GtdBrainSettings {
	rootFolder: string;
	syncIntervalMinutes: number;
	syncOnStartup: boolean;
	keepArchivedNotes: boolean;
	apiBase: string;
}

export const DEFAULT_SETTINGS: GtdBrainSettings = {
	rootFolder: 'GTD Brain',
	syncIntervalMinutes: 5,
	syncOnStartup: true,
	keepArchivedNotes: true,
	apiBase: PRODUCTION_API_BASE,
};

// Everything in data.json: the settings, the sign-in session, the per-install id and the
// last-sync snapshot the two-way diff needs.
export interface PluginData {
	settings: GtdBrainSettings;
	session: Session | null;
	installId: string;
	snapshot: Snapshot;
}

export class GtdBrainSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: GtdBrainPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const session = this.plugin.data.session;
		new Setting(containerEl)
			.setName('Account')
			.setDesc(session ? `Signed in as ${session.email}` : 'Not signed in. Sign in with your email to sync this vault with your GTD Brain board.')
			.addButton((b) =>
				session
					? b.setButtonText('Sign out').onClick(async () => {
							await this.plugin.signOut();
							this.display();
						})
					: b
							.setButtonText('Sign in')
							.setCta()
							.onClick(() => new LoginModal(this.app, this.plugin, () => this.display()).open()),
			);

		new Setting(containerEl)
			.setName('Sync now')
			.setDesc('Push your note changes to the board and pull the latest cards into the vault.')
			.addButton((b) => b.setButtonText('Sync now').onClick(() => void this.plugin.syncNow('manual')));

		new Setting(containerEl)
			.setName('GTD folder')
			.setDesc('Vault folder that holds the GTD lists (Inbox, Next Actions, Projects, Waiting For, Someday Maybe).')
			.addText((t) =>
				t
					.setPlaceholder(DEFAULT_SETTINGS.rootFolder)
					.setValue(this.plugin.prefs.rootFolder)
					.onChange(async (value) => {
						const v = value.trim().replace(/^\/+|\/+$/g, '');
						if (!v) return;
						this.plugin.prefs.rootFolder = v;
						await this.plugin.saveAll();
					}),
			);

		new Setting(containerEl)
			.setName('Set up GTD folders')
			.setDesc('Create the list folders, the overview notes and the weekly review checklist in the GTD folder.')
			.addButton((b) => b.setButtonText('Set up').onClick(() => void this.plugin.scaffold()));

		new Setting(containerEl)
			.setName('Sync every')
			.setDesc('Minutes between automatic syncs while Obsidian is open. Zero turns automatic sync off.')
			.addText((t) =>
				t.setValue(String(this.plugin.prefs.syncIntervalMinutes)).onChange(async (value) => {
					const n = Number(value);
					if (!Number.isFinite(n) || n < 0) return;
					this.plugin.prefs.syncIntervalMinutes = Math.floor(n);
					await this.plugin.saveAll();
					this.plugin.scheduleSync();
				}),
			);

		new Setting(containerEl)
			.setName('Sync on startup')
			.setDesc('Run a sync when Obsidian opens this vault.')
			.addToggle((t) =>
				t.setValue(this.plugin.prefs.syncOnStartup).onChange(async (v) => {
					this.plugin.prefs.syncOnStartup = v;
					await this.plugin.saveAll();
				}),
			);

		new Setting(containerEl)
			.setName('Keep archived cards')
			.setDesc('Move the note of an archived card into the Archive folder instead of deleting it.')
			.addToggle((t) =>
				t.setValue(this.plugin.prefs.keepArchivedNotes).onChange(async (v) => {
					this.plugin.prefs.keepArchivedNotes = v;
					await this.plugin.saveAll();
				}),
			);

		new Setting(containerEl).setName('Advanced').setHeading();

		new Setting(containerEl)
			.setName('API address')
			.setDesc('The GTD Brain backend the plugin talks to. Leave as is unless you run your own.')
			.addText((t) =>
				t.setValue(this.plugin.prefs.apiBase).onChange(async (value) => {
					const v = value.trim().replace(/\/+$/, '');
					if (!/^https?:\/\//.test(v)) {
						new Notice('The API address must be a full URL, for example https://api.minosin.com');
						return;
					}
					this.plugin.prefs.apiBase = v;
					await this.plugin.saveAll();
				}),
			);
	}
}
