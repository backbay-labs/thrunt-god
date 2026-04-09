export interface CaseCard {
  id: string;
  slug: string;
  name: string;
  kind: 'case' | 'workstream';
  status: 'active' | 'closed' | 'stale';
  openedAt: string;
  closedAt: string | null;
  techniqueCount: number;
  signal: string;
  currentPhase: number;
  totalPhases: number;
  phaseName: string;
  lastActivity: string;
  findingsPublished: boolean;
}

export interface ProgramDashboardViewModel {
  programName: string;
  missionSnippet: string;
  cases: CaseCard[];
  aggregates: {
    total: number;
    active: number;
    closed: number;
    stale: number;
    uniqueTechniques: number;
  };
  timeline: Array<{ date: string; event: string; slug: string }>;
}

export interface ProgramDashboardBootData {
  surfaceId: 'program-dashboard';
}

export type HostToProgramDashboardMessage =
  | { type: 'init'; viewModel: ProgramDashboardViewModel; isDark: boolean }
  | { type: 'update'; viewModel: ProgramDashboardViewModel }
  | { type: 'theme'; isDark: boolean };

export type ProgramDashboardToHostMessage =
  | { type: 'webview:ready' }
  | { type: 'case:open'; id: string }
  | { type: 'refresh' };
