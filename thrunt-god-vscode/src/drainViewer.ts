import * as vscode from 'vscode';
import type { HuntDataStore } from './store';
import type { Query } from './types';
import type {
  DrainViewerBootData,
  DrainViewerPinnedTemplate,
  DrainViewerViewModel,
  HostToDrainWebviewMessage,
  DrainWebviewToHostMessage,
} from '../shared/drain-viewer';

export const DRAIN_VIEWER_VIEW_TYPE = 'thruntGod.drainViewer';
export const DRAIN_VIEWER_PIN_KEY = 'thruntGod.templatePins';

export type DrainViewerPinState = Record<string, DrainViewerPinnedTemplate[]>;

export interface DrainTemplatePanelSnapshot {
  currentQueryId: string;
  isReady: boolean;
  title: string;
  visible: boolean;
  viewColumn: vscode.ViewColumn | null;
  viewModel: DrainViewerViewModel;
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

function flattenPinnedTemplates(pinState: DrainViewerPinState): DrainViewerPinnedTemplate[] {
  return Object.values(pinState)
    .flat()
    .sort((left, right) => {
      if (left.queryId === right.queryId) {
        return right.count - left.count;
      }
      return left.queryId.localeCompare(right.queryId);
    });
}

export function deterministicTemplateColor(templateId: string): string {
  const palette = [
    '#4ec9b0',
    '#569cd6',
    '#d7ba7d',
    '#c586c0',
    '#ce9178',
    '#9cdcfe',
    '#f44747',
    '#b5cea8',
  ];

  const hash = [...templateId].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return palette[hash % palette.length];
}

export function buildDrainViewerViewModel(
  query: Query,
  artifactPath: string,
  pinState: DrainViewerPinState = {}
): DrainViewerViewModel {
  const currentPins = pinState[query.queryId] ?? [];
  const currentPinnedIds = new Set(currentPins.map((pin) => pin.templateId));
  const detailById = new Map(query.templateDetails.map((detail) => [detail.templateId, detail]));

  const clusters = [...query.templates]
    .sort((left, right) => right.count - left.count)
    .map((template) => {
      const detail = detailById.get(template.templateId);

      return {
        templateId: template.templateId,
        template: template.template,
        count: template.count,
        percentage: template.percentage,
        color: deterministicTemplateColor(template.templateId),
        detailSummary:
          detail?.summary ?? 'No additional template detail was serialized in this query artifact.',
        detailLines: detail?.detailLines ?? [],
        sampleEventText: detail?.sampleEventText ?? null,
        sampleEventId: detail?.sampleEventId ?? null,
        eventIds: detail?.eventIds ?? [],
        isPinned: currentPinnedIds.has(template.templateId),
      };
    });

  return {
    query: {
      queryId: query.queryId,
      title: query.title || query.queryId,
      connectorId: query.connectorId,
      dataset: query.dataset,
      eventCount: query.eventCount,
      templateCount: query.templateCount,
      entityCount: query.entityCount,
      artifactPath,
      timeWindow: query.timeWindow ?? null,
    },
    clusters,
    pinnedTemplates: flattenPinnedTemplates(pinState),
    emptyMessage:
      clusters.length === 0
        ? 'No Drain template metadata is available for this query.'
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

export function readDrainViewerPins(
  workspaceState: vscode.Memento
): DrainViewerPinState {
  return workspaceState.get<DrainViewerPinState>(DRAIN_VIEWER_PIN_KEY, {});
}

export function togglePinnedTemplate(
  pinState: DrainViewerPinState,
  query: Query,
  templateId: string
): DrainViewerPinState {
  const currentPins = pinState[query.queryId] ?? [];
  const template = query.templates.find((item) => item.templateId === templateId);
  if (!template) {
    return pinState;
  }

  const exists = currentPins.some((pin) => pin.templateId === templateId);
  const nextPins = exists
    ? currentPins.filter((pin) => pin.templateId !== templateId)
    : [
        ...currentPins,
        {
          queryId: query.queryId,
          queryTitle: query.title || query.queryId,
          templateId: template.templateId,
          template: template.template,
          count: template.count,
        },
      ];

  if (nextPins.length === 0) {
    const { [query.queryId]: _removed, ...rest } = pinState;
    return rest;
  }

  return {
    ...pinState,
    [query.queryId]: nextPins,
  };
}

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

export class DrainTemplatePanel implements vscode.Disposable {
  static currentPanel: DrainTemplatePanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private isDisposed = false;
  private ready = false;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: HuntDataStore,
    private readonly panel: vscode.WebviewPanel,
    private currentQueryId: string
  ) {
    this.panel.webview.html = createDrainViewerHtml(this.panel.webview, context.extensionUri, {
      queryId: currentQueryId,
    });

    this.panel.onDidDispose(() => {
      this.disposeResources();
    }, null, this.disposables);

    this.panel.webview.onDidReceiveMessage((message: DrainWebviewToHostMessage) => {
      void this.handleMessage(message);
    }, null, this.disposables);

    this.disposables.push(
      this.store.onDidChange((event) => {
        if (event.artifactType === 'query' && event.id === this.currentQueryId && this.ready) {
          this.postMessage({ type: 'stale', affectedIds: [event.id] });
          this.postMessage({ type: 'update', viewModel: this.buildCurrentViewModel() });
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
    queryId: string
  ): DrainTemplatePanel {
    const existing = DrainTemplatePanel.currentPanel;
    if (existing) {
      existing.reveal(queryId);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      DRAIN_VIEWER_VIEW_TYPE,
      `Drain Template Viewer: ${queryId}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
        retainContextWhenHidden: true,
      }
    );

    const created = new DrainTemplatePanel(context, store, panel, queryId);
    DrainTemplatePanel.currentPanel = created;
    return created;
  }

  reveal(queryId: string): void {
    if (this.isDisposed) {
      return;
    }

    this.currentQueryId = queryId;
    this.panel.title = `Drain Template Viewer: ${queryId}`;
    this.panel.reveal(vscode.ViewColumn.Beside, false);

    if (this.ready) {
      this.postMessage({
        type: 'update',
        viewModel: this.buildCurrentViewModel(),
      });
    }
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.disposeResources();
    this.panel.dispose();
  }

  snapshot(): DrainTemplatePanelSnapshot {
    return {
      currentQueryId: this.currentQueryId,
      isReady: this.ready,
      title: this.panel.title,
      visible: this.panel.visible,
      viewColumn: this.panel.viewColumn ?? null,
      viewModel: this.buildCurrentViewModel(),
    };
  }

  private postMessage(message: HostToDrainWebviewMessage): void {
    if (!this.isDisposed) {
      void this.panel.webview.postMessage(message);
    }
  }

  private disposeResources(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    DrainTemplatePanel.currentPanel = undefined;

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private buildCurrentViewModel(): DrainViewerViewModel {
    const queryResult = this.store.getQuery(this.currentQueryId);
    const artifactPath = this.store.getArtifactPath(this.currentQueryId) ?? '';

    if (!queryResult || queryResult.status !== 'loaded') {
      return {
        query: {
          queryId: this.currentQueryId,
          title: this.currentQueryId,
          connectorId: '',
          dataset: '',
          eventCount: 0,
          templateCount: 0,
          entityCount: 0,
          artifactPath,
          timeWindow: null,
        },
        clusters: [],
        pinnedTemplates: flattenPinnedTemplates(readDrainViewerPins(this.context.workspaceState)),
        emptyMessage: 'The selected query is unavailable or has not been parsed yet.',
      };
    }

    return buildDrainViewerViewModel(
      queryResult.data,
      artifactPath,
      readDrainViewerPins(this.context.workspaceState)
    );
  }

  private async handleMessage(message: DrainWebviewToHostMessage): Promise<void> {
    switch (message.type) {
      case 'webview:ready':
        this.ready = true;
        this.postMessage({
          type: 'init',
          viewModel: this.buildCurrentViewModel(),
          isDark: isDarkTheme(vscode.window.activeColorTheme.kind),
        });
        return;
      case 'template:pin':
      case 'template:unpin': {
        const queryResult = this.store.getQuery(message.queryId);
        if (!queryResult || queryResult.status !== 'loaded') {
          return;
        }
        const nextPinState = togglePinnedTemplate(
          readDrainViewerPins(this.context.workspaceState),
          queryResult.data,
          message.templateId
        );
        await this.context.workspaceState.update(DRAIN_VIEWER_PIN_KEY, nextPinState);
        this.postMessage({
          type: 'update',
          viewModel: this.buildCurrentViewModel(),
        });
        return;
      }
      case 'navigate':
        await this.openQueryArtifact(message.queryId, message.templateId ?? null);
        return;
      case 'blur':
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
        return;
    }
  }

  private async openQueryArtifact(
    queryId: string,
    templateId: string | null
  ): Promise<void> {
    const artifactPath = this.store.getArtifactPath(queryId);
    if (!artifactPath) {
      return;
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(artifactPath));
    const editor = await vscode.window.showTextDocument(document);

    if (!templateId) {
      return;
    }

    const headingPattern = new RegExp(`^###\\s+Template\\s+${templateId}\\s+Details\\b`);
    for (let line = 0; line < document.lineCount; line += 1) {
      if (headingPattern.test(document.lineAt(line).text)) {
        const range = new vscode.Range(line, 0, line, 0);
        editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
        editor.selection = new vscode.Selection(range.start, range.start);
        break;
      }
    }
  }
}
