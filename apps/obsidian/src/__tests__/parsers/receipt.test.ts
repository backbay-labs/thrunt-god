import { describe, it, expect } from 'vitest';
import { parseReceipt } from '../../parsers/receipt';

// ---------------------------------------------------------------------------
// Zero snapshot helper
// ---------------------------------------------------------------------------

const ZERO = {
  receipt_id: '',
  claim_status: '',
  result_status: '',
  related_hypotheses: [],
  related_queries: [],
  claim: '',
  evidence_summary: '',
  technique_refs: [],
  confidence: '',
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WELL_FORMED = [
  '---',
  'receipt_id: RCT-20260412-001',
  'query_spec_version: "1.0"',
  'created_at: 2026-04-12T10:00:00Z',
  'source: crowdstrike',
  'connector_id: crowdstrike',
  'dataset: events',
  'result_status: ok',
  'claim_status: supports',
  'related_hypotheses:',
  '  - HYP-01',
  '  - HYP-02',
  'related_queries:',
  '  - QRY-001',
  'content_hash: sha256:abc123',
  'manifest_id: MAN-001',
  '---',
  '',
  '# Receipt: Lateral Movement via PsExec',
  '',
  '## Claim',
  '',
  'PsExec was used for lateral movement from WORKSTATION-A to SERVER-B.',
  '',
  '## Evidence',
  '',
  'Event ID 4688 shows PsExec.exe spawned at 09:42 UTC. MITRE technique T1059.001 applies.',
  '',
  '## Chain Of Custody',
  '',
  '- **Collected by:** Analyst-1',
  '- **Collection path:** EDR > Splunk',
  '- **Identifiers:** event-9876',
  '- **Time observed:** 2026-04-12T09:42:00Z',
  '',
  '## Confidence',
  '',
  'High - Direct PsExec execution observed with T1059 pattern.',
  '',
  '## Notes',
  '',
  'Also references T1570 for lateral tool transfer.',
].join('\n');

// ---------------------------------------------------------------------------
// parseReceipt
// ---------------------------------------------------------------------------

describe('parseReceipt', () => {
  it('returns zero snapshot for empty string', () => {
    expect(parseReceipt('')).toEqual(ZERO);
  });

  it('returns zero snapshot for whitespace-only input', () => {
    expect(parseReceipt('   \n  \n  ')).toEqual(ZERO);
  });

  it('extracts all fields from well-formed receipt', () => {
    const result = parseReceipt(WELL_FORMED);
    expect(result.receipt_id).toBe('RCT-20260412-001');
    expect(result.claim_status).toBe('supports');
    expect(result.result_status).toBe('ok');
    expect(result.related_hypotheses).toEqual(['HYP-01', 'HYP-02']);
    expect(result.related_queries).toEqual(['QRY-001']);
    expect(result.claim).toBe('PsExec was used for lateral movement from WORKSTATION-A to SERVER-B.');
    expect(result.evidence_summary).toBe('Event ID 4688 shows PsExec.exe spawned at 09:42 UTC. MITRE technique T1059.001 applies.');
    expect(result.confidence).toBe('High');
  });

  it('extracts technique references from the full body', () => {
    const result = parseReceipt(WELL_FORMED);
    expect(result.technique_refs).toContain('T1059.001');
    expect(result.technique_refs).toContain('T1059');
    expect(result.technique_refs).toContain('T1570');
  });

  it('returns empty claim when ## Claim section is missing', () => {
    const input = [
      '---',
      'receipt_id: RCT-002',
      'claim_status: context',
      'result_status: partial',
      '---',
      '',
      '# Receipt: No claim section',
      '',
      '## Evidence',
      '',
      'Some evidence here.',
      '',
      '## Confidence',
      '',
      'Low - no claim to evaluate.',
    ].join('\n');

    const result = parseReceipt(input);
    expect(result.claim).toBe('');
    expect(result.evidence_summary).toBe('Some evidence here.');
    expect(result.confidence).toBe('Low');
  });

  it('returns empty defaults for frontmatter fields when no frontmatter present', () => {
    const input = [
      '# Receipt: Bare receipt',
      '',
      '## Claim',
      '',
      'Some claim extracted from body only.',
      '',
      '## Evidence',
      '',
      'Evidence without frontmatter. Technique T1048.003 noted.',
      '',
      '## Confidence',
      '',
      'Medium - partial data.',
    ].join('\n');

    const result = parseReceipt(input);
    expect(result.receipt_id).toBe('');
    expect(result.claim_status).toBe('');
    expect(result.result_status).toBe('');
    expect(result.related_hypotheses).toEqual([]);
    expect(result.related_queries).toEqual([]);
    expect(result.claim).toBe('Some claim extracted from body only.');
    expect(result.evidence_summary).toBe('Evidence without frontmatter. Technique T1048.003 noted.');
    expect(result.technique_refs).toEqual(['T1048.003']);
    expect(result.confidence).toBe('Medium');
  });

  it('returns empty technique_refs array when no technique references found', () => {
    const input = [
      '---',
      'receipt_id: RCT-003',
      'claim_status: supports',
      'result_status: ok',
      '---',
      '',
      '# Receipt: Clean receipt',
      '',
      '## Claim',
      '',
      'No technique references here.',
      '',
      '## Evidence',
      '',
      'Nothing resembling a technique ID.',
      '',
      '## Confidence',
      '',
      'High - all clean.',
    ].join('\n');

    const result = parseReceipt(input);
    expect(result.technique_refs).toEqual([]);
  });

  it('handles Windows line endings identically to Unix', () => {
    const unix = WELL_FORMED;
    const windows = unix.replace(/\n/g, '\r\n');
    expect(parseReceipt(windows)).toEqual(parseReceipt(unix));
  });

  it('never throws on malformed input', () => {
    expect(() => parseReceipt('---\nincomplete frontmatter')).not.toThrow();
    expect(() => parseReceipt('random garbage\n\n\n')).not.toThrow();
    expect(() => parseReceipt('## Claim\n\n## Claim\n\nDuplicate headings')).not.toThrow();
  });

  it('handles receipt with empty sections', () => {
    const input = [
      '---',
      'receipt_id: RCT-004',
      'claim_status: disproves',
      'result_status: empty',
      'related_hypotheses:',
      'related_queries:',
      '---',
      '',
      '# Receipt: Empty sections',
      '',
      '## Claim',
      '',
      '## Evidence',
      '',
      '## Confidence',
      '',
    ].join('\n');

    const result = parseReceipt(input);
    expect(result.receipt_id).toBe('RCT-004');
    expect(result.claim_status).toBe('disproves');
    expect(result.result_status).toBe('empty');
    expect(result.related_hypotheses).toEqual([]);
    expect(result.related_queries).toEqual([]);
    expect(result.claim).toBe('');
    expect(result.evidence_summary).toBe('');
    expect(result.confidence).toBe('');
  });

  it('extracts sub-technique refs with parent technique deduplication', () => {
    const input = [
      '# Receipt: Technique test',
      '',
      '## Evidence',
      '',
      'Observed T1059.001 and T1059.003 techniques. Also T1059 was noted separately.',
      'T1048 was used for exfiltration.',
    ].join('\n');

    const result = parseReceipt(input);
    expect(result.technique_refs).toContain('T1059.001');
    expect(result.technique_refs).toContain('T1059.003');
    expect(result.technique_refs).toContain('T1059');
    expect(result.technique_refs).toContain('T1048');
  });
});
