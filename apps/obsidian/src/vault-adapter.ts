import { type App, TFile, TFolder } from 'obsidian';

export interface VaultAdapter {
  fileExists(path: string): boolean;
  folderExists(path: string): boolean;
  readFile(path: string): Promise<string>;
  createFile(path: string, content: string): Promise<void>;
  ensureFolder(path: string): Promise<void>;
  getFile(path: string): TFile | null;
}

export class ObsidianVaultAdapter implements VaultAdapter {
  constructor(private app: App) {}

  fileExists(path: string): boolean {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile;
  }

  folderExists(path: string): boolean {
    const folder = this.app.vault.getAbstractFileByPath(path);
    return folder instanceof TFolder;
  }

  async readFile(path: string): Promise<string> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    return this.app.vault.read(file);
  }

  async createFile(path: string, content: string): Promise<void> {
    await this.app.vault.create(path, content);
  }

  async ensureFolder(path: string): Promise<void> {
    if (!path) return;

    const parts = path.split('/').filter(Boolean);
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(currentPath);

      if (!existing) {
        await this.app.vault.createFolder(currentPath);
        continue;
      }

      if (!(existing instanceof TFolder)) {
        throw new Error(
          `Cannot create THRUNT folder because ${currentPath} is a file.`,
        );
      }
    }
  }

  getFile(path: string): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }
}
