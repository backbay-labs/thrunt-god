import type { CaseSummary } from '@thrunt-surfaces/contracts';

export const mockCaseSummary: CaseSummary = {
  caseRoot: '/home/analyst/hunts/oauth-session-hijack',
  title: 'OAuth Session Hijack Investigation',
  mode: 'case',
  opened: '2026-04-10T09:00:00Z',
  owner: 'analyst-1',
  status: 'Open',
  signal: 'Anomalous OAuth token refresh patterns detected across 3 Okta tenants. Multiple service accounts refreshing tokens at 2-minute intervals from previously unseen IP ranges.',
  desiredOutcome: 'Determine whether the token refresh pattern indicates active session hijacking, identify affected accounts, and assess lateral movement risk.',
  scope: 'Okta audit logs (3 tenants), Azure AD sign-in logs, CloudTrail API calls from associated AWS accounts. Time range: 2026-04-08 to present.',
  workingTheory: 'Attacker obtained OAuth refresh tokens via phishing or token theft, and is maintaining persistent access by programmatically refreshing sessions from rotating infrastructure.',
};

export const mockCase = {
  case: mockCaseSummary,
};
