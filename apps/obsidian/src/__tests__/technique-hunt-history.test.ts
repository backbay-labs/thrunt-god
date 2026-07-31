import { describe, it, expect } from 'vitest';
import {
  type TechniqueHuntEntry,
  type HuntOutcome,
  buildTechniqueHuntHistorySection,
  appendTechniqueHuntHistorySection,
} from '../technique-hunt-history';

// ---------------------------------------------------------------------------
// Helper: sample technique note content
// ---------------------------------------------------------------------------

function makeTechniqueNote(sections: {
  subTechniques?: boolean;
  huntHistory?: string | boolean;
  knownFP?: boolean;
  sightings?: boolean;
  detections?: boolean;
  related?: boolean;
} = {}): string {
  const lines: string[] = [
    '---',
    'type: ttp',
    'mitre_id: "T1053"',
    'tactic: "Execution"',
    'name: "Scheduled Task/Job"',
    'hunt_count: 0',
    'last_hunted: ""',
    '---',
    '# T1053 -- Scheduled Task/Job',
    '',
  ];

  if (sections.subTechniques !== false) {
    lines.push('## Sub-Techniques', '', '- **T1053.005** Scheduled Task', '');
  }

  if (sections.huntHistory) {
    if (typeof sections.huntHistory === 'string') {
      lines.push(sections.huntHistory);
    } else {
      lines.push('## Hunt History', '', '_No hunts have targeted this technique yet._', '');
    }
  }

  if (sections.knownFP) {
    lines.push('## Known False Positives', '', '_No false positives recorded._', '');
  }

  if (sections.sightings !== false) {
    lines.push('## Sightings', '', '_No hunts have targeted this technique yet._', '');
  }

  if (sections.detections !== false) {
    lines.push('## Detections', '');
  }

  if (sections.related !== false) {
    lines.push('## Related', '');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildTechniqueHuntHistorySection
// ---------------------------------------------------------------------------

describe('buildTechniqueHuntHistorySection', () => {
  it('returns placeholder text for empty entries', () => {
    const result = buildTechniqueHuntHistorySection([]);
    expect(result).toBe(
      '## Hunt History\n\n_No hunts have targeted this technique yet._\n',
    );
  });

  it('formats a single entry with the locked format', () => {
    const entries: TechniqueHuntEntry[] = [
      {
        huntId: 'HUNT-001',
        date: '2026-01-15',
        queryCount: 3,
        dataSources: ['Sysmon', 'Windows Event Log'],
        outcome: 'TP',
      },
    ];
    const result = buildTechniqueHuntHistorySection(entries);
    expect(result).toBe(
      '## Hunt History\n\n- **HUNT-001** (2026-01-15) -- queries: 3, data_sources: [Sysmon, Windows Event Log], outcome: TP\n',
    );
  });

  it('formats multiple entries preserving input order', () => {
    const entries: TechniqueHuntEntry[] = [
      { huntId: 'HUNT-001', date: '2026-01-15', queryCount: 3, dataSources: ['Sysmon'], outcome: 'TP' },
      { huntId: 'HUNT-002', date: '2026-02-01', queryCount: 1, dataSources: ['Process'], outcome: 'FP' },
      { huntId: 'HUNT-003', date: '2026-03-10', queryCount: 5, dataSources: ['Command', 'File'], outcome: 'inconclusive' },
    ];
    const result = buildTechniqueHuntHistorySection(entries);
    const lines = result.split('\n');
    expect(lines[0]).toBe('## Hunt History');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('- **HUNT-001** (2026-01-15) -- queries: 3, data_sources: [Sysmon], outcome: TP');
    expect(lines[3]).toBe('- **HUNT-002** (2026-02-01) -- queries: 1, data_sources: [Process], outcome: FP');
    expect(lines[4]).toBe('- **HUNT-003** (2026-03-10) -- queries: 5, data_sources: [Command, File], outcome: inconclusive');
    expect(lines[5]).toBe('');
  });

  it('includes all HuntOutcome values correctly', () => {
    const outcomes: HuntOutcome[] = ['TP', 'FP', 'inconclusive'];
    for (const outcome of outcomes) {
      const result = buildTechniqueHuntHistorySection([
        { huntId: 'H001', date: '2026-01-01', queryCount: 1, dataSources: ['test'], outcome },
      ]);
      expect(result).toContain(`outcome: ${outcome}`);
    }
  });

  it('formats entry with empty dataSources as empty list', () => {
    const entries: TechniqueHuntEntry[] = [
      { huntId: 'HUNT-001', date: '2026-01-15', queryCount: 0, dataSources: [], outcome: 'inconclusive' },
    ];
    const result = buildTechniqueHuntHistorySection(entries);
    expect(result).toContain('data_sources: []');
  });
});

// ---------------------------------------------------------------------------
// appendTechniqueHuntHistorySection
// ---------------------------------------------------------------------------

describe('appendTechniqueHuntHistorySection', () => {
  it('replaces existing ## Hunt History section content', () => {
    const content = makeTechniqueNote({ huntHistory: true });
    const entries: TechniqueHuntEntry[] = [
      { huntId: 'HUNT-002', date: '2026-02-01', queryCount: 2, dataSources: ['Sysmon'], outcome: 'TP' },
    ];
    const result = appendTechniqueHuntHistorySection(content, entries);

    // Hunt History section should have new entry, not placeholder
    expect(result).toContain('- **HUNT-002** (2026-02-01) -- queries: 2, data_sources: [Sysmon], outcome: TP');

    // Verify the Hunt History section specifically does not have the placeholder
    // (the ## Sightings section may still have it -- that's fine)
    const lines = result.split('\n');
    const huntHistoryIdx = lines.findIndex((l) => l.trim() === '## Hunt History');
    const nextSectionIdx = lines.findIndex((l, i) => i > huntHistoryIdx && l.startsWith('## '));
    const huntHistoryContent = lines.slice(huntHistoryIdx, nextSectionIdx === -1 ? undefined : nextSectionIdx).join('\n');
    expect(huntHistoryContent).not.toContain('_No hunts have targeted this technique yet._');

    // Should only have one ## Hunt History heading
    const headingCount = result.split('\n').filter((l) => l.trim() === '## Hunt History').length;
    expect(headingCount).toBe(1);
  });

  it('inserts before ## Sightings when no existing Hunt History section', () => {
    const content = makeTechniqueNote({ huntHistory: false });
    const entries: TechniqueHuntEntry[] = [
      { huntId: 'HUNT-001', date: '2026-01-15', queryCount: 3, dataSources: ['Sysmon'], outcome: 'TP' },
    ];
    const result = appendTechniqueHuntHistorySection(content, entries);
    const lines = result.split('\n');

    const huntIdx = lines.findIndex((l) => l.trim() === '## Hunt History');
    const sightingsIdx = lines.findIndex((l) => l.trim() === '## Sightings');

    expect(huntIdx).toBeGreaterThan(-1);
    expect(sightingsIdx).toBeGreaterThan(huntIdx);
  });

  it('inserts after frontmatter when no ## Sightings anchor exists', () => {
    const content = [
      '---',
      'type: ttp',
      'mitre_id: "T1053"',
      '---',
      '# T1053 -- Scheduled Task/Job',
      '',
    ].join('\n');
    const entries: TechniqueHuntEntry[] = [
      { huntId: 'HUNT-001', date: '2026-01-15', queryCount: 3, dataSources: ['Sysmon'], outcome: 'TP' },
    ];
    const result = appendTechniqueHuntHistorySection(content, entries);

    expect(result).toContain('## Hunt History');
    expect(result).toContain('- **HUNT-001** (2026-01-15) -- queries: 3, data_sources: [Sysmon], outcome: TP');

    // Hunt History should be after frontmatter
    const lines = result.split('\n');
    const fmCloseIdx = lines.indexOf('---', 1);
    const huntIdx = lines.findIndex((l) => l.trim() === '## Hunt History');
    expect(huntIdx).toBeGreaterThan(fmCloseIdx);
  });

  it('does NOT look for ## Verdict History (technique notes do not have it)', () => {
    // Build content that has ## Verdict History but no ## Sightings
    // A technique note should never have Verdict History, but if someone
    // put one there, the module should NOT use it as an anchor
    const content = [
      '---',
      'type: ttp',
      '---',
      '# T1053',
      '',
      '## Verdict History',
      '',
      '_No verdict changes recorded._',
      '',
    ].join('\n');
    const entries: TechniqueHuntEntry[] = [
      { huntId: 'HUNT-001', date: '2026-01-15', queryCount: 1, dataSources: ['test'], outcome: 'TP' },
    ];
    const result = appendTechniqueHuntHistorySection(content, entries);
    const lines = result.split('\n');

    // Hunt History should be inserted after frontmatter (case 3),
    // NOT after Verdict History (which is only for entity notes)
    const huntIdx = lines.findIndex((l) => l.trim() === '## Hunt History');
    const fmCloseIdx = lines.indexOf('---', 1);
    expect(huntIdx).toBeGreaterThan(fmCloseIdx);
  });

  it('preserves all other sections intact', () => {
    const content = makeTechniqueNote({ subTechniques: true, sightings: true, detections: true, related: true });
    const entries: TechniqueHuntEntry[] = [
      { huntId: 'HUNT-001', date: '2026-01-15', queryCount: 3, dataSources: ['Sysmon'], outcome: 'TP' },
    ];
    const result = appendTechniqueHuntHistorySection(content, entries);

    expect(result).toContain('## Sub-Techniques');
    expect(result).toContain('- **T1053.005** Scheduled Task');
    expect(result).toContain('## Sightings');
    expect(result).toContain('## Detections');
    expect(result).toContain('## Related');
  });

  it('replaces empty entries with placeholder text', () => {
    const content = makeTechniqueNote({
      huntHistory: '## Hunt History\n\n- **HUNT-001** (2026-01-15) -- queries: 3, data_sources: [Sysmon], outcome: TP\n',
    });
    const result = appendTechniqueHuntHistorySection(content, []);

    expect(result).toContain('_No hunts have targeted this technique yet._');
    expect(result).not.toContain('- **HUNT-001**');
  });

  it('never places Hunt History after ## Sightings or ## Related', () => {
    const content = makeTechniqueNote({});
    const entries: TechniqueHuntEntry[] = [
      { huntId: 'HUNT-001', date: '2026-01-15', queryCount: 3, dataSources: ['Sysmon'], outcome: 'TP' },
    ];
    const result = appendTechniqueHuntHistorySection(content, entries);
    const lines = result.split('\n');

    const huntIdx = lines.findIndex((l) => l.trim() === '## Hunt History');
    const sightingsIdx = lines.findIndex((l) => l.trim() === '## Sightings');
    const relatedIdx = lines.findIndex((l) => l.trim() === '## Related');

    expect(huntIdx).toBeGreaterThan(-1);
    if (sightingsIdx !== -1) expect(huntIdx).toBeLessThan(sightingsIdx);
    if (relatedIdx !== -1) expect(huntIdx).toBeLessThan(relatedIdx);
  });
});
