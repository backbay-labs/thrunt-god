import * as vscode from 'vscode';
import type { MCPStatusManager } from './mcpStatusManager';

// ---------------------------------------------------------------------------
// Node types for dispatch in getChildren
// ---------------------------------------------------------------------------

export type AutomationNodeType = 'mcp' | 'command-deck' | 'runbooks' | 'recent-runs';

// ---------------------------------------------------------------------------
// AutomationTreeItem
// ---------------------------------------------------------------------------

export class AutomationTreeItem extends vscode.TreeItem {
  nodeType?: AutomationNodeType;
  dataId?: string;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    options?: {
      description?: string;
      iconPath?: vscode.ThemeIcon;
      tooltip?: string;
      contextValue?: string;
      nodeType?: AutomationNodeType;
      dataId?: string;
    }
  ) {
    super(label, collapsibleState);

    if (options) {
      if (options.description !== undefined) this.description = options.description;
      if (options.iconPath) this.iconPath = options.iconPath;
      if (options.tooltip) this.tooltip = options.tooltip;
      if (options.nodeType) this.nodeType = options.nodeType;
      if (options.dataId) this.dataId = options.dataId;
    }

    this.contextValue = options?.contextValue ?? 'automationTreeItem';
  }
}

// ---------------------------------------------------------------------------
// AutomationTreeDataProvider
// ---------------------------------------------------------------------------

export class AutomationTreeDataProvider
  implements vscode.TreeDataProvider<AutomationTreeItem>, vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<AutomationTreeItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<AutomationTreeItem | undefined | void> =
    this._onDidChangeTreeData.event;

  private runbookCount: number;
  private commandCount: number;
  private mcpStatus: MCPStatusManager | null;

  constructor(options?: { runbookCount?: number; commandCount?: number; mcpStatus?: MCPStatusManager }) {
    this.runbookCount = options?.runbookCount ?? 0;
    this.commandCount = options?.commandCount ?? 0;
    this.mcpStatus = options?.mcpStatus ?? null;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  setRunbookCount(count: number): void {
    this.runbookCount = count;
    this.refresh();
  }

  setCommandCount(count: number): void {
    this.commandCount = count;
    this.refresh();
  }

  getTreeItem(element: AutomationTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AutomationTreeItem): AutomationTreeItem[] {
    if (!element) {
      return this.getRootNodes();
    }

    if (element.nodeType === 'mcp' && this.mcpStatus) {
      return this.getMcpChildren();
    }

    // Real children will be added in phases 60-62
    return [];
  }

  private getRootNodes(): AutomationTreeItem[] {
    const runbookDescription =
      this.runbookCount > 0 ? `${this.runbookCount} runbooks` : 'No runbooks found';

    return [
      this.getMcpRootNode(),
      new AutomationTreeItem('Command Deck', vscode.TreeItemCollapsibleState.Collapsed, {
        iconPath: new vscode.ThemeIcon('terminal'),
        description: this.commandCount > 0 ? `${this.commandCount} commands` : '0 commands',
        nodeType: 'command-deck',
        contextValue: 'automationCommandDeck',
      }),
      new AutomationTreeItem('Runbooks', vscode.TreeItemCollapsibleState.Collapsed, {
        iconPath: new vscode.ThemeIcon('notebook'),
        description: runbookDescription,
        nodeType: 'runbooks',
        contextValue: 'automationRunbooks',
      }),
      new AutomationTreeItem('Recent Runs', vscode.TreeItemCollapsibleState.Collapsed, {
        iconPath: new vscode.ThemeIcon('history'),
        description: 'No recent runs',
        nodeType: 'recent-runs',
        contextValue: 'automationRecentRuns',
      }),
    ];
  }

  private getMcpRootNode(): AutomationTreeItem {
    const status = this.mcpStatus?.getStatus();

    let icon: vscode.ThemeIcon;
    let description: string;

    if (!status || !this.mcpStatus) {
      icon = new vscode.ThemeIcon('plug');
      description = 'No MCP server configured';
    } else if (status.connection === 'checking') {
      icon = new vscode.ThemeIcon('sync~spin');
      description = 'Checking...';
    } else if (status.connection === 'connected') {
      icon = new vscode.ThemeIcon('plug', new vscode.ThemeColor('charts.green'));
      description = `Connected${status.profile ? ` - ${status.profile}` : ''}`;
    } else {
      icon = new vscode.ThemeIcon('plug', new vscode.ThemeColor('charts.red'));
      description = 'Disconnected';
    }

    // Append last health check timestamp if available
    if (status?.lastHealthCheck) {
      const ts = new Date(status.lastHealthCheck.timestamp);
      description += ` (${ts.toLocaleTimeString()})`;
    }

    return new AutomationTreeItem('MCP', vscode.TreeItemCollapsibleState.Collapsed, {
      iconPath: icon,
      description,
      nodeType: 'mcp',
      contextValue: 'automationMcp',
    });
  }

  private getMcpChildren(): AutomationTreeItem[] {
    const status = this.mcpStatus?.getStatus();
    if (!status?.lastHealthCheck) {
      return [
        new AutomationTreeItem('Run health check to see status', vscode.TreeItemCollapsibleState.None, {
          iconPath: new vscode.ThemeIcon('info'),
          nodeType: 'mcp',
          contextValue: 'automationMcpChild',
        }),
      ];
    }

    const hc = status.lastHealthCheck;
    const items: AutomationTreeItem[] = [];

    items.push(new AutomationTreeItem(
      `Status: ${hc.status}`,
      vscode.TreeItemCollapsibleState.None,
      {
        iconPath: new vscode.ThemeIcon(hc.status === 'healthy' ? 'pass' : 'error'),
        nodeType: 'mcp',
        contextValue: 'automationMcpChild',
      }
    ));

    items.push(new AutomationTreeItem(
      `Tools: ${hc.toolCount}`,
      vscode.TreeItemCollapsibleState.None,
      {
        iconPath: new vscode.ThemeIcon('wrench'),
        nodeType: 'mcp',
        contextValue: 'automationMcpChild',
      }
    ));

    const dbSizeKb = (hc.dbSizeBytes / 1024).toFixed(1);
    items.push(new AutomationTreeItem(
      `DB: ${dbSizeKb} KB (${hc.dbTableCount} tables)`,
      vscode.TreeItemCollapsibleState.None,
      {
        iconPath: new vscode.ThemeIcon('database'),
        nodeType: 'mcp',
        contextValue: 'automationMcpChild',
      }
    ));

    if (hc.error) {
      items.push(new AutomationTreeItem(
        `Error: ${hc.error}`,
        vscode.TreeItemCollapsibleState.None,
        {
          iconPath: new vscode.ThemeIcon('warning'),
          nodeType: 'mcp',
          contextValue: 'automationMcpChild',
        }
      ));
    }

    return items;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
