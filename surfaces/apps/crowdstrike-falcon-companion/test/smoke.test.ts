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

    expect(query).toContain("device.hostname:'WORKSTATION-01'");
  });

  test('buildDetectionQuery applies MITRE ATT&CK filters', () => {
    const query = companion.buildDetectionQuery({
      tacticIds: ['TA0001'],
      techniqueIds: ['T1566.001', 'T1566.002'],
    });

    expect(query).toContain("behaviors.tactic_id:'TA0001'");
    expect(query).toContain("behaviors.technique_id:'T1566.001'");
    expect(query).toContain("behaviors.technique_id:'T1566.002'");
  });

  test('buildDetectionQuery applies severity filter', () => {
    const query = companion.buildDetectionQuery({
      severities: ['Critical', 'High'],
    });

    expect(query).toContain("max_severity_displayname:'Critical'");
    expect(query).toContain("max_severity_displayname:'High'");
  });

  test('buildDetectionQuery applies time range', () => {
    const query = companion.buildDetectionQuery({
      since: '2025-01-01T00:00:00Z',
      until: '2025-01-31T23:59:59Z',
    });

    expect(query).toContain("created_timestamp:>='2025-01-01T00:00:00Z'");
    expect(query).toContain("created_timestamp:<='2025-01-31T23:59:59Z'");
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
