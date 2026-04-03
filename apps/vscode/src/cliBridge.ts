import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from 'child_process';
import * as vscode from 'vscode';

export interface CLIRunRequest {
  command: string[];
  cwd: string;
  cliPath: string;
  env?: NodeJS.ProcessEnv;
  phase?: number;
  huntRoot?: vscode.Uri;
  timeoutMs?: number;
}

export interface CLIRunProgress {
  phase: number | null;
  plan: string | null;
  step: string | null;
  queriesComplete: number;
  queriesTotal: number;
  eventsTotal: number;
  receiptsGenerated: number;
  elapsedMs: number;
  currentQuery: string | null;
  eta: number | null;
}

export type CLIRunStatus = 'idle' | 'running' | 'success' | 'failed' | 'cancelled';

export interface CLIActiveRun {
  phase: number | null;
  status: CLIRunStatus;
  command: string[];
  startedAt: number;
  progress: CLIRunProgress | null;
}

interface CLIProgressMessage {
  type: 'progress';
  phase?: number;
  plan?: string;
  step?: string;
  queriesComplete?: number;
  queriesTotal?: number;
  eventsTotal?: number;
  receiptsGenerated?: number;
  elapsedMs?: number;
  currentQuery?: string | null;
  eta?: number | null;
}

interface CLIArtifactCreatedMessage {
  type: 'artifact-created';
  artifactType?: string;
  artifactId?: string;
  filePath?: string;
  summary?: string;
}

interface CLIErrorMessage {
  type: 'error';
  code?: string;
  message?: string;
  connectorId?: string;
  queryId?: string;
  recoverable?: boolean;
}

interface CLICompleteMessage {
  type: 'complete';
  phase?: number;
  queriesExecuted?: number;
  receiptsGenerated?: number;
  totalEvents?: number;
  elapsedMs?: number;
  nextPhase?: number | null;
}

type StructuredCLIMessage =
  | CLIProgressMessage
  | CLIArtifactCreatedMessage
  | CLIErrorMessage
  | CLICompleteMessage;

type SpawnLike = (
  command: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio
) => ChildProcessWithoutNullStreams;

interface PendingDiagnostic {
  code?: string;
  message: string;
  queryId?: string;
}

function formatClockTime(date = new Date()): string {
  return date.toISOString().slice(11, 19);
}

function formatCommandForOutput(args: string[]): string {
  return args
    .map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg))
    .join(' ');
}

function normalizeProgress(
  message: CLIProgressMessage,
  previous: CLIRunProgress | null
): CLIRunProgress {
  return {
    phase:
      typeof message.phase === 'number'
        ? message.phase
        : previous?.phase ?? null,
    plan: typeof message.plan === 'string' ? message.plan : previous?.plan ?? null,
    step: typeof message.step === 'string' ? message.step : previous?.step ?? null,
    queriesComplete:
      typeof message.queriesComplete === 'number'
        ? message.queriesComplete
        : previous?.queriesComplete ?? 0,
    queriesTotal:
      typeof message.queriesTotal === 'number'
        ? message.queriesTotal
        : previous?.queriesTotal ?? 0,
    eventsTotal:
      typeof message.eventsTotal === 'number'
        ? message.eventsTotal
        : previous?.eventsTotal ?? 0,
    receiptsGenerated:
      typeof message.receiptsGenerated === 'number'
        ? message.receiptsGenerated
        : previous?.receiptsGenerated ?? 0,
    elapsedMs:
      typeof message.elapsedMs === 'number'
        ? message.elapsedMs
        : previous?.elapsedMs ?? 0,
    currentQuery:
      typeof message.currentQuery === 'string' || message.currentQuery === null
        ? message.currentQuery
        : previous?.currentQuery ?? null,
    eta:
      typeof message.eta === 'number' || message.eta === null
        ? message.eta
        : previous?.eta ?? null,
  };
}

function buildQueryDiagnosticUri(
  huntRoot: vscode.Uri,
  queryId: string
): vscode.Uri {
  return vscode.Uri.joinPath(huntRoot, 'QUERIES', `${queryId}.md`);
}

function buildMissionDiagnosticUri(huntRoot: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(huntRoot, 'MISSION.md');
}

const QUERY_ID_PATTERN = /(QRY-[A-Za-z0-9-]+)/;

export function parseStructuredCliLine(line: string): StructuredCLIMessage | null {
  try {
    const parsed = JSON.parse(line) as StructuredCLIMessage & { type?: string };
    return typeof parsed?.type === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function mapCliDiagnostics(
  huntRoot: vscode.Uri,
  diagnostics: PendingDiagnostic[]
): Array<[vscode.Uri, vscode.Diagnostic[]]> {
  const grouped = new Map<string, { uri: vscode.Uri; diagnostics: vscode.Diagnostic[] }>();

  for (const item of diagnostics) {
    let uri = buildMissionDiagnosticUri(huntRoot);
    if (item.queryId) {
      uri = buildQueryDiagnosticUri(huntRoot, item.queryId);
    } else if (/query timeout/i.test(item.message)) {
      const queryId = item.message.match(QUERY_ID_PATTERN)?.[1];
      if (queryId) {
        uri = buildQueryDiagnosticUri(huntRoot, queryId);
      }
    }

    const message =
      item.code === 'CONNECTOR_NOT_CONFIGURED'
        ? `Connector not configured. ${item.message}`
        : item.code === 'AUTH_FAILED'
          ? `Connector authentication failed. ${item.message}`
          : item.message;

    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 1),
      message,
      vscode.DiagnosticSeverity.Error
    );
    diagnostic.source = 'THRUNT CLI';

    const existing = grouped.get(uri.fsPath);
    if (existing) {
      existing.diagnostics.push(diagnostic);
    } else {
      grouped.set(uri.fsPath, { uri, diagnostics: [diagnostic] });
    }
  }

  return [...grouped.values()].map((entry) => [entry.uri, entry.diagnostics]);
}

export class CLIBridge implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<CLIActiveRun | null>();
  readonly onDidChange: vscode.Event<CLIActiveRun | null> = this._onDidChange.event;

  private readonly _onDidProgress = new vscode.EventEmitter<CLIRunProgress>();
  readonly onDidProgress: vscode.Event<CLIRunProgress> = this._onDidProgress.event;

  private readonly _onDidComplete = new vscode.EventEmitter<{
    status: CLIRunStatus;
    exitCode: number | null;
    summary: string | null;
  }>();
  readonly onDidComplete = this._onDidComplete.event;

  private readonly _onDidOutput = new vscode.EventEmitter<string>();
  readonly onDidOutput: vscode.Event<string> = this._onDidOutput.event;

  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly diagnostics: vscode.DiagnosticCollection;
  private activeProcess: ChildProcessWithoutNullStreams | null = null;
  private activeRun: CLIActiveRun | null = null;
  private pendingDiagnostics: PendingDiagnostic[] = [];
  private completionSummary: string | null = null;
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  private cancelKillHandle: ReturnType<typeof setTimeout> | null = null;
  private cancelled = false;

  constructor(
    private readonly outputChannel: vscode.OutputChannel,
    spawnImpl?: SpawnLike
  ) {
    this.spawnImpl = spawnImpl ?? spawn;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      90
    );
    this.statusBarItem.command = 'workbench.action.output.toggleOutput';
    this.diagnostics = vscode.languages.createDiagnosticCollection('thrunt-cli');
  }

  private readonly spawnImpl: SpawnLike;

  getActiveRun(): CLIActiveRun | null {
    return this.activeRun;
  }

  get isRunning(): boolean {
    return this.activeProcess !== null;
  }

  async run(request: CLIRunRequest): Promise<{ exitCode: number | null }> {
    if (this.activeProcess) {
      throw new Error('A THRUNT CLI command is already running.');
    }

    this.cancelled = false;
    this.pendingDiagnostics = [];
    this.completionSummary = null;
    this.diagnostics.clear();

    const spawnArgs = [request.cliPath, ...request.command, '--cwd', request.cwd];
    let child: ChildProcessWithoutNullStreams;
    try {
      child = this.spawnImpl(process.execPath, spawnArgs, {
        cwd: request.cwd,
        env: request.env ?? process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown CLI launch failure.';
      this.appendOutput(`[THRUNT CLI] Failed to start command: ${message}`);
      this.finishRun(request, 'failed', null);
      throw error;
    }

    this.activeProcess = child;
    this.activeRun = {
      phase: request.phase ?? null,
      status: 'running',
      command: request.command,
      startedAt: Date.now(),
      progress: null,
    };
    this.emitChange();
    this.renderStatusBar();

    this.outputChannel.show(true);
    this.appendOutput(`$ node thrunt-tools.cjs ${formatCommandForOutput(request.command)} --cwd ${request.cwd}`);

    const timeoutMs =
      request.timeoutMs ??
      vscode.workspace.getConfiguration('thruntGod').get<number>('cli.timeout', 600000);
    this.timeoutHandle = setTimeout(() => {
      if (this.activeProcess) {
        void vscode.window.showWarningMessage(
          `THRUNT CLI has been running for ${Math.round(timeoutMs / 60000)} minutes.`
        );
      }
    }, timeoutMs);

    const stdoutDone = this.attachStream(child.stdout, false);
    const stderrDone = this.attachStream(child.stderr, true);

    try {
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        child.once('error', (error) => {
          reject(error);
        });
        child.once('close', (code) => {
          resolve(code);
        });
      }).finally(async () => {
        await Promise.all([stdoutDone, stderrDone]);
      });

      const status: CLIRunStatus =
        this.cancelled ? 'cancelled' : exitCode === 0 ? 'success' : 'failed';
      if (status === 'success') {
        this.appendOutput('[THRUNT CLI] Command completed successfully.');
      } else if (status === 'cancelled') {
        this.appendOutput('[THRUNT CLI] Command cancelled.');
      } else {
        this.appendOutput(
          `[THRUNT CLI] Command failed${typeof exitCode === 'number' ? ` (exit ${exitCode})` : ''}.`
        );
      }

      this.finishRun(request, status, exitCode);
      return { exitCode };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown CLI launch failure.';
      this.appendOutput(`[THRUNT CLI] Failed to start command: ${message}`);
      this.finishRun(request, 'failed', null);
      throw error;
    }
  }

  cancel(): void {
    if (!this.activeProcess) {
      return;
    }

    this.cancelled = true;
    const cancelledProcess = this.activeProcess;
    cancelledProcess.kill('SIGTERM');
    this.clearCancelKillTimeout();
    this.cancelKillHandle = setTimeout(() => {
      if (this.activeProcess === cancelledProcess) {
        cancelledProcess.kill('SIGKILL');
      }
      this.cancelKillHandle = null;
    }, 5000);
  }

  dispose(): void {
    this.cancel();
    this.clearTimeout();
    this.statusBarItem.dispose();
    this.diagnostics.dispose();
    this._onDidChange.dispose();
    this._onDidProgress.dispose();
    this._onDidComplete.dispose();
    this._onDidOutput.dispose();
  }

  private async attachStream(
    stream: NodeJS.ReadableStream,
    isErrorStream: boolean
  ): Promise<void> {
    let buffer = '';

    for await (const chunk of stream) {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        this.handleLine(line, isErrorStream);
      }
    }

    if (buffer.length > 0) {
      this.handleLine(buffer, isErrorStream);
    }
  }

  private handleLine(line: string, isErrorStream: boolean): void {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return;
    }

    const structured = parseStructuredCliLine(trimmed);
    if (structured) {
      this.handleStructuredMessage(structured);
      return;
    }

    if (isErrorStream) {
      this.captureHeuristicDiagnostic(trimmed);
    }
    this.appendOutput(trimmed);
  }

  private handleStructuredMessage(message: StructuredCLIMessage): void {
    switch (message.type) {
      case 'progress': {
        const progress = normalizeProgress(message, this.activeRun?.progress ?? null);
        if (this.activeRun) {
          this.activeRun.progress = progress;
          if (typeof message.phase === 'number') {
            this.activeRun.phase = message.phase;
          }
        }
        this.renderStatusBar();
        this._onDidProgress.fire(progress);
        this.emitChange();
        return;
      }
      case 'artifact-created':
        this.appendOutput(
          `[${message.artifactId ?? 'artifact'}] Created ${message.artifactType ?? 'artifact'}${message.summary ? `: ${message.summary}` : ''}`
        );
        return;
      case 'error':
        this.pendingDiagnostics.push({
          code: message.code,
          message: message.message ?? 'THRUNT CLI reported an error.',
          queryId: message.queryId,
        });
        this.appendOutput(message.message ?? '[THRUNT CLI] Error');
        return;
      case 'complete':
        this.completionSummary = `Phase ${message.phase ?? this.activeRun?.phase ?? '?'} complete: ${message.queriesExecuted ?? 0} queries, ${message.receiptsGenerated ?? 0} receipts, ${message.totalEvents ?? 0} events`;
        this.appendOutput(this.completionSummary);
        return;
    }
  }

  private captureHeuristicDiagnostic(line: string): void {
    if (/connector .*not configured/i.test(line)) {
      this.pendingDiagnostics.push({
        code: 'CONNECTOR_NOT_CONFIGURED',
        message: line,
      });
      return;
    }

    if (/authentication failed/i.test(line)) {
      this.pendingDiagnostics.push({
        code: 'AUTH_FAILED',
        message: line,
      });
      return;
    }

    if (/query timeout/i.test(line)) {
      this.pendingDiagnostics.push({
        code: 'QUERY_TIMEOUT',
        message: line,
        queryId: line.match(QUERY_ID_PATTERN)?.[1],
      });
    }
  }

  private appendOutput(line: string): void {
    const rendered = `[${formatClockTime()}] ${line}`;
    this.outputChannel.appendLine(rendered);
    this._onDidOutput.fire(rendered);
  }

  private emitChange(): void {
    this._onDidChange.fire(this.activeRun ? { ...this.activeRun } : null);
  }

  private renderStatusBar(): void {
    if (!this.activeRun) {
      this.statusBarItem.hide();
      return;
    }

    const phaseLabel =
      typeof this.activeRun.phase === 'number'
        ? `Phase ${this.activeRun.phase}`
        : 'THRUNT';
    this.statusBarItem.text = `$(sync~spin) THRUNT: Running ${phaseLabel}...`;

    const progress = this.activeRun.progress;
    if (progress) {
      const queryProgress =
        progress.queriesTotal > 0
          ? `${progress.queriesComplete}/${progress.queriesTotal} queries`
          : `${progress.queriesComplete} queries`;
      this.statusBarItem.tooltip = `${phaseLabel} — ${queryProgress}, ${progress.eventsTotal} events, ${progress.receiptsGenerated} receipts`;
    } else {
      this.statusBarItem.tooltip = `${phaseLabel} is running. Open the THRUNT CLI output for details.`;
    }

    this.statusBarItem.show();
  }

  private clearTimeout(): void {
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }
  }

  private clearCancelKillTimeout(): void {
    if (this.cancelKillHandle) {
      clearTimeout(this.cancelKillHandle);
      this.cancelKillHandle = null;
    }
  }

  private finishRun(
    request: Pick<CLIRunRequest, 'huntRoot'>,
    status: CLIRunStatus,
    exitCode: number | null
  ): void {
    if (status === 'failed' && request.huntRoot && this.pendingDiagnostics.length > 0) {
      for (const [uri, entries] of mapCliDiagnostics(request.huntRoot, this.pendingDiagnostics)) {
        this.diagnostics.set(uri, entries);
      }
    }

    this.activeProcess = null;
    this.activeRun = null;
    this.clearTimeout();
    this.clearCancelKillTimeout();
    this.statusBarItem.hide();
    this._onDidComplete.fire({
      status,
      exitCode,
      summary: this.completionSummary,
    });
    this.emitChange();
  }
}
