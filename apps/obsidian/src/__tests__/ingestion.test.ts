import { describe, it, expect } from 'vitest';
import {
  extractEntitiesFromReceipt,
  extractEntitiesFromQuery,
  buildSightingLine,
  deduplicateSightings,
  formatIngestionLog,
  buildReceiptTimeline,
} from '../ingestion';
import type { ReceiptSnapshot, QuerySnapshot, IngestionResult } from '../types';

// ---------------------------------------------------------------------------
// extractEntitiesFromReceipt
// ---------------------------------------------------------------------------

describe('extractEntitiesFromReceipt', () => {
  it('returns an EntityInstruction for each technique_ref', () => {
    const snapshot: ReceiptSnapshot = {
      receipt_id: 'RCT-001',
      claim_status: 'supports',
      result_status: 'ok',
      related_hypotheses: ['H1'],
      related_queries: ['QRY-001'],
      claim: 'Lateral movement observed via PsExec',
      evidence_summary: 'Process execution logs show PsExec activity',
      technique_refs: ['T1059.001', 'T1021.002'],
      confidence: 'High',
    };

    const instructions = extractEntitiesFromReceipt(snapshot, 'RCT-001.md');

    expect(instructions).toHaveLength(2);

    expect(instructions[0]).toMatchObject({
      entityType: 'ttp',
      name: 'T1059.001',
      folder: 'entities/ttps',
      sourceId: 'RCT-001',
    });

    expect(instructions[1]).toMatchObject({
      entityType: 'ttp',
      name: 'T1021.002',
      folder: 'entities/ttps',
      sourceId: 'RCT-001',
    });
  });

  it('returns empty array when no technique_refs', () => {
    const snapshot: ReceiptSnapshot = {
      receipt_id: 'RCT-002',
      claim_status: 'context',
      result_status: 'ok',
      related_hypotheses: [],
      related_queries: [],
      claim: 'No technique refs here',
      evidence_summary: '',
      technique_refs: [],
      confidence: '',
    };

    const instructions = extractEntitiesFromReceipt(snapshot, 'RCT-002.md');
    expect(instructions).toHaveLength(0);
  });

  it('includes a sighting line in each instruction', () => {
    const snapshot: ReceiptSnapshot = {
      receipt_id: 'RCT-003',
      claim_status: 'supports',
      result_status: 'ok',
      related_hypotheses: [],
      related_queries: [],
      claim: 'Found evidence of command execution',
      evidence_summary: '',
      technique_refs: ['T1059'],
      confidence: '',
    };

    const instructions = extractEntitiesFromReceipt(snapshot, 'RCT-003.md');
    expect(instructions[0]!.sightingLine).toContain('**RCT-003**');
    expect(instructions[0]!.sightingLine).toContain('[[RCT-003.md]]');
  });
});

// ---------------------------------------------------------------------------
// extractEntitiesFromQuery
// ---------------------------------------------------------------------------

describe('extractEntitiesFromQuery', () => {
  it('returns EntityInstructions for each IP, domain, and hash', () => {
    const snapshot: QuerySnapshot = {
      query_id: 'QRY-001',
      dataset: 'events',
      result_status: 'ok',
      related_hypotheses: ['H1'],
      related_receipts: ['RCT-001'],
      intent: 'Search for lateral movement indicators',
      entity_refs: {
        ips: ['192.168.1.100', '10.0.0.5'],
        domains: ['evil.example.com'],
        hashes: ['abc123def456abc123def456abc123de'],
      },
    };

    const instructions = extractEntitiesFromQuery(snapshot, 'QRY-001.md');

    // 2 IPs + 1 domain + 1 hash = 4
    expect(instructions).toHaveLength(4);

    // IPs
    expect(instructions[0]).toMatchObject({
      entityType: 'ioc/ip',
      name: '192.168.1.100',
      folder: 'entities/iocs',
      sourceId: 'QRY-001',
    });
    expect(instructions[1]).toMatchObject({
      entityType: 'ioc/ip',
      name: '10.0.0.5',
      folder: 'entities/iocs',
      sourceId: 'QRY-001',
    });

    // Domain
    expect(instructions[2]).toMatchObject({
      entityType: 'ioc/domain',
      name: 'evil.example.com',
      folder: 'entities/iocs',
      sourceId: 'QRY-001',
    });

    // Hash
    expect(instructions[3]).toMatchObject({
      entityType: 'ioc/hash',
      name: 'abc123def456abc123def456abc123de',
      folder: 'entities/iocs',
      sourceId: 'QRY-001',
    });
  });

  it('returns empty array when no entity_refs', () => {
    const snapshot: QuerySnapshot = {
      query_id: 'QRY-002',
      dataset: 'events',
      result_status: 'ok',
      related_hypotheses: [],
      related_receipts: [],
      intent: 'General search',
      entity_refs: { ips: [], domains: [], hashes: [] },
    };

    const instructions = extractEntitiesFromQuery(snapshot, 'QRY-002.md');
    expect(instructions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildSightingLine
// ---------------------------------------------------------------------------

describe('buildSightingLine', () => {
  it('produces a markdown sighting line with sourceId, date, claim, and file link', () => {
    const line = buildSightingLine('RCT-001', 'Lateral movement via PsExec observed', 'RCT-001.md');

    expect(line).toMatch(/^- \*\*RCT-001\*\*/);
    // Should contain an ISO-ish date in parens
    expect(line).toMatch(/\(\d{4}-\d{2}-\d{2}/);
    expect(line).toContain('Lateral movement via PsExec observed');
    expect(line).toContain('[[RCT-001.md]]');
  });

  it('truncates claim to 80 characters', () => {
    const longClaim = 'A'.repeat(120);
    const line = buildSightingLine('QRY-001', longClaim, 'QRY-001.md');

    // The claim portion should be truncated -- check full line doesn't have 120 A's
    expect(line).not.toContain('A'.repeat(120));
    // But should contain up to 80
    expect(line).toContain('A'.repeat(77) + '...');
  });
});

// ---------------------------------------------------------------------------
// deduplicateSightings
// ---------------------------------------------------------------------------

describe('deduplicateSightings', () => {
  const existingContent = `---
type: ttp
mitre_id: T1059.001
---
# T1059.001

## Sightings

- **RCT-001** (2026-04-10): Lateral movement via PsExec [[RCT-001.md]]

## Related

`;

  it('returns false if sourceId already appears in the Sightings section', () => {
    const isNew = deduplicateSightings(existingContent, 'RCT-001');
    expect(isNew).toBe(false);
  });

  it('returns true if sourceId does NOT appear in the Sightings section', () => {
    const isNew = deduplicateSightings(existingContent, 'RCT-999');
    expect(isNew).toBe(true);
  });

  it('returns true for empty content', () => {
    const isNew = deduplicateSightings('', 'RCT-001');
    expect(isNew).toBe(true);
  });

  it('returns true when content has no Sightings section', () => {
    const noSightings = `---
type: ttp
---
# T1059

## Related

- **RCT-001** appears here but not in sightings
`;
    const isNew = deduplicateSightings(noSightings, 'RCT-001');
    expect(isNew).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatIngestionLog
// ---------------------------------------------------------------------------

describe('formatIngestionLog', () => {
  it('produces markdown block with timestamp, counts, and entity list', () => {
    const result: IngestionResult = {
      created: 2,
      updated: 1,
      skipped: 0,
      timestamp: '2026-04-10T12:00:00Z',
      entities: [
        {
          action: 'create',
          entityType: 'ttp',
          name: 'T1059.001',
          folder: 'entities/ttps',
          sightingLine: '- **RCT-001** ...',
          sourceId: 'RCT-001',
        },
        {
          action: 'create',
          entityType: 'ioc/ip',
          name: '192.168.1.100',
          folder: 'entities/iocs',
          sightingLine: '- **QRY-001** ...',
          sourceId: 'QRY-001',
        },
        {
          action: 'update',
          entityType: 'ttp',
          name: 'T1021.002',
          folder: 'entities/ttps',
          sightingLine: '- **RCT-002** ...',
          sourceId: 'RCT-002',
        },
      ],
    };

    const log = formatIngestionLog(result);

    expect(log).toContain('## 2026-04-10T12:00:00Z');
    expect(log).toContain('- Created: 2');
    expect(log).toContain('- Updated: 1');
    expect(log).toContain('- Skipped: 0');
    expect(log).toContain('### Entities');
    expect(log).toContain('- create ttp T1059.001 from RCT-001');
    expect(log).toContain('- create ioc/ip 192.168.1.100 from QRY-001');
    expect(log).toContain('- update ttp T1021.002 from RCT-002');
  });

  it('handles empty entities list', () => {
    const result: IngestionResult = {
      created: 0,
      updated: 0,
      skipped: 5,
      timestamp: '2026-04-10T12:00:00Z',
      entities: [],
    };

    const log = formatIngestionLog(result);
    expect(log).toContain('- Skipped: 5');
    expect(log).toContain('### Entities');
  });
});

// ---------------------------------------------------------------------------
// buildReceiptTimeline
// ---------------------------------------------------------------------------

describe('buildReceiptTimeline', () => {
  it('maps receipts to ReceiptTimelineEntry with hypothesis from related_hypotheses[0]', () => {
    const receipts = [
      {
        fileName: 'RCT-001.md',
        snapshot: {
          receipt_id: 'RCT-001',
          claim_status: 'supports',
          result_status: 'ok',
          related_hypotheses: ['H1-Lateral-Movement'],
          related_queries: ['QRY-001'],
          claim: 'Lateral movement observed',
          evidence_summary: 'PsExec execution',
          technique_refs: ['T1059.001'],
          confidence: 'High',
        },
      },
    ];

    const timeline = buildReceiptTimeline(receipts);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toEqual({
      receipt_id: 'RCT-001',
      claim_status: 'supports',
      claim: 'Lateral movement observed',
      technique_refs: ['T1059.001'],
      hypothesis: 'H1-Lateral-Movement',
      fileName: 'RCT-001.md',
    });
  });

  it('uses "Ungrouped" when related_hypotheses is empty', () => {
    const receipts = [
      {
        fileName: 'RCT-002.md',
        snapshot: {
          receipt_id: 'RCT-002',
          claim_status: 'context',
          result_status: 'ok',
          related_hypotheses: [],
          related_queries: [],
          claim: 'General context',
          evidence_summary: '',
          technique_refs: [],
          confidence: '',
        },
      },
    ];

    const timeline = buildReceiptTimeline(receipts);

    expect(timeline[0]!.hypothesis).toBe('Ungrouped');
  });

  it('handles multiple receipts', () => {
    const receipts = [
      {
        fileName: 'RCT-001.md',
        snapshot: {
          receipt_id: 'RCT-001',
          claim_status: 'supports',
          result_status: 'ok',
          related_hypotheses: ['H1'],
          related_queries: [],
          claim: 'Claim 1',
          evidence_summary: '',
          technique_refs: ['T1059'],
          confidence: '',
        },
      },
      {
        fileName: 'RCT-002.md',
        snapshot: {
          receipt_id: 'RCT-002',
          claim_status: 'disproves',
          result_status: 'ok',
          related_hypotheses: ['H2'],
          related_queries: [],
          claim: 'Claim 2',
          evidence_summary: '',
          technique_refs: ['T1021'],
          confidence: '',
        },
      },
    ];

    const timeline = buildReceiptTimeline(receipts);
    expect(timeline).toHaveLength(2);
    expect(timeline[0]!.hypothesis).toBe('H1');
    expect(timeline[1]!.hypothesis).toBe('H2');
  });
});
