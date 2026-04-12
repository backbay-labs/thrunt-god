import { App, FuzzySuggestModal, Notice } from 'obsidian';
import type { FuzzyMatch } from 'obsidian';
import type ThruntGodPlugin from './main';
import type { CanvasTemplateName } from './modals';
import { HyperCopyModal } from './hyper-copy-modal';
import { VERDICT_VALUES, type VerdictValue } from './verdict';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface ChooserItem {
  id: string;
  name: string;
  description: string;
}

// ---------------------------------------------------------------------------
// CopyChooserModal
// ---------------------------------------------------------------------------

const COPY_ITEMS: readonly ChooserItem[] = [
  { id: 'hyper-copy', name: 'Hyper Copy for Agent', description: 'Select an export profile and preview assembled context' },
  { id: 'query-writer', name: 'Copy for Query Writer', description: 'Copy current note context for query writing' },
  { id: 'intel-advisor', name: 'Copy for Intel Advisor', description: 'Copy current note context for intel analysis' },
  { id: 'ioc-context', name: 'Copy IOC Context', description: 'Copy IOC context for signal triage' },
];

export class CopyChooserModal extends FuzzySuggestModal<ChooserItem> {
  private plugin: ThruntGodPlugin;

  constructor(app: App, plugin: ThruntGodPlugin) {
    super(app);
    this.plugin = plugin;
    this.setPlaceholder('Choose a copy action...');
  }

  getItems(): ChooserItem[] {
    return [...COPY_ITEMS];
  }

  getItemText(item: ChooserItem): string {
    return item.name;
  }

  renderSuggestion(match: FuzzyMatch<ChooserItem>, el: HTMLElement): void {
    el.createDiv({ cls: 'thrunt-chooser-name', text: match.item.name });
    el.createDiv({ cls: 'thrunt-chooser-desc', text: match.item.description });
  }

  onChooseItem(item: ChooserItem, _evt: MouseEvent | KeyboardEvent): void {
    if (item.id === 'hyper-copy') {
      const file = this.plugin.app.workspace.getActiveFile();
      if (!file) {
        new Notice('No active file. Open a note first.');
        return;
      }
      const profiles = this.plugin.workspaceService.getAvailableProfiles();
      new HyperCopyModal(
        this.plugin.app,
        profiles,
        (agentId: string) =>
          this.plugin.workspaceService.assembleContextForProfile(file.path, agentId),
        (text: string, entry) => {
          void this.plugin.workspaceService.logExport(entry);
        },
      ).open();
      return;
    }

    // Map chooser IDs to agentId/label pairs for quick export
    const AGENT_MAP: Record<string, { agentId: string; label: string }> = {
      'query-writer': { agentId: 'query-writer', label: 'Query Writer' },
      'intel-advisor': { agentId: 'intel-advisor', label: 'Intel Advisor' },
      'ioc-context': { agentId: 'signal-triager', label: 'Signal Triager' },
    };

    const mapping = AGENT_MAP[item.id];
    if (mapping) {
      void this.quickExport(mapping.agentId, mapping.label);
    }
  }

  private async quickExport(agentId: string, label: string): Promise<void> {
    const file = this.plugin.app.workspace.getActiveFile();
    if (!file) {
      new Notice('No active file. Open a note first.');
      return;
    }
    const result = await this.plugin.workspaceService.assembleContextForProfile(file.path, agentId);
    if ('error' in result) {
      new Notice(`Export failed: ${(result as { error: string }).error}`);
      return;
    }
    const text = this.plugin.workspaceService.renderAssembledContext(result);
    await navigator.clipboard.writeText(text);
    const { buildExportLogEntry } = await import('./export-log');
    const entry = buildExportLogEntry(result, label);
    void this.plugin.workspaceService.logExport(entry);
    new Notice(`Copied ${result.tokenEstimate} tokens for ${label}`);
  }
}

// ---------------------------------------------------------------------------
// CanvasTemplateChooserModal
// ---------------------------------------------------------------------------

interface TemplateItem {
  id: CanvasTemplateName;
  name: string;
  description: string;
}

const TEMPLATE_ITEMS: readonly TemplateItem[] = [
  { id: 'kill-chain', name: 'ATT&CK Kill Chain', description: 'Map techniques across the cyber kill chain' },
  { id: 'diamond', name: 'Diamond Model', description: 'Adversary-capability-infrastructure-victim analysis' },
  { id: 'lateral-movement', name: 'Lateral Movement Map', description: 'Visualize lateral movement paths and pivots' },
  { id: 'hunt-progression', name: 'Hunt Progression', description: 'Track hunt phases and decision points' },
];

export class CanvasTemplateChooserModal extends FuzzySuggestModal<TemplateItem> {
  private onSelect: (templateId: CanvasTemplateName) => void;

  constructor(app: App, onSelect: (templateId: CanvasTemplateName) => void) {
    super(app);
    this.onSelect = onSelect;
    this.setPlaceholder('Choose a canvas template...');
  }

  getItems(): TemplateItem[] {
    return [...TEMPLATE_ITEMS];
  }

  getItemText(item: TemplateItem): string {
    return item.name;
  }

  renderSuggestion(match: FuzzyMatch<TemplateItem>, el: HTMLElement): void {
    el.createDiv({ cls: 'thrunt-chooser-name', text: match.item.name });
    el.createDiv({ cls: 'thrunt-chooser-desc', text: match.item.description });
  }

  onChooseItem(item: TemplateItem, _evt: MouseEvent | KeyboardEvent): void {
    this.onSelect(item.id);
  }
}

// ---------------------------------------------------------------------------
// CanvasChooserModal
// ---------------------------------------------------------------------------

const CANVAS_ITEMS: readonly ChooserItem[] = [
  { id: 'generate-hunt-canvas', name: 'Generate hunt canvas', description: 'Create a new canvas from ATT&CK template' },
  { id: 'canvas-from-current-hunt', name: 'Canvas from current hunt', description: 'Build canvas from active hunt entities' },
  { id: 'generate-knowledge-dashboard', name: 'Knowledge dashboard', description: 'Generate knowledge base dashboard canvas' },
];

export class CanvasChooserModal extends FuzzySuggestModal<ChooserItem> {
  private plugin: ThruntGodPlugin;

  constructor(app: App, plugin: ThruntGodPlugin) {
    super(app);
    this.plugin = plugin;
    this.setPlaceholder('Choose a canvas action...');
  }

  getItems(): ChooserItem[] {
    return [...CANVAS_ITEMS];
  }

  getItemText(item: ChooserItem): string {
    return item.name;
  }

  renderSuggestion(match: FuzzyMatch<ChooserItem>, el: HTMLElement): void {
    el.createDiv({ cls: 'thrunt-chooser-name', text: match.item.name });
    el.createDiv({ cls: 'thrunt-chooser-desc', text: match.item.description });
  }

  onChooseItem(item: ChooserItem, _evt: MouseEvent | KeyboardEvent): void {
    if (item.id === 'generate-hunt-canvas') {
      new CanvasTemplateChooserModal(this.plugin.app, async (template) => {
        const result = await this.plugin.workspaceService.generateHuntCanvas(template);
        new Notice(result.message);
        if (result.success && result.canvasPath) {
          await this.plugin.app.workspace.openLinkText(result.canvasPath, '', true);
        }
        await this.plugin.refreshViews();
      }).open();
    } else if (item.id === 'canvas-from-current-hunt') {
      new CanvasTemplateChooserModal(this.plugin.app, async (template) => {
        const result = await this.plugin.workspaceService.canvasFromCurrentHunt(template);
        new Notice(result.message);
        if (result.success && result.canvasPath) {
          await this.plugin.app.workspace.openLinkText(result.canvasPath, '', true);
        }
        await this.plugin.refreshViews();
      }).open();
    } else if (item.id === 'generate-knowledge-dashboard') {
      void (async () => {
        const result = await this.plugin.workspaceService.generateKnowledgeDashboard();
        new Notice(result.message);
        if (result.success && result.canvasPath) {
          await this.plugin.app.workspace.openLinkText(result.canvasPath, '', true);
        }
        await this.plugin.refreshViews();
      })();
    }
  }
}

// ---------------------------------------------------------------------------
// IntelligenceChooserModal
// ---------------------------------------------------------------------------

const INTELLIGENCE_ITEMS: readonly ChooserItem[] = [
  { id: 'enrich-from-mcp', name: 'Enrich from MCP', description: 'Enrich current technique note via MCP' },
  { id: 'analyze-detection-coverage', name: 'Analyze detection coverage', description: 'Run coverage analysis via MCP' },
  { id: 'log-hunt-decision', name: 'Log hunt decision', description: 'Record a hunt decision on current technique' },
  { id: 'log-hunt-learning', name: 'Log hunt learning', description: 'Record a learning from the current hunt' },
  { id: 'search-knowledge-graph', name: 'Search knowledge graph', description: 'Search entities, techniques, and actors via MCP' },
];

export class IntelligenceChooserModal extends FuzzySuggestModal<ChooserItem> {
  private plugin: ThruntGodPlugin;

  constructor(app: App, plugin: ThruntGodPlugin) {
    super(app);
    this.plugin = plugin;
    this.setPlaceholder('Choose an intelligence action...');
  }

  getItems(): ChooserItem[] {
    return [...INTELLIGENCE_ITEMS];
  }

  getItemText(item: ChooserItem): string {
    return item.name;
  }

  renderSuggestion(match: FuzzyMatch<ChooserItem>, el: HTMLElement): void {
    el.createDiv({ cls: 'thrunt-chooser-name', text: match.item.name });
    el.createDiv({ cls: 'thrunt-chooser-desc', text: match.item.description });
  }

  onChooseItem(item: ChooserItem, _evt: MouseEvent | KeyboardEvent): void {
    // Dispatch to the appropriate plugin command logic — each item maps to its corresponding command helper
    switch (item.id) {
      case 'enrich-from-mcp': {
        const file = this.plugin.app.workspace.getActiveFile();
        if (!file || !file.path.includes('entities/ttps/')) {
          new Notice('Open a TTP note first (entities/ttps/).');
          return;
        }
        if (!this.plugin.mcpClient.isConnected()) {
          new Notice('MCP is not connected. Enable in Settings > THRUNT God.');
          return;
        }
        void (async () => {
          const result = await this.plugin.workspaceService.enrichFromMcp(file.path);
          new Notice(result.message);
          if (result.success) {
            await this.plugin.refreshViews();
          }
        })();
        break;
      }
      case 'analyze-detection-coverage': {
        if (!this.plugin.mcpClient.isConnected()) {
          new Notice('MCP is not connected. Enable in Settings > THRUNT God.');
          return;
        }
        void this.plugin.workspaceService.analyzeCoverage();
        break;
      }
      case 'log-hunt-decision': {
        const file = this.plugin.app.workspace.getActiveFile();
        if (!file || !file.path.includes('entities/ttps/')) {
          new Notice('Open a TTP note first (entities/ttps/).');
          return;
        }
        if (!this.plugin.mcpClient.isConnected()) {
          new Notice('MCP is not connected. Enable in Settings > THRUNT God.');
          return;
        }
        // Use PromptModal for decision logging
        void import('./modals').then(({ PromptModal }) => {
          new PromptModal(
            this.plugin.app,
            'Log Hunt Decision',
            [
              { label: 'Decision', placeholder: 'What did you decide?' },
              { label: 'Rationale', placeholder: 'Why?' },
            ],
            async (values) => {
              const [decision, rationale] = values;
              if (!decision || !rationale) {
                new Notice('Both fields are required.');
                return;
              }
              const result = await this.plugin.workspaceService.logDecision(file.path, decision, rationale);
              new Notice(result.message);
              if (result.success) {
                await this.plugin.refreshViews();
              }
            },
          ).open();
        });
        break;
      }
      case 'log-hunt-learning': {
        if (!this.plugin.mcpClient.isConnected()) {
          new Notice('MCP is not connected. Enable in Settings > THRUNT God.');
          return;
        }
        void import('./modals').then(({ PromptModal }) => {
          new PromptModal(
            this.plugin.app,
            'Log Hunt Learning',
            [
              { label: 'Topic', placeholder: 'What topic?' },
              { label: 'Learning', placeholder: 'What did you learn?' },
            ],
            async (values) => {
              const [topic, learning] = values;
              if (!topic || !learning) {
                new Notice('Both fields are required.');
                return;
              }
              const result = await this.plugin.workspaceService.logLearning(topic, learning);
              new Notice(result.message);
              if (result.success) {
                await this.plugin.refreshViews();
              }
            },
          ).open();
        });
        break;
      }
      case 'search-knowledge-graph': {
        if (!this.plugin.mcpClient.isConnected()) {
          new Notice('MCP is not connected. Enable in Settings > THRUNT God.');
          return;
        }
        // Delegate to the MCP search modal
        void import('./mcp-search-modal').then(({ McpSearchModal }) => {
          void import('./paths').then(({ getPlanningDir, normalizePath }) => {
            void import('./settings').then(({ DEFAULT_SETTINGS }) => {
              void import('./entity-schema').then(({ ENTITY_TYPES }) => {
                const planningDir = getPlanningDir(
                  this.plugin.settings.planningDir,
                  DEFAULT_SETTINGS.planningDir,
                );
                new McpSearchModal(
                  this.plugin.app,
                  this.plugin.mcpClient,
                  (notePath: string) => {
                    const file = this.plugin.workspaceService.vaultAdapter.getFile(notePath);
                    if (file) {
                      void this.plugin.app.workspace.getLeaf(true).openFile(file);
                    } else {
                      new Notice(`Note not found: ${notePath}`);
                    }
                  },
                  (name: string, entityType: string) => {
                    void (async () => {
                      const entityDef = ENTITY_TYPES.find((def: any) => def.type === entityType);
                      const folder = entityDef ? entityDef.folder : 'entities/ttps';
                      const folderPath = normalizePath(`${planningDir}/${folder}`);
                      const notePath = normalizePath(`${folderPath}/${name}.md`);
                      if (this.plugin.workspaceService.vaultAdapter.fileExists(notePath)) {
                        const f = this.plugin.workspaceService.vaultAdapter.getFile(notePath);
                        if (f) {
                          await this.plugin.app.workspace.getLeaf(true).openFile(f);
                        }
                        return;
                      }
                      const content = entityDef
                        ? entityDef.starterTemplate(name)
                        : `# ${name}\n\n## Sightings\n\n_No sightings recorded yet._\n\n## Related\n\n`;
                      await this.plugin.workspaceService.vaultAdapter.ensureFolder(folderPath);
                      await this.plugin.workspaceService.vaultAdapter.createFile(notePath, content);
                      this.plugin.workspaceService.invalidate();
                      const f = this.plugin.workspaceService.vaultAdapter.getFile(notePath);
                      if (f) {
                        await this.plugin.app.workspace.getLeaf(true).openFile(f);
                      }
                    })();
                  },
                ).open();
              });
            });
          });
        });
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// VerdictSuggestModal
// ---------------------------------------------------------------------------

interface VerdictItem {
  id: VerdictValue;
  name: string;
  description: string;
}

const VERDICT_ITEMS: readonly VerdictItem[] = VERDICT_VALUES.map((v) => {
  const meta: Record<VerdictValue, { name: string; description: string }> = {
    unknown: { name: 'Unknown', description: 'No determination made yet' },
    suspicious: { name: 'Suspicious', description: 'Warrants further investigation' },
    confirmed_malicious: { name: 'Confirmed Malicious', description: 'Verified threat actor/IOC' },
    remediated: { name: 'Remediated', description: 'Threat addressed and contained' },
    resurfaced: { name: 'Resurfaced', description: 'Previously remediated, seen again' },
  };
  return { id: v, ...meta[v] };
});

export class VerdictSuggestModal extends FuzzySuggestModal<VerdictItem> {
  private onSelect: (verdict: VerdictValue) => void;

  constructor(app: App, onSelect: (verdict: VerdictValue) => void) {
    super(app);
    this.onSelect = onSelect;
    this.setPlaceholder('Select verdict...');
  }

  getItems(): VerdictItem[] {
    return [...VERDICT_ITEMS];
  }

  getItemText(item: VerdictItem): string {
    return item.name;
  }

  renderSuggestion(match: FuzzyMatch<VerdictItem>, el: HTMLElement): void {
    el.createDiv({ cls: 'thrunt-chooser-name', text: match.item.name });
    el.createDiv({ cls: 'thrunt-chooser-desc', text: match.item.description });
  }

  onChooseItem(item: VerdictItem, _evt: MouseEvent | KeyboardEvent): void {
    this.onSelect(item.id);
  }
}
