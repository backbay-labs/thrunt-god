import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { HUNT_MARKERS, OUTPUT_CHANNEL_NAME } from './constants';
import { ArtifactWatcher } from './watcher';
import { HuntDataStore } from './store';
import { HuntTreeDataProvider, HuntTreeItem } from './sidebar';
import { AutomationTreeDataProvider } from './automationSidebar';
import { HuntStatusBar } from './statusBar';
import { HuntCodeLensProvider } from './codeLens';
import { EvidenceIntegrityDiagnostics } from './diagnostics';
import { CLIBridge, type CLIRunRequest } from './cliBridge';
import { DrainTemplatePanel, DTV_STATE_KEY, DRAIN_VIEWER_VIEW_TYPE } from './drainViewer';
import { IOCDecorationManager } from './iocDecorations';
import {
  IOCRegistry,
  formatIOCTypeLabel,
  validateIOC,
} from './iocRegistry';
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
import { EvidenceBoardPanel, EVIDENCE_BOARD_VIEW_TYPE } from './evidenceBoardPanel';
import { QueryAnalysisPanel, QUERY_ANALYSIS_VIEW_TYPE } from './queryAnalysisPanel';
import { ProgramDashboardPanel, PROGRAM_DASHBOARD_VIEW_TYPE } from './programDashboardPanel';
import type { SessionDiff } from '../shared/hunt-overview';
import { resolveArtifactType } from './watcher';

const CLI_OUTPUT_CHANNEL_NAME = `${OUTPUT_CHANNEL_NAME} CLI`;
const LAST_CLI_COMMAND_KEY = 'thruntGod.lastCliCommand';
const LAST_PHASE_COMMAND_KEY = 'thruntGod.lastPhaseCommand';
const HAS_RUNNABLE_PHASES_CONTEXT = 'thruntGod.hasRunnablePhases';
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

function getActiveEditorReceiptId(): string | undefined {
  const activeDocument = vscode.window.activeTextEditor?.document;
  if (!activeDocument) {
    return undefined;
  }

  const resolved = resolveArtifactType(activeDocument.uri.fsPath);
  return resolved?.type === 'receipt' ? resolved.id : undefined;
}

function isE2EMode(): boolean {
  return process.env.THRUNT_E2E === '1';
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

function canEscapeCliCharacter(
  next: string | undefined,
  quote: '"' | '\'' | null
): boolean {
  if (!next || quote === '\'') {
    return false;
  }

  if (quote === '"') {
    return next === '"' || next === '\\';
  }

  return /\s/.test(next) || next === '"' || next === '\'' || next === '\\';
}

function parseCliInput(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | '\'' | null = null;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (char === '\\') {
      const next = input[index + 1];
      if (canEscapeCliCharacter(next, quote)) {
        current += next;
        index += 1;
      } else {
        current += '\\';
      }
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

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function templateUsesPlaceholder(template: string, key: string): boolean {
  return new RegExp(`\\{${key}\\}`, 'g').test(template);
}

function resolvePhaseCommandTemplate(
  template: string,
  values: Record<string, string>
): { commandString: string; args: string[] } {
  const packId = values.packId?.trim() ?? '';
  if (templateUsesPlaceholder(template, 'packId') && packId.length === 0) {
    throw new Error(
      'Run Hunt Phase requires `thruntGod.cli.defaultPackId` when the phase command template uses {packId}.'
    );
  }

  const commandString = fillPhaseCommandTemplate(template, {
    ...values,
    packId,
  }).trim();
  const args = parseCliInput(commandString);

  if (args.length === 0) {
    throw new Error('Run Hunt Phase command template resolved to an empty command.');
  }

  return {
    commandString,
    args,
  };
}

function isPhaseComplete(status: string | undefined): boolean {
  return (status ?? '').trim().toLowerCase() === 'complete';
}

function updateRunnablePhaseContext(store?: HuntDataStore | null): void {
  const hunt = store?.getHunt();
  const hasRunnablePhases = Boolean(
    hunt &&
      hunt.huntMap.status === 'loaded' &&
      hunt.huntMap.data.phases.some((phase) => !isPhaseComplete(phase.status))
  );

  void vscode.commands.executeCommand(
    'setContext',
    HAS_RUNNABLE_PHASES_CONTEXT,
    hasRunnablePhases
  );
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

function resolvePlanningDirName(huntRoot?: vscode.Uri): string | undefined {
  if (!huntRoot) {
    return undefined;
  }

  const dirName = path.basename(huntRoot.fsPath);
  return dirName === '.hunt' || dirName === '.planning' ? dirName : undefined;
}

function buildThruntCliEnv(huntRoot?: vscode.Uri): NodeJS.ProcessEnv {
  const planningDirName = resolvePlanningDirName(huntRoot);
  if (!planningDirName) {
    return process.env;
  }

  return {
    ...process.env,
    THRUNT_PLANNING_DIR: planningDirName,
  };
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
    path.resolve(
      context.extensionUri.fsPath,
      '..',
      '..',
      'thrunt-god',
      'bin',
      'thrunt-tools.cjs'
    ),
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
  args: string[],
  huntRoot?: vscode.Uri
): Promise<Record<string, unknown>> {
  const cliPath = resolveThruntCliPath(context);
  const commandArgs = [cliPath, ...args, '--cwd', workspaceRoot];
  const { stdout, stderr } = await execFileAsync(process.execPath, commandArgs, {
    cwd: workspaceRoot,
    env: buildThruntCliEnv(huntRoot),
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
  input?: unknown,
  huntRoot?: vscode.Uri
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
  const result = await runThruntCli(context, workspaceRoot, args, huntRoot);
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
  let activeIocRegistry: IOCRegistry | undefined;
  context.subscriptions.push(outputChannel);
  context.subscriptions.push(cliOutputChannel);
  context.subscriptions.push(cliBridge);
  context.subscriptions.push(slaTimer);

  async function copyWarRoomText(text: string, confirmation: string): Promise<void> {
    await vscode.env.clipboard.writeText(text);
    await vscode.window.showInformationMessage(confirmation);
  }

  async function runStreamingCliCommand(
    request: Omit<CLIRunRequest, 'cliPath'>
  ): Promise<{ exitCode: number | null } | undefined> {
    try {
      return await cliBridge.run({
        ...request,
        cliPath: resolveThruntCliPath(context),
        env: buildThruntCliEnv(request.huntRoot),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'THRUNT CLI execution failed.';
      const choice = await vscode.window.showErrorMessage(message, 'Show Output');
      if (choice === 'Show Output') {
        cliOutputChannel.show(true);
      }
      return undefined;
    }
  }

  let resolveStore: ((store: HuntDataStore) => void) | undefined;
  const storeReady = new Promise<HuntDataStore>((resolve) => {
    resolveStore = resolve;
  });
  function waitForStore(): Promise<HuntDataStore> {
    return storeReady;
  }
  let deferredSessionDiff: SessionDiff | null = null;

  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(HUNT_OVERVIEW_VIEW_TYPE, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown) {
        const store = await waitForStore();
        HuntOverviewPanel.restorePanel(context, store, panel, deferredSessionDiff);
      },
    })
  );
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(EVIDENCE_BOARD_VIEW_TYPE, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown) {
        const store = await waitForStore();
        EvidenceBoardPanel.restorePanel(context, store, panel);
      },
    })
  );
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(QUERY_ANALYSIS_VIEW_TYPE, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown) {
        const store = await waitForStore();
        QueryAnalysisPanel.restorePanel(context, store, panel);
      },
    })
  );
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(DRAIN_VIEWER_VIEW_TYPE, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown) {
        const store = await waitForStore();
        const persisted = context.workspaceState.get<{ queryId: string }>(DTV_STATE_KEY);
        const queryId = persisted?.queryId ?? '';
        if (queryId) {
          DrainTemplatePanel.restorePanel(
            context,
            store,
            panel,
            activeIocRegistry,
            queryId
          );
        } else {
          panel.dispose();
        }
      },
    })
  );
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(PROGRAM_DASHBOARD_VIEW_TYPE, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: unknown) {
        const store = await waitForStore();
        ProgramDashboardPanel.restorePanel(context, store, panel);
      },
    })
  );

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
    vscode.commands.registerCommand('thrunt-god.runThruntCli', async (input?: unknown) => {
      const workspaceRoot = resolveWorkspaceRoot(activeHuntRoot);
      if (!workspaceRoot) {
        await vscode.window.showWarningMessage(
          'Open a folder containing .planning/MISSION.md or .hunt/MISSION.md to run THRUNT CLI commands.'
        );
        return undefined;
      }

      return runThruntCliCommand(
        context,
        cliOutputChannel,
        workspaceRoot,
        input,
        activeHuntRoot
      );
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
        ['state', 'json'],
        activeHuntRoot
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
        ['progress', 'table'],
        activeHuntRoot
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
        ['huntmap', 'analyze', '--raw'],
        activeHuntRoot
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
        ['runtime', 'doctor', '--raw'],
        activeHuntRoot
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

  vscode.commands.executeCommand('setContext', 'thruntGod.huntDetected', false);
  updateRunnablePhaseContext(null);

  findHuntRoot().then((huntRoot) => {
    if (!huntRoot) {
      outputChannel.appendLine(
        'THRUNT God activated but no hunt workspace detected. ' +
        'Looking for .hunt/MISSION.md or .planning/MISSION.md in workspace folders.'
      );
      return;
    }

    outputChannel.appendLine(`THRUNT God activated. Hunt root: ${huntRoot.fsPath}`);

    const watcher = new ArtifactWatcher(huntRoot);
    context.subscriptions.push(watcher);

    const store = new HuntDataStore(huntRoot, watcher, outputChannel);
    activeHuntRoot = huntRoot;
    activeStore = store;
    context.subscriptions.push(store);

    const iocRegistry = new IOCRegistry(store);
    const iocDecorations = new IOCDecorationManager(iocRegistry);
    activeIocRegistry = iocRegistry;
    context.subscriptions.push(iocRegistry);
    context.subscriptions.push(iocDecorations);

    resolveStore?.(store);

    context.subscriptions.push(
      store.onDidChange((event) => {
        outputChannel.appendLine(
          `[Store] ${event.type}: ${event.artifactType} ${event.id}`
        );
        updateRunnablePhaseContext(store);
      })
    );

    void store.initialScanComplete().then(() => {
      updateRunnablePhaseContext(store);
    });

    vscode.commands.executeCommand('setContext', 'thruntGod.huntDetected', true);

    const treeProvider = new HuntTreeDataProvider(store, huntRoot, {
      iocRegistry,
      cliBridge,
    });
    context.subscriptions.push(treeProvider);
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider('thruntGod.huntTree', treeProvider)
    );

    // Automation sidebar tree
    const automationProvider = new AutomationTreeDataProvider();
    context.subscriptions.push(automationProvider);
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider('thruntGod.automationTree', automationProvider)
    );

    // Watch .planning/runbooks/ for YAML runbook files
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const runbookPattern = new vscode.RelativePattern(
        workspaceFolder,
        '.planning/runbooks/*.{yaml,yml}'
      );
      const runbookWatcher = vscode.workspace.createFileSystemWatcher(
        runbookPattern,
        false,
        false,
        false
      );

      const updateRunbookCount = async () => {
        try {
          const files = await vscode.workspace.findFiles(runbookPattern);
          automationProvider.setRunbookCount(files.length);
        } catch {
          automationProvider.setRunbookCount(0);
        }
      };

      runbookWatcher.onDidCreate(() => updateRunbookCount());
      runbookWatcher.onDidDelete(() => updateRunbookCount());
      runbookWatcher.onDidChange(() => updateRunbookCount());
      context.subscriptions.push(runbookWatcher);

      // Initial count on activation
      void updateRunbookCount();
    }

    // Sidebar commands
    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.openArtifact', (item: HuntTreeItem) => {
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
      vscode.commands.registerCommand('thrunt-god.copyWarRoomSummary', async () => {
        const formatter = new WarRoomFormatter(store);
        const format = getDefaultWarRoomFormat();
        const output =
          format === 'attack'
            ? formatter.formatAttackSummary()
            : formatter.formatHuntOverview();

        await copyWarRoomText(
          getClipboardText(output, format),
          format === 'attack'
            ? 'ATT&CK summary copied to clipboard.'
            : 'War room summary copied to clipboard.'
        );
        return output;
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.copyAttackSummary', async () => {
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
        const receiptId = extractReceiptIdFromTarget(target) ?? getActiveEditorReceiptId();
        if (!receiptId) {
          await vscode.window.showWarningMessage(
            'Open a receipt artifact or select a receipt in the THRUNT sidebar to copy a finding summary.'
          );
          return undefined;
        }

        const receipt = store.getReceipt(receiptId);
        if (!receipt || receipt.status !== 'loaded') {
          await vscode.window.showWarningMessage(
            `Receipt ${receiptId} is not available in the current hunt store.`
          );
          return undefined;
        }

        const format = getDefaultWarRoomFormat();
        const clipboardFormat: WarRoomFormat =
          format === 'attack' ? 'markdown' : format;
        const output = new WarRoomFormatter(store).formatFinding(receipt.data);
        await copyWarRoomText(
          getClipboardText(output, clipboardFormat),
          'Finding summary copied to clipboard.'
        );
        return output;
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.copyHypothesisSummary', async (target?: unknown) => {
        const hypothesisId = extractHypothesisIdFromTarget(target);
        if (!hypothesisId) {
          await vscode.window.showWarningMessage(
            'Select a hypothesis in the THRUNT sidebar to copy a hypothesis summary.'
          );
          return undefined;
        }

        const hunt = store.getHunt();
        if (!hunt || hunt.hypotheses.status !== 'loaded') {
          await vscode.window.showWarningMessage(
            'Hypothesis data is not available in the current hunt store.'
          );
          return undefined;
        }

        const hypothesis = [
          ...hunt.hypotheses.data.active,
          ...hunt.hypotheses.data.parked,
          ...hunt.hypotheses.data.disproved,
        ].find((candidate) => candidate.id === hypothesisId);

        if (!hypothesis) {
          await vscode.window.showWarningMessage(
            `Hypothesis ${hypothesisId} is not available in the current hunt store.`
          );
          return undefined;
        }

        const format = getDefaultWarRoomFormat();
        const clipboardFormat: WarRoomFormat =
          format === 'attack' ? 'markdown' : format;
        const output = new WarRoomFormatter(store).formatHypothesis(hypothesis);
        await copyWarRoomText(
          getClipboardText(output, clipboardFormat),
          'Hypothesis summary copied to clipboard.'
        );
        return output;
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.startSlaTimer', async () => {
        await slaTimer.pickAndStart();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.pauseSlaTimer', async () => {
        await slaTimer.pause();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.resumeSlaTimer', async () => {
        await slaTimer.resume();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.stopSlaTimer', async () => {
        await slaTimer.stop();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.advanceSlaPhase', async () => {
        await slaTimer.advance();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.showSlaStatus', async () => {
        return slaTimer.showStatus();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.copySlaStatus', async () => {
        return slaTimer.copyStatus('plainText');
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.addIoc', async () => {
        const activeSelection = vscode.window.activeTextEditor?.document.getText(
          vscode.window.activeTextEditor.selection
        );
        const initialValue = activeSelection?.trim() ?? '';
        const entered = await vscode.window.showInputBox({
          title: 'Add IOC',
          prompt: 'Paste an IOC value to track across queries and receipts',
          value: initialValue,
          ignoreFocusOut: true,
          validateInput: validateIOC,
        });
        if (!entered) {
          return undefined;
        }

        const { entry, duplicate } = iocRegistry.add(entered);
        await vscode.window.showInformationMessage(
          duplicate
            ? `IOC already tracked: ${entry.value} (${formatIOCTypeLabel(entry.type)})`
            : `Added IOC: ${entry.value} (${formatIOCTypeLabel(entry.type)})`
        );
        return entry;
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.listIocs', async () => {
        const entries = iocRegistry.list();
        if (entries.length === 0) {
          await vscode.window.showInformationMessage('No active IOCs.');
          return [];
        }

        await vscode.window.showQuickPick(
          entries.map((entry) => ({
            label: entry.value,
            description: formatIOCTypeLabel(entry.type),
            detail: `${entry.matchResults.length} artifact match(es)`,
          })),
          {
            title: 'Active IOCs',
            placeHolder: 'Review currently tracked IOCs',
            ignoreFocusOut: true,
          }
        );
        return entries;
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.removeIoc', async () => {
        const entries = iocRegistry.list();
        if (entries.length === 0) {
          await vscode.window.showInformationMessage('No active IOCs to remove.');
          return false;
        }

        const selected = await vscode.window.showQuickPick(
          entries.map((entry) => ({
            label: entry.value,
            description: formatIOCTypeLabel(entry.type),
            detail: `${entry.matchResults.length} artifact match(es)`,
            id: entry.id,
          })),
          {
            title: 'Remove IOC',
            placeHolder: 'Choose an IOC to remove',
            ignoreFocusOut: true,
          }
        );

        if (!selected) {
          return false;
        }

        const removed = iocRegistry.remove(selected.id);
        if (removed) {
          await vscode.window.showInformationMessage(`Removed IOC: ${selected.label}`);
        }
        return removed;
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.clearIocs', async () => {
        if (iocRegistry.list().length === 0) {
          await vscode.window.showInformationMessage('No active IOCs to clear.');
          return;
        }

        const confirmation = await vscode.window.showWarningMessage(
          'Clear all active IOCs?',
          { modal: true },
          'Clear'
        );
        if (confirmation === 'Clear') {
          iocRegistry.clear();
          await vscode.window.showInformationMessage('Cleared all active IOCs.');
        }
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
        const allPhases = hunt.huntMap.data.phases;
        const runnablePhases = allPhases.filter(
          (phase) => !isPhaseComplete(phase.status)
        );
        let selectedPhase = allPhases.find(
          (phase) => phase.number === requestedPhase
        );

        if (selectedPhase && isPhaseComplete(selectedPhase.status)) {
          const childHuntCount = store.getChildHunts().length;
          const detail =
            childHuntCount > 0
              ? ' Open a child case to inspect its existing evidence.'
              : '';
          await vscode.window.showInformationMessage(
            `Phase ${selectedPhase.number} is already complete in this workspace.${detail}`
          );
          return undefined;
        }

        if (!selectedPhase && runnablePhases.length === 0) {
          const childHuntCount = store.getChildHunts().length;
          const detail =
            childHuntCount > 0
              ? ' Open a child case to inspect its existing evidence.'
              : '';
          await vscode.window.showInformationMessage(
            `All hunt phases are already complete in this workspace.${detail}`
          );
          return undefined;
        }

        if (!selectedPhase) {
          const picked = await vscode.window.showQuickPick(
            runnablePhases.map((phase) => ({
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

        const cliConfig = vscode.workspace.getConfiguration('thruntGod');
        const commandTemplate = cliConfig.get<string>(
          'cli.phaseCommandTemplate',
          DEFAULT_PHASE_COMMAND_TEMPLATE
        );
        const packId = cliConfig.get<string>('cli.defaultPackId', '').trim();

        let resolvedCommand: { commandString: string; args: string[] };
        try {
          resolvedCommand = resolvePhaseCommandTemplate(commandTemplate, {
            phase: String(selectedPhase.number),
            phaseName: selectedPhase.name,
            phaseNameSlug: slugifyPhaseName(selectedPhase.name),
            packId,
          });
        } catch (error) {
          await vscode.window.showErrorMessage(
            error instanceof Error ? error.message : 'Failed to resolve the hunt phase command.'
          );
          return undefined;
        }

        await context.workspaceState.update(LAST_PHASE_COMMAND_KEY, resolvedCommand.commandString);
        const result = await runStreamingCliCommand({
          command: resolvedCommand.args,
          cwd: workspaceRoot,
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

        return runStreamingCliCommand({
          command: parseCliInput(stored),
          cwd: workspaceRoot,
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
      vscode.commands.registerCommand('thrunt-god.openTemplateViewer', async (target?: unknown) => {
        let queryId = extractQueryIdFromTarget(target);

        if (!queryId && target && typeof target === 'object') {
          const item = target as Partial<HuntTreeItem>;
          if (item.nodeType === 'receipt' && typeof item.dataId === 'string') {
            const receiptResult = store.getReceipt(item.dataId);
            if (receiptResult?.status === 'loaded' && receiptResult.data.relatedQueries.length > 0) {
              queryId = receiptResult.data.relatedQueries[0];
            }
          }
        }

        if (!queryId) {
          queryId = getActiveEditorQueryId();
        }

        if (!queryId) {
          await vscode.window.showWarningMessage(
            'Open a query artifact or select a query in the THRUNT God sidebar to use the Drain Template Viewer.'
          );
          return;
        }

        DrainTemplatePanel.createOrShow(context, store, iocRegistry, queryId);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.showInEvidenceBoard', (target?: unknown) => {
        let artifactId: string | undefined;
        if (target && typeof target === 'object') {
          const item = target as Partial<HuntTreeItem>;
          artifactId = item.dataId;
        }
        if (!artifactId) {
          const activeDoc = vscode.window.activeTextEditor?.document;
          if (activeDoc) {
            const resolved = resolveArtifactType(activeDoc.uri.fsPath);
            artifactId = resolved?.id;
          }
        }
        EvidenceBoardPanel.createOrShow(context, store);
        if (artifactId) {
          store.select(artifactId);
        }
      })
    );

    context.subscriptions.push(
      store.onDidSelect((id) => {
        outputChannel.appendLine(`[Store] Selection: ${id ?? 'cleared'}`);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.refreshSidebar', () => {
        treeProvider.refresh();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.refreshAutomationSidebar', () => {
        automationProvider.refresh();
      })
    );

    const statusBar = new HuntStatusBar(store);
    context.subscriptions.push(statusBar);

    const codeLensProvider = new HuntCodeLensProvider(store);
    context.subscriptions.push(codeLensProvider);

    const mdSelector: vscode.DocumentSelector = { language: 'markdown', scheme: 'file' };
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(mdSelector, codeLensProvider)
    );

    const diagnostics = new EvidenceIntegrityDiagnostics(store);
    context.subscriptions.push(diagnostics);
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(mdSelector, diagnostics, {
        providedCodeActionKinds: EvidenceIntegrityDiagnostics.providedCodeActionKinds,
      })
    );

    let sessionDiff: SessionDiff | null = null;

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.openHuntOverview', () => {
        HuntOverviewPanel.createOrShow(context, store, sessionDiff);
      })
    );

    store.initialScanComplete().then(() => {
      const previousHashes = context.workspaceState.get<Record<string, string>>(SESSION_HASH_KEY, {});
      const currentHashes = computeArtifactHashes(store);
      const diff = computeSessionDiff(previousHashes, currentHashes);
      sessionDiff = diff.entries.length > 0 ? diff : null;
      deferredSessionDiff = sessionDiff;

      if (sessionDiff) {
        vscode.window.showInformationMessage(
          `THRUNT: ${sessionDiff.summary}`,
          'Open Dashboard'
        ).then((choice) => {
          if (choice === 'Open Dashboard') {
            HuntOverviewPanel.createOrShow(context, store, sessionDiff);
          }
        });
      }
    });

    context.subscriptions.push({
      dispose() {
        const hashes = computeArtifactHashes(store);
        context.workspaceState.update(SESSION_HASH_KEY, hashes);
      },
    });

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.openEvidenceBoard', () => {
        EvidenceBoardPanel.createOrShow(context, store);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.openQueryAnalysis', () => {
        QueryAnalysisPanel.createOrShow(context, store);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.openReceiptInspector', (receiptId?: string) => {
        QueryAnalysisPanel.createOrShow(context, store, typeof receiptId === 'string' ? receiptId : undefined);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.openProgramDashboard', () => {
        ProgramDashboardPanel.createOrShow(context, store);
      })
    );

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
            return runThruntCli(context, workspaceRoot, args, huntRoot);
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
}

export { parseArtifact, parseMission, parseHypotheses, parseHuntMap, parseState, parseQuery, parseReceipt, parseEvidenceReview, parsePhaseSummary } from './parsers/index';
export { extractFrontmatter, extractBody, extractMarkdownSections } from './parsers/base';
export { parseCliInput, resolvePhaseCommandTemplate };
export { HuntDataStore } from './store';
export { ArtifactWatcher, resolveArtifactType } from './watcher';
export { HuntTreeDataProvider, HuntTreeItem } from './sidebar';
export { AutomationTreeDataProvider, AutomationTreeItem } from './automationSidebar';
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
  DTV_STATE_KEY,
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
  EB_STATE_KEY,
} from './evidenceBoardPanel';
export {
  QueryAnalysisPanel,
  QUERY_ANALYSIS_VIEW_TYPE,
  QA_STATE_KEY,
} from './queryAnalysisPanel';
export {
  ProgramDashboardPanel,
  PROGRAM_DASHBOARD_VIEW_TYPE,
} from './programDashboardPanel';
