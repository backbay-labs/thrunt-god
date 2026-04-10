import * as vscode from 'vscode';
import * as path from 'path';
import type { MCPStatusManager } from './mcpStatusManager';
import type { RunbookRegistry } from './runbook';
import type { ExecutionLogger } from './executionLogger';
import type { ExecutionEntry } from '../shared/execution-history';
import type { CommandTemplate } from '../shared/command-deck';
import { BUILT_IN_COMMANDS } from './commandDeck';

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
  private runbookRegistry: RunbookRegistry | null;
  private executionLogger: ExecutionLogger | null;
  private commandTemplates: CommandTemplate[] = [];

  constructor(options?: { runbookCount?: number; commandCount?: number; mcpStatus?: MCPStatusManager; runbookRegistry?: RunbookRegistry; executionLogger?: ExecutionLogger }) {
    this.runbookCount = options?.runbookCount ?? 0;
    this.commandCount = options?.commandCount ?? 0;
    this.mcpStatus = options?.mcpStatus ?? null;
    this.runbookRegistry = options?.runbookRegistry ?? null;
    this.executionLogger = options?.executionLogger ?? null;
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

  setRunbookRegistry(registry: RunbookRegistry): void {
    this.runbookRegistry = registry;
    this.refresh();
  }

  setExecutionLogger(logger: ExecutionLogger): void {
    this.executionLogger = logger;
    this.refresh();
  }

  setCommandTemplates(templates: CommandTemplate[]): void {
    this.commandTemplates = templates;
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

    if (element.nodeType === 'runbooks') {
      return this.getRunbookChildren();
    }

    if (element.nodeType === 'command-deck') {
      return this.getCommandDeckChildren();
    }

    if (element.nodeType === 'recent-runs') {
      return this.getRecentRunsChildren();
    }

    return [];
  }

  private getRunbookChildren(): AutomationTreeItem[] {
    if (!this.runbookRegistry) {
      return [
        new AutomationTreeItem('No registry', vscode.TreeItemCollapsibleState.None, {
          iconPath: new vscode.ThemeIcon('info'),
          contextValue: 'automationRunbookChild',
        }),
      ];
    }

    const runbooks = this.runbookRegistry.getRunbooks();
    if (runbooks.length === 0) {
      return [
        new AutomationTreeItem('No runbooks found', vscode.TreeItemCollapsibleState.None, {
          iconPath: new vscode.ThemeIcon('info'),
          contextValue: 'automationRunbookChild',
        }),
      ];
    }

    return runbooks.map((rb) => {
      const label = rb.valid ? rb.name : path.basename(rb.path, path.extname(rb.path));
      const description = rb.valid
        ? rb.description
        : (rb.errors[0] || 'Invalid').slice(0, 60);
      const icon = rb.valid
        ? new vscode.ThemeIcon('notebook')
        : new vscode.ThemeIcon('warning');

      const item = new AutomationTreeItem(label, vscode.TreeItemCollapsibleState.None, {
        description,
        iconPath: icon,
        tooltip: rb.path,
        contextValue: 'automationRunbookItem',
        dataId: rb.path,
      });
      if (rb.valid) {
        item.command = { command: 'thrunt-god.openRunbook', title: label, arguments: [item] };
      }
      return item;
    });
  }

  private getRootNodes(): AutomationTreeItem[] {
    const runbookDescription =
      this.runbookCount > 0 ? `${this.runbookCount} runbooks` : 'No runbooks found';

    const recentCount = this.executionLogger?.getRecent().length ?? 0;
    const recentDescription = recentCount > 0 ? `${recentCount} runs` : 'No recent runs';

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
        description: recentDescription,
        nodeType: 'recent-runs',
        contextValue: 'automationRecentRuns',
      }),
    ];
  }

  private getCommandDeckChildren(): AutomationTreeItem[] {
    const items: AutomationTreeItem[] = [];

    // Built-in commands
    for (const cmd of BUILT_IN_COMMANDS) {
      const item = new AutomationTreeItem(cmd.label, vscode.TreeItemCollapsibleState.None, {
        description: cmd.mutating ? 'mutating' : 'read-only',
        iconPath: new vscode.ThemeIcon(cmd.icon, cmd.mutating ? new vscode.ThemeColor('charts.yellow') : undefined),
        tooltip: cmd.description,
        contextValue: 'automationCommandDeckItem',
        dataId: cmd.id,
      });
      if (cmd.commandId) {
        item.command = { command: cmd.commandId, title: cmd.label };
      }
      items.push(item);
    }

    // User templates
    for (const tmpl of this.commandTemplates) {
      const item = new AutomationTreeItem(tmpl.label, vscode.TreeItemCollapsibleState.None, {
        description: tmpl.mutating ? 'mutating' : 'read-only',
        iconPath: new vscode.ThemeIcon('file-code', tmpl.mutating ? new vscode.ThemeColor('charts.yellow') : undefined),
        tooltip: tmpl.description,
        contextValue: 'automationCommandDeckItem',
        dataId: tmpl.id,
      });
      items.push(item);
    }

    return items;
  }

  private getRecentRunsChildren(): AutomationTreeItem[] {
    if (!this.executionLogger) {
      return [
        new AutomationTreeItem('No history available', vscode.TreeItemCollapsibleState.None, {
          iconPath: new vscode.ThemeIcon('info'),
          contextValue: 'automationRecentRunChild',
        }),
      ];
    }

    const entries = this.executionLogger.getRecent();
    if (entries.length === 0) {
      return [
        new AutomationTreeItem('No recent runs', vscode.TreeItemCollapsibleState.None, {
          iconPath: new vscode.ThemeIcon('info'),
          contextValue: 'automationRecentRunChild',
        }),
      ];
    }

    return entries.map((entry: ExecutionEntry) => {
      const statusIcon = entry.status === 'success'
        ? new vscode.ThemeIcon('pass', new vscode.ThemeColor('charts.green'))
        : entry.status === 'aborted'
          ? new vscode.ThemeIcon('circle-slash', new vscode.ThemeColor('charts.yellow'))
          : new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));

      const ts = new Date(entry.startedAt);
      const timeStr = ts.toLocaleTimeString();
      const dateStr = ts.toLocaleDateString();
      const description = `${dateStr} ${timeStr} (${entry.duration}ms)`;

      const mutatingLabel = entry.mutating ? 'mutating' : 'read-only';
      const envLabel = entry.environment ? ` [${entry.environment}]` : '';
      const tooltip = `${mutatingLabel} · ${entry.name}${envLabel}\nStatus: ${entry.status}\nDuration: ${entry.duration}ms\n\n${entry.stdout.slice(0, 500)}`;

      return new AutomationTreeItem(
        entry.name,
        vscode.TreeItemCollapsibleState.None,
        {
          description,
          iconPath: statusIcon,
          tooltip,
          contextValue: 'automationRecentRunChild',
          dataId: entry.id,
        }
      );
    });
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
