import type { HypothesisSummary } from '@thrunt-surfaces/contracts';

export const mockHypotheses: HypothesisSummary[] = [
  {
    id: 'HYP-01',
    assertion: 'Attacker is maintaining persistent access via stolen OAuth refresh tokens',
    priority: 'Critical',
    status: 'Supported',
    confidence: 'High',
  },
  {
    id: 'HYP-02',
    assertion: 'Token theft occurred via phishing campaign targeting service account owners',
    priority: 'High',
    status: 'Inconclusive',
    confidence: 'Medium',
  },
  {
    id: 'HYP-03',
    assertion: 'Compromised tokens have been used for lateral movement into AWS accounts',
    priority: 'Critical',
    status: 'Open',
    confidence: 'Low',
  },
  {
    id: 'HYP-04',
    assertion: 'The rotating IP ranges belong to a commercial VPN service used for obfuscation',
    priority: 'Medium',
    status: 'Supported',
    confidence: 'High',
  },
];
