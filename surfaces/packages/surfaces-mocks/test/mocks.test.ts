import { describe, test, expect } from 'bun:test';
import {
  mockCaseSummary,
  mockProgress,
  mockHypotheses,
  mockQueries,
  mockReceipts,
  mockFindings,
  mockCaseViewModel,
  mockBridgeHealth,
  mockVendorPages,
} from '../src/index.ts';

describe('surfaces-mocks', () => {
  test('mockCaseSummary has required fields', () => {
    expect(mockCaseSummary.title).toBeTruthy();
    expect(mockCaseSummary.status).toBe('Open');
    expect(mockCaseSummary.mode).toBe('case');
  });

  test('mockProgress has phases and percent', () => {
    expect(mockProgress.phases.length).toBe(4);
    expect(mockProgress.percent).toBeGreaterThan(0);
    expect(mockProgress.currentPhase).toBe(3);
  });

  test('mockHypotheses has mixed statuses', () => {
    expect(mockHypotheses.length).toBe(4);
    const statuses = mockHypotheses.map(h => h.status);
    expect(statuses).toContain('Supported');
    expect(statuses).toContain('Open');
    expect(statuses).toContain('Inconclusive');
  });

  test('mockQueries have connector IDs', () => {
    expect(mockQueries.length).toBeGreaterThan(0);
    for (const q of mockQueries) {
      expect(q.connectorId).toBeTruthy();
      expect(q.queryId).toBeTruthy();
    }
  });

  test('mockReceipts have claim statuses', () => {
    expect(mockReceipts.length).toBeGreaterThan(0);
    for (const r of mockReceipts) {
      expect(['supports', 'contradicts', 'inconclusive', 'context']).toContain(r.claimStatus);
    }
  });

  test('mockFindings have severity and recommendation', () => {
    expect(mockFindings.length).toBeGreaterThan(0);
    for (const f of mockFindings) {
      expect(f.severity).toBeTruthy();
      expect(f.recommendation).toBeTruthy();
    }
  });

  test('mockCaseViewModel assembles all sub-fixtures', () => {
    expect(mockCaseViewModel.case.title).toBeTruthy();
    expect(mockCaseViewModel.progress.phases.length).toBeGreaterThan(0);
    expect(mockCaseViewModel.hypotheses.length).toBeGreaterThan(0);
    expect(mockCaseViewModel.recentQueries.length).toBeGreaterThan(0);
    expect(mockCaseViewModel.recentReceipts.length).toBeGreaterThan(0);
    expect(mockCaseViewModel.findings.length).toBeGreaterThan(0);
    expect(mockCaseViewModel.recommendedAction).toBeTruthy();
  });

  test('mockBridgeHealth returns mock mode', () => {
    expect(mockBridgeHealth.mockMode).toBe(true);
    expect(mockBridgeHealth.status).toBe('ok');
  });

  test('mockVendorPages covers key platforms', () => {
    expect(mockVendorPages.splunk).toBeDefined();
    expect(mockVendorPages.elastic).toBeDefined();
    expect(mockVendorPages.sentinel).toBeDefined();
    expect(mockVendorPages.okta).toBeDefined();
    expect(mockVendorPages.aws).toBeDefined();
    expect(mockVendorPages.gcp).toBeDefined();
  });

  test('mockVendorPages splunk has query and table', () => {
    const sp = mockVendorPages.splunk;
    expect(sp.query).toBeTruthy();
    expect(sp.query?.language).toBe('spl');
    expect(sp.table).toBeTruthy();
    expect(sp.table?.headers.length).toBeGreaterThan(0);
  });
});
