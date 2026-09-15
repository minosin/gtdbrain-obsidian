import { type App, normalizePath, TFile, TFolder } from 'obsidian';
import type { VaultAdapter } from '../sync/engine';
import type { LocalNote } from '../sync/plan';
import { CARD_KEYS, type CardFields, fieldsToFrontmatter, FM_CONTEXT, FM_ID, FM_LIST, FM_PROJECT, FM_SINCE, FM_WHO, type Frontmatter, parseSimpleFrontmatter, splitFrontmatter, stringField } from './notes';

export class ObsidianVaultAdapter implements VaultAdapter {
	constructor(private readonly app: App) {}

	exists(path: string): boolean {
		return this.app.vault.getAbstractFileByPath(normalizePath(path)) !== null;
	}

	async ensureFolder(path: string): Promise<void> {
		const parts = normalizePath(path).split('/');
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const existing = this.app.vault.getAbstractFileByPath(current);
			if (existing instanceof TFolder) continue;
			if (existing instanceof TFile) throw new Error(`${current} is a note, not a folder`);
			await this.app.vault.createFolder(current);
		}
	}

	async listCardNotes(root: string): Promise<LocalNote[]> {
		const prefix = normalizePath(root) + '/';
		const out: LocalNote[] = [];
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (!file.path.startsWith(prefix)) continue;
			const folder = file.parent?.path ?? '';
			if (folder === normalizePath(root)) continue; // overview + weekly review notes
			const content = await this.app.vault.cachedRead(file);
			const { yaml, body } = splitFrontmatter(content);
			// The metadata cache lags behind a note the sync just wrote; fall back to the
			// flat frontmatter this plugin writes itself.
			const fm: Frontmatter | undefined = this.app.metadataCache.getFileCache(file)?.frontmatter ?? (yaml !== null ? parseSimpleFrontmatter(yaml) : undefined);
			out.push({
				path: file.path,
				folder,
				basename: file.basename,
				id: stringField(fm, FM_ID),
				list: stringField(fm, FM_LIST),
				context: stringField(fm, FM_CONTEXT),
				project: stringField(fm, FM_PROJECT),
				who: stringField(fm, FM_WHO),
				since: stringField(fm, FM_SINCE),
				body,
			});
		}
		return out;
	}

	async create(path: string, content: string): Promise<void> {
		await this.app.vault.create(normalizePath(path), content);
	}

	async rename(path: string, newPath: string): Promise<void> {
		const file = this.file(path);
		await this.app.fileManager.renameFile(file, normalizePath(newPath));
	}

	async writeCard(path: string, fields: CardFields | null, body: string | null): Promise<void> {
		const file = this.file(path);
		if (body !== null) {
			await this.app.vault.process(file, (data) => {
				const { yaml } = splitFrontmatter(data);
				const head = yaml === null ? '' : `---\n${yaml}\n---\n`;
				return head + (body ? body + '\n' : '');
			});
		}
		if (fields) {
			const wanted = fieldsToFrontmatter(fields);
			await this.app.fileManager.processFrontMatter(file, (fm: Frontmatter) => {
				for (const key of CARD_KEYS) delete fm[key];
				Object.assign(fm, wanted);
			});
		}
	}

	async writeGenerated(path: string, content: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (existing instanceof TFile) {
			const current = await this.app.vault.cachedRead(existing);
			if (current === content) return;
			await this.app.vault.process(existing, () => content);
			return;
		}
		if (existing) throw new Error(`${path} is a folder`);
		await this.app.vault.create(normalizePath(path), content);
	}

	async trash(path: string): Promise<void> {
		await this.app.fileManager.trashFile(this.file(path));
	}

	private file(path: string): TFile {
		const file = this.app.vault.getFileByPath(normalizePath(path));
		if (!file) throw new Error(`Note not found: ${path}`);
		return file;
	}
}
