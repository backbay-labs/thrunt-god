import * as vscode from 'vscode';
import type { HuntDataStore } from './store';
import type {
  ProgramDashboardBootData,
  ProgramDashboardViewModel,
  ProgramDashboardToHostMessage,
  HostToProgramDashboardMessage,
} from '../shared/program-dashboard';

export const PROGRAM_DASHBOARD_VIEW_TYPE = 'thruntGod.programDashboard';

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

function createProgramDashboardHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  bootData: ProgramDashboardBootData
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-program-dashboard.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-program-dashboard.css')
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
    <title>Program Dashboard</title>
    <style>${BASE_WEBVIEW_STYLES}</style>
    <link rel="stylesheet" href="${styleUri}" />
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      window.__THRUNT_PROGRAM_DASHBOARD_BOOT__ = ${serializedBoot};
    </script>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}

export class ProgramDashboardPanel implements vscode.Disposable {
  static currentPanel: ProgramDashboardPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private isDisposed = false;
  private ready = false;

  private constructor(
    context: vscode.ExtensionContext,
    private readonly store: HuntDataStore,
    private readonly panel: vscode.WebviewPanel
  ) {
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    };
    this.panel.webview.html = createProgramDashboardHtml(
      this.panel.webview,
      context.extensionUri,
      { surfaceId: 'program-dashboard' }
    );

    this.panel.onDidDispose(
      () => {
        this.disposeResources();
      },
      null,
      this.disposables
    );

    this.panel.webview.onDidReceiveMessage(
      (message: ProgramDashboardToHostMessage) => {
        this.handleMessage(message);
      },
      null,
      this.disposables
    );

    this.disposables.push(
      this.store.onDidChange(() => {
        if (this.ready) {
          this.postMessage({
            type: 'update',
            viewModel: this.buildViewModel(),
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

  static restorePanel(
    context: vscode.ExtensionContext,
    store: HuntDataStore,
    panel: vscode.WebviewPanel
  ): ProgramDashboardPanel {
    const restored = new ProgramDashboardPanel(context, store, panel);
    ProgramDashboardPanel.currentPanel = restored;
    return restored;
  }

  static createOrShow(
    context: vscode.ExtensionContext,
    store: HuntDataStore
  ): ProgramDashboardPanel {
    const existing = ProgramDashboardPanel.currentPanel;
    if (existing && !existing.isDisposed) {
      existing.panel.reveal(vscode.ViewColumn.Active);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      PROGRAM_DASHBOARD_VIEW_TYPE,
      'Program Dashboard',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist'),
        ],
      }
    );

    const created = new ProgramDashboardPanel(context, store, panel);
    ProgramDashboardPanel.currentPanel = created;
    return created;
  }

  static revive(
    context: vscode.ExtensionContext,
    store: HuntDataStore,
    panel: vscode.WebviewPanel
  ): ProgramDashboardPanel {
    const revived = new ProgramDashboardPanel(context, store, panel);
    ProgramDashboardPanel.currentPanel = revived;
    return revived;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.disposeResources();
    this.panel.dispose();
  }

  private postMessage(message: HostToProgramDashboardMessage): void {
    if (!this.isDisposed) {
      void this.panel.webview.postMessage(message);
    }
  }

  private disposeResources(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    ProgramDashboardPanel.currentPanel = undefined;

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private buildViewModel(): ProgramDashboardViewModel {
    return this.store.deriveProgramDashboard();
  }

  private handleMessage(msg: ProgramDashboardToHostMessage): void {
    switch (msg.type) {
      case 'webview:ready':
        this.ready = true;
        this.postMessage({
          type: 'init',
          viewModel: this.buildViewModel(),
          isDark: isDarkTheme(vscode.window.activeColorTheme.kind),
        });
        return;
      case 'case:open': {
        const child = this.store.getChildHunts().find((c) => c.id === msg.id);
        if (child) {
          const uri = vscode.Uri.file(child.missionPath);
          void vscode.commands.executeCommand('vscode.open', uri);
        }
        return;
      }
      case 'refresh':
        if (this.ready) {
          this.postMessage({
            type: 'update',
            viewModel: this.buildViewModel(),
          });
        }
        return;
    }
  }
}
