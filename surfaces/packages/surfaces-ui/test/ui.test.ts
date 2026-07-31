import { describe, test, expect } from 'bun:test';
import { toCaseCard, toPhaseTimeline, toQueryCard, toReceiptCard, toFindingCard, toVendorStatus } from '../src/index.ts';
import { mockCaseSummary } from '@thrunt-surfaces/mocks';
import { mockProgress } from '@thrunt-surfaces/mocks';
import { mockQueries } from '@thrunt-surfaces/mocks';
import { mockReceipts } from '@thrunt-surfaces/mocks';
import { mockFindings } from '@thrunt-surfaces/mocks';

describe('UI primitives', () => {
  test('toCaseCard produces valid view model', () => {
    const card = toCaseCard(mockCaseSummary);
    expect(card.title).toBe('OAuth Session Hijack Investigation');
    expect(card.statusColor).toBe('green');
  });

  test('toPhaseTimeline produces items', () => {
    const timeline = toPhaseTimeline(mockProgress);
    expect(timeline.items.length).toBe(4);
    expect(timeline.overallPercent).toBe(62);
  });

  test('toQueryCard produces valid view model', () => {
    const card = toQueryCard(mockQueries[0]);
    expect(card.connector).toBe('okta');
    expect(card.counts).toContain('1542');
  });

  test('toReceiptCard produces valid view model', () => {
    const card = toReceiptCard(mockReceipts[0]);
    expect(card.claimStatusColor).toBe('green');
  });

  test('toFindingCard produces valid view model', () => {
    const card = toFindingCard(mockFindings[0]);
    expect(card.severityColor).toBe('red');
  });

  test('toVendorStatus produces valid view model', () => {
    const status = toVendorStatus('splunk', 'connected');
    expect(status.displayName).toBe('Splunk');
  });
});
