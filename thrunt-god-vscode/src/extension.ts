import * as vscode from 'vscode';
import { HUNT_MARKERS, OUTPUT_CHANNEL_NAME } from './constants';

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

    // Re-register the info command with hunt root context
    context.subscriptions.push(
      vscode.commands.registerCommand('thrunt-god.showInfo', () => {
        vscode.window.showInformationMessage(
          `THRUNT God: Hunt workspace detected at ${huntRoot.fsPath}`
        );
      })
    );
  });
}

export function deactivate(): void {
  // Cleanup will be added as subsystems are registered
}

// Re-export parsers for test access via the built bundle
export { parseMission } from './parsers/mission';
export { parseHypotheses } from './parsers/hypotheses';
export { parseHuntMap } from './parsers/huntmap';
export { parseState } from './parsers/state';
export { parseQuery } from './parsers/query';
export { parseEvidenceReview } from './parsers/evidenceReview';
export { parsePhaseSummary } from './parsers/phaseSummary';
export { extractFrontmatter, extractBody, extractMarkdownSections } from './parsers/base';
