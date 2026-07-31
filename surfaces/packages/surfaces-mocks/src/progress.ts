import type { CaseProgress, PhaseSummary } from '@thrunt-surfaces/contracts';

export const mockPhases: PhaseSummary[] = [
  { number: 1, name: 'Signal Triage & Scope', goal: 'Validate signal and define hunt boundaries', status: 'complete', dependsOn: '', planCount: 2, completedPlans: 2 },
  { number: 2, name: 'Token Refresh Pattern Analysis', goal: 'Map the anomalous refresh behavior across all tenants', status: 'complete', dependsOn: '1', planCount: 3, completedPlans: 3 },
  { number: 3, name: 'Lateral Movement Assessment', goal: 'Determine if compromised tokens were used for resource access', status: 'running', dependsOn: '2', planCount: 2, completedPlans: 1 },
  { number: 4, name: 'Attribution & Publish', goal: 'Attribute activity to threat actor and publish findings', status: 'planned', dependsOn: '3', planCount: 0, completedPlans: 0 },
];

export const mockProgress: CaseProgress = {
  milestone: 'v1.0',
  milestoneName: 'OAuth Session Hijack',
  currentPhase: 3,
  totalPhases: 4,
  currentPlan: 2,
  totalPlansInPhase: 2,
  percent: 62,
  phases: mockPhases,
  lastActivity: 'Completed AWS CloudTrail query for cross-account API calls from suspicious IPs',
  lastUpdated: '2026-04-11T14:30:00Z',
};
