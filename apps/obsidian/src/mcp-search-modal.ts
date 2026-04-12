import { App, Modal, Setting } from 'obsidian';
import type { McpClient } from './mcp-client';
import type { SearchResult } from './types';

/**
 * Modal for searching the THRUNT knowledge graph via MCP queryKnowledge tool.
 * Renders results with entity-type badges and Open/Create note actions.
 */
export class McpSearchModal extends Modal {
  private resultsEl!: HTMLElement;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    app: App,
    private mcpClient: McpClient,
    private onOpenNote: (path: string) => void,
    private onCreateNote: (name: string, entityType: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Search THRUNT Knowledge Graph');

    new Setting(this.contentEl)
      .setName('Search query')
      .addText((text) => {
        text.setPlaceholder('Search entities, techniques, actors...');
        text.onChange((value) => {
          if (this.searchTimer) clearTimeout(this.searchTimer);
          this.searchTimer = setTimeout(() => {
            void this.search(value);
          }, 300);
        });
      });

    this.resultsEl = this.contentEl.createDiv({ cls: 'thrunt-search-results' });
  }

  private async search(query: string): Promise<void> {
    this.resultsEl.empty();

    if (query.length < 2) {
      this.resultsEl.createEl('p', { text: 'Type at least 2 characters...' });
      return;
    }

    const result = await this.mcpClient.callTool('queryKnowledge', { query });

    if (!result || result.isError) {
      this.resultsEl.createEl('p', { text: 'Search failed. Check MCP connection.' });
      return;
    }

    let results: SearchResult[];
    try {
      results = JSON.parse(result.content[0]!.text) as SearchResult[];
    } catch {
      this.resultsEl.createEl('p', { text: 'Search failed. Check MCP connection.' });
      return;
    }

    if (results.length === 0) {
      this.resultsEl.createEl('p', { text: 'No results found.' });
      return;
    }

    for (const item of results) {
      const container = this.resultsEl.createDiv({ cls: 'thrunt-search-result' });

      // Badge -- styled via CSS class + data-entity-type attribute
      const badge = container.createSpan({
        cls: 'thrunt-entity-badge',
        text: item.entityType.toUpperCase(),
      });
      badge.dataset.entityType = item.entityType;

      // Name
      container.createSpan({ cls: 'thrunt-result-name', text: item.name });

      // Snippet
      container.createEl('p', { text: item.snippet });

      // Action buttons
      const actionsEl = container.createDiv();
      const openBtn = actionsEl.createEl('button', { text: 'Open note' });
      openBtn.addEventListener('click', () => {
        this.onOpenNote(item.id);
        this.close();
      });

      const createBtn = actionsEl.createEl('button', {
        text: 'Create note',
        cls: 'thrunt-result-action',
      });
      createBtn.addEventListener('click', () => {
        this.onCreateNote(item.name, item.entityType);
        this.close();
      });
    }
  }

  onClose(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.contentEl.empty();
  }
}
