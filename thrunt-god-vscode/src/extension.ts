import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { HUNT_MARKERS, OUTPUT_CHANNEL_NAME } from './constants';
import { ArtifactWatcher } from './watcher';
import { HuntDataStore } from './store';
import { HuntTreeDataProvider, HuntTreeItem } from './sidebar';
import { HuntStatusBar } from './statusBar';
import { HuntCodeLensProvider } from './codeLens';
import { EvidenceIntegrityDiagnostics } from './diagnostics';
import { DRAIN_VIEWER_VIEW_TYPE, DrainTemplatePanel } from './drainViewer';
import { CLIBridge } from './cliBridge';
import {
  IOCRegistry,
  classifyIOC,
  formatIOCTypeLabel,
  validateIOC,
} from './iocRegistry';
import { IOCDecorationManager } from './iocDecorations';
import { SLATimerManager } from './slaTimer';
import {
  WarRoomFormatter,
  getClipboardText,
  type WarRoomFormat,
} from './warRoomCopy';
import {
  HuntOverviewPanel,
  HUNT_OVERVIEW_VIEW_TYPE,
  SESSION_HASH_KEY,
  computeArtifactHashes,
  computeSessionDiff,
} from './huntOverviewPanel';
import {
  EVIDENCE_BOARD_VIEW_TYPE,
  EvidenceBoardPanel,
} from './evidenceBoardPanel';
import { QueryAnalysisPanel, QUERY_ANALYSIS_VIEW_TYPE } from './queryAnalysisPanel';
import type { SessionDiff } from '../shared/hunt-overview';
import { resolveArtifactType } from './watcher';
import {
  ArtifactSelectionCoordinator,
  inferSelectableArtifactType,
} from './selectionSync';

const CLI_OUTPUT_CHANNEL_NAME = `${OUTPUT_CHANNEL_NAME} CLI`;
const LAST_CLI_COMMAND_KEY = 'thruntGod.lastCliCommand';
const LAST_PHASE_COMMAND_KEY = 'thruntGod.lastPhaseCommand';
const DEFAULT_PHASE_COMMAND_TEMPLATE = 'runtime execute --pack {packId} --phase {phase}';

interface RenderedMarkdownResult {
  rendered: string;
}

interface RuntimeDoctorCheck {
  status?: string;
  message?: string;
}

interface RuntimeDoctorConnector {
  id: string;
  display_name?: string;
  readiness_status?: string;
  readiness_score?: number;
  configured?: boolean;
  checks?: Record<string, RuntimeDoctorCheck>;
}

interface RuntimeDoctorReport {
  overall_status?: string;
  overall_score?: number;
  live?: boolean;
  configured_only?: boolean;
  connectors?: RuntimeDoctorConnector[];
}

/**
 * Find the workspace folder containing hunt artifacts.
 * Checks each workspace folder for marker files in order.
 * Returns the URI of the first folder where a marker is found, or undefined.
 */
async function findHuntRoot(): Promise<vscode.Uri | undefined> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) {
    return undefined;
  }

  for (const folder of folders) {
    for (const marker of HUNT_MARKERS) {
      const markerUri = vscode.Uri.joinPath(folder.uri, marker);
      try {
        await vscode.workspace.fs.stat(markerUri);
        const huntDir = marker.slice(0, marker.lastIndexOf('/'));
        return vscode.Uri.joinPath(folder.uri, huntDir);
      } catch {
        // Marker not found in this folder, continue
      }
    }
  }

  return undefined;
}

function extractQueryIdFromTarget(target: unknown): string | undefined {
  if (typeof target === 'string' && target.length > 0) {
    return target;
  }

  if (!target || typeof target !== 'object') {
    return undefined;
  }

  const candidate = target as Partial<HuntTreeItem> & {
    queryId?: unknown;
    uri?: vscode.Uri;
  };

  if (candidate.nodeType === 'query' && typeof candidate.dataId === 'string') {
    return candidate.dataId;
  }

  if (typeof candidate.queryId === 'string' && candidate.queryId.length > 0) {
    return candidate.queryId;
  }

  if (candidate.uri?.fsPath) {
    const resolved = resolveArtifactType(candidate.uri.fsPath);
    if (resolved?.type === 'query') {
      return resolved.id;
    }
  }

  return undefined;
}

function extractReceiptIdFromTarget(target: unknown): string | undefined {
  if (typeof target === 'string' && /^RCT-/.test(target)) {
    return target;
  }

  if (!target || typeof target !== 'object') {
    return undefined;
  }

  const candidate = target as Partial<HuntTreeItem> & {
    receiptId?: unknown;
    uri?: vscode.Uri;
  };

  if (candidate.nodeType === 'receipt' && typeof candidate.dataId === 'string') {
    return candidate.dataId;
  }

  if (typeof candidate.receiptId === 'string' && candidate.receiptId.length > 0) {
    return candidate.receiptId;
  }

  if (candidate.uri?.fsPath) {
    const resolved = resolveArtifactType(candidate.uri.fsPath);
    if (resolved?.type === 'receipt') {
      return resolved.id;
    }
  }

  return undefined;
}

function extractHypothesisIdFromTarget(target: unknown): string | undefined {
  if (typeof target === 'string' && /^HYP-/.test(target)) {
    return target;
  }

  if (!target || typeof target !== 'object') {
    return undefined;
  }

  const candidate = target as Partial<HuntTreeItem> & {
    hypothesisId?: unknown;
  };

  if (candidate.nodeType === 'hypothesis' && typeof candidate.dataId === 'string') {
    return candidate.dataId;
  }

  if (
    typeof candidate.hypothesisId === 'string' &&
    candidate.hypothesisId.length > 0
  ) {
    return candidate.hypothesisId;
  }

  return undefined;
}

function getActiveEditorQueryId(): string | undefined {
  const activeDocument = vscode.window.activeTextEditor?.document;
  if (!activeDocument) {
    return undefined;
  }

  const resolved = resolveArtifactType(activeDocument.uri.fsPath);
  return resolved?.type === 'query' ? resolved.id : undefined;
}

function isE2EMode(): boolean {
  return process.env.THRUNT_E2E === '1';
}

function getActiveEditorReceiptId(): string | undefined {
  const activeDocument = vscode.window.activeTextEditor?.document;
  if (!activeDocument) {
    return undefined;
  }

  const resolved = resolveArtifactType(activeDocument.uri.fsPath);
  return resolved?.type === 'receipt' ? resolved.id : undefined;
}

function isWarRoomFormat(value: string): value is WarRoomFormat {
  return value === 'markdown' || value === 'plainText' || value === 'attack';
}

function getDefaultWarRoomFormat(): WarRoomFormat {
  const configured = vscode.workspace
    .getConfiguration('thruntGod')
    .get<string>('warRoom.defaultFormat', 'markdown');

  return isWarRoomFormat(configured) ? configured : 'markdown';
}

function extractPhaseNumberFromTarget(target: unknown): number | undefined {
  if (typeof target === 'number' && Number.isFinite(target)) {
    return target;
  }

  if (typeof target === 'string' && /^\d+$/.test(target)) {
    return Number(target);
  }

  if (!target || typeof target !== 'object') {
    return undefined;
  }

  const candidate = target as Partial<HuntTreeItem>;
  if (candidate.nodeType === 'phase' && typeof candidate.dataId === 'string') {
    return /^\d+$/.test(candidate.dataId) ? Number(candidate.dataId) : undefined;
  }

  return undefined;
}

function slugifyPhaseName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fillPhaseCommandTemplate(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(/\{([a-zA-Z0-9]+)\}/g, (_, key) => values[key] ?? '');
}

const execFileAsync = promisify(execFile);

function parseCliInput(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | '\'' | null = null;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (escaping) {
    current += '\\';
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function formatCliArg(arg: string): string {
  return /\s/.test(arg) ? JSON.stringify(arg) : arg;
}

function formatCliArgs(args: string[]): string {
  return args.map(formatCliArg).join(' ');
}

function resolveWorkspaceRoot(huntRoot?: vscode.Uri): string | undefined {
  if (huntRoot) {
    return vscode.workspace.getWorkspaceFolder(huntRoot)?.uri.fsPath ?? path.dirname(huntRoot.fsPath);
  }

  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function resolveCliArgs(
  context: vscode.ExtensionContext,
  input: unknown
): Promise<string[] | undefined> {
  if (Array.isArray(input) && input.every((value) => typeof value === 'string')) {
    return input.filter((value) => value.length > 0);
  }

  if (typeof input === 'string') {
    return parseCliInput(input);
  }

  const lastCommand = context.workspaceState.get<string>(LAST_CLI_COMMAND_KEY, 'state json');
  const entered = await vscode.window.showInputBox({
    title: 'Run THRUNT CLI Command',
    prompt: 'Enter THRUNT CLI arguments without the `node thrunt-tools.cjs` prefix',
    placeHolder: 'state json',
    value: lastCommand,
    ignoreFocusOut: true,
  });

  if (entered === undefined) {
    return undefined;
  }

  const args = parseCliInput(entered);
  if (args.length > 0) {
    await context.workspaceState.update(LAST_CLI_COMMAND_KEY, entered);
  }
  return args;
}

function toRelativeHuntPath(huntRoot: vscode.Uri, filePath: string): string {
  return path.relative(huntRoot.fsPath, filePath).replace(/\\/g, '/');
}

function serializeTreeDescription(
  description: vscode.TreeItem['description']
): string | boolean | undefined {
  if (typeof description === 'string' || typeof description === 'boolean') {
    return description;
  }
  return undefined;
}

function serializeTreeTooltip(tooltip: vscode.TreeItem['tooltip']): string | undefined {
  if (typeof tooltip === 'string') {
    return tooltip;
  }

  if (tooltip instanceof vscode.MarkdownString) {
    return tooltip.value;
  }

  return undefined;
}

async function buildTreeSnapshot(
  treeProvider: HuntTreeDataProvider,
  element?: HuntTreeItem
): Promise<Array<Record<string, unknown>>> {
  const children = await Promise.resolve(treeProvider.getChildren(element));

  return Promise.all(
    children.map(async (child) => ({
      label: child.label,
      description: serializeTreeDescription(child.description),
      tooltip: serializeTreeTooltip(child.tooltip),
      contextValue: child.contextValue,
      nodeType: child.nodeType,
      dataId: child.dataId,
      artifactPath: child.artifactPath,
      children: await buildTreeSnapshot(treeProvider, child),
    }))
  );
}

function buildStoreSnapshot(store: HuntDataStore, huntRoot: vscode.Uri): Record<string, unknown> {
  const hunt = store.getHunt();
  const queries = [...store.getQueries().entries()]
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([queryId, result]) => {
      if (result.status !== 'loaded') {
        return { queryId, status: result.status };
      }

      return {
        queryId,
        status: result.status,
        artifactPath: store.getArtifactPath(queryId),
        relativePath: toRelativeHuntPath(huntRoot, store.getArtifactPath(queryId) ?? ''),
        title: result.data.title,
        connectorId: result.data.connectorId,
        dataset: result.data.dataset,
        eventCount: result.data.eventCount,
        templateCount: result.data.templateCount,
        entityCount: result.data.entityCount,
        templateIds: result.data.templates.map((template) => template.templateId),
        relatedHypotheses: result.data.relatedHypotheses,
        relatedReceipts: result.data.relatedReceipts,
      };
    });
  const receipts = [...store.getReceipts().entries()]
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([receiptId, result]) => {
      if (result.status !== 'loaded') {
        return { receiptId, status: result.status };
      }

      return {
        receiptId,
        status: result.status,
        artifactPath: store.getArtifactPath(receiptId),
        relativePath: toRelativeHuntPath(huntRoot, store.getArtifactPath(receiptId) ?? ''),
        connectorId: result.data.connectorId,
        dataset: result.data.dataset,
        claimStatus: result.data.claimStatus,
        relatedHypotheses: result.data.relatedHypotheses,
        relatedQueries: result.data.relatedQueries,
        hasAnomalyFrame: result.data.anomalyFrame !== null,
        totalScore: result.data.anomalyFrame?.deviationScore.totalScore ?? null,
      };
    });

  return {
    huntRoot: huntRoot.fsPath,
    singletonArtifacts: hunt
      ? {
          mission: hunt.mission.status,
          hypotheses: hunt.hypotheses.status,
          huntMap: hunt.huntMap.status,
          missionMode: hunt.mission.status === 'loaded' ? hunt.mission.data.mode : null,
          hypothesisCount:
            hunt.hypotheses.status === 'loaded'
              ? hunt.hypotheses.data.active.length +
                hunt.hypotheses.data.parked.length +
                hunt.hypotheses.data.disproved.length
              : 0,
          phaseCount:
            hunt.huntMap.status === 'loaded' ? hunt.huntMap.data.phases.length : 0,
          state:
            hunt.state.status === 'loaded'
              ? {
                  status: hunt.state.data.status,
                  phase: hunt.state.data.phase,
                  totalPhases: hunt.state.data.totalPhases,
                  planInPhase: hunt.state.data.planInPhase,
                  totalPlansInPhase: hunt.state.data.totalPlansInPhase,
                  lastActivity: hunt.state.data.lastActivity,
                  blockers: hunt.state.data.blockers,
                }
              : null,
        }
      : null,
    cache: {
      bodyCacheSize: store.bodyCacheSize(),
      frontmatterCacheSize: store.frontmatterCacheSize(),
    },
    queries,
    receipts,
  };
}

function resolveThruntCliPath(context: vscode.ExtensionContext): string {
  const override = process.env.THRUNT_TEST_CLI_PATH;
  const candidates = [
    override && override.trim() ? path.resolve(override) : null,
    path.resolve(context.extensionUri.fsPath, '..', 'thrunt-god', 'bin', 'thrunt-tools.cjs'),
    path.resolve(context.extensionUri.fsPath, 'dist', 'thrunt-god', 'bin', 'thrunt-tools.cjs'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to locate THRUNT CLI. Checked: ${candidates.join(', ')}`);
}

async function runThruntCli(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  args: string[]
): Promise<Record<string, unknown>> {
  const cliPath = resolveThruntCliPath(context);
  const commandArgs = [cliPath, ...args, '--cwd', workspaceRoot];
  const { stdout, stderr } = await execFileAsync(process.execPath, commandArgs, {
    cwd: workspaceRoot,
    env: process.env,
  });

  let parsed: unknown = null;
  const trimmed = stdout.trim();
  if (trimmed) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = null;
    }
  }

  return {
    cliPath,
    workspaceRoot,
    args,
    stdout,
    stderr,
    parsed,
  };
}

async function runThruntCliCommand(
  context: vscode.ExtensionContext,
  cliOutputChannel: vscode.OutputChannel,
  workspaceRoot: string,
  input?: unknown
): Promise<Record<string, unknown> | undefined> {
  const args = await resolveCliArgs(context, input);
  if (!args || args.length === 0) {
    await vscode.window.showWarningMessage('Enter a THRUNT CLI command to run.');
    return undefined;
  }

  await context.workspaceState.update(LAST_CLI_COMMAND_KEY, formatCliArgs(args));

  cliOutputChannel.appendLine(`$ node thrunt-tools.cjs ${formatCliArgs(args)} --cwd ${formatCliArg(workspaceRoot)}`);
  cliOutputChannel.show(true);

  try {
    const result = await runThruntCli(context, workspaceRoot, args);
    const stdout = typeof result.stdout === 'string' ? result.stdout.trimEnd() : '';
    const stderr = typeof result.stderr === 'string' ? result.stderr.trimEnd() : '';

    if (stdout) {
      cliOutputChannel.appendLine(stdout);
    }
    if (stderr) {
      cliOutputChannel.appendLine(stderr);
    }
    cliOutputChannel.appendLine('[THRUNT CLI] Command completed successfully.');

    return result;
  } catch (error) {
    const execError = error as Error & { stdout?: string; stderr?: string; code?: number };
    if (execError.stdout?.trim()) {
      cliOutputChannel.appendLine(execError.stdout.trimEnd());
    }
    if (execError.stderr?.trim()) {
      cliOutputChannel.appendLine(execError.stderr.trimEnd());
    }
    cliOutputChannel.appendLine(
      `[THRUNT CLI] Command failed${typeof execError.code === 'number' ? ` (exit ${execError.code})` : ''}.`
    );

    await vscode.window.showErrorMessage(
      `THRUNT CLI command failed${typeof execError.code === 'number' ? ` (exit ${execError.code})` : ''}. See ${CLI_OUTPUT_CHANNEL_NAME}.`
    );
    throw error;
  }
}

async function openTextResultDocument(
  content: string,
  language: string
): Promise<vscode.TextEditor> {
  const document = await vscode.workspace.openTextDocument({
    content,
    language,
  });

  return vscode.window.showTextDocument(document, {
    preview: false,
  });
}

function readRenderedMarkdown(parsed: unknown): string | null {
  if (
    parsed &&
    typeof parsed === 'object' &&
    typeof (parsed as RenderedMarkdownResult).rendered === 'string'
  ) {
    return (parsed as RenderedMarkdownResult).rendered;
  }

  return null;
}

function renderRuntimeDoctorMarkdown(parsed: unknown): string | null {
  const report = parsed as RuntimeDoctorReport | null;
  if (!report || !Array.isArray(report.connectors)) {
    return null;
  }

  const connectors = [...report.connectors].sort((left, right) => left.id.localeCompare(right.id));
  const lines = [
    '# THRUNT Runtime Doctor',
    '',
    `**Overall status:** ${report.overall_status ?? 'unknown'}`,
    `**Overall score:** ${report.overall_score ?? 0}`,
    `**Live mode:** ${report.live ? 'yes' : 'no'}`,
    `**Configured only:** ${report.configured_only ? 'yes' : 'no'}`,
    `**Connector count:** ${connectors.length}`,
    '',
    '## Connectors',
    '',
    '| Connector | Status | Score | Configured |',
    '|-----------|--------|-------|------------|',
  ];

  for (const connector of connectors) {
    lines.push(
      `| ${connector.id} | ${connector.readiness_status ?? 'unknown'} | ${connector.readiness_score ?? 0} | ${connector.configured ? 'yes' : 'no'} |`
    );
  }

  const failingChecks = connectors
    .flatMap((connector) =>
      Object.entries(connector.checks ?? {})
        .filter(([, check]) => check.status === 'fail')
        .map(([checkId, check]) => ({
          connectorId: connector.id,
          checkId,
          message: check.message ?? 'Check failed',
        }))
    )
    .slice(0, 8);

  if (failingChecks.length > 0) {
    lines.push('', '## Notable Failures', '');
    for (const failure of failingChecks) {
      lines.push(`- \`${failure.connectorId}.${failure.checkId}\`: ${failure.message}`);
    }
  }

  return lines.join('\n');
}

async function openMarkdownResultDocument(content: string): Promise<vscode.TextEditor> {
  return openTextResultDocument(content, 'markdown');
}

async function openJsonResultDocument(parsed: unknown): Promise<vscode.TextEditor> {
  const content = JSON.stringify(parsed, null, 2);
  return openTextResultDocument(content, 'json');
}

function buildDiagnosticsSnapshot(huntRoot: vscode.Uri): Record<string, unknown> {
  const files = vscode.languages
    .getDiagnostics()
    .flatMap(([uri, diagnostics]) => {
      const relativePath = path.relative(huntRoot.fsPath, uri.fsPath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return [];
      }

      const relevantDiagnostics = diagnostics
        .filter((diagnostic) => diagnostic.source === 'THRUNT Evidence')
        .map((diagnostic) => ({
          message: diagnostic.message,
          severity: vscode.DiagnosticSeverity[diagnostic.severity],
          source: diagnostic.source,
          range: {
            start: {
              line: diagnostic.range.start.line,
              character: diagnostic.range.start.character,
            },
            end: {
              line: diagnostic.range.end.line,
              character: diagnostic.range.end.character,
            },
          },
        }));

      if (relevantDiagnostics.length === 0) {
        return [];
      }

      return [
        {
          path: uri.fsPath,
          relativePath: relativePath.replace(/\\/g, '/'),
          diagnostics: relevantDiagnostics,
        },
      ];
    })
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return {
    totalCount: files.reduce(
      (count, file) => count + (file.diagnostics as Array<unknown>).length,
      0
    ),
    files,
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  const cliOutputChannel = vscode.window.createOutputChannel(CLI_OUTPUT_CHANNEL_NAME);
  const cliBridge = new CLIBridge(cliOutputChannel);
  const slaTimer = new SLATimerManager(context);
  let activeHuntRoot: vscode.Uri | undefined;
  let activeStore: HuntDataStore | undefined;
  context.subscriptions.push(outputChannel);
  context.subscriptions.push(cliOutputChannel);
  context.subscriptions.push(cliBridge);
  context.subscriptions.push(slaTimer);

  async function requireActiveStore(
    message: string
  ): Promise<HuntDataStore | undefined> {
    if (activeStore) {
      return activeStore;
    }

    await vscode.window.showWarningMessage(message);
    return undefined;
  }

  async function copyWarRoomText(text: string, confirmation: string): Promise<void> {
    await vscode.env.clipboard.writeText(text);
    await vscode.window.showInformationMessage(confirmation);
  }

  async function runStreamingCliCommand(
    args: string[],
    workspaceRoot: string,
    options?: {
      huntRoot?: vscode.Uri;
      phase?: number;
    }
  ): Promise<{ exitCode: number | null } | undefined> {
    let result: { exitCode: number | null };
    try {
      const cliPath = resolveThruntCliPath(context);
      result = await cliBridge.run({
        cliPath,
        command: args,
        cwd: workspaceRoot,
        huntRoot: options?.huntRoot,
        phase: options?.phase,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'THRUNT CLI execution failed.';
      const choice = await vscode.window.showErrorMessage(message, 'Show Output');
      if (choice === 'Show Output') {
        cliOutputChannel.show(true);
      }
      return undefined;
    }

    if (result.exitCode !== 0) {
      const choice = await vscode.window.showErrorMessage(
        `THRUNT CLI command failed${typeof result.exitCode === 'number' ? ` (exit ${result.exitCode})` : ''}. See ${CLI_OUTPUT_CHANNEL_NAME}.`,
        'Show Output'
      );
      if (choice === 'Show Output') {
        cliOutputChannel.show(true);
      }
      return result;
    }

    return result;
  }

  // Register the info command immediately (available even before hunt root detection)
  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.showInfo', () => {
      if (activeHuntRoot && activeStore) {
        const queries = activeStore.getQueries();
        const receipts = activeStore.getReceipts();
        void vscode.window.showInformationMessage(
          `THRUNT God: Hunt at ${activeHuntRoot.fsPath} ` +
          `(${queries.size} queries, ${receipts.size} receipts)`
        );
        return;
      }

      void vscode.window.showInformationMessage(
        'THRUNT God: Extension is active. Detecting hunt workspace...'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.copyWarRoomSummary', async () => {
      const store = await requireActiveStore(
        'Open a THRUNT hunt workspace before copying war room summaries.'
      );
      if (!store) {
        return undefined;
      }

      const formatter = new WarRoomFormatter(store);
      const defaultFormat = getDefaultWarRoomFormat();
      const options = [
        { label: 'Slack/Teams (Markdown)', format: 'markdown' as const },
        { label: 'Plain Text', format: 'plainText' as const },
        { label: 'MITRE ATT&CK Summary', format: 'attack' as const },
      ].sort((left, right) => {
        if (left.format === defaultFormat) return -1;
        if (right.format === defaultFormat) return 1;
        return left.label.localeCompare(right.label);
      });

      const selected = await vscode.window.showQuickPick(options, {
        title: 'Copy War Room Summary',
        placeHolder: 'Choose the output format',
        ignoreFocusOut: true,
      });
      if (!selected) {
        return undefined;
      }

      const output =
        selected.format === 'attack'
          ? formatter.formatAttackSummary()
          : formatter.formatHuntOverview();
      await copyWarRoomText(
        getClipboardText(output, selected.format),
        selected.format === 'attack'
          ? 'ATT&CK summary copied to clipboard.'
          : 'War room summary copied to clipboard.'
      );
      return output;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.copyAttackSummary', async () => {
      const store = await requireActiveStore(
        'Open a THRUNT hunt workspace before copying ATT&CK summaries.'
      );
      if (!store) {
        return undefined;
      }

      const output = new WarRoomFormatter(store).formatAttackSummary();
      await copyWarRoomText(
        getClipboardText(output, 'attack'),
        'ATT&CK summary copied to clipboard.'
      );
      return output;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.copyFindingSummary', async (target?: unknown) => {
      const store = await requireActiveStore(
        'Open a THRUNT hunt workspace before copying finding summaries.'
      );
      if (!store) {
        return undefined;
      }

      const receiptId = extractReceiptIdFromTarget(target) ?? getActiveEditorReceiptId();
      if (!receiptId) {
        await vscode.window.showWarningMessage(
          'Open a receipt artifact or select a receipt in the THRUNT sidebar to copy a finding summary.'
        );
        return undefined;
      }

      const receipt = store.getReceipt(receiptId);
      if (!receipt || receipt.status !== 'loaded') {
        await vscode.window.showWarningMessage(`Receipt ${receiptId} is not available in the current hunt store.`);
        return undefined;
      }

      const format = getDefaultWarRoomFormat() === 'attack' ? 'markdown' : getDefaultWarRoomFormat();
      const output = new WarRoomFormatter(store).formatFinding(receipt.data);
      await copyWarRoomText(
        getClipboardText(output, format),
        'Finding summary copied to clipboard.'
      );
      return output;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.copyHypothesisSummary', async (target?: unknown) => {
      const store = await requireActiveStore(
        'Open a THRUNT hunt workspace before copying hypothesis summaries.'
      );
      if (!store) {
        return undefined;
      }

      const hypothesisId = extractHypothesisIdFromTarget(target);
      if (!hypothesisId) {
        await vscode.window.showWarningMessage(
          'Select a hypothesis in the THRUNT sidebar to copy its summary.'
        );
        return undefined;
      }

      const formatter = new WarRoomFormatter(store);
      const hypothesis = formatter.getHypothesisById(hypothesisId);
      if (!hypothesis) {
        await vscode.window.showWarningMessage(`Hypothesis ${hypothesisId} is not available in the current hunt store.`);
        return undefined;
      }

      const format = getDefaultWarRoomFormat() === 'attack' ? 'markdown' : getDefaultWarRoomFormat();
      const output = formatter.formatHypothesis(hypothesis);
      await copyWarRoomText(
        getClipboardText(output, format),
        'Hypothesis summary copied to clipboard.'
      );
      return output;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.startSlaTimer', () => slaTimer.pickAndStart())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.pauseSlaTimer', () => slaTimer.pause())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.resumeSlaTimer', () => slaTimer.resume())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.stopSlaTimer', () => slaTimer.stop())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.advanceSlaPhase', () => slaTimer.advance())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.showSlaStatus', () => slaTimer.showStatus())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.copySlaStatus', () => slaTimer.copyStatus())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.runThruntCli', async (input?: unknown) => {
      const workspaceRoot = resolveWorkspaceRoot(activeHuntRoot);
      if (!workspaceRoot) {
        await vscode.window.showWarningMessage(
          'Open a folder containing .planning/MISSION.md or .hunt/MISSION.md to run THRUNT CLI commands.'
        );
        return undefined;
      }

      const args = await resolveCliArgs(context, input);
      if (!args || args.length === 0) {
        await vscode.window.showWarningMessage('Enter a THRUNT CLI command to run.');
        return undefined;
      }

      await context.workspaceState.update(LAST_CLI_COMMAND_KEY, formatCliArgs(args));
      return runStreamingCliCommand(args, workspaceRoot, {
        huntRoot: activeHuntRoot,
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.showStateJson', async () => {
      const workspaceRoot = resolveWorkspaceRoot(activeHuntRoot);
      if (!workspaceRoot) {
        await vscode.window.showWarningMessage(
          'Open a folder containing .planning/MISSION.md or .hunt/MISSION.md to inspect THRUNT state.'
        );
        return undefined;
      }

      const result = await runThruntCliCommand(
        context,
        cliOutputChannel,
        workspaceRoot,
        ['state', 'json']
      );
      if (!result?.parsed) {
        await vscode.window.showErrorMessage('THRUNT state command did not return JSON output.');
        return undefined;
      }

      await openJsonResultDocument(result.parsed);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.showProgressReport', async () => {
      const workspaceRoot = resolveWorkspaceRoot(activeHuntRoot);
      if (!workspaceRoot) {
        await vscode.window.showWarningMessage(
          'Open a folder containing .planning/MISSION.md or .hunt/MISSION.md to inspect THRUNT progress.'
        );
        return undefined;
      }

      const result = await runThruntCliCommand(
        context,
        cliOutputChannel,
        workspaceRoot,
        ['progress', 'table']
      );
      const rendered = readRenderedMarkdown(result?.parsed);
      if (!rendered) {
        await vscode.window.showErrorMessage('THRUNT progress command did not return markdown output.');
        return undefined;
      }

      await openMarkdownResultDocument(rendered);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.analyzeHuntmap', async () => {
      const workspaceRoot = resolveWorkspaceRoot(activeHuntRoot);
      if (!workspaceRoot) {
        await vscode.window.showWarningMessage(
          'Open a folder containing .planning/MISSION.md or .hunt/MISSION.md to analyze the THRUNT huntmap.'
        );
        return undefined;
      }

      const result = await runThruntCliCommand(
        context,
        cliOutputChannel,
        workspaceRoot,
        ['huntmap', 'analyze', '--raw']
      );
      if (!result?.parsed) {
        await vscode.window.showErrorMessage('THRUNT huntmap analysis did not return JSON output.');
        return undefined;
      }

      await openJsonResultDocument(result.parsed);
      return result;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.showRuntimeDoctor', async () => {
      const workspaceRoot = resolveWorkspaceRoot(activeHuntRoot);
      if (!workspaceRoot) {
        await vscode.window.showWarningMessage(
          'Open a folder containing .planning/MISSION.md or .hunt/MISSION.md to inspect THRUNT runtime readiness.'
        );
        return undefined;
      }

      const result = await runThruntCliCommand(
        context,
        cliOutputChannel,
        workspaceRoot,
        ['runtime', 'doctor', '--raw']
      );
      const rendered = renderRuntimeDoctorMarkdown(result?.parsed);
      if (!rendered) {
        await vscode.window.showErrorMessage('THRUNT runtime doctor did not return a renderable report.');
        return undefined;
      }

      await openMarkdownResultDocument(rendered);
      return result;
    })
  );

  // Default: no hunt detected (sidebar hidden until proven otherwise)
  vscode.commands.executeCommand('setContext', 'thruntGod.huntDetected', false);

  // Fire hunt root detection asynchronously (VS Code best practice: activate() returns void)
  findHuntRoot().then((huntRoot) => {
    if (!huntRoot) {
      outputChannel.appendLine(
        'THRUNT God activated but no hunt workspace detected. ' +
        'Looking for .hunt/MISSION.md or .planning/MISSION.md in workspace folders.'
      );
      return;
    }

    outputChannel.appendLine(`THRUNT God activated. Hunt root: ${huntRoot.fsPath}`);

    // --- Phase 8: Wire data layer ---

    // 1. Create ArtifactWatcher monitoring the hunt directory
    const watcher = new ArtifactWatcher(huntRoot);
    context.subscriptions.push(watcher);

    // 2. Create HuntDataStore wired to the watcher
    const store = new HuntDataStore(huntRoot, watcher, outputChannel);
    activeHuntRoot = huntRoot;
    activeStore = store;
    context.subscriptions.push(store);
    const iocRegistry = new IOCRegistry(store);
    const iocDecorations = new IOCDecorationManager(iocRegistry);
    context.subscriptions.push(iocRegistry);
    context.subscriptions.push(iocDecorations);

    // 3. Log store events for debugging
    context.subscriptions.push(
      store.onDidChange((event) => {
        outputChannel.appendLine(
          `[Store] ${event.type}: ${event.artifactType} ${event.id}`
        );
      })
    );

    const selectionCoordinator = new ArtifactSelectionCoordinator();
    context.subscriptions.push(selectionCoordinator);

    function resolveArtifactSelectionFromTarget(target: unknown):
      | { artifactId: string; artifactType: 'mission' | 'hypothesis' | 'query' | 'receipt' }
      | undefined {
      if (typeof target === 'string') {
        const artifactType = inferSelectableArtifactType(target);
        if (artifactType) {
          return { artifactId: target, artifactType };
        }
      }

      if (!target || typeof target !== 'object') {
        return undefined;
      }

      const candidate = target as Partial<HuntTreeItem> & {
        uri?: vscode.Uri;
      };

      if (candidate.nodeType === 'mission') {
        return { artifactId: 'MISSION', artifactType: 'mission' };
      }

      if (
        (candidate.nodeType === 'hypothesis' ||
          candidate.nodeType === 'query' ||
          candidate.nodeType === 'receipt') &&
        typeof candidate.dataId === 'string'
      ) {
        return {
          artifactId: candidate.dataId,
          artifactType: candidate.nodeType,
        };
      }

      if (candidate.uri?.fsPath) {
        const resolved = resolveArtifactType(candidate.uri.fsPath);
        const artifactType =
          resolved?.type === 'query' || resolved?.type === 'receipt'
            ? resolved.type
            : null;
        if (resolved && artifactType) {
          return {
            artifactId: resolved.id,
            artifactType,
          };
        }
      }

      return undefined;
    }

    function resolveQueryIdForTemplateViewer(target?: unknown): string | undefined {
      const selection = resolveArtifactSelectionFromTarget(target);
      if (!selection) {
        return extractQueryIdFromTarget(target) ?? getActiveEditorQueryId();
      }

      if (selection.artifactType === 'query') {
        return selection.artifactId;
      }

      if (selection.artifactType === 'receipt') {
        const receipt = store.getReceipt(selection.artifactId);
        return receipt?.status === 'loaded'
          ? receipt.data.relatedQueries[0]
          : undefined;
      }

      if (selection.artifactType === 'hypothesis') {
        const receipts = store.getReceiptsForHypothesis(selection.artifactId);
        for (const receipt of receipts) {
          if (receipt.status === 'loaded' && receipt.data.relatedQueries.length > 0) {
            return receipt.data.relatedQueries[0];
          }
        }
      }

      return getActiveEditorQueryId();
    }

    async function openArtifactById(artifactId: string): Promise<void> {
      const artifactPath = store.getArtifactPath(artifactId);
      if (!artifactPath) {
        return;
      }

      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(artifactPath));
      await vscode.window.showTextDocument(document);
    }

    async function showIocMatches(iocId: string): Promise<void> {
      const entry = iocRegistry.getEntry(iocId);
      if (!entry) {
        return;
      }

      if (entry.matchResults.length === 0) {
        await vscode.window.showInformationMessage(
          `IOC ${entry.value} has no matches in currently loaded artifacts.`
        );
        return;
      }

      const items = entry.matchResults.map((match) => ({
        label: `${match.artifactType === 'query' ? 'Query' : 'Receipt'} ${match.artifactId}`,
        description: match.templateId ? `Template ${match.templateId}` : undefined,
        detail: match.matchContext,
        match,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        title: `IOC Matches: ${entry.value}`,
        placeHolder: 'Choose an artifact to open',
        ignoreFocusOut: true,
      });
      if (!selected) {
        return;
      }

      const selection = {
        artifactId: selected.match.artifactId,
        artifactType: selected.match.artifactType,
        source: 'command' as const,
      };
      selectionCoordinator.select(selection);
      await openArtifactById(selected.match.artifactId);

      if (selected.match.artifactType === 'query' && selected.match.templateId) {
        DrainTemplatePanel.currentPanel?.reveal(selected.match.artifactId, false);
      }
    }

    async function promptForIoc(initialValue?: string): Promise<string | undefined> {
      const entered = await vscode.window.showInputBox({
        title: 'Add IOC to Investigation',
        prompt: 'Paste an IP address, domain, hash, email, or URL',
        placeHolder: '185.220.101.42 or evil.example.com or d41d8cd98f00...',
        value: initialValue,
        ignoreFocusOut: true,
        validateInput: validateIOC,
      });

      return entered?.trim() || undefined;
    }

    async function resolvePhaseCommandArgs(
      phaseNumber: number,
      phaseName: string
    ): Promise<string[] | undefined> {
      const configuration = vscode.workspace.getConfiguration('thruntGod');
      const template = configuration.get<string>(
        'cli.phaseCommandTemplate',
        DEFAULT_PHASE_COMMAND_TEMPLATE
      );
      let packId = configuration.get<string>('cli.defaultPackId', '').trim();

      if (template.includes('{packId}') && !packId) {
        packId =
          (await vscode.window.showInputBox({
            title: `Pack ID for Phase ${phaseNumber}`,
            prompt: 'Provide the THRUNT pack ID used to execute this hunt phase',
            placeHolder: 'domain.identity-abuse',
            ignoreFocusOut: true,
          }))?.trim() ?? '';
      }

      const suggested = fillPhaseCommandTemplate(template, {
        phase: String(phaseNumber),
        phaseName,
        phaseNameSlug: slugifyPhaseName(phaseName),
        packId,
      }).trim();

      const entered = await vscode.window.showInputBox({
        title: `Run Phase ${phaseNumber}: ${phaseName}`,
        prompt: 'Review or edit the THRUNT CLI arguments before execution',
        placeHolder: suggested || DEFAULT_PHASE_COMMAND_TEMPLATE,
        value: context.workspaceState.get<string>(LAST_PHASE_COMMAND_KEY, suggested),
        ignoreFocusOut: true,
      });

      if (entered === undefined) {
        return undefined;
      }

      const args = parseCliInput(entered);
      if (args.length > 0) {
        await context.workspaceState.update(LAST_PHASE_COMMAND_KEY, entered);
      }
      return args;
    }

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.addIoc', async () => {
        const value = await promptForIoc();
        if (!value) {
          return undefined;
        }

        const { entry, duplicate } = iocRegistry.add(value);
        const queryMatches = new Set(
          entry.matchResults
            .filter((match) => match.artifactType === 'query')
            .map((match) => match.artifactId)
        ).size;
        const receiptMatches = new Set(
          entry.matchResults
            .filter((match) => match.artifactType === 'receipt')
            .map((match) => match.artifactId)
        ).size;

        const label = `${entry.value} (${formatIOCTypeLabel(entry.type)})`;
        const action = entry.matchResults.length > 0 ? 'Show Matches' : undefined;
        const choice = await vscode.window.showInformationMessage(
          duplicate
            ? `IOC already tracked: ${label}.`
            : queryMatches + receiptMatches > 0
              ? `IOC added: ${label} -- found in ${queryMatches} queries, ${receiptMatches} receipts.`
              : `IOC added: ${label}. No matches found in loaded artifacts.`,
          ...(action ? [action] : [])
        );

        if (choice === 'Show Matches') {
          await showIocMatches(entry.id);
        }
        return entry;
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.listIocs', async () => {
        const items = iocRegistry.list().map((entry) => ({
          label: entry.value,
          description: formatIOCTypeLabel(entry.type),
          detail: `${entry.matchResults.length} match groups`,
          entryId: entry.id,
        }));

        if (items.length === 0) {
          await vscode.window.showInformationMessage('No active IOCs in this session.');
          return undefined;
        }

        const selected = await vscode.window.showQuickPick(items, {
          title: 'Active IOCs',
          placeHolder: 'Choose an IOC to inspect its matches',
          ignoreFocusOut: true,
        });
        if (!selected) {
          return undefined;
        }

        await showIocMatches(selected.entryId);
        return selected.entryId;
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.removeIoc', async () => {
        const items = iocRegistry.list().map((entry) => ({
          label: entry.value,
          description: formatIOCTypeLabel(entry.type),
          entryId: entry.id,
        }));

        if (items.length === 0) {
          await vscode.window.showInformationMessage('No active IOCs to remove.');
          return undefined;
        }

        const selected = await vscode.window.showQuickPick(items, {
          title: 'Remove IOC',
          placeHolder: 'Choose the IOC to remove',
          ignoreFocusOut: true,
        });
        if (!selected) {
          return undefined;
        }

        iocRegistry.remove(selected.entryId);
        await vscode.window.showInformationMessage(`Removed IOC: ${selected.label}`);
        return selected.entryId;
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.clearIocs', async () => {
        iocRegistry.clear();
        await vscode.window.showInformationMessage('Cleared all active IOCs.');
        return true;
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.runHuntPhase', async (target?: unknown) => {
        const workspaceRoot = resolveWorkspaceRoot(huntRoot);
        const hunt = store.getHunt();
        if (!workspaceRoot || !hunt || hunt.huntMap.status !== 'loaded') {
          await vscode.window.showWarningMessage(
            'Open a THRUNT hunt workspace with a parsed HUNTMAP.md before running phases.'
          );
          return undefined;
        }

        const requestedPhase = extractPhaseNumberFromTarget(target);
        const selectablePhases = hunt.huntMap.data.phases.filter(
          (phase) => phase.status !== 'complete'
        );

        let selectedPhase = selectablePhases.find((phase) => phase.number === requestedPhase);
        if (!selectedPhase) {
          const picked = await vscode.window.showQuickPick(
            hunt.huntMap.data.phases.map((phase) => ({
              label: `Phase ${phase.number}: ${phase.name}`,
              description: `[${phase.status}]`,
              phase,
            })),
            {
              title: 'Run Hunt Phase',
              placeHolder: 'Choose a phase to execute',
              ignoreFocusOut: true,
            }
          );
          selectedPhase = picked?.phase;
        }

        if (!selectedPhase) {
          return undefined;
        }

        const args = await resolvePhaseCommandArgs(selectedPhase.number, selectedPhase.name);
        if (!args || args.length === 0) {
          return undefined;
        }

        const confirmation = await vscode.window.showWarningMessage(
          `Run Phase ${selectedPhase.number}: ${selectedPhase.name}?`,
          { modal: true },
          'Run'
        );
        if (confirmation !== 'Run') {
          return undefined;
        }

        const result = await runStreamingCliCommand(args, workspaceRoot, {
          huntRoot,
          phase: selectedPhase.number,
        });
        if (result?.exitCode === 0) {
          const choice = await vscode.window.showInformationMessage(
            `Phase ${selectedPhase.number} execution finished.`,
            'Show Output'
          );
          if (choice === 'Show Output') {
            cliOutputChannel.show(true);
          }
        }
        return result;
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.rerunLastPhase', async () => {
        const workspaceRoot = resolveWorkspaceRoot(huntRoot);
        if (!workspaceRoot) {
          await vscode.window.showWarningMessage(
            'Open a THRUNT hunt workspace before re-running a phase.'
          );
          return undefined;
        }

        const stored = context.workspaceState.get<string>(LAST_PHASE_COMMAND_KEY);
        if (!stored) {
          await vscode.window.showInformationMessage('No hunt phase command has been run yet.');
          return undefined;
        }

        return runStreamingCliCommand(parseCliInput(stored), workspaceRoot, {
          huntRoot,
        });
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.cancelCliCommand', () => {
        cliBridge.cancel();
      })
    );

    context.subscriptions.push(
      selectionCoordinator.onDidChange((selection) => {
        HuntOverviewPanel.currentPanel?.focusArtifact(selection.artifactId);
        EvidenceBoardPanel.currentPanel?.focusArtifact(selection.artifactId);
        QueryAnalysisPanel.currentPanel?.focusArtifact(selection.artifactId);
        DrainTemplatePanel.currentPanel?.focusArtifact(selection.artifactId);
      })
    );

    // --- Phase 9: Sidebar tree view ---
    vscode.commands.executeCommand('setContext', 'thruntGod.huntDetected', true);

    const treeProvider = new HuntTreeDataProvider(store, huntRoot, {
      iocRegistry,
      cliBridge,
    });
    context.subscriptions.push(treeProvider);
    const treeView = vscode.window.createTreeView('thruntGod.huntTree', {
      treeDataProvider: treeProvider,
    });
    context.subscriptions.push(treeView);
    context.subscriptions.push(
      treeView.onDidChangeSelection((event) => {
        const item = event.selection[0];
        const selection = resolveArtifactSelectionFromTarget(item);
        if (selection) {
          selectionCoordinator.select({
            ...selection,
            source: 'sidebar',
          });
        }
      })
    );

    // Sidebar commands
    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.openArtifact', (item: HuntTreeItem) => {
        const selection = resolveArtifactSelectionFromTarget(item);
        if (selection) {
          selectionCoordinator.select({
            ...selection,
            source: 'sidebar',
          });
        }
        if (item?.artifactPath) {
          vscode.window.showTextDocument(vscode.Uri.file(item.artifactPath));
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.revealInExplorer', (item: HuntTreeItem) => {
        if (item?.artifactPath) {
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(item.artifactPath));
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.copyPath', (item: HuntTreeItem) => {
        if (item?.artifactPath) {
          vscode.env.clipboard.writeText(item.artifactPath);
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.openTemplateViewer', async (target?: unknown) => {
        const queryId = resolveQueryIdForTemplateViewer(target);
        if (!queryId) {
          await vscode.window.showWarningMessage(
            'Open a query artifact or select a query in the THRUNT God sidebar to use the Drain Template Viewer.'
          );
          return;
        }

        DrainTemplatePanel.createOrShow(
          context,
          store,
          selectionCoordinator,
          iocRegistry,
          queryId
        );
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.showInEvidenceBoard', (target?: unknown) => {
        const panel = EvidenceBoardPanel.createOrShow(
          context,
          store,
          selectionCoordinator
        );
        const selection =
          resolveArtifactSelectionFromTarget(target) ??
          (() => {
            const activeQueryId = extractQueryIdFromTarget(target) ?? getActiveEditorQueryId();
            if (!activeQueryId) {
              return undefined;
            }

            return {
              artifactId: activeQueryId,
              artifactType: 'query' as const,
            };
          })();

        if (selection) {
          panel.focusArtifact(selection.artifactId);
          selectionCoordinator.select({
            ...selection,
            source: 'command',
          });
        }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.refreshSidebar', () => {
        treeProvider.refresh();
      })
    );

    // --- Phase 9: Status bar ---
    const statusBar = new HuntStatusBar(store);
    context.subscriptions.push(statusBar);

    // --- Phase 9: CodeLens ---
    const codeLensProvider = new HuntCodeLensProvider(store);
    context.subscriptions.push(codeLensProvider);

    // Register for .md files only
    const mdSelector: vscode.DocumentSelector = { language: 'markdown', scheme: 'file' };
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(mdSelector, codeLensProvider)
    );

    // --- Phase 10: Evidence integrity diagnostics ---
    const diagnostics = new EvidenceIntegrityDiagnostics(store);
    context.subscriptions.push(diagnostics);
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(mdSelector, diagnostics, {
        providedCodeActionKinds: EvidenceIntegrityDiagnostics.providedCodeActionKinds,
      })
    );

    // --- Phase 13: Hunt Overview Dashboard ---
    let sessionDiff: SessionDiff | null = null;

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.openHuntOverview', () => {
        HuntOverviewPanel.createOrShow(
          context,
          store,
          sessionDiff,
          selectionCoordinator
        );
      })
    );

    // Session diff and "what changed" toast
    store.initialScanComplete().then(() => {
      const previousHashes = context.workspaceState.get<Record<string, string>>(SESSION_HASH_KEY, {});
      const currentHashes = computeArtifactHashes(store);
      const diff = computeSessionDiff(previousHashes, currentHashes);
      sessionDiff = diff.entries.length > 0 ? diff : null;

      if (sessionDiff) {
        vscode.window.showInformationMessage(
          `THRUNT: ${sessionDiff.summary}`,
          'Open Dashboard'
        ).then((choice) => {
          if (choice === 'Open Dashboard') {
            HuntOverviewPanel.createOrShow(
              context,
              store,
              sessionDiff,
              selectionCoordinator
            );
          }
        });
      }
    });

    // Store artifact hashes for session diff on next activation
    context.subscriptions.push({
      dispose() {
        const hashes = computeArtifactHashes(store);
        context.workspaceState.update(SESSION_HASH_KEY, hashes);
      },
    });

    // --- Phase 14: Evidence Board ---
    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.openEvidenceBoard', () => {
        EvidenceBoardPanel.createOrShow(
          context,
          store,
          selectionCoordinator
        );
      })
    );

    // --- Phase 15: Query Analysis ---
    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.openQueryAnalysis', () => {
        QueryAnalysisPanel.createOrShow(
          context,
          store,
          selectionCoordinator
        );
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.openReceiptInspector', (receiptId?: string) => {
        if (typeof receiptId === 'string') {
          selectionCoordinator.select({
            artifactId: receiptId,
            artifactType: 'receipt',
            source: 'command',
          });
        }
        QueryAnalysisPanel.createOrShow(
          context,
          store,
          selectionCoordinator,
          typeof receiptId === 'string' ? receiptId : undefined
        );
      })
    );

    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(DRAIN_VIEWER_VIEW_TYPE, {
        async deserializeWebviewPanel(panel, state) {
          const revivedState = state as { queryId?: unknown } | undefined;
          const queryId =
            typeof revivedState?.queryId === 'string'
              ? revivedState.queryId
              : [...store.getQueries().keys()].sort((left, right) =>
                  left.localeCompare(right)
                )[0];
          if (!queryId) {
            return;
          }

          DrainTemplatePanel.revive(
            context,
            store,
            panel,
            selectionCoordinator,
            iocRegistry,
            queryId
          );
        },
      })
    );

    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(HUNT_OVERVIEW_VIEW_TYPE, {
        async deserializeWebviewPanel(panel) {
          HuntOverviewPanel.revive(
            context,
            store,
            panel,
            sessionDiff,
            selectionCoordinator
          );
        },
      })
    );

    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(EVIDENCE_BOARD_VIEW_TYPE, {
        async deserializeWebviewPanel(panel) {
          EvidenceBoardPanel.revive(
            context,
            store,
            panel,
            selectionCoordinator
          );
        },
      })
    );

    context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(QUERY_ANALYSIS_VIEW_TYPE, {
        async deserializeWebviewPanel(panel) {
          QueryAnalysisPanel.revive(
            context,
            store,
            panel,
            selectionCoordinator
          );
        },
      })
    );

    // CodeLens navigation command
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'thrunt-god.scrollToSection',
        async (uri: vscode.Uri, lineNumber: number) => {
          const doc = await vscode.workspace.openTextDocument(uri);
          const editor = await vscode.window.showTextDocument(doc);
          const range = new vscode.Range(lineNumber, 0, lineNumber, 0);
          editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
          editor.selection = new vscode.Selection(range.start, range.start);
        }
      )
    );

    if (isE2EMode()) {
      const workspaceRoot =
        vscode.workspace.getWorkspaceFolder(huntRoot)?.uri.fsPath ?? path.dirname(huntRoot.fsPath);

      context.subscriptions.push(
        vscode.commands.registerCommand('thrunt-god.test.snapshotStore', async () => {
          await store.initialScanComplete();
          return buildStoreSnapshot(store, huntRoot);
        })
      );

      context.subscriptions.push(
        vscode.commands.registerCommand('thrunt-god.test.snapshotTree', async () => {
          await store.initialScanComplete();
          return {
            huntRoot: huntRoot.fsPath,
            tree: await buildTreeSnapshot(treeProvider),
          };
        })
      );

      context.subscriptions.push(
        vscode.commands.registerCommand('thrunt-god.test.snapshotDiagnostics', async () => {
          await store.initialScanComplete();
          return buildDiagnosticsSnapshot(huntRoot);
        })
      );

      context.subscriptions.push(
        vscode.commands.registerCommand('thrunt-god.test.snapshotViewer', async () => {
          await store.initialScanComplete();
          return DrainTemplatePanel.currentPanel?.snapshot() ?? null;
        })
      );

      context.subscriptions.push(
        vscode.commands.registerCommand(
          'thrunt-god.test.runThruntCli',
          async (args: unknown) => {
            if (!Array.isArray(args) || !args.every((value) => typeof value === 'string')) {
              throw new Error('thrunt-god.test.runThruntCli expects an array of string args');
            }

            await store.initialScanComplete();
            return runThruntCli(context, workspaceRoot, args);
          }
        )
      );
    }

    outputChannel.appendLine(
      'THRUNT God data layer initialized. Watching for artifact changes...'
    );
  });
}

export function deactivate(): void {
  // Cleanup will be added as subsystems are registered
}

// Re-export parsers, store, and watcher for test access via the built bundle
export { parseArtifact, parseMission, parseHypotheses, parseHuntMap, parseState, parseQuery, parseReceipt, parseEvidenceReview, parsePhaseSummary } from './parsers/index';
export { extractFrontmatter, extractBody, extractMarkdownSections } from './parsers/base';
export { HuntDataStore } from './store';
export { ArtifactWatcher, resolveArtifactType } from './watcher';
export { HuntTreeDataProvider, HuntTreeItem } from './sidebar';
export { HuntStatusBar } from './statusBar';
export { HuntCodeLensProvider } from './codeLens';
export { EvidenceIntegrityDiagnostics } from './diagnostics';
export {
  CLIBridge,
  parseStructuredCliLine,
  mapCliDiagnostics,
} from './cliBridge';
export {
  IOCRegistry,
  classifyIOC,
  buildIOCRegExp,
  findIOCMatchesInText,
  formatIOCTypeLabel,
  normalizeIOCValue,
  validateIOC,
} from './iocRegistry';
export { IOCDecorationManager } from './iocDecorations';
export {
  SLATimerManager,
  SLA_TIMER_STATE_KEY,
  formatSlaDuration,
  getRemainingMs,
  resolveSlaVisualState,
  summarizeSlaStatus,
} from './slaTimer';
export {
  WarRoomFormatter,
  getClipboardText,
} from './warRoomCopy';
export {
  DRAIN_VIEWER_PIN_KEY,
  DRAIN_VIEWER_VIEW_TYPE,
  DrainTemplatePanel,
  buildDrainViewerViewModel,
  createDrainViewerHtml,
  deterministicTemplateColor,
  readDrainViewerPins,
  togglePinnedTemplate,
} from './drainViewer';
export {
  HuntOverviewPanel,
  HUNT_OVERVIEW_VIEW_TYPE,
  SESSION_HASH_KEY,
  computeArtifactHashes,
  computeSessionDiff,
  getDiagnosticsHealth,
} from './huntOverviewPanel';
export {
  EvidenceBoardPanel,
  EVIDENCE_BOARD_VIEW_TYPE,
} from './evidenceBoardPanel';
export {
  QueryAnalysisPanel,
  QUERY_ANALYSIS_VIEW_TYPE,
} from './queryAnalysisPanel';
