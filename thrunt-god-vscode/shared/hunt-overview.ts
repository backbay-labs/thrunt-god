// --- Session diff types (DASH-07, DASH-08) ---

export type DiffKind = 'added' | 'modified' | 'removed';

export interface ActivityFeedEntry {
  artifactType: string;   // 'query' | 'receipt' | 'hypothesis' | 'mission' | etc.
  artifactId: string;     // e.g. "QRY-20260329-001"
  diffKind: DiffKind;
  timestamp: string;      // ISO date string (from file mtime or store event)
}

export interface SessionDiff {
  entries: ActivityFeedEntry[];
  summary: string;         // e.g. "2 added, 1 modified since last session"
}

export interface SessionContinuitySummary {
  whereLeftOff: string;
  lastActivity: string;
  recentChanges: string;
  nextStep: string;
}

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

  // Blockers (structured with timestamps per locked decision)
  blockers: Array<{ text: string; timestamp: string }>;

  // Diagnostics health bridge
  diagnosticsHealth: {
    warnings: number;
    errors: number;
  };

  // Activity feed (DASH-08)
  activityFeed: ActivityFeedEntry[];

  // Session diff (DASH-07)
  sessionDiff: SessionDiff | null;

  // Session continuity summary (XNAV-05)
  sessionContinuity: SessionContinuitySummary | null;
}

export interface HuntOverviewBootData {
  surfaceId: 'hunt-overview';
}

export type HostToHuntOverviewMessage =
  | { type: 'init'; viewModel: HuntOverviewViewModel; isDark: boolean }
  | { type: 'update'; viewModel: HuntOverviewViewModel }
  | { type: 'theme'; isDark: boolean }
  | { type: 'focus'; artifactId: string };

export type HuntOverviewToHostMessage =
  | { type: 'webview:ready' }
  | { type: 'navigate'; target: string }
  | { type: 'artifact:select'; artifactId: string }
  | { type: 'blur' };
