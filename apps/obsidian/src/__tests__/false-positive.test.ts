import { describe, it, expect } from 'vitest';
import {
  type FalsePositiveEntry,
  buildFPSection,
  appendFalsePositiveEntry,
} from '../false-positive';

// ---------------------------------------------------------------------------
// Helper: sample technique note content
// ---------------------------------------------------------------------------

function makeTechniqueNote(sections: {
  subTechniques?: boolean;
  huntHistory?: boolean;
  knownFP?: string | boolean;
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
    lines.push(
      '## Hunt History',
      '',
      '- **HUNT-001** (2026-01-15) -- queries: 3, data_sources: [Sysmon], outcome: TP',
      '',
    );
  }

  if (sections.knownFP) {
    if (typeof sections.knownFP === 'string') {
      lines.push(sections.knownFP);
    } else {
      lines.push('## Known False Positives', '', '_No false positives recorded._', '');
    }
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
// buildFPSection
// ---------------------------------------------------------------------------

describe('buildFPSection', () => {
  it('returns placeholder text for empty entries', () => {
    const result = buildFPSection([]);
    expect(result).toBe(
      '## Known False Positives\n\n_No false positives recorded._\n',
    );
  });

  it('formats a single entry with the locked format', () => {
    const entries: FalsePositiveEntry[] = [
      { pattern: 'Legitimate admin PsExec', date: '2026-03-10', huntId: 'HUNT-042' },
    ];
    const result = buildFPSection(entries);
    expect(result).toBe(
      '## Known False Positives\n\n- **pattern**: Legitimate admin PsExec -- added: 2026-03-10, hunt: HUNT-042\n',
    );
  });

  it('formats multiple entries preserving input order', () => {
    const entries: FalsePositiveEntry[] = [
      { pattern: 'Admin PsExec', date: '2026-03-10', huntId: 'HUNT-042' },
      { pattern: 'Backup scheduled task', date: '2026-04-01', huntId: 'HUNT-050' },
    ];
    const result = buildFPSection(entries);
    const lines = result.split('\n');
    expect(lines[0]).toBe('## Known False Positives');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('- **pattern**: Admin PsExec -- added: 2026-03-10, hunt: HUNT-042');
    expect(lines[3]).toBe('- **pattern**: Backup scheduled task -- added: 2026-04-01, hunt: HUNT-050');
    expect(lines[4]).toBe('');
  });
});

// ---------------------------------------------------------------------------
// appendFalsePositiveEntry
// ---------------------------------------------------------------------------

describe('appendFalsePositiveEntry', () => {
  it('appends to existing ## Known False Positives section', () => {
    const content = makeTechniqueNote({
      knownFP: '## Known False Positives\n\n- **pattern**: Existing FP -- added: 2026-01-01, hunt: HUNT-001\n',
    });
    const entry: FalsePositiveEntry = {
      pattern: 'New FP pattern',
      date: '2026-03-10',
      huntId: 'HUNT-042',
    };
    const result = appendFalsePositiveEntry(content, entry);

    expect(result).toContain('- **pattern**: Existing FP -- added: 2026-01-01, hunt: HUNT-001');
    expect(result).toContain('- **pattern**: New FP pattern -- added: 2026-03-10, hunt: HUNT-042');

    // Only one heading
    const headingCount = result.split('\n').filter((l) => l.trim() === '## Known False Positives').length;
    expect(headingCount).toBe(1);
  });

  it('creates section before ## Sightings when no existing section', () => {
    const content = makeTechniqueNote({ knownFP: false });
    const entry: FalsePositiveEntry = {
      pattern: 'Admin PsExec',
      date: '2026-03-10',
      huntId: 'HUNT-042',
    };
    const result = appendFalsePositiveEntry(content, entry);
    const lines = result.split('\n');

    const fpIdx = lines.findIndex((l) => l.trim() === '## Known False Positives');
    const sightingsIdx = lines.findIndex((l) => l.trim() === '## Sightings');

    expect(fpIdx).toBeGreaterThan(-1);
    expect(sightingsIdx).toBeGreaterThan(fpIdx);
  });

  it('removes placeholder on first real entry', () => {
    const content = makeTechniqueNote({ knownFP: true });
    const entry: FalsePositiveEntry = {
      pattern: 'Admin PsExec',
      date: '2026-03-10',
      huntId: 'HUNT-042',
    };
    const result = appendFalsePositiveEntry(content, entry);

    expect(result).not.toContain('_No false positives recorded._');
    expect(result).toContain('- **pattern**: Admin PsExec -- added: 2026-03-10, hunt: HUNT-042');
  });

  it('appends multiple entries in order (append-only)', () => {
    const content = makeTechniqueNote({ knownFP: true });
    const entry1: FalsePositiveEntry = {
      pattern: 'First FP',
      date: '2026-03-10',
      huntId: 'HUNT-042',
    };
    const entry2: FalsePositiveEntry = {
      pattern: 'Second FP',
      date: '2026-04-01',
      huntId: 'HUNT-050',
    };

    let result = appendFalsePositiveEntry(content, entry1);
    result = appendFalsePositiveEntry(result, entry2);

    const lines = result.split('\n');
    const firstFPIdx = lines.findIndex((l) => l.includes('First FP'));
    const secondFPIdx = lines.findIndex((l) => l.includes('Second FP'));

    expect(firstFPIdx).toBeGreaterThan(-1);
    expect(secondFPIdx).toBeGreaterThan(firstFPIdx);
  });

  it('inserts after ## Hunt History when no ## Sightings exists', () => {
    const content = [
      '---',
      'type: ttp',
      '---',
      '# T1053',
      '',
      '## Hunt History',
      '',
      '- **HUNT-001** (2026-01-15) -- queries: 3, data_sources: [Sysmon], outcome: TP',
      '',
    ].join('\n');
    const entry: FalsePositiveEntry = {
      pattern: 'Admin PsExec',
      date: '2026-03-10',
      huntId: 'HUNT-042',
    };
    const result = appendFalsePositiveEntry(content, entry);
    const lines = result.split('\n');

    const huntIdx = lines.findIndex((l) => l.trim() === '## Hunt History');
    const fpIdx = lines.findIndex((l) => l.trim() === '## Known False Positives');

    expect(fpIdx).toBeGreaterThan(huntIdx);
  });

  it('inserts after frontmatter as final fallback', () => {
    const content = [
      '---',
      'type: ttp',
      '---',
      '# T1053',
      '',
    ].join('\n');
    const entry: FalsePositiveEntry = {
      pattern: 'Admin PsExec',
      date: '2026-03-10',
      huntId: 'HUNT-042',
    };
    const result = appendFalsePositiveEntry(content, entry);
    const lines = result.split('\n');

    const fmCloseIdx = lines.indexOf('---', 1);
    const fpIdx = lines.findIndex((l) => l.trim() === '## Known False Positives');

    expect(fpIdx).toBeGreaterThan(fmCloseIdx);
  });

  it('preserves all other sections intact', () => {
    const content = makeTechniqueNote({
      subTechniques: true,
      huntHistory: true,
      knownFP: false,
      sightings: true,
      detections: true,
      related: true,
    });
    const entry: FalsePositiveEntry = {
      pattern: 'Admin PsExec',
      date: '2026-03-10',
      huntId: 'HUNT-042',
    };
    const result = appendFalsePositiveEntry(content, entry);

    expect(result).toContain('## Sub-Techniques');
    expect(result).toContain('## Hunt History');
    expect(result).toContain('## Sightings');
    expect(result).toContain('## Detections');
    expect(result).toContain('## Related');
  });
});
