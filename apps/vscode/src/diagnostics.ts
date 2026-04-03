import * as vscode from 'vscode';
import type { HuntDataStore } from './store';
import type { Receipt } from './types';
import { resolveArtifactType } from './watcher';

const DIAGNOSTIC_COLLECTION_NAME = 'thrunt-evidence';
const DIAGNOSTIC_SOURCE = 'THRUNT Evidence';

const CAUSALITY_PATTERN =
  /\b(after|then|subsequently|led to|caused|resulted in|followed by)\b/i;
const POST_HOC_PATTERN =
  /\b(in hindsight|looking back|retrospectively|upon reflection|after the fact|it is now clear)\b/i;
const TIMESTAMP_PATTERN =
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?/g;

const PREDICTION_SCAFFOLD =
  '\n## Prediction\n\n### Benign\n- [expected benign outcome]\n\n### Malicious\n- [expected malicious outcome]\n\n### Ambiguous\n- [unclear indicators]\n';

const BASELINE_SCAFFOLD =
  '\n## Baseline\n\n**Entity:** [entity identifier]\n**Time window:** [baseline period]\n**Normal behavior:** [expected pattern]\n';

export class EvidenceIntegrityDiagnostics
  implements vscode.CodeActionProvider, vscode.Disposable
{
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  private readonly diagnosticCollection =
    vscode.languages.createDiagnosticCollection(DIAGNOSTIC_COLLECTION_NAME);
  private readonly storeSubscription: vscode.Disposable;
  private readonly trackedPaths = new Set<string>();
  private disposed = false;

  constructor(private readonly store: HuntDataStore) {
    this.storeSubscription = store.onDidChange(() => {
      this.recomputeAll();
    });

    const initialScan =
      typeof store.initialScanComplete === 'function'
        ? store.initialScanComplete()
        : Promise.resolve();

    void Promise.resolve(initialScan).then(
      () => {
        if (!this.disposed) {
          this.recomputeAll();
        }
      },
      () => {
        if (!this.disposed) {
          this.recomputeAll();
        }
      }
    );
  }

  recomputeAll(): void {
    if (this.disposed) {
      return;
    }

    const nextTrackedPaths = new Set<string>();

    for (const [receiptId, result] of this.store.getReceipts()) {
      const filePath = this.store.getArtifactPath(receiptId);
      if (!filePath) {
        continue;
      }

      nextTrackedPaths.add(filePath);

      if (result.status !== 'loaded') {
        this.diagnosticCollection.set(vscode.Uri.file(filePath), []);
        continue;
      }

      const diagnostics = this.checkReceipt(result.data);
      this.diagnosticCollection.set(vscode.Uri.file(filePath), diagnostics);
    }

    for (const filePath of this.trackedPaths) {
      if (!nextTrackedPaths.has(filePath)) {
        this.diagnosticCollection.set(vscode.Uri.file(filePath), []);
      }
    }

    this.trackedPaths.clear();
    for (const filePath of nextTrackedPaths) {
      this.trackedPaths.add(filePath);
    }
  }

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    const resolved = resolveArtifactType(document.uri.fsPath);
    if (!resolved || resolved.type !== 'receipt') {
      return [];
    }

    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== DIAGNOSTIC_SOURCE) {
        continue;
      }

      if (diagnostic.severity !== vscode.DiagnosticSeverity.Warning) {
        continue;
      }

      if (diagnostic.message.includes('Missing prediction')) {
        actions.push(
          this.createQuickFix(
            document,
            diagnostic,
            'Insert prediction section scaffold',
            PREDICTION_SCAFFOLD
          )
        );
      }

      if (diagnostic.message.includes('Missing baseline')) {
        actions.push(
          this.createQuickFix(
            document,
            diagnostic,
            'Insert baseline section scaffold',
            BASELINE_SCAFFOLD
          )
        );
      }
    }

    return actions;
  }

  dispose(): void {
    this.disposed = true;
    this.storeSubscription.dispose();
    this.trackedPaths.clear();
    this.diagnosticCollection.clear();
    this.diagnosticCollection.dispose();
  }

  private checkReceipt(receipt: Receipt): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];

    const unsupportedClaim = this.checkUnsupportedClaim(receipt);
    if (unsupportedClaim) diagnostics.push(unsupportedClaim);

    const causalityWithoutEvidence = this.checkCausalityWithoutEvidence(receipt);
    if (causalityWithoutEvidence) diagnostics.push(causalityWithoutEvidence);

    const missingBaseline = this.checkMissingBaseline(receipt);
    if (missingBaseline) diagnostics.push(missingBaseline);

    const missingPrediction = this.checkMissingPrediction(receipt);
    if (missingPrediction) diagnostics.push(missingPrediction);

    const scoreInflation = this.checkScoreInflation(receipt);
    if (scoreInflation) diagnostics.push(scoreInflation);

    const postHocRationalization = this.checkPostHocRationalization(receipt);
    if (postHocRationalization) diagnostics.push(postHocRationalization);

    const temporalGap = this.checkTemporalGap(receipt);
    if (temporalGap) diagnostics.push(temporalGap);

    return diagnostics;
  }

  private checkUnsupportedClaim(receipt: Receipt): vscode.Diagnostic | null {
    const hasRelatedQuery = receipt.relatedQueries.some((queryId) => queryId.trim() !== '');
    if (hasRelatedQuery) {
      return null;
    }

    return this.createDiagnostic(
      'Unsupported claim: receipt has no related queries in frontmatter',
      vscode.DiagnosticSeverity.Error
    );
  }

  private checkCausalityWithoutEvidence(receipt: Receipt): vscode.Diagnostic | null {
    if (!CAUSALITY_PATTERN.test(receipt.claim) || receipt.anomalyFrame !== null) {
      return null;
    }

    return this.createDiagnostic(
      'Causality claim without supporting evidence framework (no anomaly framing section)',
      vscode.DiagnosticSeverity.Error
    );
  }

  private checkMissingBaseline(receipt: Receipt): vscode.Diagnostic | null {
    if (receipt.anomalyFrame === null || receipt.anomalyFrame.baseline.trim() !== '') {
      return null;
    }

    return this.createDiagnostic(
      'Missing baseline: deviation scored without documented normal behavior',
      vscode.DiagnosticSeverity.Warning
    );
  }

  private checkMissingPrediction(receipt: Receipt): vscode.Diagnostic | null {
    if (receipt.anomalyFrame === null || receipt.anomalyFrame.prediction.trim() !== '') {
      return null;
    }

    return this.createDiagnostic(
      'Missing prediction: no predicted outcomes documented before observation',
      vscode.DiagnosticSeverity.Warning
    );
  }

  private checkScoreInflation(receipt: Receipt): vscode.Diagnostic | null {
    if (receipt.anomalyFrame === null) {
      return null;
    }

    const { baseScore, modifiers, totalScore } = receipt.anomalyFrame.deviationScore;
    if (modifiers.length > 0 || totalScore <= baseScore) {
      return null;
    }

    return this.createDiagnostic(
      `Score inflation: total score (${totalScore}) exceeds base score (${baseScore}) without documented modifiers`,
      vscode.DiagnosticSeverity.Warning
    );
  }

  private checkPostHocRationalization(receipt: Receipt): vscode.Diagnostic | null {
    if (
      receipt.anomalyFrame === null ||
      (!POST_HOC_PATTERN.test(receipt.claim) &&
        !POST_HOC_PATTERN.test(receipt.anomalyFrame.observation))
    ) {
      return null;
    }

    return this.createDiagnostic(
      'Possible post-hoc rationalization: language suggests retroactive reasoning',
      vscode.DiagnosticSeverity.Information
    );
  }

  private checkTemporalGap(receipt: Receipt): vscode.Diagnostic | null {
    if (receipt.anomalyFrame === null) {
      return null;
    }

    const timestamps = [...receipt.anomalyFrame.observation.matchAll(TIMESTAMP_PATTERN)]
      .map((match) => match[0])
      .map((value) => Date.parse(value))
      .filter((value) => Number.isFinite(value));

    if (timestamps.length < 2) {
      return null;
    }

    for (let i = 1; i < timestamps.length; i += 1) {
      if (timestamps[i] < timestamps[i - 1]) {
        return this.createDiagnostic(
          'Temporal gap: observation timestamps may be out of chronological order',
          vscode.DiagnosticSeverity.Information
        );
      }
    }

    return null;
  }

  private createDiagnostic(
    message: string,
    severity: vscode.DiagnosticSeverity
  ): vscode.Diagnostic {
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(0, 0, 0, 0),
      message,
      severity
    );
    diagnostic.source = DIAGNOSTIC_SOURCE;
    return diagnostic;
  }

  private createQuickFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    title: string,
    scaffold: string
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    action.diagnostics = [diagnostic];
    action.edit = new vscode.WorkspaceEdit();
    action.edit.insert(document.uri, this.findInsertPosition(document), scaffold);
    return action;
  }

  private findInsertPosition(document: vscode.TextDocument): vscode.Position {
    let claimHeadingLine = -1;

    for (let i = 0; i < document.lineCount; i += 1) {
      if (/^##\s+Claim\b/.test(document.lineAt(i).text)) {
        claimHeadingLine = i;
        break;
      }
    }

    if (claimHeadingLine >= 0) {
      for (let i = claimHeadingLine + 1; i < document.lineCount; i += 1) {
        if (/^##\s+/.test(document.lineAt(i).text)) {
          return new vscode.Position(i, 0);
        }
      }
    }

    if (document.lineCount === 0) {
      return new vscode.Position(0, 0);
    }

    const lastLine = document.lineAt(document.lineCount - 1).text;
    return new vscode.Position(document.lineCount - 1, lastLine.length);
  }
}
