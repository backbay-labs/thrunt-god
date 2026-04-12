/**
 * Case card — structured data for rendering a case summary card.
 */
import type { CaseSummary } from '@thrunt-surfaces/contracts';

export interface CaseCardViewModel {
  title: string;
  mode: string;
  status: string;
  owner: string;
  opened: string;
  signalPreview: string;
  statusColor: 'green' | 'yellow' | 'red' | 'gray';
}

export function toCaseCard(cs: CaseSummary): CaseCardViewModel {
  return {
    title: cs.title,
    mode: cs.mode,
    status: cs.status,
    owner: cs.owner,
    opened: cs.opened,
    signalPreview: cs.signal.length > 120 ? cs.signal.slice(0, 117) + '...' : cs.signal,
    statusColor: cs.status === 'Open' ? 'green' : cs.status === 'Closed' ? 'gray' : 'yellow',
  };
}
