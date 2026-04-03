import * as vscode from 'vscode';
import type {
  SLARecord,
  SLAPhase,
  SLATimerConfig,
  SLATimerState,
  SlaVisualState,
} from '../shared/sla';

export const SLA_TIMER_STATE_KEY = 'thruntGod.slaTimer';

interface StoredSlaTimerState {
  activeTimer: SLATimerState | null;
  completedPhases: SLARecord[];
}

const DEFAULT_SLA_DURATIONS: Record<'ttd' | 'ttc' | 'ttr', number> = {
  ttd: 30 * 60 * 1000,
  ttc: 4 * 60 * 60 * 1000,
  ttr: 24 * 60 * 60 * 1000,
};

function formatUnit(value: number, suffix: string): string | null {
  return value > 0 ? `${value}${suffix}` : null;
}

export function formatSlaDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [formatUnit(hours, 'h'), formatUnit(minutes, 'm')].filter(Boolean).join(' ');
  }

  if (minutes > 0) {
    return [formatUnit(minutes, 'm'), `${seconds}s`].filter(Boolean).join(' ');
  }

  return `${seconds}s`;
}

export function getRemainingMs(state: SLATimerState, now = Date.now()): number {
  const effectiveNow = state.pausedAt ?? now;
  const elapsed = effectiveNow - state.startedAt - state.accumulatedPauseMs;
  return state.config.durationMs - elapsed;
}

export function resolveSlaVisualState(
  state: SLATimerState,
  warningThresholdPercent: number,
  criticalThresholdPercent: number,
  now = Date.now()
): SlaVisualState {
  if (state.pausedAt !== null) {
    return 'paused';
  }

  const remainingMs = getRemainingMs(state, now);
  if (remainingMs <= 0) {
    return 'expired';
  }

  const percentRemaining = (remainingMs / Math.max(state.config.durationMs, 1)) * 100;
  if (percentRemaining <= criticalThresholdPercent) {
    return 'critical';
  }

  if (percentRemaining <= warningThresholdPercent) {
    return 'warning';
  }

  return 'nominal';
}

export function summarizeSlaStatus(
  activeTimer: SLATimerState | null,
  completedPhases: SLARecord[],
  format: 'plainText' | 'markdown' = 'plainText',
  now = Date.now()
): string {
  const lines: string[] = [];

  if (format === 'markdown') {
    lines.push('**SLA Status**');
  } else {
    lines.push('SLA Status');
  }

  if (activeTimer) {
    const remainingMs = getRemainingMs(activeTimer, now);
    const label = activeTimer.config.label;
    if (remainingMs >= 0) {
      lines.push(`Active: ${label} (${formatSlaDuration(remainingMs)} remaining)`);
    } else {
      lines.push(`Active: ${label} (EXPIRED +${formatSlaDuration(Math.abs(remainingMs))})`);
    }
  } else {
    lines.push('Active: None');
  }

  if (completedPhases.length === 0) {
    lines.push('Completed: None');
  } else {
    lines.push('Completed:');
    for (const record of completedPhases) {
      lines.push(
        `- ${record.label}: ${record.overageMs > 0 ? `late by ${formatSlaDuration(record.overageMs)}` : 'within SLA'}`
      );
    }
  }

  return lines.join('\n');
}

function getConfiguration() {
  return vscode.workspace.getConfiguration('thruntGod');
}

function getDefaultDurations(): Record<'ttd' | 'ttc' | 'ttr', number> {
  const configured = getConfiguration().get<Record<string, number>>('sla.defaults');
  return {
    ttd: configured?.ttd ?? DEFAULT_SLA_DURATIONS.ttd,
    ttc: configured?.ttc ?? DEFAULT_SLA_DURATIONS.ttc,
    ttr: configured?.ttr ?? DEFAULT_SLA_DURATIONS.ttr,
  };
}

function getWarningThresholdPercent(): number {
  return getConfiguration().get<number>('sla.warningThresholdPercent', 25);
}

function getCriticalThresholdPercent(): number {
  return getConfiguration().get<number>('sla.criticalThresholdPercent', 10);
}

function buildDefaultConfig(phase: Exclude<SLAPhase, 'custom'>): SLATimerConfig {
  const durations = getDefaultDurations();
  const labelMap: Record<Exclude<SLAPhase, 'custom'>, string> = {
    ttd: 'TTD',
    ttc: 'TTC',
    ttr: 'TTR',
  };

  return {
    phase,
    label: labelMap[phase],
    durationMs: durations[phase],
  };
}

function getNextPhaseConfig(current: SLATimerConfig): SLATimerConfig | null {
  if (current.phase === 'ttd') {
    return buildDefaultConfig('ttc');
  }

  if (current.phase === 'ttc') {
    return buildDefaultConfig('ttr');
  }

  return null;
}

function createStorageShape(
  activeTimer: SLATimerState | null,
  completedPhases: SLARecord[]
): StoredSlaTimerState {
  return {
    activeTimer,
    completedPhases,
  };
}

export class SLATimerManager implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly onDidChangeEmitter = new vscode.EventEmitter<SLATimerState | null>();
  readonly onDidChange = this.onDidChangeEmitter.event;

  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private expiryNotified = false;
  private activeTimer: SLATimerState | null = null;
  private completedPhases: SLARecord[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      99
    );
    this.statusBarItem.command = 'thrunt-god.showSlaStatus';
    this.restoreFromState();
    this.updateStatusBar();
  }

  async pickAndStart(): Promise<void> {
    const choice = await vscode.window.showQuickPick(
      [
        { label: 'TTD', description: 'Time to Detect (30 minutes)', value: buildDefaultConfig('ttd') },
        { label: 'TTC', description: 'Time to Contain (4 hours)', value: buildDefaultConfig('ttc') },
        { label: 'TTR', description: 'Time to Report (24 hours)', value: buildDefaultConfig('ttr') },
        { label: 'Custom', description: 'Choose a custom label and duration', value: null },
      ],
      {
        title: 'Start SLA Timer',
        placeHolder: 'Select an SLA phase',
        ignoreFocusOut: true,
      }
    );

    if (!choice) {
      return;
    }

    if (choice.value) {
      await this.start(choice.value);
      return;
    }

    const label = await vscode.window.showInputBox({
      title: 'Custom SLA Timer',
      prompt: 'Label for the custom SLA timer',
      placeHolder: 'Initial Triage',
      ignoreFocusOut: true,
      validateInput: (value) =>
        value.trim().length > 0 ? undefined : 'A label is required.',
    });
    if (!label) {
      return;
    }

    const durationInput = await vscode.window.showInputBox({
      title: 'Custom SLA Duration',
      prompt: 'Duration in minutes',
      placeHolder: '45',
      ignoreFocusOut: true,
      validateInput: (value) => {
        const minutes = Number(value);
        return Number.isFinite(minutes) && minutes > 0
          ? undefined
          : 'Enter a positive number of minutes.';
      },
    });
    if (!durationInput) {
      return;
    }

    await this.start({
      phase: 'custom',
      label: label.trim(),
      durationMs: Number(durationInput) * 60 * 1000,
    });
  }

  async start(config: SLATimerConfig): Promise<void> {
    if (this.activeTimer) {
      const replaceChoice = await vscode.window.showWarningMessage(
        `Timer '${this.activeTimer.config.label}' is active. Replace it?`,
        'Replace',
        'Cancel'
      );
      if (replaceChoice !== 'Replace') {
        return;
      }
    }

    this.activeTimer = {
      config: { ...config },
      startedAt: Date.now(),
      pausedAt: null,
      accumulatedPauseMs: 0,
    };
    this.expiryNotified = false;
    this.startTicking();
    this.updateStatusBar();
    await this.persistState();
    this.onDidChangeEmitter.fire(this.activeTimer);
  }

  async pause(): Promise<void> {
    if (!this.activeTimer || this.activeTimer.pausedAt !== null) {
      return;
    }

    this.activeTimer = {
      ...this.activeTimer,
      pausedAt: Date.now(),
    };
    this.stopTicking();
    this.updateStatusBar();
    await this.persistState();
    this.onDidChangeEmitter.fire(this.activeTimer);
  }

  async resume(): Promise<void> {
    if (!this.activeTimer || this.activeTimer.pausedAt === null) {
      return;
    }

    const now = Date.now();
    this.activeTimer = {
      ...this.activeTimer,
      accumulatedPauseMs:
        this.activeTimer.accumulatedPauseMs + (now - this.activeTimer.pausedAt),
      pausedAt: null,
    };
    this.expiryNotified = false;
    this.startTicking();
    this.updateStatusBar();
    await this.persistState();
    this.onDidChangeEmitter.fire(this.activeTimer);
  }

  async stop(): Promise<void> {
    this.activeTimer = null;
    this.expiryNotified = false;
    this.stopTicking();
    this.updateStatusBar();
    await this.persistState();
    this.onDidChangeEmitter.fire(null);
  }

  async advance(): Promise<void> {
    if (!this.activeTimer) {
      return;
    }

    this.recordCompletion(this.activeTimer);
    const next = getNextPhaseConfig(this.activeTimer.config);
    if (!next) {
      await this.stop();
      return;
    }

    this.activeTimer = null;
    await this.start(next);
  }

  async snooze(minutes = 5): Promise<void> {
    if (!this.activeTimer) {
      return;
    }

    this.activeTimer = {
      ...this.activeTimer,
      config: {
        ...this.activeTimer.config,
        durationMs: this.activeTimer.config.durationMs + minutes * 60 * 1000,
      },
    };
    this.expiryNotified = false;
    this.updateStatusBar();
    await this.persistState();
    this.onDidChangeEmitter.fire(this.activeTimer);
  }

  async showStatus(): Promise<string> {
    const summary = summarizeSlaStatus(this.activeTimer, this.completedPhases);
    await vscode.window.showInformationMessage(summary);
    return summary;
  }

  async copyStatus(format: 'plainText' | 'markdown' = 'plainText'): Promise<string> {
    const summary = summarizeSlaStatus(this.activeTimer, this.completedPhases, format);
    await vscode.env.clipboard.writeText(summary);
    await vscode.window.showInformationMessage('SLA status copied to clipboard.');
    return summary;
  }

  getActiveTimer(): SLATimerState | null {
    return this.activeTimer;
  }

  getCompletedPhases(): SLARecord[] {
    return [...this.completedPhases];
  }

  dispose(): void {
    void this.persistState();
    this.stopTicking();
    this.statusBarItem.dispose();
    this.onDidChangeEmitter.dispose();
  }

  private restoreFromState(): void {
    const stored = this.context.workspaceState.get<StoredSlaTimerState>(SLA_TIMER_STATE_KEY);
    if (!stored) {
      return;
    }

    this.activeTimer = stored.activeTimer ?? null;
    this.completedPhases = Array.isArray(stored.completedPhases)
      ? stored.completedPhases
      : [];

    if (this.activeTimer && this.activeTimer.pausedAt === null) {
      this.startTicking();
    }
  }

  private async persistState(): Promise<void> {
    await this.context.workspaceState.update(
      SLA_TIMER_STATE_KEY,
      createStorageShape(this.activeTimer, this.completedPhases)
    );
  }

  private startTicking(): void {
    if (this.tickInterval) {
      return;
    }

    this.tickInterval = setInterval(() => {
      void this.tick();
    }, 1000);
  }

  private stopTicking(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private async tick(): Promise<void> {
    if (!this.activeTimer) {
      return;
    }

    this.updateStatusBar();

    if (getRemainingMs(this.activeTimer) <= 0 && !this.expiryNotified) {
      this.expiryNotified = true;
      await this.notifyExpiry();
    }
  }

  private updateStatusBar(): void {
    if (!this.activeTimer) {
      this.statusBarItem.hide();
      return;
    }

    const remainingMs = getRemainingMs(this.activeTimer);
    const visualState = resolveSlaVisualState(
      this.activeTimer,
      getWarningThresholdPercent(),
      getCriticalThresholdPercent()
    );

    if (visualState === 'paused') {
      this.statusBarItem.text = `$(debug-pause) ${this.activeTimer.config.label}: PAUSED (${formatSlaDuration(Math.max(0, remainingMs))})`;
    } else if (remainingMs >= 0) {
      this.statusBarItem.text = `$(clock) ${this.activeTimer.config.label}: ${formatSlaDuration(remainingMs)}`;
    } else {
      this.statusBarItem.text = `$(clock) ${this.activeTimer.config.label}: EXPIRED +${formatSlaDuration(Math.abs(remainingMs))}`;
    }

    this.statusBarItem.backgroundColor =
      visualState === 'expired'
        ? new vscode.ThemeColor('statusBarItem.errorBackground')
        : visualState === 'warning' || visualState === 'critical'
          ? new vscode.ThemeColor('statusBarItem.warningBackground')
          : undefined;

    if (visualState === 'nominal') {
      this.statusBarItem.color = new vscode.ThemeColor('charts.green');
    } else if (visualState === 'warning') {
      this.statusBarItem.color = new vscode.ThemeColor('charts.yellow');
    } else if (visualState === 'critical' || visualState === 'expired') {
      this.statusBarItem.color = new vscode.ThemeColor('charts.red');
    } else {
      this.statusBarItem.color = undefined;
    }

    this.statusBarItem.tooltip = summarizeSlaStatus(
      this.activeTimer,
      this.completedPhases,
      'plainText'
    );
    this.statusBarItem.show();
  }

  private recordCompletion(state: SLATimerState): void {
    const now = Date.now();
    const remainingMs = getRemainingMs(state, now);
    this.completedPhases.push({
      phase: state.config.phase,
      label: state.config.label,
      startedAt: state.startedAt,
      deadline: state.startedAt + state.config.durationMs + state.accumulatedPauseMs,
      completedAt: now,
      overageMs: remainingMs < 0 ? Math.abs(remainingMs) : 0,
    });
  }

  private async notifyExpiry(): Promise<void> {
    if (!this.activeTimer) {
      return;
    }

    const choice = await vscode.window.showWarningMessage(
      `SLA Alert: ${this.activeTimer.config.label} has expired.`,
      'Start Next Phase',
      'Snooze 5m',
      'Dismiss'
    );

    if (choice === 'Start Next Phase') {
      await this.advance();
      return;
    }

    if (choice === 'Snooze 5m') {
      await this.snooze(5);
      return;
    }

    if (choice === 'Dismiss') {
      await this.stop();
    }
  }
}
