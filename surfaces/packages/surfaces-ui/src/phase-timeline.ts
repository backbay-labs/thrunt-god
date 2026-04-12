/**
 * Phase timeline — structured data for rendering a phase progress rail.
 */
import type { PhaseSummary, CaseProgress } from '@thrunt-surfaces/contracts';

export interface PhaseTimelineItem {
  number: number;
  name: string;
  status: 'complete' | 'running' | 'planned';
  isCurrent: boolean;
  progress: string; // "2/3 plans"
  statusIcon: string; // '✓', '▶', '○'
}

export interface PhaseTimelineViewModel {
  items: PhaseTimelineItem[];
  overallPercent: number;
  currentPhaseName: string;
}

export function toPhaseTimeline(progress: CaseProgress): PhaseTimelineViewModel {
  const items: PhaseTimelineItem[] = progress.phases.map((phase) => ({
    number: phase.number,
    name: phase.name,
    status: phase.status,
    isCurrent: phase.number === progress.currentPhase,
    progress: `${phase.completedPlans}/${phase.planCount} plans`,
    statusIcon: phase.status === 'complete' ? '\u2713' : phase.status === 'running' ? '\u25B6' : '\u25CB',
  }));

  const current = progress.phases.find((p) => p.number === progress.currentPhase);

  return {
    items,
    overallPercent: progress.percent,
    currentPhaseName: current?.name ?? 'Unknown',
  };
}
