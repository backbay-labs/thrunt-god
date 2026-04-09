import * as vscode from 'vscode';
import type {
  CommandDef,
  CommandDeckBootData,
  CommandDeckToHostMessage,
  HostToCommandDeckMessage,
  CommandDeckContext,
  RecentCommandEntry,
} from '../shared/command-deck';

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
    case 'case':
      return ['close-case', 'publish-findings', 'open-evidence-board'];
    case 'query':
      return ['query-knowledge', 'analyze-coverage'];
    case 'receipt':
      return ['open-evidence-board', 'publish-findings'];
    case 'hypothesis':
      return ['analyze-coverage', 'query-knowledge'];
    case 'finding':
      return ['publish-findings'];
    case 'mission':
      return ['open-program-dashboard', 'runtime-doctor'];
    case 'huntmap':
      return ['generate-attack-layer', 'analyze-coverage'];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// CommandDeckRegistry — manages command list, pinned state, recent history
// ---------------------------------------------------------------------------

const PINS_KEY = 'thruntGod.commandDeck.pins';
const RECENT_KEY = 'thruntGod.commandDeck.recent';
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
    registry: CommandDeckRegistry
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

    const created = new CommandDeckPanel(context, registry, panel);
    CommandDeckPanel.currentPanel = created;
    return created;
  }

  static restorePanel(
    context: vscode.ExtensionContext,
    registry: CommandDeckRegistry,
    panel: vscode.WebviewPanel
  ): CommandDeckPanel {
    const restored = new CommandDeckPanel(context, registry, panel);
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

    try {
      if (cmd.commandId) {
        await vscode.commands.executeCommand(cmd.commandId);
        await this.registry.recordExecution(commandId, cmd.label, true);
        this.postMessage({
          type: 'execResult',
          commandId,
          success: true,
          message: `Executed: ${cmd.label}`,
        });
      } else if (cmd.cliArgs) {
        // CLI execution placeholder -- full CLIBridge wiring in Plan 03
        await this.registry.recordExecution(commandId, cmd.label, true);
        this.postMessage({
          type: 'execResult',
          commandId,
          success: true,
          message: `CLI command queued: ${cmd.cliArgs.join(' ')} (full execution wired in Plan 03)`,
        });
      }
      this.sendCommandsUpdate();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.registry.recordExecution(commandId, cmd.label, false);
      this.postMessage({
        type: 'execResult',
        commandId,
        success: false,
        message,
      });
      this.sendCommandsUpdate();
    }
  }
}
