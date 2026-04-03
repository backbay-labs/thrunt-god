import * as vscode from 'vscode';
import type { HuntDataStore } from './store';
import type {
  QueryAnalysisBootData,
  QueryAnalysisViewModel,
  QueryAnalysisToHostMessage,
  HostToQueryAnalysisMessage,
} from '../shared/query-analysis';

export const QUERY_ANALYSIS_VIEW_TYPE = 'thruntGod.queryAnalysis';

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

function createQueryAnalysisHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  bootData: QueryAnalysisBootData
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-query-analysis.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-query-analysis.css')
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
    <title>Query Analysis</title>
    <style>${BASE_WEBVIEW_STYLES}</style>
    <link rel="stylesheet" href="${styleUri}" />
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      window.__THRUNT_QUERY_ANALYSIS_BOOT__ = ${serializedBoot};
    </script>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}

export class QueryAnalysisPanel implements vscode.Disposable {
  static currentPanel: QueryAnalysisPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private isDisposed = false;
  private ready = false;

  // Internal state
  private selectedQueryIds: string[] = [];
  private sortBy: 'count' | 'deviation' | 'novelty' | 'recency' = 'count';
  private inspectorReceiptId: string | null = null;
  private comparisonMode: 'side-by-side' | 'matrix' = 'side-by-side';

  private constructor(
    context: vscode.ExtensionContext,
    private readonly store: HuntDataStore,
    private readonly panel: vscode.WebviewPanel,
    initialReceiptId?: string
  ) {
    // Default selectedQueryIds to first 2 queries from store
    const queries = this.store.getQueries();
    const queryIds = [...queries.keys()];
    this.selectedQueryIds = queryIds.slice(0, Math.min(2, queryIds.length));

    // Set initial inspector receipt if provided
    if (initialReceiptId) {
      this.inspectorReceiptId = initialReceiptId;
    }

    this.panel.webview.html = createQueryAnalysisHtml(
      this.panel.webview,
      context.extensionUri,
      { surfaceId: 'query-analysis' }
    );

    this.panel.onDidDispose(
      () => {
        this.disposeResources();
      },
      null,
      this.disposables
    );

    this.panel.webview.onDidReceiveMessage(
      (message: QueryAnalysisToHostMessage) => {
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
    store: HuntDataStore,
    initialReceiptId?: string
  ): QueryAnalysisPanel {
    const existing = QueryAnalysisPanel.currentPanel;
    if (existing && !existing.isDisposed) {
      existing.panel.reveal(vscode.ViewColumn.Active);
      // If opening with a receipt ID, switch to inspector mode
      if (initialReceiptId) {
        existing.inspectorReceiptId = initialReceiptId;
        if (existing.ready) {
          existing.postMessage({
            type: 'update',
            viewModel: existing.buildViewModel(),
          });
        }
      }
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      QUERY_ANALYSIS_VIEW_TYPE,
      'Query Analysis',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist'),
        ],
      }
    );

    const created = new QueryAnalysisPanel(context, store, panel, initialReceiptId);
    QueryAnalysisPanel.currentPanel = created;
    return created;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.disposeResources();
    this.panel.dispose();
  }

  private postMessage(message: HostToQueryAnalysisMessage): void {
    if (!this.isDisposed) {
      void this.panel.webview.postMessage(message);
    }
  }

  private disposeResources(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    QueryAnalysisPanel.currentPanel = undefined;

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private buildViewModel(): QueryAnalysisViewModel {
    return this.store.deriveQueryAnalysis(
      this.selectedQueryIds,
      this.sortBy,
      this.inspectorReceiptId
    );
  }

  private handleMessage(msg: QueryAnalysisToHostMessage): void {
    switch (msg.type) {
      case 'webview:ready':
        this.ready = true;
        this.postMessage({
          type: 'init',
          viewModel: this.buildViewModel(),
          isDark: isDarkTheme(vscode.window.activeColorTheme.kind),
        });
        return;
      case 'query:select': {
        // Toggle query selection
        const idx = this.selectedQueryIds.indexOf(msg.queryId);
        if (idx >= 0) {
          this.selectedQueryIds.splice(idx, 1);
        } else {
          this.selectedQueryIds.push(msg.queryId);
        }
        this.postMessage({
          type: 'update',
          viewModel: this.buildViewModel(),
        });
        return;
      }
      case 'sort:change':
        this.sortBy = msg.sortBy;
        this.postMessage({
          type: 'update',
          viewModel: this.buildViewModel(),
        });
        return;
      case 'mode:change':
        this.comparisonMode = msg.mode;
        this.postMessage({
          type: 'update',
          viewModel: this.buildViewModel(),
        });
        return;
      case 'receipt:select':
        this.inspectorReceiptId = msg.receiptId;
        this.postMessage({
          type: 'update',
          viewModel: this.buildViewModel(),
        });
        return;
      case 'inspector:open':
        this.inspectorReceiptId = msg.receiptId ?? null;
        this.postMessage({
          type: 'update',
          viewModel: this.buildViewModel(),
        });
        return;
      case 'inspector:close':
        this.inspectorReceiptId = null;
        this.postMessage({
          type: 'update',
          viewModel: this.buildViewModel(),
        });
        return;
      case 'blur':
        void vscode.commands.executeCommand(
          'workbench.action.focusActiveEditorGroup'
        );
        return;
    }
  }
}
