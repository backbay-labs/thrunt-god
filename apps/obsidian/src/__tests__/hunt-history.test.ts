import { describe, it, expect } from 'vitest';
import {
  type HuntRole,
  type HuntHistoryEntry,
  buildHuntHistorySection,
  appendHuntHistorySection,
} from '../hunt-history';

// ---------------------------------------------------------------------------
// Helper: sample entity note content
// ---------------------------------------------------------------------------

function makeEntityNote(sections: {
  verdictHistory?: boolean;
  huntHistory?: string | boolean;
  sightings?: boolean;
  related?: boolean;
} = {}): string {
  const lines: string[] = [
    '---',
    'schema_version: 1',
    'type: ioc/ip',
    'value: "10.0.0.1"',
    'verdict: unknown',
    '---',
    '# 10.0.0.1',
    '',
  ];

  if (sections.verdictHistory !== false) {
    lines.push('## Verdict History', '', '_No verdict changes recorded._', '');
  }

  if (sections.huntHistory) {
    if (typeof sections.huntHistory === 'string') {
      lines.push(sections.huntHistory);
    } else {
      lines.push('## Hunt History', '', '_No hunt references found._', '');
    }
  }

  if (sections.sightings !== false) {
    lines.push('## Sightings', '', '_No sightings recorded yet._', '');
  }

  if (sections.related !== false) {
    lines.push('## Related', '');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildHuntHistorySection
// ---------------------------------------------------------------------------

describe('buildHuntHistorySection', () => {
  it('returns placeholder text for empty entries', () => {
    const result = buildHuntHistorySection([]);
    expect(result).toBe('## Hunt History\n\n_No hunt references found._\n');
  });

  it('formats a single entry with the locked format', () => {
    const entries: HuntHistoryEntry[] = [
      { huntId: 'H001', date: '2026-01-15', role: 'target', outcome: 'confirmed' },
    ];
    const result = buildHuntHistorySection(entries);
    expect(result).toBe(
      '## Hunt History\n\n- **H001** (2026-01-15) -- role: target, outcome: confirmed\n',
    );
  });

  it('formats multiple entries preserving input order', () => {
    const entries: HuntHistoryEntry[] = [
      { huntId: 'H001', date: '2026-01-15', role: 'target', outcome: 'confirmed' },
      { huntId: 'H002', date: '2026-02-01', role: 'indicator', outcome: 'false_positive' },
      { huntId: 'H003', date: '2026-03-10', role: 'infrastructure', outcome: 'ongoing' },
    ];
    const result = buildHuntHistorySection(entries);
    const lines = result.split('\n');
    expect(lines[0]).toBe('## Hunt History');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('- **H001** (2026-01-15) -- role: target, outcome: confirmed');
    expect(lines[3]).toBe('- **H002** (2026-02-01) -- role: indicator, outcome: false_positive');
    expect(lines[4]).toBe('- **H003** (2026-03-10) -- role: infrastructure, outcome: ongoing');
    expect(lines[5]).toBe('');
  });

  it('includes all HuntRole values correctly', () => {
    const roles: HuntRole[] = ['target', 'indicator', 'infrastructure', 'false_positive'];
    for (const role of roles) {
      const result = buildHuntHistorySection([
        { huntId: 'H001', date: '2026-01-01', role, outcome: 'test' },
      ]);
      expect(result).toContain(`role: ${role}`);
    }
  });
});

// ---------------------------------------------------------------------------
// appendHuntHistorySection
// ---------------------------------------------------------------------------

describe('appendHuntHistorySection', () => {
  it('inserts section after ## Verdict History when no Hunt History exists', () => {
    const content = makeEntityNote({ verdictHistory: true, huntHistory: false });
    const entries: HuntHistoryEntry[] = [
      { huntId: 'H001', date: '2026-01-15', role: 'target', outcome: 'confirmed' },
    ];
    const result = appendHuntHistorySection(content, entries);
    const lines = result.split('\n');

    // Find Verdict History and Hunt History positions
    const verdictIdx = lines.findIndex((l) => l.trim() === '## Verdict History');
    const huntIdx = lines.findIndex((l) => l.trim() === '## Hunt History');
    const sightingsIdx = lines.findIndex((l) => l.trim() === '## Sightings');

    expect(verdictIdx).toBeGreaterThan(-1);
    expect(huntIdx).toBeGreaterThan(-1);
    expect(sightingsIdx).toBeGreaterThan(-1);
    // Order: Verdict History < Hunt History < Sightings
    expect(huntIdx).toBeGreaterThan(verdictIdx);
    expect(sightingsIdx).toBeGreaterThan(huntIdx);

    // Check entry is present
    expect(result).toContain('- **H001** (2026-01-15) -- role: target, outcome: confirmed');
  });

  it('replaces existing ## Hunt History section content', () => {
    const content = makeEntityNote({ huntHistory: true });
    const entries: HuntHistoryEntry[] = [
      { huntId: 'H002', date: '2026-02-01', role: 'indicator', outcome: 'resolved' },
    ];
    const result = appendHuntHistorySection(content, entries);

    // Old placeholder removed, new entry present
    expect(result).not.toContain('_No hunt references found._');
    expect(result).toContain('- **H002** (2026-02-01) -- role: indicator, outcome: resolved');

    // Should only have one ## Hunt History heading
    const headingCount = result.split('\n').filter((l) => l.trim() === '## Hunt History').length;
    expect(headingCount).toBe(1);
  });

  it('inserts before ## Sightings when no Verdict History exists', () => {
    const content = makeEntityNote({ verdictHistory: false, huntHistory: false });
    const entries: HuntHistoryEntry[] = [
      { huntId: 'H001', date: '2026-01-15', role: 'target', outcome: 'confirmed' },
    ];
    const result = appendHuntHistorySection(content, entries);
    const lines = result.split('\n');

    const huntIdx = lines.findIndex((l) => l.trim() === '## Hunt History');
    const sightingsIdx = lines.findIndex((l) => l.trim() === '## Sightings');

    expect(huntIdx).toBeGreaterThan(-1);
    expect(sightingsIdx).toBeGreaterThan(huntIdx);
  });

  it('inserts after frontmatter when no sections exist', () => {
    const content = [
      '---',
      'schema_version: 1',
      'type: ioc/ip',
      '---',
      '# Test Entity',
      '',
    ].join('\n');
    const entries: HuntHistoryEntry[] = [
      { huntId: 'H001', date: '2026-01-15', role: 'target', outcome: 'confirmed' },
    ];
    const result = appendHuntHistorySection(content, entries);

    expect(result).toContain('## Hunt History');
    expect(result).toContain('- **H001** (2026-01-15) -- role: target, outcome: confirmed');

    // Hunt History should be after frontmatter
    const lines = result.split('\n');
    const fmCloseIdx = lines.indexOf('---', 1);
    const huntIdx = lines.findIndex((l) => l.trim() === '## Hunt History');
    expect(huntIdx).toBeGreaterThan(fmCloseIdx);
  });

  it('never places Hunt History after ## Sightings or ## Related', () => {
    const content = makeEntityNote({ verdictHistory: true });
    const entries: HuntHistoryEntry[] = [
      { huntId: 'H001', date: '2026-01-15', role: 'target', outcome: 'confirmed' },
    ];
    const result = appendHuntHistorySection(content, entries);
    const lines = result.split('\n');

    const huntIdx = lines.findIndex((l) => l.trim() === '## Hunt History');
    const sightingsIdx = lines.findIndex((l) => l.trim() === '## Sightings');
    const relatedIdx = lines.findIndex((l) => l.trim() === '## Related');

    expect(huntIdx).toBeGreaterThan(-1);
    if (sightingsIdx !== -1) expect(huntIdx).toBeLessThan(sightingsIdx);
    if (relatedIdx !== -1) expect(huntIdx).toBeLessThan(relatedIdx);
  });

  it('replaces empty entries with placeholder text', () => {
    const content = makeEntityNote({ huntHistory: '## Hunt History\n\n- **H001** (2026-01-15) -- role: target, outcome: confirmed\n' });
    const result = appendHuntHistorySection(content, []);

    expect(result).toContain('_No hunt references found._');
    expect(result).not.toContain('- **H001**');
  });

  it('preserves all other sections intact', () => {
    const content = makeEntityNote({ verdictHistory: true, sightings: true, related: true });
    const entries: HuntHistoryEntry[] = [
      { huntId: 'H001', date: '2026-01-15', role: 'target', outcome: 'confirmed' },
    ];
    const result = appendHuntHistorySection(content, entries);

    expect(result).toContain('## Verdict History');
    expect(result).toContain('_No verdict changes recorded._');
    expect(result).toContain('## Sightings');
    expect(result).toContain('_No sightings recorded yet._');
    expect(result).toContain('## Related');
  });
});
