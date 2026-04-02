import * as vscode from 'vscode';
import { HUNT_MARKERS, OUTPUT_CHANNEL_NAME } from './constants';
import { ArtifactWatcher } from './watcher';
import { HuntDataStore } from './store';

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
        return folder.uri;
      } catch {
        // Marker not found in this folder, continue
      }
    }
  }

  return undefined;
}

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  context.subscriptions.push(outputChannel);

  // Register the info command immediately (available even before hunt root detection)
  context.subscriptions.push(
    vscode.commands.registerCommand('thrunt-god.showInfo', () => {
      vscode.window.showInformationMessage(
        'THRUNT God: Extension is active. Detecting hunt workspace...'
      );
    })
  );

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
    context.subscriptions.push(store);

    // 3. Log store events for debugging
    context.subscriptions.push(
      store.onDidChange((event) => {
        outputChannel.appendLine(
          `[Store] ${event.type}: ${event.artifactType} ${event.id}`
        );
      })
    );

    // 4. Re-register the info command with hunt root + store context
    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.showInfo', () => {
        const queries = store.getQueries();
        const receipts = store.getReceipts();
        vscode.window.showInformationMessage(
          `THRUNT God: Hunt at ${huntRoot.fsPath} ` +
          `(${queries.size} queries, ${receipts.size} receipts)`
        );
      })
    );

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
