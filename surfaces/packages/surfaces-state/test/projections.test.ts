import { describe, test, expect } from 'bun:test';
import { projectCaseViewModel, deriveHypothesisStats } from '../src/projections.ts';
import type { RawArtifacts } from '../src/projections.ts';
import { mockCaseSummary } from '@thrunt-surfaces/mocks';
import { mockProgress } from '@thrunt-surfaces/mocks';
import { mockHypotheses } from '@thrunt-surfaces/mocks';
import { mockQueries } from '@thrunt-surfaces/mocks';
import { mockReceipts } from '@thrunt-surfaces/mocks';
import { mockEvidence } from '@thrunt-surfaces/mocks';
import { mockFindings } from '@thrunt-surfaces/mocks';

function createArtifacts(overrides?: Partial<RawArtifacts>): RawArtifacts {
  return {
    mission: mockCaseSummary,
    progress: mockProgress,
    hypotheses: mockHypotheses,
    queries: mockQueries,
    receipts: mockReceipts,
    evidence: mockEvidence,
    findings: mockFindings,
    blockers: [],
    ...overrides,
  };
}

describe('projectCaseViewModel', () => {
  test('returns null when mission is missing', () => {
    const result = projectCaseViewModel(createArtifacts({ mission: null }));
    expect(result).toBeNull();
  });

  test('returns null when progress is missing', () => {
    const result = projectCaseViewModel(createArtifacts({ progress: null }));
    expect(result).toBeNull();
  });

  test('projects a full view model from mock data', () => {
    const vm = projectCaseViewModel(createArtifacts({
      certificationFreshness: [{
        vendorId: 'okta',
        currentStatus: 'live-blocked',
        lastCampaignId: 'CERT-OKTA-1',
        lastCampaignAt: '2026-04-11T12:00:00Z',
        lastLiveCertifiedCampaignId: null,
        lastLiveCertifiedAt: null,
        activeBaselineCampaignId: null,
        activeBaselinePromotedAt: null,
        ageHours: null,
        ageDays: null,
        bucket: 'uncertified',
        state: 'blocked',
        nextRecommendedRecertificationAt: null,
        overdue: true,
        blockingCampaignCount: 1,
        policy: { freshWithinHours: 168, agingWithinHours: 336 },
        reasons: ['Missing live session capture'],
      }],
      certificationBaselineChurn: [{
        vendorId: 'okta',
        currentStatus: 'live-blocked',
        activeBaselineCampaignId: null,
        activeBaselinePromotedAt: null,
        activeBaselineAgeDays: null,
        promotedBaselineCount: 0,
        supersededBaselineCount: 0,
        replacementCount: 0,
        averageReplacementIntervalDays: null,
        shortestReplacementIntervalDays: null,
        lastReplacementAt: null,
        driftClassesLeadingToReplacement: [],
        currentStabilityPosture: 'no_baseline',
        suspicionFlags: ['no_stable_baseline'],
      }],
    }));
    expect(vm).not.toBeNull();
    expect(vm!.case.title).toBe('OAuth Session Hijack Investigation');
    expect(vm!.progress.currentPhase).toBe(3);
    expect(vm!.hypotheses).toHaveLength(4);
    expect(vm!.findings).toHaveLength(2);
    expect(vm!.recentEvidence).toHaveLength(1);
    expect(vm!.certification?.certificationFreshness[0]?.bucket).toBe('uncertified');
    expect(vm!.certification?.certificationBaselineChurn[0]?.currentStabilityPosture).toBe('no_baseline');
  });

  test('slices queries and receipts to 10 max', () => {
    const vm = projectCaseViewModel(createArtifacts());
    expect(vm).not.toBeNull();
    expect(vm!.recentQueries.length).toBeLessThanOrEqual(10);
    expect(vm!.recentReceipts.length).toBeLessThanOrEqual(10);
    expect(vm!.recentEvidence.length).toBeLessThanOrEqual(10);
  });

  test('derives blockers from open critical hypotheses', () => {
    // mockHypotheses has HYP-03 as Critical + Open
    const vm = projectCaseViewModel(createArtifacts());
    expect(vm).not.toBeNull();
    expect(vm!.blockers).toContain('1 critical hypothesis(es) still open');
  });

  test('no blockers when no open critical hypotheses', () => {
    const noCritical = mockHypotheses.map(h => ({
      ...h,
      status: h.status === 'Open' ? 'Supported' as const : h.status,
    }));
    const vm = projectCaseViewModel(createArtifacts({ hypotheses: noCritical }));
    expect(vm).not.toBeNull();
    expect(vm!.blockers).toHaveLength(0);
  });

  test('preserves artifact-derived blockers', () => {
    const vm = projectCaseViewModel(createArtifacts({ blockers: ['Evidence follow-up: link captured query to hypothesis'] }));
    expect(vm).not.toBeNull();
    expect(vm!.blockers).toContain('Evidence follow-up: link captured query to hypothesis');
  });

  test('derives recommended action for running phase', () => {
    // Phase 3 is running in mockProgress
    const vm = projectCaseViewModel(createArtifacts());
    expect(vm).not.toBeNull();
    expect(vm!.recommendedAction).toContain('Continue phase 3');
  });

  test('derives recommended action for planned phase', () => {
    const plannedProgress = {
      ...mockProgress,
      currentPhase: 4,
    };
    const vm = projectCaseViewModel(createArtifacts({ progress: plannedProgress }));
    expect(vm).not.toBeNull();
    expect(vm!.recommendedAction).toContain('Start phase 4');
  });
});

describe('deriveHypothesisStats', () => {
  test('computes stats from mock hypotheses', () => {
    const stats = deriveHypothesisStats(mockHypotheses);
    expect(stats.total).toBe(4);
    expect(stats.supported).toBe(2);
    expect(stats.disproved).toBe(0);
    expect(stats.inconclusive).toBe(1);
    expect(stats.open).toBe(1);
  });

  test('handles empty array', () => {
    const stats = deriveHypothesisStats([]);
    expect(stats.total).toBe(0);
    expect(stats.supported).toBe(0);
    expect(stats.disproved).toBe(0);
    expect(stats.inconclusive).toBe(0);
    expect(stats.open).toBe(0);
  });
});
