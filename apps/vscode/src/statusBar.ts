import * as vscode from 'vscode';
import type { HuntDataStore } from './store';

export class HuntStatusBar implements vscode.Disposable {
  private readonly _statusBarItem: vscode.StatusBarItem;
  private readonly _storeSubscription: vscode.Disposable;

  constructor(private readonly store: HuntDataStore) {
    this._statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this._statusBarItem.command = 'thrunt-god.showProgressReport';

    this._storeSubscription = store.onDidChange(() => {
      this.update();
    });

    this.update();
  }

  update(): void {
    const hunt = this.store.getHunt();

    if (!hunt) {
      this._statusBarItem.hide();
      return;
    }

    if (hunt.state.status === 'loaded') {
      const { phase, totalPhases } = hunt.state.data;
      this._statusBarItem.text = `$(shield) THRUNT: Phase ${phase}/${totalPhases}`;
    } else {
      this._statusBarItem.text = '$(shield) THRUNT: Loading...';
    }

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
        'Critical deviation detected (score >= 5). Click to open the THRUNT progress report.';
    } else {
      this._statusBarItem.backgroundColor = undefined;
      this._statusBarItem.tooltip = 'THRUNT God Hunt Investigation. Click to open the progress report.';
    }

    this._statusBarItem.show();
  }

  dispose(): void {
    this._storeSubscription.dispose();
    this._statusBarItem.dispose();
  }
}
