import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatExportLog, buildExportLogEntry, type ExportLogEntry } from '../export-log';
import type { AssembledContext, ProvenanceSection } from '../types';

// ---------------------------------------------------------------------------
// formatExportLog
// ---------------------------------------------------------------------------

describe('formatExportLog', () => {
  it('produces markdown with ## {timestamp} heading', () => {
    const entry: ExportLogEntry = {
      timestamp: '2026-04-12T12:00:00Z',
      sourceNote: 'hunts/APT29-Campaign.md',
      profileId: 'query-writer',
      profileLabel: 'Query Writer',
      tokenEstimate: 1500,
      sectionCount: 3,
      entityCounts: {},
    };

    const log = formatExportLog(entry);
    expect(log).toContain('## 2026-04-12T12:00:00Z');
  });

  it('includes source note path, target profile agentId, and profile label', () => {
    const entry: ExportLogEntry = {
      timestamp: '2026-04-12T12:00:00Z',
      sourceNote: 'hunts/APT29-Campaign.md',
      profileId: 'query-writer',
      profileLabel: 'Query Writer',
      tokenEstimate: 1500,
      sectionCount: 3,
      entityCounts: {},
    };

    const log = formatExportLog(entry);
    expect(log).toContain('- Source: hunts/APT29-Campaign.md');
    expect(log).toContain('- Profile: Query Writer (query-writer)');
  });

  it('includes token estimate as number', () => {
    const entry: ExportLogEntry = {
      timestamp: '2026-04-12T12:00:00Z',
      sourceNote: 'hunts/APT29-Campaign.md',
      profileId: 'query-writer',
      profileLabel: 'Query Writer',
      tokenEstimate: 2500,
      sectionCount: 5,
      entityCounts: {},
    };

    const log = formatExportLog(entry);
    expect(log).toContain('- Token estimate: 2500');
  });

  it('includes section count and entity counts by entity type', () => {
    const entry: ExportLogEntry = {
      timestamp: '2026-04-12T12:00:00Z',
      sourceNote: 'hunts/APT29-Campaign.md',
      profileId: 'query-writer',
      profileLabel: 'Query Writer',
      tokenEstimate: 3000,
      sectionCount: 4,
      entityCounts: { ttps: 2, iocs: 3 },
    };

    const log = formatExportLog(entry);
    expect(log).toContain('- Sections: 4');
    expect(log).toContain('### Entities');
    expect(log).toContain('- ttps: 2');
    expect(log).toContain('- iocs: 3');
  });

  it('handles empty sections array (zero sections, zero entities)', () => {
    const entry: ExportLogEntry = {
      timestamp: '2026-04-12T12:00:00Z',
      sourceNote: 'hunts/empty.md',
      profileId: 'analyst',
      profileLabel: 'Analyst',
      tokenEstimate: 0,
      sectionCount: 0,
      entityCounts: {},
    };

    const log = formatExportLog(entry);
    expect(log).toContain('- Sections: 0');
    expect(log).toContain('### Entities');
    // No entity lines after ### Entities -- just the header
  });
});

// ---------------------------------------------------------------------------
// buildExportLogEntry
// ---------------------------------------------------------------------------

describe('buildExportLogEntry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-12T14:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts entity types by parsing sourcePath folder prefixes', () => {
    const assembled: AssembledContext = {
      sections: [
        { heading: 'T1059.001', content: '...', sourcePath: 'entities/ttps/T1059.001.md' },
        { heading: 'T1021.002', content: '...', sourcePath: 'entities/ttps/T1021.002.md' },
        { heading: '192.168.1.100', content: '...', sourcePath: 'entities/iocs/192.168.1.100.md' },
        { heading: 'APT29', content: '...', sourcePath: 'entities/actors/APT29.md' },
        { heading: 'Hypothesis', content: '...', sourcePath: 'hunts/APT29-Campaign.md' },
      ],
      tokenEstimate: 2000,
      profileUsed: 'query-writer',
      sourceNote: 'hunts/APT29-Campaign.md',
    };

    const entry = buildExportLogEntry(assembled, 'Query Writer');

    expect(entry.timestamp).toBe('2026-04-12T14:30:00.000Z');
    expect(entry.sourceNote).toBe('hunts/APT29-Campaign.md');
    expect(entry.profileId).toBe('query-writer');
    expect(entry.profileLabel).toBe('Query Writer');
    expect(entry.tokenEstimate).toBe(2000);
    expect(entry.sectionCount).toBe(5);
    expect(entry.entityCounts).toEqual({ ttps: 2, iocs: 1, actors: 1 });
  });

  it('deduplicates entity paths before counting', () => {
    const assembled: AssembledContext = {
      sections: [
        { heading: 'T1059.001', content: '...', sourcePath: 'entities/ttps/T1059.001.md' },
        { heading: 'T1059.001 detail', content: '...', sourcePath: 'entities/ttps/T1059.001.md' },
        { heading: '192.168.1.100', content: '...', sourcePath: 'entities/iocs/192.168.1.100.md' },
      ],
      tokenEstimate: 800,
      profileUsed: 'analyst',
      sourceNote: 'hunts/test.md',
    };

    const entry = buildExportLogEntry(assembled, 'Analyst');

    // T1059.001.md appears twice but should count once
    expect(entry.entityCounts).toEqual({ ttps: 1, iocs: 1 });
  });

  it('handles assembled context with no entity sections', () => {
    const assembled: AssembledContext = {
      sections: [
        { heading: 'Hypothesis', content: '...', sourcePath: 'hunts/APT29-Campaign.md' },
        { heading: 'Status', content: '...', sourcePath: 'hunts/APT29-Campaign.md' },
      ],
      tokenEstimate: 500,
      profileUsed: 'analyst',
      sourceNote: 'hunts/APT29-Campaign.md',
    };

    const entry = buildExportLogEntry(assembled, 'Analyst');

    expect(entry.entityCounts).toEqual({});
    expect(entry.sectionCount).toBe(2);
  });
});
