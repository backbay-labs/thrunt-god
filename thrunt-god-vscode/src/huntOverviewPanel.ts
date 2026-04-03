import * as vscode from 'vscode';
import type { HuntDataStore } from './store';
import type { ArtifactSelectionCoordinator } from './selectionSync';
import { inferSelectableArtifactType } from './selectionSync';
import type {
  HuntOverviewBootData,
  HuntOverviewViewModel,
  HuntOverviewToHostMessage,
  HostToHuntOverviewMessage,
  SessionDiff,
  ActivityFeedEntry,
} from '../shared/hunt-overview';

export const HUNT_OVERVIEW_VIEW_TYPE = 'thruntGod.huntOverview';
export const SESSION_HASH_KEY = 'thruntGod.sessionHashes';

type ArtifactHashMap = Record<string, string>;

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

/**
 * Compute content hashes for all known artifacts in the store.
 * Used to detect what changed between extension activations.
 */
export function computeArtifactHashes(store: HuntDataStore): ArtifactHashMap {
  const hashes: ArtifactHashMap = {};

  // Queries and receipts
  for (const [id, result] of store.getQueries()) {
    if (result.status === 'loaded') {
      hashes[id] = result.data.contentHash;
    }
  }
  for (const [id, result] of store.getReceipts()) {
    if (result.status === 'loaded') {
      hashes[id] = result.data.contentHash;
    }
  }

  // Singleton artifacts
  const hunt = store.getHunt();
  if (hunt) {
    if (hunt.mission.status === 'loaded') {
      hashes['MISSION'] = hunt.mission.data.signal;
    }
    if (hunt.hypotheses.status === 'loaded') {
      hashes['HYPOTHESES'] = JSON.stringify(
        hunt.hypotheses.data.active.map((h) => h.status)
      );
    }
    if (hunt.state.status === 'loaded') {
      hashes['STATE'] = hunt.state.data.lastActivity;
    }
  }

  return hashes;
}

/**
 * Infer the artifact type from an artifact ID string.
 */
function inferType(id: string): string {
  if (id.startsWith('QRY')) return 'query';
  if (id.startsWith('RCT')) return 'receipt';
  if (id.startsWith('HYP')) return 'hypothesis';
  return id.toLowerCase();
}

/**
 * Compute the diff between two artifact hash maps.
 * Returns a SessionDiff with entries for added/modified/removed artifacts.
 */
export function computeSessionDiff(
  previous: ArtifactHashMap,
  current: ArtifactHashMap
): SessionDiff {
  const entries: ActivityFeedEntry[] = [];
  const now = new Date().toISOString();

  // Added: in current but not in previous
  for (const key of Object.keys(current)) {
    if (!(key in previous)) {
      entries.push({
        artifactType: inferType(key),
        artifactId: key,
        diffKind: 'added',
        timestamp: now,
      });
    }
  }

  // Modified: in both but hash differs
  for (const key of Object.keys(current)) {
    if (key in previous && current[key] !== previous[key]) {
      entries.push({
        artifactType: inferType(key),
        artifactId: key,
        diffKind: 'modified',
        timestamp: now,
      });
    }
  }

  // Removed: in previous but not in current
  for (const key of Object.keys(previous)) {
    if (!(key in current)) {
      entries.push({
        artifactType: inferType(key),
        artifactId: key,
        diffKind: 'removed',
        timestamp: now,
      });
    }
  }

  // Build summary string (omit zero categories)
  const added = entries.filter((e) => e.diffKind === 'added').length;
  const modified = entries.filter((e) => e.diffKind === 'modified').length;
  const removed = entries.filter((e) => e.diffKind === 'removed').length;
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} added`);
  if (modified > 0) parts.push(`${modified} modified`);
  if (removed > 0) parts.push(`${removed} removed`);
  const summary =
    parts.length > 0
      ? `${parts.join(', ')} since last session`
      : 'No changes since last session';

  return { entries, summary };
}

/**
 * Read diagnostics health from the THRUNT Evidence diagnostic collection.
 */
export function getDiagnosticsHealth(): { warnings: number; errors: number } {
  let warnings = 0;
  let errors = 0;

  for (const [, diagnostics] of vscode.languages.getDiagnostics()) {
    for (const d of diagnostics) {
      if (d.source !== 'THRUNT Evidence') continue;
      if (d.severity === vscode.DiagnosticSeverity.Warning) {
        warnings += 1;
      } else if (d.severity === vscode.DiagnosticSeverity.Error) {
        errors += 1;
      }
    }
  }

  return { warnings, errors };
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

function createHuntOverviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  bootData: HuntOverviewBootData
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-hunt-overview.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-hunt-overview.css')
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
    <title>Hunt Overview</title>
    <style>${BASE_WEBVIEW_STYLES}</style>
    <link rel="stylesheet" href="${styleUri}" />
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      window.__THRUNT_HUNT_OVERVIEW_BOOT__ = ${serializedBoot};
    </script>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}

export class HuntOverviewPanel implements vscode.Disposable {
  static currentPanel: HuntOverviewPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private isDisposed = false;
  private ready = false;
  private readonly sessionDiff: SessionDiff | null;
  private selectedArtifactId: string | null = null;

  private constructor(
    context: vscode.ExtensionContext,
    private readonly store: HuntDataStore,
    private readonly panel: vscode.WebviewPanel,
    sessionDiff: SessionDiff | null,
    private readonly selectionCoordinator: ArtifactSelectionCoordinator
  ) {
    this.sessionDiff = sessionDiff;

    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    };
    this.panel.webview.html = createHuntOverviewHtml(
      this.panel.webview,
      context.extensionUri,
      { surfaceId: 'hunt-overview' }
    );

    this.panel.onDidDispose(
      () => {
        this.disposeResources();
      },
      null,
      this.disposables
    );

    this.panel.webview.onDidReceiveMessage(
      (message: HuntOverviewToHostMessage) => {
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

    this.disposables.push(
      vscode.languages.onDidChangeDiagnostics(() => {
        if (this.ready) {
          this.postMessage({
            type: 'update',
            viewModel: this.buildViewModel(),
          });
        }
      })
    );
  }

  static createOrShow(
    context: vscode.ExtensionContext,
    store: HuntDataStore,
    sessionDiff: SessionDiff | null,
    selectionCoordinator: ArtifactSelectionCoordinator
  ): HuntOverviewPanel {
    const existing = HuntOverviewPanel.currentPanel;
    if (existing && !existing.isDisposed) {
      existing.panel.reveal(vscode.ViewColumn.Active);
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      HUNT_OVERVIEW_VIEW_TYPE,
      'Hunt Overview',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist'),
        ],
      }
    );

    const created = new HuntOverviewPanel(
      context,
      store,
      panel,
      sessionDiff,
      selectionCoordinator
    );
    HuntOverviewPanel.currentPanel = created;
    return created;
  }

  static revive(
    context: vscode.ExtensionContext,
    store: HuntDataStore,
    panel: vscode.WebviewPanel,
    sessionDiff: SessionDiff | null,
    selectionCoordinator: ArtifactSelectionCoordinator
  ): HuntOverviewPanel {
    const revived = new HuntOverviewPanel(
      context,
      store,
      panel,
      sessionDiff,
      selectionCoordinator
    );
    HuntOverviewPanel.currentPanel = revived;
    return revived;
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.disposeResources();
    this.panel.dispose();
  }

  private postMessage(message: HostToHuntOverviewMessage): void {
    if (!this.isDisposed) {
      void this.panel.webview.postMessage(message);
    }
  }

  focusArtifact(artifactId: string): void {
    this.selectedArtifactId = artifactId;
    if (this.ready) {
      this.postMessage({ type: 'focus', artifactId });
    }
  }

  private disposeResources(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    HuntOverviewPanel.currentPanel = undefined;

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private buildViewModel(): HuntOverviewViewModel {
    const health = getDiagnosticsHealth();
    return this.store.deriveHuntOverview(health, this.sessionDiff);
  }

  private handleMessage(msg: HuntOverviewToHostMessage): void {
    switch (msg.type) {
      case 'webview:ready':
        this.ready = true;
        this.postMessage({
          type: 'init',
          viewModel: this.buildViewModel(),
          isDark: isDarkTheme(vscode.window.activeColorTheme.kind),
        });
        if (this.selectedArtifactId) {
          this.postMessage({ type: 'focus', artifactId: this.selectedArtifactId });
        }
        return;
      case 'navigate':
        if (msg.target === 'problems') {
          void vscode.commands.executeCommand(
            'workbench.action.problems.focus'
          );
        } else if (msg.target.startsWith('sidebar')) {
          void vscode.commands.executeCommand(
            'workbench.action.focusSideBar'
          );
        } else {
          void vscode.commands.executeCommand(
            'workbench.action.focusSideBar'
          );
        }
        return;
      case 'artifact:select': {
        const artifactType = inferSelectableArtifactType(msg.artifactId);
        if (artifactType) {
          this.selectedArtifactId = msg.artifactId;
          this.selectionCoordinator.select({
            artifactId: msg.artifactId,
            artifactType,
            source: 'hunt-overview',
          });
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
