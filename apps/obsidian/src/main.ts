import { Notice, Plugin } from 'obsidian';
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

export default class ThruntGodPlugin extends Plugin {
  settings: ThruntGodPluginSettings = DEFAULT_SETTINGS;
  workspaceService!: WorkspaceService;
  private statusBarItemEl?: HTMLElement;

  async onload(): Promise<void> {
    await this.loadSettings();

    const vaultAdapter = new ObsidianVaultAdapter(this.app);
    this.workspaceService = new WorkspaceService(
      this.app,
      vaultAdapter,
      () => this.settings,
      DEFAULT_SETTINGS.planningDir,
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
      id: 'scaffold-attack-ontology',
      name: 'Scaffold ATT&CK ontology',
      callback: () => {
        void this.scaffoldAttack();
      },
    });

    this.addSettingTab(new ThruntGodSettingTab(this.app, this));

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
