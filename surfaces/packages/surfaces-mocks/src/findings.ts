import type { FindingSummary } from '@thrunt-surfaces/contracts';

export const mockFindings: FindingSummary[] = [
  {
    title: 'Automated OAuth token refresh from adversary infrastructure',
    severity: 'Critical',
    confidence: 'High',
    relatedHypotheses: ['HYP-01'],
    recommendation: 'Revoke all affected refresh tokens immediately. Rotate service account credentials. Implement conditional access policies to block token refresh from unrecognized IP ranges.',
  },
  {
    title: 'Suspicious IP ranges linked to commercial VPN provider',
    severity: 'Medium',
    confidence: 'High',
    relatedHypotheses: ['HYP-04'],
    recommendation: 'Add identified VPN exit node IP ranges to watchlist. Consider blocking automated API access from known VPN providers for service accounts.',
  },
];
