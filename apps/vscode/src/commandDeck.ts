import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import type {
  CommandDef,
  CommandDeckBootData,
  CommandDeckToHostMessage,
  HostToCommandDeckMessage,
  CommandDeckContext,
  CommandTemplate,
  RecentCommandEntry,
} from '../shared/command-deck';
import { ExecutionLogger, confirmMutatingAction, buildCommandEntry } from './executionLogger';
import type { MCPStatusManager } from './mcpStatusManager';

// ---------------------------------------------------------------------------
// Built-in commands (10 curated actions)
// ---------------------------------------------------------------------------

export const BUILT_IN_COMMANDS: CommandDef[] = [
  {
    id: 'runtime-doctor',
    label: 'Runtime Doctor',
    icon: 'heart',
    description: 'Check connector health, runtime readiness, and environment configuration.',
    category: 'Maintenance',
    mutating: false,
    commandId: 'thrunt-god.runtimeDoctor',
  },
  {
    id: 'open-program-dashboard',
    label: 'Open Program Dashboard',
    icon: 'dashboard',
    description: 'Open the program-level dashboard showing hunt portfolio metrics.',
    category: 'Investigation',
    mutating: false,
    commandId: 'thrunt-god.openProgramDashboard',
  },
  {
    id: 'open-evidence-board',
    label: 'Open Evidence Board',
    icon: 'note',
    description: 'Open the evidence board for visual correlation of hunt artifacts.',
    category: 'Investigation',
    mutating: false,
    commandId: 'thrunt-god.openEvidenceBoard',
  },
  {
    id: 'analyze-coverage',
    label: 'Analyze Coverage',
    icon: 'graph',
    description: 'Analyze detection coverage across ATT&CK techniques and data sources.',
    category: 'Intelligence',
    mutating: false,
    cliArgs: ['coverage', 'analyze'],
  },
  {
    id: 'generate-attack-layer',
    label: 'Generate ATT&CK Layer',
    icon: 'shield',
    description: 'Generate a MITRE ATT&CK Navigator layer from current hunt findings.',
    category: 'Intelligence',
    mutating: true,
    cliArgs: ['attack-layer', 'generate'],
  },
  {
    id: 'query-knowledge',
    label: 'Query Knowledge',
    icon: 'search',
    description: 'Search the knowledge base for threat intelligence and detection context.',
    category: 'Intelligence',
    mutating: false,
    cliArgs: ['knowledge', 'query'],
  },
  {
    id: 'run-pack',
    label: 'Run Pack',
    icon: 'play',
    description: 'Execute a hunt pack against configured data sources.',
    category: 'Execution',
    mutating: true,
    cliArgs: ['runtime', 'execute'],
  },
  {
    id: 'publish-findings',
    label: 'Publish Findings',
    icon: 'cloud-upload',
    description: 'Publish validated findings to the configured output destination.',
    category: 'Execution',
    mutating: true,
    cliArgs: ['findings', 'publish'],
  },
  {
    id: 'close-case',
    label: 'Close Case',
    icon: 'check-all',
    description: 'Close the current investigation case with a disposition summary.',
    category: 'Execution',
    mutating: true,
    commandId: 'thrunt-god.closeCase',
  },
  {
    id: 'reindex-intel',
    label: 'Reindex Intel/Detections',
    icon: 'database',
    description: 'Rebuild the local intel and detection index from upstream sources.',
    category: 'Maintenance',
    mutating: true,
    cliArgs: ['intel', 'reindex'],
  },
];

// ---------------------------------------------------------------------------
// Context-relevance mapping: tree selection -> relevant command IDs
// ---------------------------------------------------------------------------

export function getContextRelevantIds(context: CommandDeckContext | null): string[] {
  if (!context) return [];
  switch (context.nodeType) {
    case 'phase':
      return ['run-pack', 'analyze-coverage'];
    case 'query':
      return ['query-knowledge', 'analyze-coverage'];
    case 'receipt':
      return ['open-evidence-board', 'publish-findings'];
    case 'hypothesis':
      return ['analyze-coverage', 'query-knowledge'];
    case 'mission':
      return ['open-program-dashboard', 'runtime-doctor'];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// CommandDeckRegistry — manages command list, pinned state, recent history
// ---------------------------------------------------------------------------

const PINS_KEY = 'thruntGod.commandDeck.pins';
const RECENT_KEY = 'thruntGod.commandDeck.recent';
const TEMPLATES_KEY = 'thruntGod.commandDeck.templates';
const MAX_RECENT = 20;

export class CommandDeckRegistry {
  constructor(private readonly workspaceState: vscode.Memento) {}

  getCommands(): CommandDef[] {
    return BUILT_IN_COMMANDS;
  }

  getPinnedIds(): string[] {
    return this.workspaceState.get<string[]>(PINS_KEY, []);
  }

  getRecent(): RecentCommandEntry[] {
    return this.workspaceState.get<RecentCommandEntry[]>(RECENT_KEY, []);
  }

  async pin(commandId: string): Promise<void> {
    const current = this.getPinnedIds();
    if (!current.includes(commandId)) {
      await this.workspaceState.update(PINS_KEY, [...current, commandId]);
    }
  }

  async unpin(commandId: string): Promise<void> {
    const current = this.getPinnedIds();
    await this.workspaceState.update(
      PINS_KEY,
      current.filter((id) => id !== commandId)
    );
  }

  async recordExecution(
    commandId: string,
    label: string,
    success: boolean
  ): Promise<void> {
    const current = this.getRecent();
    const entry: RecentCommandEntry = {
      commandId,
      label,
      timestamp: Date.now(),
      success,
    };
    const updated = [entry, ...current].slice(0, MAX_RECENT);
    await this.workspaceState.update(RECENT_KEY, updated);
  }

  // ---- Template CRUD ----

  getTemplates(): CommandTemplate[] {
    return this.workspaceState.get<CommandTemplate[]>(TEMPLATES_KEY, []);
  }

  async saveTemplate(template: CommandTemplate): Promise<void> {
    const current = this.getTemplates();
    const idx = current.findIndex((t) => t.id === template.id);
    if (idx >= 0) {
      current[idx] = template;
    } else {
      current.push(template);
    }
    await this.workspaceState.update(TEMPLATES_KEY, current);
  }

  async deleteTemplate(templateId: string): Promise<void> {
    const current = this.getTemplates();
    await this.workspaceState.update(
      TEMPLATES_KEY,
      current.filter((t) => t.id !== templateId)
    );
  }

  static extractPlaceholders(text: string): string[] {
    const matches = text.match(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g) || [];
    return [...new Set(matches.map((m) => m.slice(1, -1)))];
  }
}

// ---------------------------------------------------------------------------
// CommandDeckPanel — webview host (follows McpControlPanel pattern)
// ---------------------------------------------------------------------------

export const COMMAND_DECK_VIEW_TYPE = 'thruntGod.commandDeckPanel';

const BASE_WEBVIEW_STYLES = `
  :root {
    color-scheme: light dark;
  }

  body {
    margin: 0;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
  }

  #root {
    min-height: 100vh;
  }
`;

function createNonce(): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 16; i += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

function isDarkTheme(themeKind: vscode.ColorThemeKind): boolean {
  return (
    themeKind === vscode.ColorThemeKind.Dark ||
    themeKind === vscode.ColorThemeKind.HighContrast
  );
}

function createCommandDeckHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  bootData: CommandDeckBootData
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-command-deck.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-command-deck.css')
  );
  const nonce = createNonce();
  const serializedBoot = JSON.stringify(bootData).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src ${webview.cspSource} https: data:; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Command Deck</title>
    <style>${BASE_WEBVIEW_STYLES}</style>
    <link rel="stylesheet" href="${styleUri}" />
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      window.__THRUNT_COMMAND_DECK_BOOT__ = ${serializedBoot};
    </script>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}

export class CommandDeckPanel implements vscode.Disposable {
  static currentPanel: CommandDeckPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private isDisposed = false;
  private ready = false;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly registry: CommandDeckRegistry,
    private readonly logger: ExecutionLogger,
    private readonly mcpStatus: MCPStatusManager | null,
    private readonly panel: vscode.WebviewPanel
  ) {
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    };
    this.panel.webview.html = createCommandDeckHtml(
      this.panel.webview,
      context.extensionUri,
      { surfaceId: 'command-deck' }
    );

    this.panel.onDidDispose(
      () => {
        this.disposeResources();
      },
      null,
      this.disposables
    );

    this.panel.webview.onDidReceiveMessage(
      (message: CommandDeckToHostMessage) => {
        this.handleMessage(message);
      },
      null,
      this.disposables
    );

    this.disposables.push(
      vscode.window.onDidChangeActiveColorTheme((theme) => {
        if (this.ready) {
          this.postMessage({ type: 'theme', isDark: isDarkTheme(theme.kind) });
        }
      })
    );
  }

  static createOrShow(
    context: vscode.ExtensionContext,
    registry: CommandDeckRegistry,
    logger: ExecutionLogger,
    mcpStatus: MCPStatusManager | null
  ): CommandDeckPanel {
    const existing = CommandDeckPanel.currentPanel;
    if (existing && !existing.isDisposed) {
      existing.panel.reveal(vscode.ViewColumn.Active);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      COMMAND_DECK_VIEW_TYPE,
      'Command Deck',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist'),
        ],
      }
    );

    const created = new CommandDeckPanel(context, registry, logger, mcpStatus, panel);
    CommandDeckPanel.currentPanel = created;
    return created;
  }

  static restorePanel(
    context: vscode.ExtensionContext,
    registry: CommandDeckRegistry,
    logger: ExecutionLogger,
    mcpStatus: MCPStatusManager | null,
    panel: vscode.WebviewPanel
  ): CommandDeckPanel {
    const restored = new CommandDeckPanel(context, registry, logger, mcpStatus, panel);
    CommandDeckPanel.currentPanel = restored;
    return restored;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.disposeResources();
    this.panel.dispose();
  }

  setContext(context: CommandDeckContext | null): void {
    if (this.ready) {
      this.postMessage({ type: 'context', context });
    }
  }

  private postMessage(message: HostToCommandDeckMessage): void {
    if (!this.isDisposed) {
      void this.panel.webview.postMessage(message);
    }
  }

  private disposeResources(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    CommandDeckPanel.currentPanel = undefined;

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private handleMessage(msg: CommandDeckToHostMessage): void {
    switch (msg.type) {
      case 'webview:ready':
        this.ready = true;
        this.postMessage({
          type: 'init',
          commands: this.registry.getCommands(),
          templates: this.registry.getTemplates(),
          pinned: this.registry.getPinnedIds(),
          recent: this.registry.getRecent(),
          context: null,
          isDark: isDarkTheme(vscode.window.activeColorTheme.kind),
        });
        return;
      case 'command:exec':
        void this.handleExec(msg.commandId);
        return;
      case 'command:pin':
        void this.registry.pin(msg.commandId).then(() => this.sendCommandsUpdate());
        return;
      case 'command:unpin':
        void this.registry.unpin(msg.commandId).then(() => this.sendCommandsUpdate());
        return;
      case 'template:save':
        void this.registry.saveTemplate(msg.template).then(() => {
          this.postMessage({ type: 'templates', templates: this.registry.getTemplates() });
        });
        return;
      case 'template:delete':
        void this.registry.deleteTemplate(msg.templateId).then(() => {
          this.postMessage({ type: 'templates', templates: this.registry.getTemplates() });
        });
        return;
      case 'template:exec':
        void this.handleTemplateExec(msg.templateId, msg.values);
        return;
      case 'refresh':
        this.sendCommandsUpdate();
        return;
    }
  }

  private sendCommandsUpdate(): void {
    this.postMessage({
      type: 'commands',
      commands: this.registry.getCommands(),
      pinned: this.registry.getPinnedIds(),
      recent: this.registry.getRecent(),
    });
  }

  private resolveCliPath(): string {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const cliPath =
      vscode.workspace.getConfiguration('thruntGod').get<string>('cli.path') ||
      (workspaceRoot
        ? path.join(workspaceRoot, 'dist', 'thrunt-god', 'bin', 'thrunt-tools.cjs')
        : '');
    return cliPath;
  }

  private runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const cliPath = this.resolveCliPath();
    if (!cliPath) {
      return Promise.reject(new Error('CLI path not configured'));
    }

    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: workspaceRoot || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
      let settled = false;
      let killTimer: ReturnType<typeof setTimeout> | null = null;

      const timeoutTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill('SIGTERM');
        killTimer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* already dead */ }
        }, 2_000);
        reject(new Error('CLI execution timed out after 60s'));
      }, 60_000);

      child.on('close', (code) => {
        clearTimeout(timeoutTimer);
        if (killTimer) clearTimeout(killTimer);
        if (settled) return;
        settled = true;
        if (code === 0) {
          resolve({ stdout, stderr, exitCode: 0 });
        } else {
          reject(new Error(`CLI exited with code ${code}: ${(stdout + stderr).slice(0, 500)}`));
        }
      });
      child.on('error', (err) => {
        clearTimeout(timeoutTimer);
        if (killTimer) clearTimeout(killTimer);
        if (settled) return;
        settled = true;
        reject(err);
      });
    });
  }

  private async handleExec(commandId: string): Promise<void> {
    const cmd = this.registry.getCommands().find((c) => c.id === commandId);
    if (!cmd) {
      this.postMessage({
        type: 'execResult',
        commandId,
        success: false,
        message: `Unknown command: ${commandId}`,
      });
      return;
    }

    const environment = this.mcpStatus?.getStatus().profile ?? null;

    // Confirmation gate for mutating actions
    if (cmd.mutating) {
      const confirmed = await confirmMutatingAction(cmd.label, environment);
      if (!confirmed) {
        this.postMessage({ type: 'execResult', commandId, success: false, message: 'Cancelled by user' });
        return;
      }
    }

    const startedAt = Date.now();
    try {
      let stdout = '';
      let stderr = '';
      let exitCode: number | null = 0;

      if (cmd.commandId) {
        await vscode.commands.executeCommand(cmd.commandId);
      } else if (cmd.cliArgs) {
        const result = await this.runCli(cmd.cliArgs);
        stdout = result.stdout;
        stderr = result.stderr;
        exitCode = result.exitCode;
      }

      await this.registry.recordExecution(commandId, cmd.label, true);
      this.logger.append(buildCommandEntry(cmd.label, cmd.cliArgs || [], stdout, stderr, exitCode, startedAt, 'success', environment, cmd.mutating));
      this.postMessage({
        type: 'execResult',
        commandId,
        success: true,
        message: 'Command completed',
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await this.registry.recordExecution(commandId, cmd.label, false);
      this.logger.append(buildCommandEntry(cmd.label, cmd.cliArgs || [], '', errMsg, 1, startedAt, 'failure', environment, cmd.mutating));
      this.postMessage({
        type: 'execResult',
        commandId,
        success: false,
        message: errMsg,
      });
      vscode.window.showErrorMessage(`Command Deck: ${cmd.label} failed - ${errMsg}`);
    }

    this.sendCommandsUpdate();
  }

  private async handleTemplateExec(
    templateId: string,
    values: Record<string, string>
  ): Promise<void> {
    const tmpl = this.registry.getTemplates().find((t) => t.id === templateId);
    if (!tmpl) {
      return;
    }

    const environment = this.mcpStatus?.getStatus().profile ?? null;

    // Confirmation gate for mutating templates
    if (tmpl.mutating) {
      const confirmed = await confirmMutatingAction(tmpl.label, environment);
      if (!confirmed) {
        return;
      }
    }

    // Substitute placeholders in cliArgs
    const resolvedArgs = (tmpl.cliArgs || []).map((arg) =>
      arg.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_, key) => values[key] ?? '')
    );

    const startedAt = Date.now();
    try {
      let stdout = '';
      let stderr = '';
      let exitCode: number | null = 0;

      if (tmpl.commandId) {
        await vscode.commands.executeCommand(tmpl.commandId);
      } else if (resolvedArgs.length > 0) {
        const result = await this.runCli(resolvedArgs);
        stdout = result.stdout;
        stderr = result.stderr;
        exitCode = result.exitCode;
      }

      await this.registry.recordExecution(tmpl.id, tmpl.label, true);
      this.logger.append(buildCommandEntry(tmpl.label, resolvedArgs, stdout, stderr, exitCode, startedAt, 'success', environment, tmpl.mutating));
      this.postMessage({
        type: 'execResult',
        commandId: tmpl.id,
        success: true,
        message: 'Template executed',
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await this.registry.recordExecution(tmpl.id, tmpl.label, false);
      this.logger.append(buildCommandEntry(tmpl.label, resolvedArgs, '', errMsg, 1, startedAt, 'failure', environment, tmpl.mutating));
      this.postMessage({
        type: 'execResult',
        commandId: tmpl.id,
        success: false,
        message: errMsg,
      });
    }

    this.sendCommandsUpdate();
  }
}
