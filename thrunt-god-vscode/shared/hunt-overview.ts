// View model: data the host sends to the Hunt Overview webview
export interface HuntOverviewViewModel {
  // Mission identity
  mission: {
    signal: string;
    owner: string;
    opened: string;
    mode: string;
    focus: string;
  } | null;

  // Phase progress
  phases: Array<{
    number: number;
    name: string;
    status: string;  // 'planned' | 'running' | 'complete'
  }>;
  currentPhase: number;

  // Hypothesis verdicts
  verdicts: {
    supported: number;
    disproved: number;
    inconclusive: number;
    open: number;
  };

  // Evidence counts
  evidence: {
    receipts: number;
    queries: number;
    templates: number;
  };

  // Confidence
  confidence: string;

  // Blockers
  blockers: string[];

  // Diagnostics health bridge
  diagnosticsHealth: {
    warnings: number;
    errors: number;
  };
}

export interface HuntOverviewBootData {
  surfaceId: 'hunt-overview';
}

export type HostToHuntOverviewMessage =
  | { type: 'init'; viewModel: HuntOverviewViewModel; isDark: boolean }
  | { type: 'update'; viewModel: HuntOverviewViewModel }
  | { type: 'theme'; isDark: boolean };

export type HuntOverviewToHostMessage =
  | { type: 'webview:ready' }
  | { type: 'navigate'; target: string }
  | { type: 'blur' };
