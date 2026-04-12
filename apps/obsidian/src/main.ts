import { Notice, Plugin, requestUrl } from 'obsidian';
import {
  DEFAULT_SETTINGS,
  type ThruntGodPluginSettings,
  ThruntGodSettingTab,
} from './settings';
import { THRUNT_WORKSPACE_VIEW_TYPE, ThruntWorkspaceView } from './view';
import { ObsidianVaultAdapter } from './vault-adapter';
import { WorkspaceService, formatStatusBarText } from './workspace';
import { HttpMcpClient } from './mcp-client';
import { EventBus } from './services/event-bus';
import { registerCommands } from './commands';

export default class ThruntGodPlugin extends Plugin {
  settings: ThruntGodPluginSettings = DEFAULT_SETTINGS;
  workspaceService!: WorkspaceService;
  mcpClient!: HttpMcpClient;
  eventBus!: EventBus;
  private statusBarItemEl?: HTMLElement;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.eventBus = new EventBus();

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
      this.eventBus,
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

    registerCommands(this);

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
    this.eventBus.removeAllListeners();
    this.app.workspace.detachLeavesOfType(THRUNT_WORKSPACE_VIEW_TYPE);
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
