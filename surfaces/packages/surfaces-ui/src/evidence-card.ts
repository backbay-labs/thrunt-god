/**
 * Evidence cards — structured data for rendering queries, receipts, and findings.
 */
import type { QueryLogSummary, ReceiptSummary, FindingSummary } from '@thrunt-surfaces/contracts';

export interface QueryCardViewModel {
  id: string;
  title: string;
  connector: string;
  dataset: string;
  executedAt: string;
  counts: string;
  hypotheses: string[];
}

export interface ReceiptCardViewModel {
  id: string;
  connector: string;
  claim: string;
  claimStatus: string;
  claimStatusColor: 'green' | 'red' | 'yellow' | 'gray';
  confidence: string;
  createdAt: string;
}

export interface FindingCardViewModel {
  title: string;
  severity: string;
  severityColor: 'red' | 'orange' | 'yellow' | 'blue' | 'gray';
  confidence: string;
  recommendation: string;
}

export function toQueryCard(q: QueryLogSummary): QueryCardViewModel {
  return {
    id: q.queryId,
    title: q.title,
    connector: q.connectorId,
    dataset: q.dataset,
    executedAt: q.executedAt,
    counts: `${q.eventCount} events, ${q.entityCount} entities, ${q.templateCount} templates`,
    hypotheses: q.relatedHypotheses,
  };
}

export function toReceiptCard(r: ReceiptSummary): ReceiptCardViewModel {
  const colorMap: Record<string, 'green' | 'red' | 'yellow' | 'gray'> = {
    supports: 'green',
    contradicts: 'red',
    inconclusive: 'yellow',
    context: 'gray',
  };
  return {
    id: r.receiptId,
    connector: r.connectorId,
    claim: r.claim.length > 150 ? r.claim.slice(0, 147) + '...' : r.claim,
    claimStatus: r.claimStatus,
    claimStatusColor: colorMap[r.claimStatus] ?? 'gray',
    confidence: r.confidence,
    createdAt: r.createdAt,
  };
}

export function toFindingCard(f: FindingSummary): FindingCardViewModel {
  const severityColors: Record<string, 'red' | 'orange' | 'yellow' | 'blue' | 'gray'> = {
    Critical: 'red',
    High: 'orange',
    Medium: 'yellow',
    Low: 'blue',
    Info: 'gray',
  };
  return {
    title: f.title,
    severity: f.severity,
    severityColor: severityColors[f.severity] ?? 'gray',
    confidence: f.confidence,
    recommendation: f.recommendation,
  };
}
