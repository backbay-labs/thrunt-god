import { describe, test, expect } from 'bun:test';
import { CrowdStrikeCompanion } from '../src/index.ts';

describe('CrowdStrikeCompanion', () => {
  const companion = new CrowdStrikeCompanion();

  test('can be instantiated', () => {
    expect(companion).toBeInstanceOf(CrowdStrikeCompanion);
  });

  test('buildDetectionQuery returns valid query with defaults', () => {
    const query = companion.buildDetectionQuery({});

    expect(query).toBeDefined();
    expect(typeof query).toBe('string');
    expect(query).toContain('filter=*');
    expect(query).toContain('limit=100');
    expect(query).toContain('sort=created_timestamp.desc');
  });

  test('buildDetectionQuery applies host filter', () => {
    const query = companion.buildDetectionQuery({
      hostFilter: 'WORKSTATION-01',
    });
    const params = new URLSearchParams(query);

    expect(params.get('filter')).toContain("device.hostname:'WORKSTATION-01'");
  });

  test('buildDetectionQuery applies MITRE ATT&CK filters', () => {
    const query = companion.buildDetectionQuery({
      tacticIds: ['TA0001'],
      techniqueIds: ['T1566.001', 'T1566.002'],
    });
    const params = new URLSearchParams(query);
    const filter = params.get('filter') ?? '';

    expect(filter).toContain("behaviors.tactic_id:'TA0001'");
    expect(filter).toContain("behaviors.technique_id:'T1566.001'");
    expect(filter).toContain("behaviors.technique_id:'T1566.002'");
  });

  test('buildDetectionQuery applies severity filter', () => {
    const query = companion.buildDetectionQuery({
      severities: ['Critical', 'High'],
    });
    const params = new URLSearchParams(query);
    const filter = params.get('filter') ?? '';

    expect(filter).toContain("max_severity_displayname:'Critical'");
    expect(filter).toContain("max_severity_displayname:'High'");
  });

  test('buildDetectionQuery applies time range', () => {
    const query = companion.buildDetectionQuery({
      since: '2025-01-01T00:00:00Z',
      until: '2025-01-31T23:59:59Z',
    });
    const params = new URLSearchParams(query);
    const filter = params.get('filter') ?? '';

    expect(filter).toContain("created_timestamp:>='2025-01-01T00:00:00Z'");
    expect(filter).toContain("created_timestamp:<='2025-01-31T23:59:59Z'");
  });

  test('buildDetectionQuery supports custom sort', () => {
    const query = companion.buildDetectionQuery({
      sortBy: 'max_severity',
      sortDirection: 'asc',
      limit: 50,
    });

    expect(query).toContain('sort=max_severity.asc');
    expect(query).toContain('limit=50');
  });

  test('buildDetectionQuery escapes literals and URL-encodes query params', () => {
    const query = companion.buildDetectionQuery({
      hostFilter: "WORKSTATION-01' OR device_id:'abc",
      q: 'cmd.exe & powershell.exe',
    });
    const params = new URLSearchParams(query);

    expect(params.get('filter')).toContain("device.hostname:'WORKSTATION-01\\' OR device_id:\\'abc'");
    expect(params.get('q')).toBe('cmd.exe & powershell.exe');
  });

  test('buildDetectionQuery rejects invalid sort fields', () => {
    expect(() => companion.buildDetectionQuery({
      sortBy: 'created_timestamp.desc&limit=5000',
    })).toThrow('Invalid CrowdStrike sort field');
  });

  test('correlateDetection returns valid correlation result', () => {
    const result = companion.correlateDetection('ldt:abc123:456');

    expect(result).toBeDefined();
    expect(result.detectionId).toBe('ldt:abc123:456');
    expect(result.vendor).toBe('crowdstrike');
    expect(typeof result.correlated).toBe('boolean');
    expect(result.correlatedAt).toBeDefined();
    expect(typeof result.details).toBe('object');
  });
});
