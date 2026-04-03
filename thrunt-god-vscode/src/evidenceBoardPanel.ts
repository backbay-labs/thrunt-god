import * as vscode from 'vscode';
import type { HuntDataStore } from './store';
import type {
  EvidenceBoardBootData,
  EvidenceBoardViewModel,
  EvidenceBoardToHostMessage,
  HostToEvidenceBoardMessage,
} from '../shared/evidence-board';

export const EVIDENCE_BOARD_VIEW_TYPE = 'thruntGod.evidenceBoard';
export const EB_STATE_KEY = 'thruntGod.evidenceBoardState';

interface EvidenceBoardPersistedState {
  mode: 'graph' | 'matrix';
  selectedArtifactId: string | null;
}

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

function isDarkTheme(themeKind: vscode.ColorThemeKind): boolean {
  return (
    themeKind === vscode.ColorThemeKind.Dark ||
    themeKind === vscode.ColorThemeKind.HighContrast
  );
}

function createNonce(): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 16; i += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return value;
}

function createEvidenceBoardHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  bootData: EvidenceBoardBootData
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-evidence-board.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-evidence-board.css')
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
    <title>Evidence Board</title>
    <style>${BASE_WEBVIEW_STYLES}</style>
    <link rel="stylesheet" href="${styleUri}" />
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      window.__THRUNT_EVIDENCE_BOARD_BOOT__ = ${serializedBoot};
    </script>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}

export class EvidenceBoardPanel implements vscode.Disposable {
  static currentPanel: EvidenceBoardPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private isDisposed = false;
  private ready = false;
  private mode: 'graph' | 'matrix' = 'graph';

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: HuntDataStore,
    private readonly panel: vscode.WebviewPanel
  ) {
    // Restore persisted mode preference
    const persisted = context.workspaceState.get<EvidenceBoardPersistedState>(EB_STATE_KEY);
    if (persisted?.mode) {
      this.mode = persisted.mode;
    }

    this.panel.webview.html = createEvidenceBoardHtml(
      this.panel.webview,
      context.extensionUri,
      { surfaceId: 'evidence-board', mode: this.mode }
    );

    this.panel.onDidDispose(
      () => {
        this.disposeResources();
      },
      null,
      this.disposables
    );

    this.panel.webview.onDidReceiveMessage(
      (message: EvidenceBoardToHostMessage) => {
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
      this.store.onDidSelect((id) => {
        if (this.ready) {
          this.postMessage({ type: 'selection:highlight', artifactId: id });
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
    store: HuntDataStore
  ): EvidenceBoardPanel {
    const existing = EvidenceBoardPanel.currentPanel;
    if (existing && !existing.isDisposed) {
      existing.panel.reveal(vscode.ViewColumn.Active);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      EVIDENCE_BOARD_VIEW_TYPE,
      'Evidence Board',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist'),
        ],
      }
    );

    const created = new EvidenceBoardPanel(context, store, panel);
    EvidenceBoardPanel.currentPanel = created;
    return created;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.disposeResources();
    this.panel.dispose();
  }

  private postMessage(message: HostToEvidenceBoardMessage): void {
    if (!this.isDisposed) {
      void this.panel.webview.postMessage(message);
    }
  }

  private disposeResources(): void {
    if (this.isDisposed) {
      return;
    }

    // Persist view preferences before disposing
    void this.context.workspaceState.update(EB_STATE_KEY, {
      mode: this.mode,
      selectedArtifactId: this.store.getSelectedArtifactId(),
    } satisfies EvidenceBoardPersistedState);

    this.isDisposed = true;
    EvidenceBoardPanel.currentPanel = undefined;

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private buildViewModel(): EvidenceBoardViewModel {
    return this.store.deriveEvidenceBoard();
  }

  private handleMessage(msg: EvidenceBoardToHostMessage): void {
    switch (msg.type) {
      case 'webview:ready':
        this.ready = true;
        this.postMessage({
          type: 'init',
          viewModel: this.buildViewModel(),
          isDark: isDarkTheme(vscode.window.activeColorTheme.kind),
        });
        return;
      case 'node:open': {
        const artifactPath = this.store.getArtifactPath(msg.nodeId);
        if (artifactPath) {
          void vscode.window.showTextDocument(
            vscode.Uri.file(artifactPath)
          );
        }
        return;
      }
      case 'node:select':
        this.store.select(msg.nodeId);
        return;
      case 'mode:toggle':
        this.mode = msg.mode;
        void this.context.workspaceState.update(EB_STATE_KEY, {
          mode: this.mode,
          selectedArtifactId: null,
        } satisfies EvidenceBoardPersistedState);
        return;
      case 'hypothesis:focus':
        // No-op on host side
        return;
      case 'blur':
        void vscode.commands.executeCommand(
          'workbench.action.focusActiveEditorGroup'
        );
        return;
    }
  }
}
