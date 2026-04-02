import * as vscode from 'vscode';
import type { ArtifactType, Hypothesis, Receipt, HuntPhase, Query } from './types';
import type { HuntDataStore } from './store';

// ---------------------------------------------------------------------------
// Node types for dispatch in getChildren
// ---------------------------------------------------------------------------

type NodeType =
  | 'mission'
  | 'hypotheses-group'
  | 'hypothesis'
  | 'phases-group'
  | 'phase'
  | 'query'
  | 'receipt';

// ---------------------------------------------------------------------------
// HuntTreeItem
// ---------------------------------------------------------------------------

export class HuntTreeItem extends vscode.TreeItem {
  artifactPath?: string;
  artifactType?: ArtifactType;
  nodeType?: NodeType;
  dataId?: string;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    options?: {
      description?: string;
      iconPath?: vscode.ThemeIcon;
      tooltip?: string;
      artifactPath?: string;
      artifactType?: ArtifactType;
      contextValue?: string;
      nodeType?: NodeType;
      dataId?: string;
    }
  ) {
    super(label, collapsibleState);

    if (options) {
      if (options.description !== undefined) this.description = options.description;
      if (options.iconPath) this.iconPath = options.iconPath;
      if (options.tooltip) this.tooltip = options.tooltip;
      if (options.artifactPath) this.artifactPath = options.artifactPath;
      if (options.artifactType) this.artifactType = options.artifactType;
      if (options.nodeType) this.nodeType = options.nodeType;
      if (options.dataId) this.dataId = options.dataId;
    }

    this.contextValue = options?.contextValue ?? 'huntTreeItem';

    // Leaf nodes (non-collapsible) get a command for double-click to open
    if (collapsibleState === vscode.TreeItemCollapsibleState.None && this.artifactPath) {
      this.command = {
        command: 'thrunt-god.openArtifact',
        title: 'Open Artifact',
        arguments: [this],
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve an artifact file path from the hunt root, node type, and ID.
 * Matches the watcher's resolveArtifactType convention.
 */
function resolveArtifactPath(huntRoot: vscode.Uri, type: string, id: string): string {
  switch (type) {
    case 'mission':
      return vscode.Uri.joinPath(huntRoot, 'MISSION.md').fsPath;
    case 'hypotheses-group':
      return vscode.Uri.joinPath(huntRoot, 'HYPOTHESES.md').fsPath;
    case 'query':
      return vscode.Uri.joinPath(huntRoot, 'QUERIES', `${id}.md`).fsPath;
    case 'receipt':
      return vscode.Uri.joinPath(huntRoot, 'RECEIPTS', `${id}.md`).fsPath;
    default:
      return '';
  }
}

/**
 * Build a receipt tree item with deviation score badge.
 */
function buildReceiptNode(receipt: Receipt, huntRoot: vscode.Uri): HuntTreeItem {
  let description: string;
  let icon: vscode.ThemeIcon;

  if (!receipt.anomalyFrame) {
    description = 'No score';
    icon = new vscode.ThemeIcon('file');
  } else {
    const score = receipt.anomalyFrame.deviationScore.totalScore;
    description = `Score: ${score}/6`;
    if (score <= 2) {
      icon = new vscode.ThemeIcon('pass', new vscode.ThemeColor('charts.green'));
    } else if (score <= 4) {
      icon = new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
    } else {
      icon = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
    }
  }

  const tooltip = receipt.claim ? receipt.claim.slice(0, 200) : '';

  return new HuntTreeItem(receipt.receiptId, vscode.TreeItemCollapsibleState.None, {
    description,
    iconPath: icon,
    tooltip,
    nodeType: 'receipt',
    dataId: receipt.receiptId,
    artifactPath: resolveArtifactPath(huntRoot, 'receipt', receipt.receiptId),
    artifactType: 'receipt',
  });
}

// ---------------------------------------------------------------------------
// HuntTreeDataProvider
// ---------------------------------------------------------------------------

export class HuntTreeDataProvider implements vscode.TreeDataProvider<HuntTreeItem>, vscode.Disposable {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<HuntTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<HuntTreeItem | undefined | void> = this._onDidChangeTreeData.event;

  private readonly storeSubscription: vscode.Disposable;

  constructor(
    private readonly store: HuntDataStore,
    private readonly huntRoot: vscode.Uri
  ) {
    // Refresh entire tree whenever the store emits a change
    this.storeSubscription = this.store.onDidChange(() => {
      this._onDidChangeTreeData.fire(undefined);
    });
  }

  /**
   * Manually refresh the tree view.
   */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: HuntTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: HuntTreeItem): HuntTreeItem[] {
    if (!element) {
      return this.getRootNodes();
    }

    switch (element.nodeType) {
      case 'hypotheses-group':
        return this.getHypothesisNodes();
      case 'hypothesis':
        return this.getReceiptsForHypothesis(element.dataId ?? '');
      case 'phases-group':
        return this.getPhaseNodes();
      case 'phase':
        return this.getQueriesForPhase(element.dataId ?? '');
      case 'query':
        return this.getReceiptsForQuery(element.dataId ?? '');
      default:
        return [];
    }
  }

  // --- Root nodes ---

  private getRootNodes(): HuntTreeItem[] {
    const hunt = this.store.getHunt();
    if (!hunt) {
      return []; // Empty state handled by viewsWelcome
    }

    const missionLabel =
      hunt.mission.status === 'loaded' && hunt.mission.data.mode
        ? `Mission (${hunt.mission.data.mode})`
        : 'Mission';

    return [
      new HuntTreeItem(missionLabel, vscode.TreeItemCollapsibleState.None, {
        iconPath: new vscode.ThemeIcon('shield'),
        nodeType: 'mission',
        artifactPath: resolveArtifactPath(this.huntRoot, 'mission', ''),
        artifactType: 'mission',
      }),
      new HuntTreeItem('Hypotheses', vscode.TreeItemCollapsibleState.Expanded, {
        iconPath: new vscode.ThemeIcon('lightbulb'),
        nodeType: 'hypotheses-group',
        artifactPath: resolveArtifactPath(this.huntRoot, 'hypotheses-group', ''),
        artifactType: 'hypotheses',
      }),
      new HuntTreeItem('Phases', vscode.TreeItemCollapsibleState.Expanded, {
        iconPath: new vscode.ThemeIcon('layers'),
        nodeType: 'phases-group',
      }),
    ];
  }

  // --- Hypothesis nodes ---

  private getHypothesisNodes(): HuntTreeItem[] {
    const hunt = this.store.getHunt();
    if (!hunt || hunt.hypotheses.status !== 'loaded') return [];

    const hyps = hunt.hypotheses.data;
    const all: Hypothesis[] = [...hyps.active, ...hyps.parked, ...hyps.disproved];

    return all.map((h) => {
      const { description, icon } = this.verdictBadge(h.status);
      const tooltip = h.assertion ? h.assertion.slice(0, 200) : '';

      return new HuntTreeItem(h.id, vscode.TreeItemCollapsibleState.Collapsed, {
        description,
        iconPath: icon,
        tooltip,
        nodeType: 'hypothesis',
        dataId: h.id,
        artifactPath: resolveArtifactPath(this.huntRoot, 'hypotheses-group', ''),
        artifactType: 'hypotheses',
      });
    });
  }

  private verdictBadge(status: string): { description: string; icon: vscode.ThemeIcon } {
    switch (status) {
      case 'Supported':
        return {
          description: 'Supported',
          icon: new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
        };
      case 'Disproved':
        return {
          description: 'Disproved',
          icon: new vscode.ThemeIcon('close', new vscode.ThemeColor('charts.red')),
        };
      case 'Inconclusive':
        return {
          description: 'Inconclusive',
          icon: new vscode.ThemeIcon('question', new vscode.ThemeColor('charts.yellow')),
        };
      default:
        return {
          description: 'Open',
          icon: new vscode.ThemeIcon('circle-outline'),
        };
    }
  }

  // --- Receipts for hypothesis ---

  private getReceiptsForHypothesis(hypothesisId: string): HuntTreeItem[] {
    const results = this.store.getReceiptsForHypothesis(hypothesisId);
    return results
      .filter((r) => r.status === 'loaded')
      .map((r) => buildReceiptNode(r.data as Receipt, this.huntRoot));
  }

  // --- Phase nodes ---

  private getPhaseNodes(): HuntTreeItem[] {
    const hunt = this.store.getHunt();
    if (!hunt || hunt.huntMap.status !== 'loaded') return [];

    const phases = hunt.huntMap.data.phases;
    return phases.map((p) => {
      const { description, icon } = this.phaseStatusBadge(p.status);

      return new HuntTreeItem(`Phase ${p.number}: ${p.name}`, vscode.TreeItemCollapsibleState.Collapsed, {
        description,
        iconPath: icon,
        nodeType: 'phase',
        dataId: p.number.toString(),
      });
    });
  }

  private phaseStatusBadge(status: string): { description: string; icon: vscode.ThemeIcon } {
    switch (status) {
      case 'complete':
        return {
          description: 'complete',
          icon: new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green')),
        };
      case 'running':
        return {
          description: 'running',
          icon: new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue')),
        };
      default:
        return {
          description: 'planned',
          icon: new vscode.ThemeIcon('circle-outline'),
        };
    }
  }

  // --- Queries for phase ---

  private getQueriesForPhase(phaseNumber: string): HuntTreeItem[] {
    const queries = this.store.getQueriesForPhase(parseInt(phaseNumber, 10));
    return queries
      .filter((q) => q.status === 'loaded')
      .map((q) => {
        const query = q.data as Query;
        return new HuntTreeItem(query.queryId, vscode.TreeItemCollapsibleState.Collapsed, {
          description: `${query.templateCount} templates`,
          iconPath: new vscode.ThemeIcon('beaker'),
          nodeType: 'query',
          dataId: query.queryId,
          artifactPath: resolveArtifactPath(this.huntRoot, 'query', query.queryId),
          artifactType: 'query',
        });
      });
  }

  // --- Receipts for query ---

  private getReceiptsForQuery(queryId: string): HuntTreeItem[] {
    const results = this.store.getReceiptsForQuery(queryId);
    return results
      .filter((r) => r.status === 'loaded')
      .map((r) => buildReceiptNode(r.data as Receipt, this.huntRoot));
  }

  // --- Disposal ---

  dispose(): void {
    this.storeSubscription.dispose();
    this._onDidChangeTreeData.dispose();
  }
}
