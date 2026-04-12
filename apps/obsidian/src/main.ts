import { Modal, Notice, Plugin, Setting, requestUrl } from 'obsidian';
import {
  DEFAULT_SETTINGS,
  type ThruntGodPluginSettings,
  ThruntGodSettingTab,
} from './settings';
import { THRUNT_WORKSPACE_VIEW_TYPE, ThruntWorkspaceView } from './view';
import { CORE_ARTIFACTS } from './artifacts';
import { ObsidianVaultAdapter } from './vault-adapter';
import { WorkspaceService, formatStatusBarText } from './workspace';
import { normalizePath, getEntityFolder, getPlanningDir } from './paths';
import { HttpMcpClient } from './mcp-client';
import { McpSearchModal } from './mcp-search-modal';
import { HyperCopyModal } from './hyper-copy-modal';
import { ENTITY_TYPES } from './entity-schema';

export default class ThruntGodPlugin extends Plugin {
  settings: ThruntGodPluginSettings = DEFAULT_SETTINGS;
  workspaceService!: WorkspaceService;
  mcpClient!: HttpMcpClient;
  private statusBarItemEl?: HTMLElement;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.mcpClient = new HttpMcpClient(
      () => this.settings,
      async (opts) => {
        const response = await requestUrl({
          url: opts.url,
          method: opts.method,
          body: opts.body,
          headers: opts.headers,
        });
        return { status: response.status, text: response.text };
      },
    );

    const vaultAdapter = new ObsidianVaultAdapter(this.app);
    this.workspaceService = new WorkspaceService(
      this.app,
      vaultAdapter,
      () => this.settings,
      DEFAULT_SETTINGS.planningDir,
      this.mcpClient,
    );

    this.registerView(
      THRUNT_WORKSPACE_VIEW_TYPE,
      (leaf) => new ThruntWorkspaceView(leaf, this),
    );

    this.statusBarItemEl = this.addStatusBarItem();
    void this.updateStatusBar();

    this.addRibbonIcon('shield', 'Open workspace', () => {
      void this.activateView();
    });

    this.addCommand({
      id: 'open-thrunt-workspace',
      name: 'Open workspace',
      callback: () => {
        void this.activateView();
      },
    });

    // Register open commands for all 5 artifacts from registry
    for (const artifact of CORE_ARTIFACTS) {
      this.addCommand({
        id: artifact.commandId,
        name: artifact.commandName,
        callback: () => {
          void this.openCoreFile(artifact.fileName);
        },
      });
    }

    this.addCommand({
      id: 'create-thrunt-workspace',
      name: 'Create mission scaffold',
      callback: () => {
        void this.bootstrapWorkspace();
      },
    });

    this.addCommand({
      id: 'ingest-agent-output',
      name: 'Ingest agent output',
      callback: () => {
        void this.runIngestion();
      },
    });

    this.addCommand({
      id: 'scaffold-attack-ontology',
      name: 'Scaffold ATT&CK ontology',
      callback: () => {
        void this.scaffoldAttack();
      },
    });

    // --- MCP enrichment commands (Plan 02) ---

    this.addCommand({
      id: 'enrich-from-mcp',
      name: 'Enrich from MCP',
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !file.path.includes('entities/ttps/')) return false;
        if (checking) return true;
        void this.enrichFromMcp(file.path);
        return true;
      },
    });

    this.addCommand({
      id: 'analyze-detection-coverage',
      name: 'Analyze detection coverage',
      callback: () => {
        void this.runCoverageAnalysis();
      },
    });

    this.addCommand({
      id: 'log-hunt-decision',
      name: 'Log hunt decision',
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !file.path.includes('entities/ttps/')) return false;
        if (checking) return true;
        void this.promptAndLogDecision(file.path);
        return true;
      },
    });

    this.addCommand({
      id: 'log-hunt-learning',
      name: 'Log hunt learning',
      callback: () => {
        void this.promptAndLogLearning();
      },
    });

    this.addCommand({
      id: 'search-knowledge-graph',
      name: 'Search THRUNT knowledge graph',
      callback: () => {
        void this.openSearchModal();
      },
    });

    // --- Hyper Copy commands (Phase 75) ---

    this.addCommand({
      id: 'hyper-copy-for-agent',
      name: 'Hyper Copy for Agent',
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice('No active file. Open a note first.');
          return;
        }
        const profiles = this.workspaceService.getAvailableProfiles();
        new HyperCopyModal(
          this.app,
          profiles,
          (agentId: string) =>
            this.workspaceService.assembleContextForProfile(file.path, agentId),
          (text: string, entry) => {
            void this.workspaceService.logExport(entry);
          },
        ).open();
      },
    });

    this.addCommand({
      id: 'copy-for-query-writer',
      name: 'Copy for Query Writer',
      callback: () => { void this.quickExport('query-writer', 'Query Writer'); },
    });

    this.addCommand({
      id: 'copy-for-intel-advisor',
      name: 'Copy for Intel Advisor',
      callback: () => { void this.quickExport('intel-advisor', 'Intel Advisor'); },
    });

    this.addCommand({
      id: 'copy-ioc-context',
      name: 'Copy IOC context',
      callback: () => { void this.quickExport('signal-triager', 'Signal Triager'); },
    });

    // --- Canvas commands (Phase 76) ---

    this.addCommand({
      id: 'generate-hunt-canvas',
      name: 'Generate hunt canvas',
      callback: () => {
        new CanvasTemplateModal(this.app, async (template) => {
          const result = await this.workspaceService.generateHuntCanvas(template);
          new Notice(result.message);
          if (result.success && result.canvasPath) {
            await this.app.workspace.openLinkText(result.canvasPath, '', true);
          }
          await this.refreshViews();
        }).open();
      },
    });

    this.addCommand({
      id: 'canvas-from-current-hunt',
      name: 'Canvas from current hunt',
      callback: () => {
        new CanvasTemplateModal(this.app, async (template) => {
          const result = await this.workspaceService.canvasFromCurrentHunt(template);
          new Notice(result.message);
          if (result.success && result.canvasPath) {
            await this.app.workspace.openLinkText(result.canvasPath, '', true);
          }
          await this.refreshViews();
        }).open();
      },
    });

    // --- Cross-hunt intelligence commands (Phase 77) ---

    this.addCommand({
      id: 'cross-hunt-intel',
      name: 'Cross-hunt intelligence report',
      callback: () => {
        void (async () => {
          const result = await this.workspaceService.crossHuntIntel();
          new Notice(result.message);
          if (result.success && result.reportPath) {
            const file = this.workspaceService.vaultAdapter.getFile(result.reportPath);
            if (file) {
              await this.app.workspace.getLeaf(true).openFile(file);
            }
          }
          await this.refreshViews();
        })();
      },
    });

    this.addCommand({
      id: 'compare-hunts',
      name: 'Compare hunts',
      callback: () => {
        new CompareHuntsModal(this.app, this.workspaceService, async (huntAPath, huntBPath) => {
          const result = await this.workspaceService.compareHuntsReport(huntAPath, huntBPath);
          new Notice(result.message);
          if (result.success && result.reportPath) {
            const file = this.workspaceService.vaultAdapter.getFile(result.reportPath);
            if (file) {
              await this.app.workspace.getLeaf(true).openFile(file);
            }
          }
          await this.refreshViews();
        }).open();
      },
    });

    this.addCommand({
      id: 'generate-knowledge-dashboard',
      name: 'Generate knowledge dashboard',
      callback: () => {
        void (async () => {
          const result = await this.workspaceService.generateKnowledgeDashboard();
          new Notice(result.message);
          if (result.success && result.canvasPath) {
            await this.app.workspace.openLinkText(result.canvasPath, '', true);
          }
          await this.refreshViews();
        })();
      },
    });

    this.addSettingTab(new ThruntGodSettingTab(this.app, this));

    // Connect MCP if enabled (fire-and-forget -- connect never throws)
    if (this.settings.mcpEnabled) {
      void this.mcpClient.connect();
    }

    // Event wiring: vault events invalidate cache and refresh views
    // (Spec acceptance criterion 9: main.ts wires events, not WorkspaceService)
    const refresh = () => {
      this.workspaceService.invalidate();
      void this.refreshViews();
    };

    this.registerEvent(this.app.vault.on('create', refresh));
    this.registerEvent(this.app.vault.on('delete', refresh));
    this.registerEvent(this.app.vault.on('rename', refresh));
  }

  onunload(): void {
    this.mcpClient.disconnect();
    this.app.workspace.detachLeavesOfType(THRUNT_WORKSPACE_VIEW_TYPE);
  }

  async openCoreFile(fileName: string): Promise<void> {
    const path = this.workspaceService.getFilePath(fileName);
    const file = this.workspaceService.vaultAdapter.getFile(path);

    if (!file) {
      new Notice(
        `THRUNT file not found: ${path}. Use the workspace view to create it.`,
      );
      return;
    }

    await this.app.workspace.getLeaf(true).openFile(file);
  }

  private async bootstrapWorkspace(): Promise<void> {
    await this.workspaceService.bootstrap();
    const first = CORE_ARTIFACTS[0];
    if (first) {
      await this.openCoreFile(first.fileName);
    }
    await this.refreshViews();
    new Notice('THRUNT workspace scaffold created.');
  }

  private async runIngestion(): Promise<void> {
    const result = await this.workspaceService.runIngestion();
    await this.refreshViews();
    new Notice(
      `Ingestion complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
    );
  }

  private async scaffoldAttack(): Promise<void> {
    const { getParentTechniques, getTechniqueFileName, generateTechniqueNote } =
      await import('./scaffold');

    const planningDir = getPlanningDir(
      this.settings.planningDir,
      DEFAULT_SETTINGS.planningDir,
    );
    const ttpsFolder = getEntityFolder(planningDir, 'entities/ttps');
    await this.workspaceService.vaultAdapter.ensureFolder(ttpsFolder);

    const techniques = getParentTechniques();
    let created = 0;
    let skipped = 0;

    for (const technique of techniques) {
      const fileName = getTechniqueFileName(technique);
      const path = normalizePath(`${ttpsFolder}/${fileName}`);
      if (this.workspaceService.vaultAdapter.fileExists(path)) {
        skipped++;
        continue;
      }
      const content = generateTechniqueNote(technique);
      await this.workspaceService.vaultAdapter.createFile(path, content);
      created++;
    }

    this.workspaceService.invalidate();
    await this.refreshViews();
    new Notice(
      `ATT&CK ontology scaffolded: ${created} created, ${skipped} skipped.`,
    );
  }

  // ---------------------------------------------------------------------------
  // MCP command helpers (Plan 02)
  // ---------------------------------------------------------------------------

  private async enrichFromMcp(path: string): Promise<void> {
    if (!this.mcpClient.isConnected()) {
      new Notice('MCP is not connected. Enable in Settings > THRUNT God.');
      return;
    }
    const result = await this.workspaceService.enrichFromMcp(path);
    new Notice(result.message);
    if (result.success) {
      await this.refreshViews();
    }
  }

  private async runCoverageAnalysis(): Promise<void> {
    if (!this.mcpClient.isConnected()) {
      new Notice('MCP is not connected. Enable in Settings > THRUNT God.');
      return;
    }
    const result = await this.workspaceService.analyzeCoverage();
    new Notice(result.message);
    if (result.success) {
      const planningDir = getPlanningDir(
        this.settings.planningDir,
        DEFAULT_SETTINGS.planningDir,
      );
      const reportPath = normalizePath(`${planningDir}/COVERAGE_REPORT.md`);
      const file = this.workspaceService.vaultAdapter.getFile(reportPath);
      if (file) {
        await this.app.workspace.getLeaf(true).openFile(file);
      }
    }
  }

  private async promptAndLogDecision(path: string): Promise<void> {
    if (!this.mcpClient.isConnected()) {
      new Notice('MCP is not connected. Enable in Settings > THRUNT God.');
      return;
    }
    new PromptModal(
      this.app,
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
        const result = await this.workspaceService.logDecision(path, decision, rationale);
        new Notice(result.message);
        if (result.success) {
          await this.refreshViews();
        }
      },
    ).open();
  }

  private async promptAndLogLearning(): Promise<void> {
    if (!this.mcpClient.isConnected()) {
      new Notice('MCP is not connected. Enable in Settings > THRUNT God.');
      return;
    }
    new PromptModal(
      this.app,
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
        const result = await this.workspaceService.logLearning(topic, learning);
        new Notice(result.message);
        if (result.success) {
          await this.refreshViews();
        }
      },
    ).open();
  }

  private async openSearchModal(): Promise<void> {
    if (!this.mcpClient.isConnected()) {
      new Notice('MCP is not connected. Enable in Settings > THRUNT God.');
      return;
    }

    const planningDir = getPlanningDir(
      this.settings.planningDir,
      DEFAULT_SETTINGS.planningDir,
    );

    new McpSearchModal(
      this.app,
      this.mcpClient,
      // onOpenNote: find file by path and open in new leaf
      (notePath: string) => {
        const file = this.workspaceService.vaultAdapter.getFile(notePath);
        if (file) {
          void this.app.workspace.getLeaf(true).openFile(file);
        } else {
          new Notice(`Note not found: ${notePath}`);
        }
      },
      // onCreateNote: create entity note in appropriate folder and open it
      (name: string, entityType: string) => {
        void (async () => {
          const entityDef = ENTITY_TYPES.find((def) => def.type === entityType);
          const folder = entityDef ? entityDef.folder : 'entities/ttps';
          const folderPath = normalizePath(`${planningDir}/${folder}`);
          const notePath = normalizePath(`${folderPath}/${name}.md`);

          if (this.workspaceService.vaultAdapter.fileExists(notePath)) {
            const file = this.workspaceService.vaultAdapter.getFile(notePath);
            if (file) {
              await this.app.workspace.getLeaf(true).openFile(file);
            }
            return;
          }

          const content = entityDef
            ? entityDef.starterTemplate(name)
            : `# ${name}\n\n## Sightings\n\n_No sightings recorded yet._\n\n## Related\n\n`;

          await this.workspaceService.vaultAdapter.ensureFolder(folderPath);
          await this.workspaceService.vaultAdapter.createFile(notePath, content);
          this.workspaceService.invalidate();

          const file = this.workspaceService.vaultAdapter.getFile(notePath);
          if (file) {
            await this.app.workspace.getLeaf(true).openFile(file);
          }
        })();
      },
    ).open();
  }

  private async quickExport(agentId: string, label: string): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('No active file. Open a note first.');
      return;
    }
    const result = await this.workspaceService.assembleContextForProfile(file.path, agentId);
    if ('error' in result) {
      new Notice(`Export failed: ${result.error}`);
      return;
    }
    const text = this.workspaceService.renderAssembledContext(result);
    await navigator.clipboard.writeText(text);
    const { buildExportLogEntry } = await import('./export-log');
    const entry = buildExportLogEntry(result, label);
    void this.workspaceService.logExport(entry);
    new Notice(`Copied ${result.tokenEstimate} tokens for ${label}`);
  }

  async activateView(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(THRUNT_WORKSPACE_VIEW_TYPE)[0];

    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false) ?? undefined;
    }

    if (!leaf) {
      new Notice('Unable to open the THRUNT workspace view.');
      return;
    }

    await leaf.setViewState({
      type: THRUNT_WORKSPACE_VIEW_TYPE,
      active: true,
    });

    this.app.workspace.revealLeaf(leaf);
    await this.refreshViews();
  }

  async refreshViews(): Promise<void> {
    this.workspaceService.invalidate();
    await this.updateStatusBar();

    for (const leaf of this.app.workspace.getLeavesOfType(
      THRUNT_WORKSPACE_VIEW_TYPE,
    )) {
      const view = leaf.view;
      if (view instanceof ThruntWorkspaceView) {
        await view.render();
      }
    }
  }

  async loadSettings(): Promise<void> {
    const stored = (await this.loadData()) as Partial<ThruntGodPluginSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...stored };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    await this.refreshViews();
  }

  private async updateStatusBar(): Promise<void> {
    if (!this.statusBarItemEl) return;
    const vm = await this.workspaceService.getViewModel();
    this.statusBarItemEl.setText(formatStatusBarText(vm));
  }
}

// ---------------------------------------------------------------------------
// PromptModal -- simple multi-field text input modal
// ---------------------------------------------------------------------------

interface PromptField {
  label: string;
  placeholder: string;
}

class PromptModal extends Modal {
  private values: string[];

  constructor(
    app: import('obsidian').App,
    private title: string,
    private fields: PromptField[],
    private onSubmit: (values: string[]) => void,
  ) {
    super(app);
    this.values = fields.map(() => '');
  }

  onOpen(): void {
    this.titleEl.setText(this.title);

    for (let i = 0; i < this.fields.length; i++) {
      const field = this.fields[i]!;
      new Setting(this.contentEl)
        .setName(field.label)
        .addText((text) => {
          text.setPlaceholder(field.placeholder);
          text.onChange((value) => {
            this.values[i] = value;
          });
        });
    }

    new Setting(this.contentEl)
      .addButton((btn) => {
        btn.setButtonText('Submit')
          .setCta()
          .onClick(() => {
            this.close();
            this.onSubmit(this.values);
          });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
// CanvasTemplateModal -- template picker for canvas generation
// ---------------------------------------------------------------------------

type CanvasTemplateName = 'kill-chain' | 'diamond' | 'lateral-movement' | 'hunt-progression';

class CanvasTemplateModal extends Modal {
  constructor(
    app: import('obsidian').App,
    private onSelect: (template: CanvasTemplateName) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Generate Hunt Canvas');

    const templates: Array<{ label: string; value: CanvasTemplateName }> = [
      { label: 'ATT&CK Kill Chain', value: 'kill-chain' },
      { label: 'Diamond Model', value: 'diamond' },
      { label: 'Lateral Movement Map', value: 'lateral-movement' },
      { label: 'Hunt Progression', value: 'hunt-progression' },
    ];

    for (const tmpl of templates) {
      new Setting(this.contentEl)
        .setName(tmpl.label)
        .addButton((btn) => {
          btn.setButtonText('Generate')
            .setCta()
            .onClick(() => {
              this.close();
              this.onSelect(tmpl.value);
            });
        });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
// CompareHuntsModal -- hunt path picker for cross-hunt comparison (Phase 77)
// ---------------------------------------------------------------------------

class CompareHuntsModal extends Modal {
  private huntAPath = '';
  private huntBPath = '';

  constructor(
    app: import('obsidian').App,
    private workspaceService: WorkspaceService,
    private onSubmit: (huntAPath: string, huntBPath: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Compare Hunts');

    new Setting(this.contentEl)
      .setName('Hunt A path')
      .setDesc('Vault-relative path to first hunt workspace')
      .addText((text) => {
        text.setPlaceholder('e.g. hunt-alpha');
        text.onChange((value) => { this.huntAPath = value; });
      });

    new Setting(this.contentEl)
      .setName('Hunt B path')
      .setDesc('Vault-relative path to second hunt workspace')
      .addText((text) => {
        text.setPlaceholder('e.g. hunt-bravo');
        text.onChange((value) => { this.huntBPath = value; });
      });

    new Setting(this.contentEl)
      .addButton((btn) => {
        btn.setButtonText('Compare')
          .setCta()
          .onClick(() => {
            if (!this.huntAPath || !this.huntBPath) {
              new Notice('Both hunt paths are required.');
              return;
            }
            this.close();
            this.onSubmit(this.huntAPath, this.huntBPath);
          });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
