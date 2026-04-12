import { describe, it, expect } from 'vitest';
import { parseQueryLog } from '../../parsers/query-log';

// ---------------------------------------------------------------------------
// Zero snapshot helper
// ---------------------------------------------------------------------------

const ZERO = {
  query_id: '',
  dataset: '',
  result_status: '',
  related_hypotheses: [],
  related_receipts: [],
  intent: '',
  entity_refs: { ips: [], domains: [], hashes: [] },
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WELL_FORMED = [
  '---',
  'query_id: QRY-20260412-001',
  'query_spec_version: "1.0"',
  'source: SIEM',
  'connector_id: splunk',
  'dataset: events',
  'executed_at: 2026-04-12T10:00:00Z',
  'author: analyst-1',
  'related_hypotheses:',
  '  - HYP-01',
  'related_receipts:',
  '  - RCT-001',
  '  - RCT-002',
  'content_hash: sha256:def456',
  'manifest_id: MAN-002',
  '---',
  '',
  '# Query Log: Lateral Movement Detection',
  '',
  '## Intent',
  '',
  'Identify PsExec usage from compromised workstation 10.0.0.1 to server 192.168.1.100.',
  '',
  '## Query Or Procedure',
  '',
  '~~~text',
  'index=main sourcetype=wineventlog EventCode=4688 NewProcessName="*psexec*"',
  '~~~',
  '',
  '## Parameters',
  '',
  '- **Time window:** 2026-04-11T00:00:00Z to 2026-04-12T00:00:00Z',
  '- **Entities:** 10.0.0.1, evil.example.com',
  '- **Filters:** EventCode=4688',
  '',
  '## Runtime Metadata',
  '',
  '- **Profile:** default',
  '- **Result status:** ok',
  '- **Warnings:** 0',
  '- **Errors:** none',
  '',
  '## Result Summary',
  '',
  'Found 3 PsExec executions originating from 10.0.0.1 targeting 192.168.1.100.',
  'Hash observed: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2 (SHA256).',
  'Also found connection to malware.bad.net.',
  '',
  '## Related Receipts',
  '',
  '- RCT-001',
  '',
  '## Notes',
  '',
  'Partial results due to log rotation.',
].join('\n');

// ---------------------------------------------------------------------------
// parseQueryLog
// ---------------------------------------------------------------------------

describe('parseQueryLog', () => {
  it('returns zero snapshot for empty string', () => {
    expect(parseQueryLog('')).toEqual(ZERO);
  });

  it('returns zero snapshot for whitespace-only input', () => {
    expect(parseQueryLog('   \n  \n  ')).toEqual(ZERO);
  });

  it('extracts all fields from well-formed query log', () => {
    const result = parseQueryLog(WELL_FORMED);
    expect(result.query_id).toBe('QRY-20260412-001');
    expect(result.dataset).toBe('events');
    expect(result.result_status).toBe('ok');
    expect(result.related_hypotheses).toEqual(['HYP-01']);
    expect(result.related_receipts).toEqual(['RCT-001', 'RCT-002']);
    expect(result.intent).toBe('Identify PsExec usage from compromised workstation 10.0.0.1 to server 192.168.1.100.');
  });

  it('returns empty intent when ## Intent section is missing', () => {
    const input = [
      '---',
      'query_id: QRY-002',
      'dataset: alerts',
      '---',
      '',
      '# Query Log: No intent',
      '',
      '## Query Or Procedure',
      '',
      '~~~text',
      'SELECT * FROM alerts',
      '~~~',
    ].join('\n');

    const result = parseQueryLog(input);
    expect(result.intent).toBe('');
    expect(result.query_id).toBe('QRY-002');
    expect(result.dataset).toBe('alerts');
  });

  it('extracts IPv4 addresses into entity_refs.ips', () => {
    const result = parseQueryLog(WELL_FORMED);
    expect(result.entity_refs.ips).toContain('10.0.0.1');
    expect(result.entity_refs.ips).toContain('192.168.1.100');
  });

  it('extracts domains into entity_refs.domains', () => {
    const result = parseQueryLog(WELL_FORMED);
    expect(result.entity_refs.domains).toContain('evil.example.com');
    expect(result.entity_refs.domains).toContain('malware.bad.net');
  });

  it('extracts SHA256 hashes into entity_refs.hashes', () => {
    const result = parseQueryLog(WELL_FORMED);
    expect(result.entity_refs.hashes).toContain('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2');
  });

  it('deduplicates entity references', () => {
    // The well-formed fixture has 10.0.0.1 appearing twice in the body
    const result = parseQueryLog(WELL_FORMED);
    const ipCounts = result.entity_refs.ips.filter((ip: string) => ip === '10.0.0.1');
    expect(ipCounts).toHaveLength(1);

    const ip2Counts = result.entity_refs.ips.filter((ip: string) => ip === '192.168.1.100');
    expect(ip2Counts).toHaveLength(1);
  });

  it('handles Windows line endings identically to Unix', () => {
    const windows = WELL_FORMED.replace(/\n/g, '\r\n');
    expect(parseQueryLog(windows)).toEqual(parseQueryLog(WELL_FORMED));
  });

  it('never throws on malformed input', () => {
    expect(() => parseQueryLog('---\nincomplete frontmatter')).not.toThrow();
    expect(() => parseQueryLog('random garbage\n\n\n')).not.toThrow();
    expect(() => parseQueryLog('## Intent\n\n## Intent\n\nDuplicate headings')).not.toThrow();
  });

  it('falls back to Runtime Metadata section for result_status when not in frontmatter', () => {
    const input = [
      '---',
      'query_id: QRY-003',
      'dataset: identity',
      '---',
      '',
      '# Query Log: Status from body',
      '',
      '## Intent',
      '',
      'Test fallback.',
      '',
      '## Runtime Metadata',
      '',
      '- **Result status:** partial',
      '- **Warnings:** 1',
    ].join('\n');

    const result = parseQueryLog(input);
    expect(result.result_status).toBe('partial');
  });

  it('extracts MD5 and SHA1 hashes', () => {
    const input = [
      '# Query Log: Hash test',
      '',
      '## Intent',
      '',
      'Find hashes.',
      '',
      '## Result Summary',
      '',
      'MD5: d41d8cd98f00b204e9800998ecf8427e',
      'SHA1: da39a3ee5e6b4b0d3255bfef95601890afd80709',
    ].join('\n');

    const result = parseQueryLog(input);
    expect(result.entity_refs.hashes).toContain('d41d8cd98f00b204e9800998ecf8427e');
    expect(result.entity_refs.hashes).toContain('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it('does not extract version numbers as domains', () => {
    const input = [
      '---',
      'query_id: QRY-004',
      'query_spec_version: "1.0"',
      'dataset: events',
      '---',
      '',
      '# Query Log: Version numbers',
      '',
      '## Intent',
      '',
      'Ensure version strings like 1.0 or 2.1 are not domains.',
    ].join('\n');

    const result = parseQueryLog(input);
    // Version numbers should NOT be extracted as domains
    expect(result.entity_refs.domains).not.toContain('1.0');
    expect(result.entity_refs.domains).not.toContain('2.1');
  });
});
