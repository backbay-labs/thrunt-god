import * as vscode from 'vscode';
import type {
  RunbookBootData,
  RunbookToHostMessage,
  HostToRunbookMessage,
  RunbookDef,
  StepResult,
  RunbookRunRecord,
} from '../shared/runbook';
import { RunbookEngine, RunbookRegistry } from './runbook';
import { ExecutionLogger, buildRunbookEntry } from './executionLogger';
import type { MCPStatusManager } from './mcpStatusManager';

// Re-export for convenience
export { RUNBOOK_PANEL_VIEW_TYPE } from './runbook';
import { RUNBOOK_PANEL_VIEW_TYPE } from './runbook';

// ---------------------------------------------------------------------------
// HTML template helpers (same pattern as CommandDeckPanel / McpControlPanel)
// ---------------------------------------------------------------------------

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

function createRunbookHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  bootData: RunbookBootData
): string {
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-runbook.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview-runbook.css')
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
    <title>Runbook</title>
    <style>${BASE_WEBVIEW_STYLES}</style>
    <link rel="stylesheet" href="${styleUri}" />
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">
      window.__THRUNT_RUNBOOK_BOOT__ = ${serializedBoot};
    </script>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}

// ---------------------------------------------------------------------------
// RunbookPanel — webview host (follows CommandDeckPanel / McpControlPanel pattern)
// ---------------------------------------------------------------------------

export class RunbookPanel implements vscode.Disposable {
  static currentPanel: RunbookPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];
  private isDisposed = false;
  private ready = false;
  private confirmResolve: ((value: boolean) => void) | null = null;
  private currentRunbook: { def: RunbookDef; path: string } | null = null;

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly registry: RunbookRegistry,
    private readonly engine: RunbookEngine,
    private readonly logger: ExecutionLogger,
    private readonly mcpStatus: MCPStatusManager | null,
    private readonly panel: vscode.WebviewPanel
  ) {
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
    };
    this.panel.webview.html = createRunbookHtml(
      this.panel.webview,
      context.extensionUri,
      { surfaceId: 'runbook' }
    );

    this.panel.onDidDispose(
      () => {
        this.disposeResources();
      },
      null,
      this.disposables
    );

    this.panel.webview.onDidReceiveMessage(
      (message: RunbookToHostMessage) => {
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
    registry: RunbookRegistry,
    engine: RunbookEngine,
    logger: ExecutionLogger,
    mcpStatus: MCPStatusManager | null,
    runbookPath?: string
  ): RunbookPanel {
    const existing = RunbookPanel.currentPanel;
    if (existing && !existing.isDisposed) {
      existing.panel.reveal(vscode.ViewColumn.Active);
      if (runbookPath) {
        existing.loadRunbook(runbookPath);
      }
      return existing;
    }

    const panel = vscode.window.createWebviewPanel(
      RUNBOOK_PANEL_VIEW_TYPE,
      'Runbook',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist'),
        ],
      }
    );

    const created = new RunbookPanel(context, registry, engine, logger, mcpStatus, panel);
    RunbookPanel.currentPanel = created;

    if (runbookPath) {
      created.loadRunbook(runbookPath);
    }

    return created;
  }

  static restorePanel(
    context: vscode.ExtensionContext,
    registry: RunbookRegistry,
    engine: RunbookEngine,
    logger: ExecutionLogger,
    mcpStatus: MCPStatusManager | null,
    panel: vscode.WebviewPanel
  ): RunbookPanel {
    const restored = new RunbookPanel(context, registry, engine, logger, mcpStatus, panel);
    RunbookPanel.currentPanel = restored;
    return restored;
  }

  loadRunbook(runbookPath: string): void {
    const def = this.registry.getRunbook(runbookPath);
    if (!def) {
      this.currentRunbook = null;
      this.postMessage({
        type: 'error',
        message: `Failed to load runbook: ${runbookPath}`,
      });
      return;
    }

    this.currentRunbook = { def, path: runbookPath };

    if (this.ready) {
      this.postMessage({
        type: 'init',
        runbook: def,
        runbookPath,
        isDark: isDarkTheme(vscode.window.activeColorTheme.kind),
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

  private postMessage(message: HostToRunbookMessage): void {
    if (!this.isDisposed) {
      void this.panel.webview.postMessage(message);
    }
  }

  private disposeResources(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;
    RunbookPanel.currentPanel = undefined;

    // Reject any pending confirm
    if (this.confirmResolve) {
      this.confirmResolve(false);
      this.confirmResolve = null;
    }

    while (this.disposables.length > 0) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }

  private handleMessage(msg: RunbookToHostMessage): void {
    switch (msg.type) {
      case 'webview:ready':
        this.ready = true;
        if (this.currentRunbook) {
          this.postMessage({
            type: 'init',
            runbook: this.currentRunbook.def,
            runbookPath: this.currentRunbook.path,
            isDark: isDarkTheme(vscode.window.activeColorTheme.kind),
          });
        }
        return;
      case 'run:start':
        void this.handleRunStart(msg.inputs, msg.dryRun);
        return;
      case 'confirm:continue':
        if (this.confirmResolve) {
          this.confirmResolve(true);
          this.confirmResolve = null;
        }
        return;
      case 'confirm:abort':
        if (this.confirmResolve) {
          this.confirmResolve(false);
          this.confirmResolve = null;
        }
        return;
      case 'refresh':
        if (this.currentRunbook) {
          void this.registry.refresh().then(() => {
            if (this.currentRunbook) {
              this.loadRunbook(this.currentRunbook.path);
            }
          });
        }
        return;
    }
  }

  private async handleRunStart(
    inputs: Record<string, string>,
    dryRun: boolean
  ): Promise<void> {
    if (!this.currentRunbook) {
      this.postMessage({ type: 'error', message: 'No runbook loaded' });
      return;
    }

    let currentStepIndex = 0;
    let currentStepDescription =
      this.currentRunbook.def.steps[0]?.description || 'Step 1';

    const onConfirm = (): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        this.confirmResolve = resolve;
        this.postMessage({
          type: 'confirmPrompt',
          stepIndex: currentStepIndex,
          description: currentStepDescription,
        });
      });
    };

    try {
      const gen = this.engine.executeRunbook(
        this.currentRunbook.def,
        this.currentRunbook.path,
        inputs,
        { dryRun, onConfirm }
      );

      let iterResult = await gen.next();
      while (!iterResult.done) {
        const result = iterResult.value as StepResult;

        // Post stepStart for next step
        this.postMessage({
          type: 'stepStart',
          stepIndex: result.stepIndex,
          description: result.description,
        });

        // Pre-update tracking for the NEXT confirm callback before calling gen.next()
        const nextIndex = result.stepIndex + 1;
        currentStepIndex = nextIndex;
        currentStepDescription =
          this.currentRunbook.def.steps[nextIndex]?.description ||
          `Step ${nextIndex + 1}`;

        // Post stepComplete
        this.postMessage({ type: 'stepComplete', result });

        iterResult = await gen.next();
      }

      // Generator return value is the RunbookRunRecord
      const record = iterResult.value as RunbookRunRecord;
      this.postMessage({ type: 'runComplete', record });

      const environment = this.mcpStatus?.getStatus().profile ?? null;
      this.logger.append(buildRunbookEntry(record, environment));
    } catch (err) {
      this.postMessage({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
