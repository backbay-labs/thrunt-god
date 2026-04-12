import type { CaseViewModel } from '@thrunt-surfaces/contracts';
import { mockCaseSummary } from './case.ts';
import { mockProgress } from './progress.ts';
import { mockHypotheses } from './hypotheses.ts';
import { mockQueries } from './queries.ts';
import { mockReceipts } from './receipts.ts';
import { mockEvidence } from './evidence.ts';
import { mockFindings } from './findings.ts';

export const mockCaseViewModel: CaseViewModel = {
  case: mockCaseSummary,
  progress: mockProgress,
  hypotheses: mockHypotheses,
  recentQueries: mockQueries,
  recentReceipts: mockReceipts,
  recentEvidence: mockEvidence,
  findings: mockFindings,
  blockers: [
    'Awaiting SOC approval to expand scope to production AWS accounts',
  ],
  readinessBlockers: [],
  recommendedAction: 'Complete lateral movement assessment: run CloudTrail query for IAM role assumption from suspicious IPs across remaining AWS accounts.',
  runtimePreview: null,
  lastExecution: null,
  certification: [
    {
      vendorId: 'okta',
      status: 'fixture-certified',
      source: 'fixture',
      generatedAt: '2026-04-11T13:30:00Z',
      summary: 'Okta adapter passes checked-in fixture validation.',
    },
  ],
  certificationCampaigns: [],
  certificationHistory: [],
  certificationDriftTrends: [],
  certificationBaselines: [],
  certificationFreshness: [],
  certificationBaselineChurn: [],
  recommendedActions: [],
  evidenceTimeline: [],
  adapterStatuses: [],
};
