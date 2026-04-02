import * as vscode from 'vscode';
import type { HuntDataStore } from './store';

/**
 * HuntStatusBar manages a StatusBarItem showing hunt phase progress
 * and critical deviation alerts.
 *
 * Displays "$(shield) THRUNT: Phase N/M" when a hunt is active.
 * Pulses warning background when any receipt has deviation score >= 5.
 * Hidden when no hunt workspace detected.
 */
export class HuntStatusBar implements vscode.Disposable {
  private readonly _statusBarItem: vscode.StatusBarItem;
  private readonly _storeSubscription: vscode.Disposable;

  constructor(private readonly store: HuntDataStore) {
    this._statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this._statusBarItem.command = 'thrunt-god.showInfo';

    // Subscribe to store changes for live updates
    this._storeSubscription = store.onDidChange(() => {
      this.update();
    });

    // Initial render
    this.update();
  }

  /**
   * Update the status bar item based on current store state.
   */
  update(): void {
    const hunt = this.store.getHunt();

    if (!hunt) {
      this._statusBarItem.hide();
      return;
    }

    // Extract phase progress from HuntState
    if (hunt.state.status === 'loaded') {
      const { phase, totalPhases } = hunt.state.data;
      this._statusBarItem.text = `$(shield) THRUNT: Phase ${phase}/${totalPhases}`;
    } else {
      this._statusBarItem.text = '$(shield) THRUNT: Loading...';
    }

    // Check for critical deviations (score >= 5) across all receipts
    let hasCritical = false;
    const receipts = this.store.getReceipts();
    for (const [, receipt] of receipts) {
      if (
        receipt.status === 'loaded' &&
        receipt.data.anomalyFrame?.deviationScore.totalScore !== undefined &&
        receipt.data.anomalyFrame.deviationScore.totalScore >= 5
      ) {
        hasCritical = true;
        break;
      }
    }

    if (hasCritical) {
      this._statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      this._statusBarItem.tooltip =
        'Critical deviation detected (score >= 5)';
    } else {
      this._statusBarItem.backgroundColor = undefined;
      this._statusBarItem.tooltip = 'THRUNT God Hunt Investigation';
    }

    this._statusBarItem.show();
  }

  dispose(): void {
    this._storeSubscription.dispose();
    this._statusBarItem.dispose();
  }
}
