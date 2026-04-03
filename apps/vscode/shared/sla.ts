export type SLAPhase = 'ttd' | 'ttc' | 'ttr' | 'custom';

export interface SLATimerConfig {
  phase: SLAPhase;
  label: string;
  durationMs: number;
}

export interface SLATimerState {
  config: SLATimerConfig;
  startedAt: number;
  pausedAt: number | null;
  accumulatedPauseMs: number;
}

export interface SLARecord {
  phase: SLAPhase;
  label: string;
  startedAt: number;
  deadline: number;
  completedAt: number;
  overageMs: number;
}

export type SlaVisualState = 'nominal' | 'warning' | 'critical' | 'expired' | 'paused';
