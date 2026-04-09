import * as assert from 'assert';
import * as vscode from 'vscode';

interface StoreSnapshot {
  singletonArtifacts: {
    missionMode: string | null;
    hypothesisCount: number;
    phaseCount: number;
    state: {
      status: string;
      phase: number;
      totalPhases: number;
      planInPhase: number;
      totalPlansInPhase: number;
      lastActivity: string;
      blockers: string;
    } | null;
  } | null;
  queries: Array<{
    queryId: string;
    artifactPath?: string;
    eventCount?: number;
    templateCount?: number;
  }>;
  receipts: Array<{
    receiptId: string;
  }>;
}

interface TreeSnapshotNode {
  label: string;
  nodeType?: string;
  dataId?: string;
  children?: TreeSnapshotNode[];
}

interface DiagnosticsSnapshot {
  totalCount: number;
  files: Array<{
    relativePath: string;
    diagnostics: Array<{
      message: string;
      severity: string;
    }>;
  }>;
}

interface ViewerSnapshot {
  currentQueryId: string;
  isReady: boolean;
  viewModel: {
    query: {
      queryId: string;
      artifactPath: string;
    };
    clusters: Array<{
      templateId: string;
      count: number;
    }>;
    pinnedTemplates: unknown[];
  };
}

interface ThruntCliResult {
  stdout: string;
  stderr: string;
  parsed: unknown;
}

async function waitForActiveMarkdownDocument(
  predicate: (text: string) => boolean
): Promise<string> {
  return waitFor(
    'active Markdown document',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return '';
      }

      return editor.document.getText();
    },
    (text) => text.length > 0 && predicate(text)
  );
}

async function waitForActiveJsonDocument(
  predicate: (value: unknown) => boolean
): Promise<unknown> {
  return waitFor(
    'active JSON document',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return null;
      }

      const text = editor.document.getText();
      if (!text.trim()) {
        return null;
      }

      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    },
    (value) => value !== null && predicate(value)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(
  label: string,
  producer: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 20000,
  intervalMs = 250
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const value = await producer();
      if (predicate(value)) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(intervalMs);
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(`Timed out waiting for ${label}`);
}

async function activateExtension(): Promise<vscode.Extension<unknown>> {
  const extension = vscode.extensions.getExtension('backbay-labs.thrunt-god');
  assert.ok(extension, 'Extension should be found by ID');

  if (!extension.isActive) {
    await extension.activate();
  }

  return extension;
}

async function executeTestCommand<T>(command: string, ...args: unknown[]): Promise<T> {
  return vscode.commands.executeCommand<T>(command, ...args);
}

async function runThruntCli(args: string[]): Promise<ThruntCliResult> {
  return executeTestCommand<ThruntCliResult>('thrunt-god.runThruntCli', args);
}

function flattenTree(nodes: TreeSnapshotNode[]): TreeSnapshotNode[] {
  const flattened: TreeSnapshotNode[] = [];

  for (const node of nodes) {
    flattened.push(node);
    flattened.push(...flattenTree(node.children ?? []));
  }

  return flattened;
}

suite('Dogfood Harness', function () {
  suiteSetup(function () {
    if (process.env.THRUNT_E2E !== '1') {
      this.skip();
    }
  });

  test('captures store and tree snapshots for the brute-force fixture', async () => {
    await activateExtension();

    await waitFor(
      'E2E snapshot commands',
      async () => vscode.commands.getCommands(true),
      (commands) => commands.includes('thrunt-god.test.snapshotStore')
    );

    const storeSnapshot = await waitFor<StoreSnapshot>(
      'store snapshot',
      () => executeTestCommand<StoreSnapshot>('thrunt-god.test.snapshotStore'),
      (snapshot) => snapshot.queries.length === 3 && snapshot.receipts.length === 4
    );

    assert.strictEqual(storeSnapshot.singletonArtifacts?.missionMode, 'case');
    assert.strictEqual(storeSnapshot.singletonArtifacts?.hypothesisCount, 4);
    assert.strictEqual(storeSnapshot.singletonArtifacts?.phaseCount, 4);
    assert.strictEqual(storeSnapshot.singletonArtifacts?.state?.status, 'Complete');
    assert.ok(
      storeSnapshot.singletonArtifacts?.state?.blockers.includes('(hunt complete)'),
      'Expected the completed-hunt blocker marker in state snapshot'
    );

    const queryIds = storeSnapshot.queries.map((query) => query.queryId);
    assert.deepStrictEqual(queryIds, [
      'QRY-20260329-001',
      'QRY-20260329-002',
      'QRY-20260329-003',
    ]);

    const primaryQuery = storeSnapshot.queries.find(
      (query) => query.queryId === 'QRY-20260329-001'
    );
    assert.ok(primaryQuery, 'Primary query should be present in store snapshot');
    assert.strictEqual(primaryQuery?.eventCount, 1247);
    assert.strictEqual(primaryQuery?.templateCount, 3);

    const treeSnapshot = await executeTestCommand<{ tree: TreeSnapshotNode[] }>(
      'thrunt-god.test.snapshotTree'
    );
    const rootLabels = treeSnapshot.tree.map((node) => node.label);
    assert.deepStrictEqual(rootLabels, ['Mission', 'Hypotheses', 'Phases']);

    const flattened = flattenTree(treeSnapshot.tree);
    const queryNodes = flattened.filter((node) => node.nodeType === 'query');
    assert.strictEqual(queryNodes.length, 3);
    assert.deepStrictEqual(
      queryNodes.map((node) => node.dataId).sort(),
      ['QRY-20260329-001', 'QRY-20260329-002', 'QRY-20260329-003']
    );
  });

  test('captures evidence diagnostics from the fixture receipts', async () => {
    await activateExtension();

    const diagnosticsSnapshot = await waitFor<DiagnosticsSnapshot>(
      'diagnostics snapshot',
      () => executeTestCommand<DiagnosticsSnapshot>('thrunt-god.test.snapshotDiagnostics'),
      (snapshot) => snapshot.totalCount >= 2
    );

    const allMessages = diagnosticsSnapshot.files.flatMap((file) =>
      file.diagnostics.map((diagnostic) => diagnostic.message)
    );

    assert.ok(
      diagnosticsSnapshot.files.some(
        (file) => file.relativePath === 'RECEIPTS/RCT-20260329-001.md'
      ),
      'Expected receipt diagnostics for RCT-20260329-001'
    );
    assert.ok(
      allMessages.some((message) => message.includes('Missing prediction')),
      'Expected missing prediction warning in diagnostics snapshot'
    );
    assert.ok(
      allMessages.some((message) => message.includes('Missing baseline')),
      'Expected missing baseline warning in diagnostics snapshot'
    );
  });

  test('runs THRUNT CLI commands from the extension host and observes state refresh', async () => {
    await activateExtension();

    const stateJson = await runThruntCli(['state', 'json']);
    const parsedState = stateJson.parsed as
      | {
          milestone?: string;
          status?: string;
          progress?: { percent?: number };
        }
      | null;

    assert.ok(parsedState, 'Expected JSON output from `state json`');
    assert.strictEqual(parsedState?.milestone, 'v1.0');
    assert.strictEqual(parsedState?.status, 'completed');
    assert.strictEqual(parsedState?.progress?.percent, 100);

    const blockerText = 'Harness blocker via VS Code CLI bridge';

    await runThruntCli(['state', 'add-blocker', '--text', blockerText, '--raw']);

    const withBlocker = await waitFor<StoreSnapshot>(
      'state snapshot after adding blocker',
      () => executeTestCommand<StoreSnapshot>('thrunt-god.test.snapshotStore'),
      (snapshot) =>
        snapshot.singletonArtifacts?.state?.blockers.includes(blockerText) ?? false
    );

    assert.ok(
      withBlocker.singletonArtifacts?.state?.blockers.includes(blockerText),
      'Expected blocker text after CLI mutation'
    );

    await runThruntCli(['state', 'resolve-blocker', '--text', blockerText, '--raw']);

    const resolved = await waitFor<StoreSnapshot>(
      'state snapshot after resolving blocker',
      () => executeTestCommand<StoreSnapshot>('thrunt-god.test.snapshotStore'),
      (snapshot) =>
        !(snapshot.singletonArtifacts?.state?.blockers.includes(blockerText) ?? true)
    );

    assert.ok(
      !(resolved.singletonArtifacts?.state?.blockers.includes(blockerText) ?? true),
      'Expected blocker text to disappear after CLI resolve'
    );
  });

  test('opens curated THRUNT command results in JSON and markdown editors', async () => {
    await activateExtension();

    await executeTestCommand('thrunt-god.showStateJson');
    const stateDoc = (await waitForActiveJsonDocument(
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        (value as { milestone?: string }).milestone === 'v1.0'
    )) as {
      milestone: string;
      status: string;
    };

    assert.strictEqual(stateDoc.milestone, 'v1.0');
    assert.strictEqual(stateDoc.status, 'completed');

    await executeTestCommand('thrunt-god.analyzeHuntmap');
    const huntmapDoc = (await waitForActiveJsonDocument(
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        (value as { phase_count?: number }).phase_count === 4
    )) as {
      phase_count: number;
      completed_phases: number;
      phases: Array<{ number: string }>;
    };

    assert.strictEqual(huntmapDoc.phase_count, 4);
    assert.strictEqual(huntmapDoc.completed_phases, 4);
    assert.deepStrictEqual(
      huntmapDoc.phases.map((phase) => phase.number),
      ['1', '2', '3', '4']
    );

    await executeTestCommand('thrunt-god.showProgressReport');
    const progressDoc = await waitForActiveMarkdownDocument(
      (text) =>
        text.includes('# v1.0 Meridian Brute Force to Persistence') &&
        text.includes('**Progress:**')
    );

    assert.ok(progressDoc.includes('| Phase | Name | Plans | Status |'));

    await executeTestCommand('thrunt-god.showRuntimeDoctor');
    const runtimeDoctorDoc = await waitForActiveMarkdownDocument(
      (text) =>
        text.includes('# THRUNT Runtime Doctor') &&
        text.includes('**Overall status:** unconfigured')
    );

    assert.ok(runtimeDoctorDoc.includes('| Connector | Status | Score | Configured |'));
    assert.ok(runtimeDoctorDoc.includes('| okta | unconfigured | 20 | no |'));
    assert.ok(runtimeDoctorDoc.includes('## Notable Failures'));
  });

  test('opens the drain template viewer against the active query document', async () => {
    await activateExtension();

    const storeSnapshot = await waitFor<StoreSnapshot>(
      'store snapshot before viewer test',
      () => executeTestCommand<StoreSnapshot>('thrunt-god.test.snapshotStore'),
      (snapshot) => snapshot.queries.length === 3
    );
    const query = storeSnapshot.queries.find((entry) => entry.queryId === 'QRY-20260329-001');
    assert.ok(query?.artifactPath, 'Viewer test needs the primary query artifact path');

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(query!.artifactPath!));
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('thrunt-god.openTemplateViewer');

    const viewerSnapshot = await waitFor<ViewerSnapshot | null>(
      'drain viewer snapshot',
      () => executeTestCommand<ViewerSnapshot | null>('thrunt-god.test.snapshotViewer'),
      (snapshot): snapshot is ViewerSnapshot =>
        snapshot !== null &&
        snapshot.isReady &&
        snapshot.currentQueryId === 'QRY-20260329-001' &&
        snapshot.viewModel.clusters.length === 3
    );

    assert.strictEqual(viewerSnapshot.viewModel.query.queryId, 'QRY-20260329-001');
    assert.strictEqual(viewerSnapshot.viewModel.query.artifactPath, query!.artifactPath);
    assert.strictEqual(viewerSnapshot.viewModel.clusters[0]?.templateId, 'T1');
    assert.strictEqual(viewerSnapshot.viewModel.clusters[0]?.count, 1189);
    assert.strictEqual(viewerSnapshot.viewModel.pinnedTemplates.length, 0);
  });
});
