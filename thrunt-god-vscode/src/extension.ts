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
import { DrainTemplatePanel } from './drainViewer';
import {
  HuntOverviewPanel,
  SESSION_HASH_KEY,
  computeArtifactHashes,
  computeSessionDiff,
} from './huntOverviewPanel';
import { EvidenceBoardPanel } from './evidenceBoardPanel';
import type { SessionDiff } from '../shared/hunt-overview';
import { resolveArtifactType } from './watcher';

const CLI_OUTPUT_CHANNEL_NAME = `${OUTPUT_CHANNEL_NAME} CLI`;
const LAST_CLI_COMMAND_KEY = 'thruntGod.lastCliCommand';

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
  let activeHuntRoot: vscode.Uri | undefined;
  let activeStore: HuntDataStore | undefined;
  context.subscriptions.push(outputChannel);
  context.subscriptions.push(cliOutputChannel);

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
    vscode.commands.registerCommand('thrunt-god.runThruntCli', async (input?: unknown) => {
      const workspaceRoot = resolveWorkspaceRoot(activeHuntRoot);
      if (!workspaceRoot) {
        await vscode.window.showWarningMessage(
          'Open a folder containing .planning/MISSION.md or .hunt/MISSION.md to run THRUNT CLI commands.'
        );
        return undefined;
      }

      return runThruntCliCommand(context, cliOutputChannel, workspaceRoot, input);
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

    // 3. Log store events for debugging
    context.subscriptions.push(
      store.onDidChange((event) => {
        outputChannel.appendLine(
          `[Store] ${event.type}: ${event.artifactType} ${event.id}`
        );
      })
    );

    // --- Phase 9: Sidebar tree view ---
    vscode.commands.executeCommand('setContext', 'thruntGod.huntDetected', true);

    const treeProvider = new HuntTreeDataProvider(store, huntRoot);
    context.subscriptions.push(treeProvider);
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider('thruntGod.huntTree', treeProvider)
    );

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
      vscode.commands.registerCommand('thrunt-god.openTemplateViewer', async (target?: unknown) => {
        const queryId = extractQueryIdFromTarget(target) ?? getActiveEditorQueryId();
        if (!queryId) {
          await vscode.window.showWarningMessage(
            'Open a query artifact or select a query in the THRUNT God sidebar to use the Drain Template Viewer.'
          );
          return;
        }

        DrainTemplatePanel.createOrShow(context, store, queryId);
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
        HuntOverviewPanel.createOrShow(context, store, sessionDiff);
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
            HuntOverviewPanel.createOrShow(context, store, sessionDiff);
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
        EvidenceBoardPanel.createOrShow(context, store);
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
