import { App, Modal, Notice } from 'obsidian';
import type { ExportProfile, AssembledContext } from './types';
import { buildExportLogEntry } from './export-log';
import type { ExportLogEntry } from './export-log';

/**
 * Modal for "Hyper Copy for Agent" -- lets the user pick an export profile,
 * previews the assembled context, shows a token estimate, and copies the
 * rendered markdown to the clipboard.
 */
export class HyperCopyModal extends Modal {
  constructor(
    app: App,
    private profiles: ExportProfile[],
    private onSelect: (agentId: string) => Promise<AssembledContext | { error: string }>,
    private onCopy: (text: string, entry: ExportLogEntry) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Hyper Copy for Agent');

    const listEl = this.contentEl.createDiv({ cls: 'thrunt-profile-list' });

    for (const profile of this.profiles) {
      const item = listEl.createDiv({ cls: 'thrunt-profile-item' });

      item.createEl('div', { text: profile.label, cls: 'thrunt-profile-label' });
      item.createEl('div', { text: profile.agentId, cls: 'thrunt-profile-id' });

      item.addEventListener('click', () => {
        void this.selectProfile(profile);
      });
    }
  }

  private async selectProfile(profile: ExportProfile): Promise<void> {
    // Clear any existing preview (everything after the profile list)
    const existingPreview = this.contentEl.querySelector('.thrunt-preview');
    if (existingPreview) existingPreview.remove();
    const existingBadge = this.contentEl.querySelector('.thrunt-token-badge');
    if (existingBadge) existingBadge.parentElement?.remove();
    const existingBtn = this.contentEl.querySelector('.thrunt-copy-btn');
    if (existingBtn) existingBtn.parentElement?.remove();

    // Loading indicator
    const loadingEl = this.contentEl.createEl('p', { text: 'Assembling context...' });
    loadingEl.classList.add('thrunt-loading');

    const result = await this.onSelect(profile.agentId);

    loadingEl.remove();

    // Error check
    if ('error' in result) {
      new Notice((result as { error: string }).error);
      return;
    }

    const assembled = result as AssembledContext;

    // Build rendered text
    const renderedParts: string[] = [];
    for (const section of assembled.sections) {
      renderedParts.push(`<!-- source: ${section.sourcePath} -->`);
      renderedParts.push(`## ${section.heading}`);
      renderedParts.push(section.content);
      renderedParts.push('');
    }
    const renderedText = renderedParts.join('\n');

    // Preview container
    const previewEl = this.contentEl.createDiv({ cls: 'thrunt-preview' });

    const preEl = previewEl.createEl('pre');
    preEl.textContent = renderedText;

    // Token estimate badge row
    const badgeRow = this.contentEl.createDiv({ cls: 'thrunt-token-row' });

    badgeRow.createSpan({
      cls: 'thrunt-token-badge',
      text: `${assembled.tokenEstimate} tokens`,
    });

    if (assembled.tokenEstimate > profile.maxTokenEstimate) {
      badgeRow.createSpan({
        cls: 'thrunt-token-warning',
        text: `(exceeds ${profile.maxTokenEstimate} budget)`,
      });
    }

    // Copy button
    const btnRow = this.contentEl.createDiv({ cls: 'thrunt-copy-row' });

    const copyBtn = btnRow.createEl('button', { text: 'Copy to clipboard' });
    copyBtn.classList.add('mod-cta', 'thrunt-copy-btn');
    copyBtn.addEventListener('click', () => {
      void navigator.clipboard.writeText(renderedText).then(() => {
        const entry = buildExportLogEntry(assembled, profile.label);
        this.onCopy(renderedText, entry);
        new Notice(`Copied ${assembled.tokenEstimate} tokens for ${profile.label}`);
        this.close();
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
