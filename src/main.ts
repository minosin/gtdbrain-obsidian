import { Notice, Plugin } from 'obsidian';
import type { Session } from './api/auth';
import { ensureBoard, type Board } from './api/board';
import { ApiError, type ClientContext } from './api/client';
import { DEFAULT_SETTINGS, GtdBrainSettingTab, type GtdBrainSettings, type PluginData } from './settings';
import { ensureScaffold, runSync, SignedOutError } from './sync/engine';
import { LoginModal } from './ui/loginModal';
import { ObsidianVaultAdapter } from './vault/obsidianAdapter';

export default class GtdBrainPlugin extends Plugin {
	data!: PluginData;
	private syncing = false;
	private timer: number | null = null;
	private statusEl: HTMLElement | null = null;

	get prefs(): GtdBrainSettings {
		return this.data.settings;
	}

	async onload(): Promise<void> {
		await this.loadAll();
		this.addSettingTab(new GtdBrainSettingTab(this.app, this));
		this.statusEl = this.addStatusBarItem();
		this.updateStatus();

		this.addRibbonIcon('refresh-cw', 'Sync with GTD Brain', () => void this.syncNow('manual'));
		this.addCommand({ id: 'sync', name: 'Sync now', callback: () => void this.syncNow('manual') });
		this.addCommand({ id: 'scaffold', name: 'Set up GTD folders', callback: () => void this.scaffold() });
		this.addCommand({
			id: 'sign-in',
			name: 'Sign in',
			checkCallback: (checking) => {
				if (this.data.session) return false;
				if (!checking) new LoginModal(this.app, this, () => this.updateStatus()).open();
				return true;
			},
		});
		this.addCommand({
			id: 'sign-out',
			name: 'Sign out',
			checkCallback: (checking) => {
				if (!this.data.session) return false;
				if (!checking) void this.signOut();
				return true;
			},
		});
		this.addCommand({
			id: 'open-dashboard',
			name: 'Open the web app',
			callback: () => window.open('https://dashboard.gtdbrain.com/?source=obsidian'),
		});

		this.app.workspace.onLayoutReady(() => {
			this.scheduleSync();
			if (this.prefs.syncOnStartup && this.data.session) void this.syncNow('startup');
		});
	}

	onunload(): void {
		if (this.timer !== null) window.clearInterval(this.timer);
	}

	clientContext(): ClientContext {
		return {
			apiBase: this.prefs.apiBase,
			version: this.manifest.version,
			installId: this.data.installId,
			token: this.data.session?.token ?? null,
		};
	}

	async signIn(session: Session): Promise<void> {
		this.data.session = session;
		this.data.snapshot = {};
		await this.saveAll();
		this.updateStatus();
		let board: Board | null = null;
		try {
			board = await ensureBoard(this.clientContext());
		} catch (e) {
			// An older backend without POST /board: GET during the sync still works for
			// accounts that already have a board.
			if (!(e instanceof ApiError && e.status === 404)) throw e;
		}
		await ensureScaffold(new ObsidianVaultAdapter(this.app), this.prefs.rootFolder, board);
		await this.syncNow('sign-in');
	}

	async signOut(): Promise<void> {
		this.data.session = null;
		this.data.snapshot = {};
		await this.saveAll();
		this.updateStatus();
		new Notice('Signed out. Your notes stay in the vault.');
	}

	async scaffold(): Promise<void> {
		const vault = new ObsidianVaultAdapter(this.app);
		let board: Board | null = null;
		if (this.data.session) {
			try {
				board = await ensureBoard(this.clientContext());
			} catch (e) {
				if (!(e instanceof ApiError && e.status === 404)) {
					new Notice(`Could not reach GTD Brain: ${e instanceof Error ? e.message : String(e)}`);
				}
			}
		}
		await ensureScaffold(vault, this.prefs.rootFolder, board);
		new Notice(`GTD folders are ready in "${this.prefs.rootFolder}".`);
		if (this.data.session) await this.syncNow('scaffold');
	}

	scheduleSync(): void {
		if (this.timer !== null) {
			window.clearInterval(this.timer);
			this.timer = null;
		}
		const minutes = this.prefs.syncIntervalMinutes;
		if (minutes > 0) {
			this.timer = window.setInterval(() => void this.syncNow('interval'), minutes * 60 * 1000);
			this.registerInterval(this.timer);
		}
	}

	async syncNow(trigger: 'manual' | 'startup' | 'interval' | 'sign-in' | 'scaffold'): Promise<void> {
		if (!this.data.session) {
			if (trigger === 'manual') new LoginModal(this.app, this, () => this.updateStatus()).open();
			return;
		}
		if (this.syncing) return;
		this.syncing = true;
		this.updateStatus('syncing…');
		try {
			const result = await runSync(
				this.clientContext(),
				new ObsidianVaultAdapter(this.app),
				{ root: this.prefs.rootFolder, keepArchived: this.prefs.keepArchivedNotes },
				this.data.snapshot,
			);
			this.data.snapshot = result.snapshot;
			await this.saveAll();
			for (const w of result.warnings) console.warn('[GTD Brain]', w);
			if (result.errors.length > 0) {
				console.error('[GTD Brain] sync errors', result.errors);
				new Notice(`GTD Brain sync finished with ${result.errors.length} problem(s): ${result.errors[0]}`, 8000);
			} else if (trigger === 'manual' || trigger === 'sign-in' || trigger === 'scaffold') {
				new Notice(`GTD Brain synced: ${result.pushed} change(s) pushed, ${result.pulled} note(s) updated.`);
			}
			this.updateStatus();
		} catch (e) {
			if (e instanceof SignedOutError) {
				this.data.session = null;
				await this.saveAll();
				this.updateStatus();
				new Notice('Your GTD Brain session expired. Please sign in again.');
			} else {
				console.error('[GTD Brain] sync failed', e);
				this.updateStatus('sync failed');
				if (trigger !== 'interval') new Notice(`GTD Brain sync failed: ${e instanceof Error ? e.message : String(e)}`);
			}
		} finally {
			this.syncing = false;
		}
	}

	private updateStatus(state?: string): void {
		if (!this.statusEl) return;
		const session = this.data.session;
		this.statusEl.setText(session ? `GTD Brain: ${state ?? 'synced'}` : 'GTD Brain: signed out');
	}

	async loadAll(): Promise<void> {
		const raw = ((await this.loadData()) ?? {}) as Partial<PluginData>;
		this.data = {
			settings: Object.assign({}, DEFAULT_SETTINGS, raw.settings ?? {}),
			session: raw.session ?? null,
			installId: raw.installId ?? crypto.randomUUID(),
			snapshot: raw.snapshot ?? {},
		};
		if (!raw.installId) await this.saveAll();
	}

	async saveAll(): Promise<void> {
		await this.saveData(this.data);
	}
}
