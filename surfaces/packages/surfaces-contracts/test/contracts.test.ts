import { describe, test, expect } from 'bun:test';
import type {
  CaseSummary,
  CaseProgress,
  CaseViewModel,
  QuerySpec,
  ResultEnvelope,
  ConnectorCapabilities,
  SiteAdapter,
  BridgeHealthResponse,
  EvidenceAttachment,
} from '../src/index.ts';

describe('surfaces-contracts', () => {
  test('CaseSummary type is structurally valid', () => {
    const cs: CaseSummary = {
      caseRoot: '/test',
      title: 'Test Case',
      mode: 'case',
      opened: '2026-01-01T00:00:00Z',
      owner: 'tester',
      status: 'Open',
      signal: 'test signal',
      desiredOutcome: 'test outcome',
      scope: 'test scope',
      workingTheory: 'test theory',
    };
    expect(cs.title).toBe('Test Case');
    expect(cs.status).toBe('Open');
  });

  test('QuerySpec shape matches connector-sdk.cjs', () => {
    const spec: Partial<QuerySpec> = {
      version: '1.0',
      query_id: 'QRY-TEST-001',
      connector: { id: 'splunk', profile: 'default', tenant: null, region: null },
      dataset: { kind: 'events', name: null, version: null },
    };
    expect(spec.version).toBe('1.0');
    expect(spec.connector?.id).toBe('splunk');
    expect(spec.dataset?.kind).toBe('events');
  });

  test('EvidenceAttachment supports all payload kinds', () => {
    const queryAttachment: EvidenceAttachment = {
      surfaceId: 'test',
      type: 'query_clip',
      vendorId: 'splunk',
      sourceUrl: 'https://example.com',
      capturedAt: '2026-01-01T00:00:00Z',
      capturedBy: 'tester',
      hypothesisIds: [],
      payload: { kind: 'query', language: 'spl', statement: 'index=main' },
    };
    expect(queryAttachment.payload.kind).toBe('query');

    const noteAttachment: EvidenceAttachment = {
      surfaceId: 'test',
      type: 'manual_note',
      vendorId: 'unknown',
      sourceUrl: '',
      capturedAt: '2026-01-01T00:00:00Z',
      capturedBy: 'tester',
      hypothesisIds: [],
      payload: { kind: 'note', text: 'This is a note' },
    };
    expect(noteAttachment.payload.kind).toBe('note');
  });

  test('BridgeHealthResponse type is valid', () => {
    const health: BridgeHealthResponse = {
      status: 'ok',
      version: '0.1.0',
      mockMode: false,
      projectRoot: '/test',
      planningExists: true,
      caseOpen: true,
      uptime: 100,
    };
    expect(health.status).toBe('ok');
  });
});
