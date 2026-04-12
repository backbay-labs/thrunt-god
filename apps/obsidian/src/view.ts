import { ItemView, Notice, Setting, setIcon, type WorkspaceLeaf } from 'obsidian';
import type ThruntGodPlugin from './main';
import type { ViewModel } from './types';
import { ENTITY_FOLDERS } from './entity-schema';
import { getEffectiveExpandedSections } from './sidebar-state';

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
    const scrollPos = contentEl.scrollTop;
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

    contentEl.scrollTop = scrollPos;
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

    if (vm.workspaceStatus === 'missing') {
      this.renderWelcomeScreen(contentEl);
      return;
    }

    const expanded = getEffectiveExpandedSections(
      this.plugin.settings.sidebarState.expandedSections,
      vm.workspaceStatus,
    );

    this.renderCollapsibleSection(contentEl, 'hunt-status', 'Hunt Status', expanded['hunt-status'] ?? true, (body) => {
      this.renderHuntStatusBody(body, vm);
    });

    this.renderCollapsibleSection(contentEl, 'knowledge-base', 'Knowledge Base', expanded['knowledge-base'] ?? true, (body) => {
      this.renderKnowledgeBaseBody(body, vm);
    });

    this.renderCollapsibleSection(contentEl, 'extended-artifacts', 'Agent Artifacts', expanded['extended-artifacts'] ?? false, (body) => {
      this.renderExtendedArtifactsBody(body, vm);
    });

    if (vm.receiptTimeline.length > 0) {
      this.renderCollapsibleSection(contentEl, 'receipt-timeline', 'Receipt Timeline', expanded['receipt-timeline'] ?? false, (body) => {
        this.renderReceiptTimelineBody(body, vm);
      });
    }

    this.renderCollapsibleSection(contentEl, 'core-artifacts', 'Core Artifacts', expanded['core-artifacts'] ?? false, (body) => {
      this.renderCoreArtifactsBody(body, vm);
    });
  }

  // ---------------------------------------------------------------------------
  // Unified collapsible section renderer
  // ---------------------------------------------------------------------------

  private renderCollapsibleSection(
    container: HTMLElement,
    sectionId: string,
    title: string,
    isExpanded: boolean,
    renderBody: (body: HTMLElement) => void,
  ): HTMLDetailsElement {
    const card = container.createDiv({ cls: 'thrunt-god-card thrunt-god-section' });
    const details = card.createEl('details', { cls: 'thrunt-god-section-details' });
    if (isExpanded) {
      details.setAttribute('open', '');
    }
    const summary = details.createEl('summary', { cls: 'thrunt-god-section-summary' });
    summary.createEl('h3', { text: title, cls: 'thrunt-god-section-title' });
    const body = details.createDiv({ cls: 'thrunt-god-section-body' });
    renderBody(body);
    details.addEventListener('toggle', () => {
      this.updateSectionState(sectionId, details.open);
    });
    return details;
  }

  private updateSectionState(sectionId: string, isOpen: boolean): void {
    this.plugin.settings.sidebarState.expandedSections[sectionId] = isOpen;
    void this.plugin.saveSettings();
  }

  // ---------------------------------------------------------------------------
  // Welcome screen (shown when workspaceStatus === 'missing')
  // ---------------------------------------------------------------------------

  private renderWelcomeScreen(container: HTMLElement): void {
    const card = container.createDiv({ cls: 'thrunt-god-card thrunt-god-welcome' });
    const iconEl = card.createDiv({ cls: 'thrunt-god-welcome-icon' });
    setIcon(iconEl, 'shield');
    card.createEl('h3', { text: 'THRUNT God' });
    card.createEl('p', {
      text: 'Initialize your threat hunting workspace to begin tracking hypotheses, evidence, and entity intelligence.',
      cls: 'thrunt-god-welcome-text',
    });
    this.createActionButton(card, 'Initialize Hunt Workspace', async () => {
      await this.plugin.workspaceService.bootstrap();
      this.plugin.workspaceService.invalidate();
      await this.render();
    });
  }

  // ---------------------------------------------------------------------------
  // Empty state hint renderer
  // ---------------------------------------------------------------------------

  private renderEmptyState(
    container: HTMLElement,
    message: string,
    actionLabel?: string,
    action?: () => Promise<void>,
  ): void {
    const empty = container.createDiv({ cls: 'thrunt-god-empty-state' });
    empty.createEl('p', { text: message, cls: 'thrunt-god-empty-hint' });
    if (actionLabel && action) {
      this.createActionButton(empty, actionLabel, action);
    }
  }

  // ---------------------------------------------------------------------------
  // Section body renderers
  // ---------------------------------------------------------------------------

  private renderHuntStatusBody(body: HTMLElement, vm: ViewModel): void {
    // Header row: status badge + path
    const header = body.createDiv({ cls: 'thrunt-god-hunt-header' });
    const statusCls = vm.workspaceStatus === 'healthy' ? 'is-healthy'
      : vm.workspaceStatus === 'partial' ? 'is-partial'
      : 'is-missing';
    const statusText = vm.workspaceStatus === 'healthy' ? 'Healthy'
      : vm.workspaceStatus === 'partial' ? `Partial (${vm.artifactCount}/${vm.artifactTotal})`
      : 'Not detected';
    header.createSpan({ cls: `thrunt-god-status ${statusCls}`, text: statusText });
    header.createSpan({ cls: 'thrunt-god-path', text: vm.planningDir });

    // MCP connection indicator
    const mcpDot = header.createSpan({ cls: 'thrunt-god-mcp-status' });
    const dotEl = mcpDot.createSpan({ cls: 'thrunt-god-mcp-dot' });

    dotEl.style.display = 'inline-block';
    dotEl.style.width = '8px';
    dotEl.style.height = '8px';
    dotEl.style.borderRadius = '50%';
    dotEl.style.marginLeft = '6px';
    dotEl.style.verticalAlign = 'middle';

    switch (vm.mcpStatus) {
      case 'connected':
        dotEl.addClass('is-connected');
        dotEl.style.backgroundColor = 'var(--color-green, #4ade80)';
        mcpDot.setAttribute('aria-label', 'MCP connected');
        mcpDot.setAttribute('title', 'MCP connected');
        break;
      case 'disabled':
        dotEl.addClass('is-disabled');
        dotEl.style.backgroundColor = 'var(--text-muted)';
        mcpDot.setAttribute('aria-label', 'MCP disabled');
        mcpDot.setAttribute('title', 'MCP disabled — enable in settings');
        break;
      case 'error':
        dotEl.addClass('is-error');
        dotEl.style.backgroundColor = 'var(--color-red, #f87171)';
        mcpDot.setAttribute('aria-label', 'MCP connection error');
        mcpDot.setAttribute('title', 'MCP enabled but unreachable — check server URL');
        break;
      case 'disconnected':
        dotEl.addClass('is-disabled');
        dotEl.style.backgroundColor = 'var(--text-muted)';
        mcpDot.setAttribute('aria-label', 'MCP disconnected');
        mcpDot.setAttribute('title', 'MCP disconnected');
        break;
    }

    // Hunt fields
    if (vm.workspaceStatus !== 'missing') {
      const fields = body.createDiv({ cls: 'thrunt-god-hunt-fields' });

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
    const actions = body.createDiv({ cls: 'thrunt-god-actions' });
    this.createActionButton(actions, 'Open mission', async () => {
      await this.plugin.openCoreFile('MISSION.md');
    });
    this.createActionButton(actions, 'Refresh', async () => {
      this.plugin.workspaceService.invalidate();
      await this.render();
    });
  }

  private renderKnowledgeBaseBody(body: HTMLElement, vm: ViewModel): void {
    const folderLabels: Record<string, string> = {
      'entities/iocs': 'IOCs',
      'entities/ttps': 'TTPs',
      'entities/actors': 'Actors',
      'entities/tools': 'Tools',
      'entities/infra': 'Infrastructure',
      'entities/datasources': 'Data Sources',
    };

    const total = Object.values(vm.entityCounts).reduce((sum, c) => sum + c, 0);

    if (total === 0) {
      this.renderEmptyState(
        body,
        'No entities yet -- run ingestion to populate.',
        'Ingest',
        async () => {
          const result = await this.plugin.workspaceService.runIngestion();
          await this.plugin.refreshViews();
          new Notice(
            `Ingestion complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
          );
        },
      );
      return;
    }

    const fields = body.createDiv({ cls: 'thrunt-god-hunt-fields' });
    for (const folder of ENTITY_FOLDERS) {
      const label = folderLabels[folder] ?? folder;
      const count = vm.entityCounts[folder] ?? 0;
      this.renderField(fields, label, String(count));
    }

    this.renderField(fields, 'Total', String(total));

    const actions = body.createDiv({ cls: 'thrunt-god-actions' });
    this.createActionButton(actions, 'Open dashboard', async () => {
      await this.plugin.openCoreFile('KNOWLEDGE_BASE.md');
    });
  }

  private renderExtendedArtifactsBody(body: HTMLElement, vm: ViewModel): void {
    const ea = vm.extendedArtifacts;
    const hasData = ea.receipts > 0 || ea.queries > 0 || ea.evidenceReview ||
      ea.successCriteria || ea.environment || ea.cases > 0;

    if (!hasData) {
      this.renderEmptyState(
        body,
        'No agent artifacts detected. Run hunts to generate receipts and queries.',
      );
      return;
    }

    const fields = body.createDiv({ cls: 'thrunt-god-hunt-fields' });

    this.renderField(fields, 'Receipts', String(ea.receipts));
    this.renderField(fields, 'Query Logs', String(ea.queries));
    this.renderField(fields, 'Evidence Review', ea.evidenceReview ? 'Present' : 'Missing');
    this.renderField(fields, 'Success Criteria', ea.successCriteria ? 'Present' : 'Missing');
    this.renderField(fields, 'Environment', ea.environment ? 'Present' : 'Missing');
    this.renderField(fields, 'Cases', String(ea.cases));
  }

  private renderReceiptTimelineBody(body: HTMLElement, vm: ViewModel): void {
    if (vm.receiptTimeline.length === 0) {
      this.renderEmptyState(body, 'No receipts yet.');
      return;
    }

    const content = body.createDiv({ cls: 'thrunt-god-rt-content' });

    // Group entries by hypothesis
    const grouped = new Map<string, typeof vm.receiptTimeline>();
    for (const entry of vm.receiptTimeline) {
      const group = grouped.get(entry.hypothesis) ?? [];
      group.push(entry);
      grouped.set(entry.hypothesis, group);
    }

    // Render each hypothesis group
    for (const [hypothesis, entries] of grouped) {
      content.createDiv({ cls: 'thrunt-god-rt-hypothesis', text: hypothesis });

      for (const entry of entries) {
        const row = content.createDiv({ cls: 'thrunt-god-rt-entry' });

        // Status badge
        let statusCls = 'is-pending';
        if (entry.claim_status === 'supports') statusCls = 'is-validated';
        else if (entry.claim_status === 'disproves') statusCls = 'is-rejected';

        row.createSpan({
          cls: `thrunt-god-rt-status ${statusCls}`,
          text: entry.claim_status || 'pending',
        });

        // Receipt ID
        row.createSpan({ cls: 'thrunt-god-rt-id', text: entry.receipt_id });

        // Truncated claim
        const claimText = entry.claim.length > 50
          ? entry.claim.slice(0, 47) + '...'
          : entry.claim;
        row.createSpan({ cls: 'thrunt-god-rt-claim', text: claimText });

        // Technique refs badges
        for (const ref of entry.technique_refs) {
          row.createSpan({ cls: 'thrunt-god-rt-technique', text: ref });
        }

        // Click handler
        row.addEventListener('click', () => {
          void this.plugin.openCoreFile('RECEIPTS/' + entry.fileName);
        });
      }
    }

    // Actions row with Ingest button
    const actions = body.createDiv({ cls: 'thrunt-god-actions' });
    this.createActionButton(actions, 'Ingest', async () => {
      const result = await this.plugin.workspaceService.runIngestion();
      await this.plugin.refreshViews();
      new Notice(
        `Ingestion complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
      );
    });
  }

  private renderCoreArtifactsBody(body: HTMLElement, vm: ViewModel): void {
    for (const artifact of vm.artifacts) {
      new Setting(body)
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

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  private renderField(container: HTMLElement, label: string, value: string): void {
    const field = container.createDiv({ cls: 'thrunt-god-hunt-field' });
    field.createSpan({ cls: 'thrunt-god-field-label', text: label });
    field.createSpan({ cls: 'thrunt-god-field-value', text: value });
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
