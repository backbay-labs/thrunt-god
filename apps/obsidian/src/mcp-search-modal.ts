import { App, Modal, Setting } from 'obsidian';
import type { McpClient } from './mcp-client';
import type { SearchResult } from './types';

/**
 * Badge background colors per entity type.
 */
const BADGE_COLORS: Record<string, string> = {
  ttp: '#4a90d9',
  'ioc/ip': '#d94a4a',
  'ioc/domain': '#d94a4a',
  'ioc/hash': '#d94a4a',
  actor: '#d9a04a',
  tool: '#4ad97a',
  infrastructure: '#9a4ad9',
  datasource: '#4ad9d9',
};

function getBadgeColor(entityType: string): string {
  return BADGE_COLORS[entityType] ?? '#888';
}

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

      // Badge
      const badge = container.createSpan({ text: item.entityType.toUpperCase() });
      badge.style.backgroundColor = getBadgeColor(item.entityType);
      badge.style.color = '#fff';
      badge.style.padding = '2px 6px';
      badge.style.borderRadius = '3px';
      badge.style.fontSize = '0.75em';
      badge.style.marginRight = '8px';

      // Name
      const nameEl = container.createSpan({ text: item.name });
      nameEl.style.fontWeight = 'bold';

      // Snippet
      container.createEl('p', { text: item.snippet });

      // Action buttons
      const actionsEl = container.createDiv();
      const openBtn = actionsEl.createEl('button', { text: 'Open note' });
      openBtn.addEventListener('click', () => {
        this.onOpenNote(item.id);
        this.close();
      });

      const createBtn = actionsEl.createEl('button', { text: 'Create note' });
      createBtn.style.marginLeft = '8px';
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
