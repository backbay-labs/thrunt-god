import { describe, test, expect } from 'bun:test';
import { M365DefenderCompanion } from '../src/index.ts';

describe('M365DefenderCompanion', () => {
  const companion = new M365DefenderCompanion();

  test('can be instantiated', () => {
    expect(companion).toBeInstanceOf(M365DefenderCompanion);
  });

  test('buildAdvancedHuntingQuery returns valid KQL with defaults', () => {
    const kql = companion.buildAdvancedHuntingQuery({
      table: 'DeviceProcessEvents',
    });

    expect(kql).toBeDefined();
    expect(typeof kql).toBe('string');
    expect(kql).toContain('DeviceProcessEvents');
    expect(kql).toContain('Timestamp > ago(7d)');
    expect(kql).toContain('take 100');
  });

  test('buildAdvancedHuntingQuery applies filters', () => {
    const kql = companion.buildAdvancedHuntingQuery({
      table: 'DeviceNetworkEvents',
      lookbackDays: 30,
      filters: ['RemotePort == 443', 'ActionType == "ConnectionSuccess"'],
      columns: ['Timestamp', 'DeviceName', 'RemoteIP', 'RemotePort'],
      limit: 50,
    });

    expect(kql).toContain('DeviceNetworkEvents');
    expect(kql).toContain('ago(30d)');
    expect(kql).toContain('RemotePort == 443');
    expect(kql).toContain('ActionType == "ConnectionSuccess"');
    expect(kql).toContain('project Timestamp, DeviceName, RemoteIP, RemotePort');
    expect(kql).toContain('take 50');
  });

  test('buildAdvancedHuntingQuery supports entity search', () => {
    const kql = companion.buildAdvancedHuntingQuery({
      table: 'DeviceProcessEvents',
      entitySearch: 'malware.exe',
    });

    expect(kql).toContain('has "malware.exe"');
  });

  test('buildAdvancedHuntingQuery supports sorting', () => {
    const kql = companion.buildAdvancedHuntingQuery({
      table: 'EmailEvents',
      orderBy: 'Timestamp',
      orderDirection: 'asc',
    });

    expect(kql).toContain('sort by Timestamp asc');
  });

  test('buildAdvancedHuntingQuery escapes entity search and normalizes invalid limits', () => {
    const kql = companion.buildAdvancedHuntingQuery({
      table: 'DeviceProcessEvents',
      entitySearch: 'evil" or DeviceName has "prod',
      limit: 0,
    });

    expect(kql).toContain('has "evil\\" or DeviceName has \\"prod"');
    expect(kql).toContain('take 100');
  });

  test('buildAdvancedHuntingQuery rejects invalid identifiers', () => {
    expect(() => companion.buildAdvancedHuntingQuery({
      table: 'DeviceEvents\n| invoke bad()',
    })).toThrow('Invalid M365 table');

    expect(() => companion.buildAdvancedHuntingQuery({
      table: 'EmailEvents',
      columns: ['Timestamp', 'DeviceName; drop table'],
    })).toThrow('Invalid M365 column');
  });

  test('correlateIncident returns valid correlation result', () => {
    const result = companion.correlateIncident('INC-12345');

    expect(result).toBeDefined();
    expect(result.incidentId).toBe('INC-12345');
    expect(result.vendor).toBe('m365-defender');
    expect(typeof result.correlated).toBe('boolean');
    expect(result.correlatedAt).toBeDefined();
    expect(typeof result.details).toBe('object');
  });
});
