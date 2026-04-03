import * as vscode from 'vscode';
import type { HuntDataStore } from './store';
import type {
  QueryAnalysisBootData,
  QueryAnalysisViewModel,
  QueryAnalysisMode,
  QueryAnalysisToHostMessage,
  HostToQueryAnalysisMessage,
} from '../shared/query-analysis';

export const QUERY_ANALYSIS_VIEW_TYPE = 'thruntGod.queryAnalysis';
export const QA_STATE_KEY = 'thruntGod.queryAnalysisState';

interface QueryAnalysisPersistedState {
  leftQueryId: string | null;
  rightQueryId: string | null;
  inspectorReceiptId: string | null;
  mode: QueryAnalysisMode;
  sortBy: 'count' | 'deviation' | 'novelty' | 'recency';
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
  private leftQueryId: string | null = null;
  private rightQueryId: string | null = null;
  private sortBy: 'count' | 'deviation' | 'novelty' | 'recency' = 'count';
  private inspectorReceiptId: string | null = null;
  private mode: QueryAnalysisMode = 'comparison';
  private lastNonInspectorMode: 'comparison' | 'heatmap' = 'comparison';

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: HuntDataStore,
    private readonly panel: vscode.WebviewPanel,
    initialReceiptId?: string
  ) {
    const persisted = context.workspaceState.get<QueryAnalysisPersistedState>(
      QA_STATE_KEY
    );
    const queryIds = [...this.store.getQueries().keys()].sort((left, right) =>
      left.localeCompare(right)
    );
    const availableIds = new Set(queryIds);

    this.leftQueryId =
      persisted?.leftQueryId && availableIds.has(persisted.leftQueryId)
        ? persisted.leftQueryId
        : queryIds[0] ?? null;
    this.rightQueryId =
      persisted?.rightQueryId && availableIds.has(persisted.rightQueryId)
        ? persisted.rightQueryId
        : queryIds[1] ?? queryIds[0] ?? null;
    this.inspectorReceiptId = persisted?.inspectorReceiptId ?? null;
    this.sortBy = persisted?.sortBy ?? this.sortBy;
    this.mode = persisted?.mode ?? this.mode;
    if (this.mode === 'comparison' || this.mode === 'heatmap') {
      this.lastNonInspectorMode = this.mode;
    }

    if (initialReceiptId) {
      this.inspectorReceiptId = initialReceiptId;
      this.mode = 'inspector';
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

  static restorePanel(
    context: vscode.ExtensionContext,
    store: HuntDataStore,
    panel: vscode.WebviewPanel,
    initialReceiptId?: string
  ): QueryAnalysisPanel {
    const restored = new QueryAnalysisPanel(context, store, panel, initialReceiptId);
    QueryAnalysisPanel.currentPanel = restored;
    return restored;
  }

  static createOrShow(
    context: vscode.ExtensionContext,
    store: HuntDataStore,
    initialReceiptId?: string
  ): QueryAnalysisPanel {
    const existing = QueryAnalysisPanel.currentPanel;
    if (existing && !existing.isDisposed) {
      existing.panel.reveal(vscode.ViewColumn.Active);
      if (initialReceiptId) {
        if (existing.mode === 'comparison' || existing.mode === 'heatmap') {
          existing.lastNonInspectorMode = existing.mode;
        }
        existing.mode = 'inspector';
        existing.inspectorReceiptId = initialReceiptId;
        existing.persistState();
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

  private persistState(): void {
    void this.context.workspaceState.update(QA_STATE_KEY, {
      leftQueryId: this.leftQueryId,
      rightQueryId: this.rightQueryId,
      inspectorReceiptId: this.inspectorReceiptId,
      mode: this.mode,
      sortBy: this.sortBy,
    } satisfies QueryAnalysisPersistedState);
  }

  private disposeResources(): void {
    if (this.isDisposed) {
      return;
    }

    // Persist view preferences before disposing
    this.persistState();

    this.isDisposed = true;
    QueryAnalysisPanel.currentPanel = undefined;

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private buildViewModel(): QueryAnalysisViewModel {
    const allQueryIds = [...this.store.getQueries().keys()].sort((left, right) =>
      left.localeCompare(right)
    );
    const selectedQueryIds =
      this.mode === 'heatmap'
        ? allQueryIds
        : [this.leftQueryId, this.rightQueryId].filter(
            (value): value is string =>
              typeof value === 'string' && value.length > 0
          );

    return this.store.deriveQueryAnalysis(
      selectedQueryIds,
      this.sortBy,
      this.inspectorReceiptId,
      this.mode
    );
  }

  private setComparisonQuery(
    slot: 'left' | 'right',
    queryId: string
  ): void {
    // The two selectors map to fixed slots, so updating one side must replace
    // only that slot rather than toggling membership in a shared selection set.
    if (slot === 'left') {
      this.leftQueryId = queryId;
    } else {
      this.rightQueryId = queryId;
    }

    this.mode = 'comparison';
    this.lastNonInspectorMode = 'comparison';
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
        this.postMessage({
          type: 'selection:highlight',
          artifactId: this.store.getSelectedArtifactId(),
        });
        return;
      case 'query:set':
        this.setComparisonQuery(msg.slot, msg.queryId);
        this.store.select(msg.queryId);
        this.persistState();
        this.postMessage({
          type: 'update',
          viewModel: this.buildViewModel(),
        });
        return;
      case 'sort:change':
        this.sortBy = msg.sortBy;
        this.persistState();
        this.postMessage({
          type: 'update',
          viewModel: this.buildViewModel(),
        });
        return;
      case 'mode:change':
        this.mode = msg.mode;
        if (msg.mode === 'comparison' || msg.mode === 'heatmap') {
          this.lastNonInspectorMode = msg.mode;
        }
        this.persistState();
        this.postMessage({
          type: 'update',
          viewModel: this.buildViewModel(),
        });
        return;
      case 'receipt:select':
        this.mode = 'inspector';
        this.inspectorReceiptId = msg.receiptId;
        this.store.select(msg.receiptId);
        this.persistState();
        this.postMessage({
          type: 'update',
          viewModel: this.buildViewModel(),
        });
        return;
      case 'inspector:open':
        this.mode = 'inspector';
        this.inspectorReceiptId = msg.receiptId ?? this.inspectorReceiptId;
        if (msg.receiptId) {
          this.store.select(msg.receiptId);
        }
        this.persistState();
        this.postMessage({
          type: 'update',
          viewModel: this.buildViewModel(),
        });
        return;
      case 'inspector:close':
        this.mode = this.lastNonInspectorMode;
        this.inspectorReceiptId = null;
        this.persistState();
        this.postMessage({
          type: 'update',
          viewModel: this.buildViewModel(),
        });
        return;
      case 'navigate': {
        const artifactPath = this.store.getArtifactPath(msg.artifactId);
        this.store.select(msg.artifactId);
        if (artifactPath) {
          void vscode.window.showTextDocument(vscode.Uri.file(artifactPath));
        }
        return;
      }
      case 'blur':
        void vscode.commands.executeCommand(
          'workbench.action.focusActiveEditorGroup'
        );
        return;
    }
  }
}
