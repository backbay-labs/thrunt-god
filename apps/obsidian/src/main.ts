import { debounce, Notice, Plugin, requestUrl, type Debouncer, type EventRef } from 'obsidian';
import {
  DEFAULT_SETTINGS,
  DEFAULT_SIDEBAR_STATE,
  type ThruntGodPluginSettings,
  ThruntGodSettingTab,
} from './settings';
import { THRUNT_WORKSPACE_VIEW_TYPE, ThruntWorkspaceView } from './view';
import { ObsidianVaultAdapter } from './vault-adapter';
import { WorkspaceService, formatStatusBarText } from './workspace';
import { HttpMcpClient } from './mcp-client';
import { EventBus } from './services/event-bus';
import { registerCommands } from './commands';
import { createScopedHandler } from './sidebar-events';
import { formatHuntPulse } from './hunt-pulse';
import { mapCliEventToAction } from './mcp-events';
import type { VaultEvent } from './mcp-events';
import { findPriorHuntMatches, type PriorHuntSuggestion } from './prior-hunt-suggester';
import { scanEntityNotes } from './entity-utils';
import { detectHuntId } from './verdict';
import type { EntityNote } from './cross-hunt';

export default class ThruntGodPlugin extends Plugin {
  settings: ThruntGodPluginSettings = DEFAULT_SETTINGS;
  workspaceService!: WorkspaceService;
  mcpClient!: HttpMcpClient;
  eventBus!: EventBus;
  private statusBarItemEl?: HTMLElement;
  private debouncedRefresh?: Debouncer<[], void>;
  private debouncedCanvasRefresh?: Debouncer<[], void>;
  private debouncedDashboardRefresh?: Debouncer<[], void>;
  private debouncedAutoIngest?: Debouncer<[], void>;
  private autoIngestEventRef?: EventRef;
  private huntPulseEl?: HTMLElement;
  private huntPulseInterval?: number;
  private mcpPollInterval?: number;
  private outboundEventBuffer: VaultEvent[] = [];
  private outboundFlushTimeout?: number;
  private priorHuntSuggestions: PriorHuntSuggestion[] = [];
  private dismissedSuggestions = new Set<string>();
  private entityNoteCache: EntityNote[] | null = null;
  private suggestionEntityHandler?: (data: { name: string; entityType: string; sourcePath: string }) => void;
  private suggestionCacheHandler?: () => void;
  private liveCanvasEntityHandler?: (data: { name: string; entityType: string; sourcePath: string }) => void;
  private liveCanvasDashboardRef?: EventRef;

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
    // Debounced at 400ms trailing, scoped to planning directory only
    this.debouncedRefresh = debounce(() => {
      this.workspaceService.invalidate();
      void this.refreshViews();
    }, 400, true);

    const handler = createScopedHandler(
      this.settings.planningDir || DEFAULT_SETTINGS.planningDir,
      () => this.debouncedRefresh!(),
    );

    this.registerEvent(this.app.vault.on('create', handler));
    this.registerEvent(this.app.vault.on('modify', handler));
    this.registerEvent(this.app.vault.on('delete', handler));
    this.registerEvent(this.app.vault.on('rename', handler));

    // Entity-scoped canvas refresh: debounced at 500ms, batches rapid entity changes
    const planningDir = this.settings.planningDir || DEFAULT_SETTINGS.planningDir;
    const pendingEntityPaths = new Set<string>();
    this.debouncedCanvasRefresh = debounce(async () => {
      const paths = [...pendingEntityPaths];
      pendingEntityPaths.clear();
      for (const path of paths) {
        await this.workspaceService.refreshCanvasForEntity(path);
      }
    }, 500, true);

    const isEntityFile = (path: string): boolean =>
      path.startsWith(planningDir + '/entities/') && path.endsWith('.md');

    this.registerEvent(this.app.vault.on('modify', (file) => {
      if (isEntityFile(file.path)) {
        pendingEntityPaths.add(file.path);
        this.debouncedCanvasRefresh!();
      }
    }));

    // --- Live canvas (Phase 86) ---
    if (this.settings.liveCanvasEnabled) {
      this.enableLiveCanvas();
    }

    // --- Auto-ingestion debouncer (Phase 87) ---
    // Created ONCE in onload, not per-enable cycle, to avoid stale references
    this.debouncedAutoIngest = debounce(async () => {
      const watcher = this.workspaceService.watcher;
      const result = await watcher.handleAutoIngest();
      const total = result.created + result.updated;
      if (total > 0) {
        new Notice(`Ingested ${total} new artifact${total !== 1 ? 's' : ''}`);
      }
    }, this.settings.autoIngestDebounceMs ?? 2000, true);

    // --- Auto-ingestion (Phase 87) ---
    if (this.settings.autoIngestionEnabled) {
      this.enableAutoIngestion();
    }

    // --- Hunt pulse status bar (Phase 87) ---
    if (this.settings.huntPulseEnabled) {
      this.enableHuntPulse();
    }

    // --- MCP event polling (Phase 88) ---
    if (this.settings.mcpEventPollingEnabled) {
      this.enableMcpEventPolling();
    }

    // --- Prior-hunt suggestions (Phase 88) ---
    if (this.settings.priorHuntSuggestionsEnabled) {
      this.enablePriorHuntSuggestions();
    }
  }

  onunload(): void {
    this.debouncedRefresh?.cancel();
    this.debouncedCanvasRefresh?.cancel();
    this.disableLiveCanvas();
    this.disableAutoIngestion();
    this.disableHuntPulse();
    this.disableMcpEventPolling();
    this.disablePriorHuntSuggestions();
    this.mcpClient.disconnect();
    this.eventBus.removeAllListeners();
    this.app.workspace.detachLeavesOfType(THRUNT_WORKSPACE_VIEW_TYPE);
  }

  enableAutoIngestion(): void {
    if (this.autoIngestEventRef) return; // already enabled
    const watcher = this.workspaceService.watcher;
    const handler = (file: { path: string }) => {
      if (watcher.isAutoIngestTarget(file.path)) {
        watcher.recordActivity();
        this.debouncedAutoIngest!();
      }
    };
    this.autoIngestEventRef = this.app.vault.on('create', handler);
    this.registerEvent(this.autoIngestEventRef);
  }

  disableAutoIngestion(): void {
    if (this.autoIngestEventRef) {
      this.app.vault.offref(this.autoIngestEventRef);
      this.autoIngestEventRef = undefined;
    }
    this.debouncedAutoIngest?.cancel();
  }

  enableLiveCanvas(): void {
    if (this.liveCanvasEntityHandler) return; // already enabled

    // Live canvas auto-population via EventBus
    this.liveCanvasEntityHandler = (data) => {
      void this.workspaceService.handleLiveCanvasEntityCreated(data);
    };
    this.eventBus.on('entity:created', this.liveCanvasEntityHandler);

    // Dashboard reactive refresh (2000ms debounce)
    const planningDir = this.settings.planningDir || DEFAULT_SETTINGS.planningDir;
    const isEntityFile = (path: string): boolean =>
      path.startsWith(planningDir + '/entities/') && path.endsWith('.md');

    this.debouncedDashboardRefresh = debounce(async () => {
      await this.workspaceService.refreshDashboardCanvas();
    }, 2000, true);

    this.liveCanvasDashboardRef = this.app.vault.on('modify', (file) => {
      if (isEntityFile(file.path)) {
        this.debouncedDashboardRefresh!();
      }
    });
    this.registerEvent(this.liveCanvasDashboardRef);
  }

  disableLiveCanvas(): void {
    if (this.liveCanvasEntityHandler) {
      this.eventBus.off('entity:created', this.liveCanvasEntityHandler);
      this.liveCanvasEntityHandler = undefined;
    }
    if (this.liveCanvasDashboardRef) {
      this.app.vault.offref(this.liveCanvasDashboardRef);
      this.liveCanvasDashboardRef = undefined;
    }
    this.debouncedDashboardRefresh?.cancel();
  }

  enableHuntPulse(): void {
    if (this.huntPulseEl) return; // already enabled
    this.huntPulseEl = this.addStatusBarItem();
    this.huntPulseEl.addClass('thrunt-hunt-pulse');
    this.huntPulseEl.addEventListener('click', () => {
      void this.activateView();
    });
    this.updateHuntPulse();
    this.huntPulseInterval = window.setInterval(() => {
      this.updateHuntPulse();
    }, 30_000);
  }

  disableHuntPulse(): void {
    if (this.huntPulseInterval !== undefined) {
      window.clearInterval(this.huntPulseInterval);
      this.huntPulseInterval = undefined;
    }
    if (this.huntPulseEl) {
      this.huntPulseEl.remove();
      this.huntPulseEl = undefined;
    }
  }

  enableMcpEventPolling(): void {
    if (this.mcpPollInterval !== undefined) return; // already enabled
    const intervalMs = this.settings.mcpPollIntervalMs ?? 10000;
    this.mcpPollInterval = window.setInterval(() => {
      void this.handleMcpPoll();
    }, intervalMs);
    this.registerInterval(this.mcpPollInterval);

    // Wire outbound event listeners
    this.eventBus.on('entity:created', (data) => {
      const event: VaultEvent = {
        type: 'entity:created',
        timestamp: Date.now(),
        path: data.sourcePath,
        entityType: data.entityType,
      };
      this.bufferOutboundEvent(event);
    });

    this.eventBus.on('verdict:set', (data) => {
      const event: VaultEvent = {
        type: 'verdict:set',
        timestamp: Date.now(),
        path: data.path,
        verdict: data.verdict,
      };
      this.bufferOutboundEvent(event);
    });
  }

  disableMcpEventPolling(): void {
    if (this.mcpPollInterval !== undefined) {
      window.clearInterval(this.mcpPollInterval);
      this.mcpPollInterval = undefined;
    }
    if (this.outboundFlushTimeout !== undefined) {
      window.clearTimeout(this.outboundFlushTimeout);
      this.outboundFlushTimeout = undefined;
    }
    this.outboundEventBuffer = [];
  }

  getPriorHuntSuggestions(): PriorHuntSuggestion[] {
    return this.priorHuntSuggestions.filter(
      (s) => !this.dismissedSuggestions.has(s.entityName),
    );
  }

  dismissSuggestion(entityName: string): void {
    this.dismissedSuggestions.add(entityName);
  }

  enablePriorHuntSuggestions(): void {
    if (this.suggestionEntityHandler) return; // already enabled

    this.suggestionEntityHandler = (data: { name: string; entityType: string; sourcePath: string }) => {
      void this.handleSuggestionEntityCreated(data);
    };
    this.eventBus.on('entity:created', this.suggestionEntityHandler);

    // Invalidate entity note cache when cache is cleared
    this.suggestionCacheHandler = () => {
      this.entityNoteCache = null;
    };
    this.eventBus.on('cache:invalidated', this.suggestionCacheHandler);
  }

  disablePriorHuntSuggestions(): void {
    if (this.suggestionEntityHandler) {
      this.eventBus.off('entity:created', this.suggestionEntityHandler);
      this.suggestionEntityHandler = undefined;
    }
    if (this.suggestionCacheHandler) {
      this.eventBus.off('cache:invalidated', this.suggestionCacheHandler);
      this.suggestionCacheHandler = undefined;
    }
    this.priorHuntSuggestions = [];
    this.dismissedSuggestions.clear();
    this.entityNoteCache = null;
  }

  private async handleSuggestionEntityCreated(data: { name: string; entityType: string; sourcePath: string }): Promise<void> {
    // Populate entity note cache on first use (pitfall #6)
    if (this.entityNoteCache === null) {
      const planningDir = this.settings.planningDir || DEFAULT_SETTINGS.planningDir;
      this.entityNoteCache = await scanEntityNotes(
        this.workspaceService.vaultAdapter,
        planningDir,
        planningDir,
      );
    }

    // Detect current hunt ID (MISSION.md hunt_id > planning dir name > "manual")
    const planningDir = this.settings.planningDir || DEFAULT_SETTINGS.planningDir;
    let missionContent: string | null = null;
    try {
      missionContent = await this.workspaceService.vaultAdapter.readFile(
        `${planningDir}/MISSION.md`,
      );
    } catch {
      // MISSION.md not found -- fallback to planning dir name
    }
    const currentHuntId = detectHuntId(missionContent, planningDir);

    const matches = findPriorHuntMatches(
      data.name,
      data.entityType,
      this.entityNoteCache,
      currentHuntId,
      this.settings.suggestionMinHunts,
    );

    // Dedup by entityName to avoid duplicate suggestions
    let added = false;
    for (const match of matches) {
      const existing = this.priorHuntSuggestions.find(
        (s) => s.entityName === match.entityName,
      );
      if (!existing) {
        this.priorHuntSuggestions.push(match);
        added = true;
      }
    }

    if (added) {
      await this.refreshViews();
    }
  }

  private async handleMcpPoll(): Promise<void> {
    const bridge = this.workspaceService.mcpBridge;
    const events = await bridge.pollEvents();

    for (const event of events) {
      const action = mapCliEventToAction(event);
      if (!action) continue;

      switch (action.type) {
        case 'trigger-ingestion':
          this.debouncedAutoIngest?.();
          break;
        case 'create-finding':
          // Create a finding note in the planning directory
          new Notice(`Finding: ${action.data.title as string ?? 'Untitled'}`);
          break;
        case 'update-mission':
          new Notice(`Hunt ${action.data.huntId as string ?? ''} status: ${action.data.status as string}`);
          break;
      }
    }

    // Update hunt pulse with MCP status
    this.updateHuntPulse();
  }

  private bufferOutboundEvent(event: VaultEvent): void {
    this.outboundEventBuffer.push(event);

    // Debounce: flush after 500ms of inactivity
    if (this.outboundFlushTimeout !== undefined) {
      window.clearTimeout(this.outboundFlushTimeout);
    }
    this.outboundFlushTimeout = window.setTimeout(() => {
      void this.flushOutboundEvents();
    }, 500);
  }

  private async flushOutboundEvents(): Promise<void> {
    if (this.outboundEventBuffer.length === 0) return;
    const events = [...this.outboundEventBuffer];
    this.outboundEventBuffer = [];
    this.outboundFlushTimeout = undefined;

    const bridge = this.workspaceService.mcpBridge;
    await bridge.publishEvents(events);
  }

  private updateHuntPulse(): void {
    if (!this.huntPulseEl) return;
    const watcher = this.workspaceService.watcher;
    const mcpStatus: 'online' | 'offline' | undefined =
      this.settings.mcpEventPollingEnabled
        ? (this.mcpClient.isConnected() ? 'online' : 'offline')
        : undefined;
    const text = formatHuntPulse(
      watcher.getLastActivityTimestamp(),
      Date.now(),
      watcher.getRecentArtifactCount(),
      undefined,
      mcpStatus,
    );
    this.huntPulseEl.setText(text);
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
    // Deep-merge sidebarState to preserve defaults for new sections
    this.settings.sidebarState = {
      ...DEFAULT_SIDEBAR_STATE,
      expandedSections: {
        ...DEFAULT_SIDEBAR_STATE.expandedSections,
        ...(stored?.sidebarState?.expandedSections ?? {}),
      },
    };
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
