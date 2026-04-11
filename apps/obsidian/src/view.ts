import { ItemView, Setting, type WorkspaceLeaf } from 'obsidian';
import type ThruntGodPlugin from './main';
import type { ViewModel } from './types';

export const THRUNT_WORKSPACE_VIEW_TYPE = 'thrunt-god-workspace';

export class ThruntWorkspaceView extends ItemView {
  plugin: ThruntGodPlugin;

  private lastErrorMessage: string | null = null;
  private consecutiveErrors = 0;

  constructor(leaf: WorkspaceLeaf, plugin: ThruntGodPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return THRUNT_WORKSPACE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'THRUNT God';
  }

  getIcon(): string {
    return 'shield';
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  async render(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('thrunt-god-view');

    try {
      const vm = this.plugin.workspaceService.getViewModel();
      this.renderContent(vm);
      this.consecutiveErrors = 0;
      this.lastErrorMessage = null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === this.lastErrorMessage) {
        this.consecutiveErrors++;
      } else {
        this.consecutiveErrors = 1;
        this.lastErrorMessage = message;
      }
      this.renderError(err, this.consecutiveErrors < 2);
    }
  }

  private renderError(err: unknown, showRetry: boolean): void {
    const { contentEl } = this;
    const card = contentEl.createDiv({ cls: 'thrunt-god-card thrunt-god-hero' });
    card.createEl('h2', { text: 'Rendering error' });
    card.createEl('p', {
      cls: 'thrunt-god-copy',
      text: err instanceof Error ? err.message : String(err),
    });

    if (showRetry) {
      this.createActionButton(card, 'Retry', async () => {
        await this.render();
      });
    } else {
      card.createEl('p', {
        cls: 'thrunt-god-copy',
        text: 'Rendering failed repeatedly. Check the developer console for details.',
      });
    }
  }

  private renderContent(vm: ViewModel): void {
    const { contentEl } = this;

    // Hero card
    const hero = contentEl.createDiv({ cls: 'thrunt-god-card thrunt-god-hero' });
    hero.createEl('p', {
      cls: 'thrunt-god-eyebrow',
      text: 'Threat-hunting workspace',
    });
    hero.createEl('h2', { text: 'THRUNT God' });

    // Three-state status row
    const statusRow = hero.createDiv({ cls: 'thrunt-god-status-row' });

    let badgeClass: string;
    let badgeText: string;
    switch (vm.workspaceStatus) {
      case 'healthy':
        badgeClass = 'thrunt-god-status is-healthy';
        badgeText = `Workspace healthy (${vm.artifactCount}/${vm.artifactTotal})`;
        break;
      case 'partial':
        badgeClass = 'thrunt-god-status is-partial';
        badgeText = `Workspace partial (${vm.artifactCount}/${vm.artifactTotal})`;
        break;
      case 'missing':
        badgeClass = 'thrunt-god-status is-missing';
        badgeText = 'Workspace not detected';
        break;
    }

    statusRow.createSpan({ cls: badgeClass, text: badgeText });
    statusRow.createSpan({ cls: 'thrunt-god-path', text: vm.planningDir });

    // Guidance text
    let guidance: string;
    switch (vm.workspaceStatus) {
      case 'healthy':
        guidance = 'All core artifacts present. Use actions below to open them.';
        break;
      case 'partial':
        guidance = `${vm.artifactCount} of ${vm.artifactTotal} artifacts found. Create missing files below.`;
        break;
      case 'missing':
        guidance =
          'No THRUNT folder was found at the configured path. Open the repo root as your vault or change the planning directory setting.';
        break;
    }
    hero.createEl('p', { cls: 'thrunt-god-copy', text: guidance });

    // Hero actions
    const heroActions = hero.createDiv({ cls: 'thrunt-god-actions' });
    this.createActionButton(heroActions, 'Open mission', async () => {
      await this.plugin.openCoreFile('MISSION.md');
    });
    this.createActionButton(heroActions, 'Refresh', async () => {
      this.plugin.workspaceService.invalidate();
      await this.render();
    });

    // Artifact list
    const artifactCard = contentEl.createDiv({ cls: 'thrunt-god-card' });
    artifactCard.createEl('h3', { text: 'Core artifacts' });

    for (const artifact of vm.artifacts) {
      new Setting(artifactCard)
        .setName(artifact.definition.label)
        .setDesc(`${artifact.definition.description} (${artifact.path})`)
        .addButton((button) => {
          button
            .setButtonText(artifact.exists ? 'Open' : 'Create')
            .setCta()
            .onClick(async () => {
              if (artifact.exists) {
                await this.plugin.openCoreFile(artifact.definition.fileName);
                return;
              }

              await this.plugin.workspaceService.ensureCoreFile(
                artifact.definition.fileName,
                artifact.definition.starterTemplate,
              );
              await this.plugin.openCoreFile(artifact.definition.fileName);
              await this.plugin.refreshViews();
            });
        });
    }
  }

  private createActionButton(
    container: HTMLElement,
    label: string,
    action: () => Promise<void>,
  ): void {
    const button = container.createEl('button', {
      cls: 'clickable-icon thrunt-god-action-button',
      text: label,
      type: 'button',
    });

    button.addEventListener('click', () => {
      void action();
    });
  }
}
