import * as vscode from 'vscode';
import type { HuntDataStore } from './store';
import { resolveArtifactType } from './watcher';

/**
 * HuntCodeLensProvider shows inline annotations above markdown headings
 * in receipt and query files:
 *
 * - Receipts: Deviation score above ## Claim and ## Assessment headings
 * - Queries: Template/event counts above ## Result Summary heading
 *
 * Clicking a CodeLens scrolls to and highlights the heading.
 */
export class HuntCodeLensProvider
  implements vscode.CodeLensProvider, vscode.Disposable
{
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses: vscode.Event<void> =
    this._onDidChangeCodeLenses.event;

  private readonly _storeSubscription: vscode.Disposable;

  constructor(private readonly store: HuntDataStore) {
    this._storeSubscription = store.onDidChange(() => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.CodeLens[] {
    // Determine if this document is a receipt or query artifact
    const resolved = resolveArtifactType(document.uri.fsPath);
    if (!resolved || (resolved.type !== 'receipt' && resolved.type !== 'query')) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];

    if (resolved.type === 'receipt') {
      const receipt = this.store.getReceipt(resolved.id);
      if (!receipt || receipt.status !== 'loaded') {
        return [];
      }

      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (/^##\s+(Claim|Assessment)\b/.test(line)) {
          const range = new vscode.Range(i, 0, i, line.length);
          const score =
            receipt.data.anomalyFrame?.deviationScore.totalScore;
          const scoreText =
            score !== undefined
              ? `Deviation Score: ${score}/6`
              : 'No deviation score';
          const severity =
            score !== undefined
              ? score <= 2
                ? 'low'
                : score <= 4
                  ? 'medium'
                  : 'critical'
              : 'unknown';
          lenses.push(
            new vscode.CodeLens(range, {
              title: `$(pulse) ${scoreText} [${severity}]`,
              command: 'thrunt-god.scrollToSection',
              arguments: [document.uri, i],
              tooltip: 'Deviation score for this receipt',
            })
          );
        }
      }
    } else {
      // query
      const query = this.store.getQuery(resolved.id);
      if (!query || query.status !== 'loaded') {
        return [];
      }

      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        if (/^##\s+Result Summary\b/.test(line)) {
          const range = new vscode.Range(i, 0, i, line.length);
          const count = query.data.templateCount;
          const events = query.data.eventCount;
          lenses.push(
            new vscode.CodeLens(range, {
              title: `$(beaker) ${count} templates, ${events} events`,
              command: 'thrunt-god.scrollToSection',
              arguments: [document.uri, i],
              tooltip: 'Drain template summary for this query',
            })
          );
        }
      }
    }

    return lenses;
  }

  dispose(): void {
    this._storeSubscription.dispose();
    this._onDidChangeCodeLenses.dispose();
  }
}
