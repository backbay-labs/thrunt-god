import { describe, it, expect } from 'vitest';
import type {
  EnrichmentData,
  CoverageTactic,
  CoverageReport,
  SearchResult,
} from '../types';

// ---------------------------------------------------------------------------
// Type shape tests -- verify the interfaces exist and have the correct fields
// ---------------------------------------------------------------------------

describe('EnrichmentData type', () => {
  it('has the expected shape', () => {
    const data: EnrichmentData = {
      description: 'A technique description',
      groups: ['APT28', 'APT29'],
      detectionSources: ['Process monitoring', 'File monitoring'],
      relatedTechniques: ['T1059.001', 'T1059.003'],
    };

    expect(data.description).toBe('A technique description');
    expect(data.groups).toHaveLength(2);
    expect(data.detectionSources).toHaveLength(2);
    expect(data.relatedTechniques).toHaveLength(2);
  });
});

describe('CoverageTactic type', () => {
  it('has the expected shape', () => {
    const tactic: CoverageTactic = {
      tactic: 'Initial Access',
      total: 10,
      hunted: 3,
      percentage: 30.0,
    };

    expect(tactic.tactic).toBe('Initial Access');
    expect(tactic.total).toBe(10);
    expect(tactic.hunted).toBe(3);
    expect(tactic.percentage).toBe(30.0);
  });
});

describe('CoverageReport type', () => {
  it('has the expected shape', () => {
    const report: CoverageReport = {
      tactics: [
        { tactic: 'Initial Access', total: 10, hunted: 3, percentage: 30.0 },
      ],
      totalTechniques: 10,
      huntedTechniques: 3,
      overallPercentage: 30.0,
      gaps: ['T1190', 'T1133'],
    };

    expect(report.tactics).toHaveLength(1);
    expect(report.totalTechniques).toBe(10);
    expect(report.huntedTechniques).toBe(3);
    expect(report.overallPercentage).toBe(30.0);
    expect(report.gaps).toHaveLength(2);
  });
});

describe('SearchResult type', () => {
  it('has the expected shape', () => {
    const result: SearchResult = {
      id: 'T1059',
      name: 'Command and Scripting Interpreter',
      entityType: 'ttp',
      snippet: 'Adversaries may abuse command and script interpreters...',
    };

    expect(result.id).toBe('T1059');
    expect(result.name).toBe('Command and Scripting Interpreter');
    expect(result.entityType).toBe('ttp');
    expect(result.snippet).toContain('command and script');
  });
});
