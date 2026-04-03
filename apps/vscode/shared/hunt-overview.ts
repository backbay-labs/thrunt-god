export type DiffKind = 'added' | 'modified' | 'removed';

export interface ActivityFeedEntry {
  artifactType: string;
  artifactId: string;
  diffKind: DiffKind;
  timestamp: string;
}

export interface SessionDiff {
  entries: ActivityFeedEntry[];
  summary: string;
}

export interface SessionContinuitySummary {
  lastActivity: string;
  currentPosition: string;
  changesSummary: string;
  suggestedAction: string;
  hasChanges: boolean;
}

export interface HuntOverviewViewModel {
  mission: {
    signal: string;
    owner: string;
    opened: string;
    mode: string;
    focus: string;
  } | null;

  childHunts: Array<{
    id: string;
    name: string;
    kind: 'case' | 'workstream';
    signal: string;
    status: string;
    currentPhase: number;
    totalPhases: number;
    phaseName: string;
    lastActivity: string;
    findingsPublished: boolean;
  }>;

  phases: Array<{
    number: number;
    name: string;
    status: string;
  }>;
  currentPhase: number;

  verdicts: {
    supported: number;
    disproved: number;
    inconclusive: number;
    open: number;
  };

  evidence: {
    receipts: number;
    queries: number;
    templates: number;
  };

  confidence: string;

  blockers: Array<{ text: string; timestamp: string }>;

  diagnosticsHealth: {
    warnings: number;
    errors: number;
  };

  activityFeed: ActivityFeedEntry[];

  sessionDiff: SessionDiff | null;

  sessionContinuity: SessionContinuitySummary;
}

export interface HuntOverviewBootData {
  surfaceId: 'hunt-overview';
}

export type HostToHuntOverviewMessage =
  | { type: 'init'; viewModel: HuntOverviewViewModel; isDark: boolean }
  | { type: 'update'; viewModel: HuntOverviewViewModel }
  | { type: 'theme'; isDark: boolean }
  | { type: 'selection:highlight'; artifactId: string | null };

export type HuntOverviewToHostMessage =
  | { type: 'webview:ready' }
  | { type: 'navigate'; target: string }
  | { type: 'artifact:select'; artifactId: string }
  | { type: 'blur' };
