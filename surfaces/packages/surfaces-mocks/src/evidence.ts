import type { CapturedEvidenceSummary } from '@thrunt-surfaces/contracts';

export const mockEvidence: CapturedEvidenceSummary[] = [
  {
    evidenceId: 'EVD-20260411-ABCD',
    type: 'query_clip',
    vendorId: 'okta',
    capturedAt: '2026-04-11T13:15:00Z',
    capturedBy: 'analyst-1',
    sourceUrl: 'https://acme-admin.okta.com/admin/reports/system-log',
    relatedHypotheses: ['HYP-01'],
    reviewStatus: 'captured',
    summary: 'Evidence: query_clip from okta',
    classification: 'plain_evidence',
    canonicalizationReason: null,
    relatedQueries: [],
    relatedReceipts: [],
  },
];
