import * as vscode from 'vscode';
import type { HuntDataStore } from './store';
import type { ArtifactSelectionCoordinator } from './selectionSync';
import type { IOCRegistry } from './iocRegistry';
import type { Query, DrainTemplateDetail } from './types';
import type {
  DrainViewerBootData,
  DrainViewerCluster,
  DrainViewerPinnedTemplate,
  DrainViewerViewModel,
  DrainWebviewToHostMessage,
  HostToDrainWebviewMessage,
} from '../shared/drain-viewer';

export const DRAIN_VIEWER_VIEW_TYPE = 'thruntGod.drainViewer';
export const DRAIN_VIEWER_PIN_KEY = 'thruntGod.drainViewerPins';

interface StoredPin {
  queryId: string;
  templateId: string;
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

function findTemplateDetail(
  query: Query,
  templateId: string
): DrainTemplateDetail | undefined {
  return query.templateDetails.find((detail) => detail.templateId === templateId);
}

export function deterministicTemplateColor(templateId: string): string {
  const palette = [
    '#4ec9b0',
    '#61afef',
    '#d19a66',
    '#e5c07b',
    '#98c379',
    '#c678dd',
    '#56b6c2',
    '#be5046',
  ];

  let hash = 0;
  for (const char of templateId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return palette[hash % palette.length];
}

export function readDrainViewerPins(
  workspaceState: vscode.Memento
): StoredPin[] {
  const raw = workspaceState.get<StoredPin[]>(DRAIN_VIEWER_PIN_KEY, []);
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw.filter(
    (pin) =>
      pin &&
      typeof pin.queryId === 'string' &&
      pin.queryId.length > 0 &&
      typeof pin.templateId === 'string' &&
      pin.templateId.length > 0
  );
}

export async function togglePinnedTemplate(
  workspaceState: vscode.Memento,
  queryId: string,
  templateId: string
): Promise<StoredPin[]> {
  const pins = readDrainViewerPins(workspaceState);
  const next = pins.some(
    (pin) => pin.queryId === queryId && pin.templateId === templateId
  )
    ? pins.filter(
        (pin) => !(pin.queryId === queryId && pin.templateId === templateId)
      )
    : [...pins, { queryId, templateId }];

  await workspaceState.update(DRAIN_VIEWER_PIN_KEY, next);
  return next;
}

function buildPinnedTemplates(
  store: HuntDataStore,
  pins: StoredPin[]
): DrainViewerPinnedTemplate[] {
  const pinnedTemplates: DrainViewerPinnedTemplate[] = [];

  for (const pin of pins) {
    const query = store.getQuery(pin.queryId);
    if (!query || query.status !== 'loaded') {
      continue;
    }

    const template = query.data.templates.find(
      (candidate) => candidate.templateId === pin.templateId
    );
    if (!template) {
      continue;
    }

    pinnedTemplates.push({
      queryId: query.data.queryId,
      queryTitle: query.data.title,
      templateId: template.templateId,
      template: template.template,
      count: template.count,
      percentage: template.percentage,
    });
  }

  return pinnedTemplates.sort((left, right) =>
    `${left.queryId}:${left.templateId}`.localeCompare(
      `${right.queryId}:${right.templateId}`
    )
  );
}

export function buildDrainViewerViewModel(
  store: HuntDataStore,
  workspaceState: vscode.Memento,
  queryId: string,
  templateIocMatches = new Map<string, string[]>(),
  activeIocs: string[] = []
): DrainViewerViewModel | null {
  const result = store.getQuery(queryId);
  if (!result || result.status !== 'loaded') {
    return null;
  }

  const query = result.data;
  const pins = readDrainViewerPins(workspaceState);
  const pinSet = new Set(pins.map((pin) => `${pin.queryId}:${pin.templateId}`));

  const clusters: DrainViewerCluster[] = query.templates.map((template) => {
    const detail = findTemplateDetail(query, template.templateId);
    const relatedReceiptIds = (query.relatedReceipts ?? []).filter(Boolean);

    return {
      templateId: template.templateId,
      template: template.template,
      count: template.count,
      percentage: template.percentage,
      color: deterministicTemplateColor(template.templateId),
      isPinned: pinSet.has(`${query.queryId}:${template.templateId}`),
      matchedIocs: templateIocMatches.get(template.templateId) ?? [],
      detailLines: detail?.detailLines ?? [],
      sampleEventText: detail?.sampleEventText ?? null,
      eventIds: detail?.eventIds ?? [],
      relatedReceiptIds,
    };
  });

  clusters.sort((left, right) => right.count - left.count);

  return {
    query: {
      queryId: query.queryId,
      title: query.title,
      connectorId: query.connectorId,
      dataset: query.dataset,
      eventCount: query.eventCount,
      templateCount: query.templateCount,
      entityCount: query.entityCount,
      timeWindow: query.timeWindow,
    },
    activeIocs,
    clusters,
    pinnedTemplates: buildPinnedTemplates(store, pins),
    emptyMessage:
      clusters.length === 0
        ? 'This query has no serialized Drain template clusters yet.'
        : null,
  };
}

export function createDrainViewerHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  bootData: DrainViewerBootData
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-drain.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-drain.css')
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
    <title>Drain Template Viewer</title>
    <style>${BASE_WEBVIEW_STYLES}</style>
    <link rel="stylesheet" href="${styleUri}" />
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      window.__THRUNT_DRAIN_BOOT__ = ${serializedBoot};
    </script>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}

async function openQueryArtifact(
  store: HuntDataStore,
  queryId: string,
  templateId?: string | null
): Promise<void> {
  const artifactPath = store.getArtifactPath(queryId);
  if (!artifactPath) {
    return;
  }

  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(artifactPath));
  const editor = await vscode.window.showTextDocument(document);

  if (!templateId) {
    return;
  }

  let targetLine = 0;
  for (let line = 0; line < document.lineCount; line += 1) {
    const text = document.lineAt(line).text;
    if (text.startsWith(`### Template ${templateId} Details`)) {
      targetLine = line;
      break;
    }
  }

  const range = new vscode.Range(targetLine, 0, targetLine, 0);
  editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
  editor.selection = new vscode.Selection(range.start, range.start);
}

export class DrainTemplatePanel implements vscode.Disposable {
  static currentPanel: DrainTemplatePanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private isDisposed = false;
  private ready = false;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: HuntDataStore,
    private readonly panel: vscode.WebviewPanel,
    private readonly selectionCoordinator: ArtifactSelectionCoordinator,
    private readonly iocRegistry: IOCRegistry | undefined,
    private queryId: string
  ) {
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    };
    this.panel.webview.html = createDrainViewerHtml(
      this.panel.webview,
      context.extensionUri,
      { queryId: this.queryId }
    );

    this.panel.onDidDispose(
      () => {
        this.disposeResources();
      },
      null,
      this.disposables
    );

    this.panel.webview.onDidReceiveMessage(
      (message: DrainWebviewToHostMessage) => {
        void this.handleMessage(message);
      },
      null,
      this.disposables
    );

    this.disposables.push(
      this.store.onDidChange((event) => {
        if (!this.ready) {
          return;
        }

        if (event.id === this.queryId) {
          this.postMessage({ type: 'stale', affectedIds: [event.id] });
        }

        this.postViewModel('update');
      })
    );

    if (this.iocRegistry) {
      this.disposables.push(
        this.iocRegistry.onDidChange(() => {
          if (this.ready) {
            this.postViewModel('update');
          }
        })
      );
    }

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
    selectionCoordinator: ArtifactSelectionCoordinator,
    iocRegistry: IOCRegistry | undefined,
    queryId: string
  ): DrainTemplatePanel {
    const existing = DrainTemplatePanel.currentPanel;
    if (existing && !existing.isDisposed) {
      existing.reveal(queryId);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      DRAIN_VIEWER_VIEW_TYPE,
      'Drain Template Viewer',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
      }
    );

    const created = new DrainTemplatePanel(
      context,
      store,
      panel,
      selectionCoordinator,
      iocRegistry,
      queryId
    );
    DrainTemplatePanel.currentPanel = created;
    return created;
  }

  static revive(
    context: vscode.ExtensionContext,
    store: HuntDataStore,
    panel: vscode.WebviewPanel,
    selectionCoordinator: ArtifactSelectionCoordinator,
    iocRegistry: IOCRegistry | undefined,
    queryId: string
  ): DrainTemplatePanel {
    const revived = new DrainTemplatePanel(
      context,
      store,
      panel,
      selectionCoordinator,
      iocRegistry,
      queryId
    );
    DrainTemplatePanel.currentPanel = revived;
    return revived;
  }

  focusArtifact(artifactId: string): void {
    if (!artifactId.startsWith('QRY-')) {
      return;
    }

    this.reveal(artifactId, false);
  }

  reveal(queryId: string, announceSelection = true): void {
    this.queryId = queryId;
    this.panel.reveal(vscode.ViewColumn.Active);
    this.panel.title = 'Drain Template Viewer';
    this.panel.webview.html = createDrainViewerHtml(
      this.panel.webview,
      this.context.extensionUri,
      { queryId: this.queryId }
    );
    if (this.ready) {
      this.postViewModel('update');
    }
    if (announceSelection) {
      this.selectionCoordinator.select({
        artifactId: queryId,
        artifactType: 'query',
        source: 'drain-viewer',
      });
    }
  }

  snapshot(): { queryId: string; ready: boolean } {
    return {
      queryId: this.queryId,
      ready: this.ready,
    };
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.disposeResources();
    this.panel.dispose();
  }

  private postMessage(message: HostToDrainWebviewMessage): void {
    if (!this.isDisposed) {
      void this.panel.webview.postMessage(message);
    }
  }

  private postViewModel(type: 'init' | 'update'): void {
    const viewModel = buildDrainViewerViewModel(
      this.store,
      this.context.workspaceState,
      this.queryId,
      this.iocRegistry?.getTemplateMatchesForQuery(this.queryId),
      this.iocRegistry?.list().map((entry) => entry.value) ?? []
    );
    if (!viewModel) {
      return;
    }

    if (type === 'init') {
      this.postMessage({
        type,
        viewModel,
        isDark: isDarkTheme(vscode.window.activeColorTheme.kind),
      });
      return;
    }

    this.postMessage({ type, viewModel });
  }

  private disposeResources(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    DrainTemplatePanel.currentPanel = undefined;

    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private async handleMessage(message: DrainWebviewToHostMessage): Promise<void> {
    switch (message.type) {
      case 'webview:ready':
        this.ready = true;
        this.postViewModel('init');
        this.selectionCoordinator.select({
          artifactId: this.queryId,
          artifactType: 'query',
          source: 'drain-viewer',
        });
        return;
      case 'template:pin':
      case 'template:unpin':
        await togglePinnedTemplate(
          this.context.workspaceState,
          message.queryId,
          message.templateId
        );
        this.postViewModel('update');
        return;
      case 'navigate':
        this.selectionCoordinator.select({
          artifactId: message.queryId,
          artifactType: 'query',
          source: 'drain-viewer',
        });
        await openQueryArtifact(this.store, message.queryId, message.templateId);
        return;
      case 'blur':
        await vscode.commands.executeCommand(
          'workbench.action.focusActiveEditorGroup'
        );
        return;
    }
  }
}
