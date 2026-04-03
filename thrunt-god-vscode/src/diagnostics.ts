import * as vscode from 'vscode';
import type { HuntDataStore } from './store';
import type { Receipt } from './types';
import { checkReceiptStructured } from './receiptIntegrity';

function createRange(): vscode.Range {
  return new vscode.Range(0, 0, 0, 0);
}

function severityToVsCode(
  severity: 'error' | 'warning' | 'info'
): vscode.DiagnosticSeverity {
  if (severity === 'error') {
    return vscode.DiagnosticSeverity.Error;
  }
  if (severity === 'warning') {
    return vscode.DiagnosticSeverity.Warning;
  }
  return vscode.DiagnosticSeverity.Information;
}

export class EvidenceIntegrityDiagnostics
  implements vscode.CodeActionProvider, vscode.Disposable
{
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  private readonly collection = vscode.languages.createDiagnosticCollection(
    'THRUNT Evidence'
  );
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly store: HuntDataStore) {
    this.disposables.push(
      this.store.onDidChange(() => {
        this.refresh();
      })
    );
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.collection.clear();

    for (const [receiptId, result] of this.store.getReceipts()) {
      if (result.status !== 'loaded') {
        continue;
      }

      const receipt = result.data as Receipt;
      const artifactPath = this.store.getArtifactPath(receiptId);
      if (!artifactPath) {
        continue;
      }

      const diagnostics = checkReceiptStructured(receipt)
        .filter((check) => check.status === 'flagged')
        .map((check) => {
          const diagnostic = new vscode.Diagnostic(
            createRange(),
            check.message,
            severityToVsCode(check.severity)
          );
          diagnostic.source = 'THRUNT Evidence';
          return diagnostic;
        });

      if (diagnostics.length > 0) {
        this.collection.set(vscode.Uri.file(artifactPath), diagnostics);
      }
    }
  }

  provideCodeActions(
    _document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    _context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    return [];
  }

  dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
    this.collection.dispose();
  }
}
