import { spawn } from 'child_process';
import * as vscode from 'vscode';
import type { MCPStatusManager } from './mcpStatusManager';
import type {
  McpControlBootData,
  McpControlToHostMessage,
  HostToMcpControlMessage,
  McpServerStatus,
  McpToolInfo,
} from '../shared/mcp-control';

export const MCP_CONTROL_VIEW_TYPE = 'thruntGod.mcpControlPanel';

const TOOL_TEST_TIMEOUT_MS = parseInt(process.env.THRUNT_MCP_TIMEOUT || '', 10) || 30_000;

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

function createMcpControlHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  bootData: McpControlBootData
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-mcp-control.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-mcp-control.css')
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
    <title>MCP Control Panel</title>
    <style>${BASE_WEBVIEW_STYLES}</style>
    <link rel="stylesheet" href="${styleUri}" />
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      window.__THRUNT_MCP_CONTROL_BOOT__ = ${serializedBoot};
    </script>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}

export class McpControlPanel implements vscode.Disposable {
  static currentPanel: McpControlPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private isDisposed = false;
  private ready = false;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly mcpStatus: MCPStatusManager,
    private readonly panel: vscode.WebviewPanel
  ) {
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    };
    this.panel.webview.html = createMcpControlHtml(
      this.panel.webview,
      context.extensionUri,
      { surfaceId: 'mcp-control' }
    );

    this.panel.onDidDispose(
      () => {
        this.disposeResources();
      },
      null,
      this.disposables
    );

    this.panel.webview.onDidReceiveMessage(
      (message: McpControlToHostMessage) => {
        this.handleMessage(message);
      },
      null,
      this.disposables
    );

    this.disposables.push(
      this.mcpStatus.onDidChange(() => {
        if (this.ready) {
          this.postMessage({
            type: 'status',
            status: this.buildStatusViewModel(),
          });
        }
      })
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
    mcpStatus: MCPStatusManager
  ): McpControlPanel {
    const existing = McpControlPanel.currentPanel;
    if (existing && !existing.isDisposed) {
      existing.panel.reveal(vscode.ViewColumn.Active);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      MCP_CONTROL_VIEW_TYPE,
      'MCP Control Panel',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist'),
        ],
      }
    );

    const created = new McpControlPanel(context, mcpStatus, panel);
    McpControlPanel.currentPanel = created;
    return created;
  }

  static restorePanel(
    context: vscode.ExtensionContext,
    mcpStatus: MCPStatusManager,
    panel: vscode.WebviewPanel
  ): McpControlPanel {
    const restored = new McpControlPanel(context, mcpStatus, panel);
    McpControlPanel.currentPanel = restored;
    return restored;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.disposeResources();
    this.panel.dispose();
  }

  private postMessage(message: HostToMcpControlMessage): void {
    if (!this.isDisposed) {
      void this.panel.webview.postMessage(message);
    }
  }

  private disposeResources(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    McpControlPanel.currentPanel = undefined;

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private buildStatusViewModel(): McpServerStatus {
    const s = this.mcpStatus.getStatus();
    return {
      connection: s.connection,
      profile: s.profile,
      serverVersion: null,
      toolCount: s.lastHealthCheck?.toolCount ?? 0,
      dbSizeBytes: s.lastHealthCheck?.dbSizeBytes ?? 0,
      dbTableCount: s.lastHealthCheck?.dbTableCount ?? 0,
      uptimeMs: s.lastHealthCheck?.uptimeMs ?? 0,
      lastHealthCheck: s.lastHealthCheck ? new Date(s.lastHealthCheck.timestamp).toISOString() : null,
      hasError: s.hasError,
      errorMessage: s.lastHealthCheck?.error ?? null,
    };
  }

  private handleMessage(msg: McpControlToHostMessage): void {
    switch (msg.type) {
      case 'webview:ready':
        this.ready = true;
        void this.sendInitData();
        return;
      case 'refresh':
        void this.sendRefreshData();
        return;
      case 'tool:test':
        void this.handleToolTest(msg.toolName, msg.input);
        return;
      case 'action:start':
        void this.mcpStatus.start();
        return;
      case 'action:restart':
        void this.mcpStatus.restart();
        return;
      case 'action:healthCheck':
        void this.mcpStatus.runHealthCheck().then(() => {
          this.postMessage({
            type: 'status',
            status: this.buildStatusViewModel(),
          });
        });
        return;
      case 'profile:switch':
        void this.handleProfileSwitch(msg.profile);
        return;
    }
  }

  private async sendInitData(): Promise<void> {
    const [, tools] = await Promise.all([
      this.mcpStatus.runHealthCheck(),
      this.mcpStatus.listTools(),
    ]);
    this.postMessage({
      type: 'init',
      status: this.buildStatusViewModel(),
      tools,
      isDark: isDarkTheme(vscode.window.activeColorTheme.kind),
    });
  }

  private async sendRefreshData(): Promise<void> {
    const [, tools] = await Promise.all([
      this.mcpStatus.runHealthCheck(),
      this.mcpStatus.listTools(),
    ]);
    this.postMessage({ type: 'status', status: this.buildStatusViewModel() });
    this.postMessage({ type: 'tools', tools });
  }

  private async handleToolTest(toolName: string, input: string): Promise<void> {
    const serverPath = this.mcpStatus.getServerPath();

    try {
      const result = await new Promise<string>((resolve, reject) => {
        let stdout = '';
        let settled = false;

        const child = spawn(process.execPath, [serverPath, '--run-tool', toolName, '--input', input], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill('SIGTERM');
          setTimeout(() => {
            try { child.kill('SIGKILL'); } catch { /* already dead */ }
          }, 2_000);
          reject(new Error(`Tool test timed out after ${TOOL_TEST_TIMEOUT_MS}ms`));
        }, TOOL_TEST_TIMEOUT_MS);

        child.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        child.on('close', () => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          resolve(stdout.trim());
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          reject(err);
        });
      });

      this.postMessage({
        type: 'toolResult',
        toolName,
        result,
        isError: false,
      });
    } catch (err) {
      this.postMessage({
        type: 'toolResult',
        toolName,
        result: err instanceof Error ? err.message : String(err),
        isError: true,
      });
    }
  }

  private async handleProfileSwitch(profile: string): Promise<void> {
    try {
      await vscode.workspace.getConfiguration('thruntGod').update(
        'mcpProfile',
        profile,
        vscode.ConfigurationTarget.Workspace
      );
      await this.mcpStatus.restart();
      const [, tools] = await Promise.all([
        this.mcpStatus.runHealthCheck(),
        this.mcpStatus.listTools(),
      ]);
      this.postMessage({ type: 'status', status: this.buildStatusViewModel() });
      this.postMessage({ type: 'tools', tools });
    } catch (err) {
      vscode.window.showErrorMessage(
        `Failed to switch MCP profile: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
