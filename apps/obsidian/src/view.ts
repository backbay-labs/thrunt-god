import { ItemView, Setting, type WorkspaceLeaf } from 'obsidian';
import type ThruntGodPlugin from './main';
import type { ViewModel } from './types';
import { ENTITY_FOLDERS } from './entity-schema';

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
      const vm = await this.plugin.workspaceService.getViewModel();
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
    const card = contentEl.createDiv({ cls: 'thrunt-god-card thrunt-god-hunt-status' });
    card.createEl('h3', { text: 'Rendering error' });
    card.createEl('p', {
      text: err instanceof Error ? err.message : String(err),
    });

    if (showRetry) {
      this.createActionButton(card, 'Retry', async () => {
        await this.render();
      });
    } else {
      card.createEl('p', {
        text: 'Rendering failed repeatedly. Check the developer console for details.',
      });
    }
  }

  private renderContent(vm: ViewModel): void {
    const { contentEl } = this;

    // Hunt status card (replaces old hero marketing card)
    this.renderHuntStatusCard(contentEl, vm);

    // Knowledge Base entity counts
    this.renderKnowledgeBaseSection(contentEl, vm);

    // Extended artifacts (agent-produced)
    this.renderExtendedArtifactsSection(contentEl, vm);

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

  private renderHuntStatusCard(container: HTMLElement, vm: ViewModel): void {
    const card = container.createDiv({ cls: 'thrunt-god-card thrunt-god-hunt-status' });

    // Header row: status badge + path
    const header = card.createDiv({ cls: 'thrunt-god-hunt-header' });
    const statusCls = vm.workspaceStatus === 'healthy' ? 'is-healthy'
      : vm.workspaceStatus === 'partial' ? 'is-partial'
      : 'is-missing';
    const statusText = vm.workspaceStatus === 'healthy' ? 'Healthy'
      : vm.workspaceStatus === 'partial' ? `Partial (${vm.artifactCount}/${vm.artifactTotal})`
      : 'Not detected';
    header.createSpan({ cls: `thrunt-god-status ${statusCls}`, text: statusText });
    header.createSpan({ cls: 'thrunt-god-path', text: vm.planningDir });

    // Hunt fields (skip if missing)
    if (vm.workspaceStatus !== 'missing') {
      const fields = card.createDiv({ cls: 'thrunt-god-hunt-fields' });

      // Phase
      const phaseLabel = vm.stateSnapshot?.currentPhase ?? 'unknown';
      this.renderField(fields, 'Phase', phaseLabel);

      // Blockers
      const blockerCount = vm.stateSnapshot?.blockers.length ?? 0;
      this.renderField(fields, 'Blockers', String(blockerCount));

      // Next action (only if nextActions is non-empty)
      const nextActions = vm.stateSnapshot?.nextActions ?? [];
      if (nextActions.length > 0) {
        const first = nextActions[0]!;
        const nextText = first.length > 60
          ? first.slice(0, 57) + '...'
          : first;
        this.renderField(fields, 'Next', nextText);
      }

      // Hypotheses scoreboard
      if (vm.hypothesisSnapshot && vm.hypothesisSnapshot.total > 0) {
        const hypoField = fields.createDiv({ cls: 'thrunt-god-hunt-field' });
        hypoField.createSpan({ cls: 'thrunt-god-field-label', text: 'Hypotheses' });
        const scoreboard = hypoField.createSpan({ cls: 'thrunt-god-field-value thrunt-god-scoreboard' });
        scoreboard.createSpan({ cls: 'thrunt-god-score is-validated', text: `${vm.hypothesisSnapshot.validated} validated` });
        scoreboard.createSpan({ cls: 'thrunt-god-score-sep', text: ' / ' });
        scoreboard.createSpan({ cls: 'thrunt-god-score is-pending', text: `${vm.hypothesisSnapshot.pending} pending` });
        scoreboard.createSpan({ cls: 'thrunt-god-score-sep', text: ' / ' });
        scoreboard.createSpan({ cls: 'thrunt-god-score is-rejected', text: `${vm.hypothesisSnapshot.rejected} rejected` });
      } else {
        this.renderField(fields, 'Hypotheses', 'none');
      }

      // Phase directories
      const pd = vm.phaseDirectories;
      if (pd.count > 0) {
        this.renderField(fields, 'Phases', `${pd.count} directories (latest: ${pd.highestName})`);
      }
    }

    // Actions row
    const actions = card.createDiv({ cls: 'thrunt-god-actions' });
    this.createActionButton(actions, 'Open mission', async () => {
      await this.plugin.openCoreFile('MISSION.md');
    });
    this.createActionButton(actions, 'Refresh', async () => {
      this.plugin.workspaceService.invalidate();
      await this.render();
    });
  }

  private renderField(container: HTMLElement, label: string, value: string): void {
    const field = container.createDiv({ cls: 'thrunt-god-hunt-field' });
    field.createSpan({ cls: 'thrunt-god-field-label', text: label });
    field.createSpan({ cls: 'thrunt-god-field-value', text: value });
  }

  private renderExtendedArtifactsSection(container: HTMLElement, vm: ViewModel): void {
    if (vm.workspaceStatus === 'missing') return;

    const card = container.createDiv({ cls: 'thrunt-god-card thrunt-god-extended-artifacts' });
    const details = card.createEl('details', { cls: 'thrunt-god-ea-details' });
    details.setAttribute('open', '');

    const summary = details.createEl('summary', { cls: 'thrunt-god-ea-summary' });
    summary.createEl('h3', { text: 'Agent Artifacts', cls: 'thrunt-god-ea-title' });

    const fields = details.createDiv({ cls: 'thrunt-god-hunt-fields' });
    const ea = vm.extendedArtifacts;

    this.renderField(fields, 'Receipts', String(ea.receipts));
    this.renderField(fields, 'Query Logs', String(ea.queries));
    this.renderField(fields, 'Evidence Review', ea.evidenceReview ? 'Present' : 'Missing');
    this.renderField(fields, 'Success Criteria', ea.successCriteria ? 'Present' : 'Missing');
    this.renderField(fields, 'Environment', ea.environment ? 'Present' : 'Missing');
    this.renderField(fields, 'Cases', String(ea.cases));
  }

  private renderKnowledgeBaseSection(container: HTMLElement, vm: ViewModel): void {
    const folderLabels: Record<string, string> = {
      'entities/iocs': 'IOCs',
      'entities/ttps': 'TTPs',
      'entities/actors': 'Actors',
      'entities/tools': 'Tools',
      'entities/infra': 'Infrastructure',
      'entities/datasources': 'Data Sources',
    };

    const card = container.createDiv({ cls: 'thrunt-god-card thrunt-god-kb-section' });

    const details = card.createEl('details', { cls: 'thrunt-god-kb-details' });
    details.setAttribute('open', '');

    const summary = details.createEl('summary', { cls: 'thrunt-god-kb-summary' });
    summary.createEl('h3', { text: 'Knowledge Base', cls: 'thrunt-god-kb-title' });

    const fields = details.createDiv({ cls: 'thrunt-god-hunt-fields' });
    for (const folder of ENTITY_FOLDERS) {
      const label = folderLabels[folder] ?? folder;
      const count = vm.entityCounts[folder] ?? 0;
      this.renderField(fields, label, String(count));
    }

    const total = Object.values(vm.entityCounts).reduce((sum, c) => sum + c, 0);
    this.renderField(fields, 'Total', String(total));

    const actions = details.createDiv({ cls: 'thrunt-god-actions' });
    this.createActionButton(actions, 'Open dashboard', async () => {
      await this.plugin.openCoreFile('KNOWLEDGE_BASE.md');
    });
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
