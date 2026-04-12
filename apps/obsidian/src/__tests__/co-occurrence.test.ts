import { describe, it, expect } from 'vitest';
import {
  type CoOccurrence,
  findCoOccurrences,
  buildRelatedInfraSection,
  appendRelatedInfraSection,
} from '../co-occurrence';
import type { EntityNote } from '../cross-hunt';

// ---------------------------------------------------------------------------
// Helper: build EntityNote stubs
// ---------------------------------------------------------------------------

function makeEntity(
  name: string,
  huntRefs: string[],
  entityType = 'ioc/ip',
): EntityNote {
  return {
    name,
    entityType,
    frontmatter: { type: entityType },
    sightingsCount: 0,
    huntRefs,
  };
}

function makeEntityNote(sections: {
  verdictHistory?: boolean;
  huntHistory?: boolean;
  relatedInfra?: string | boolean;
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

  if (sections.huntHistory !== false) {
    lines.push('## Hunt History', '', '_No hunt references found._', '');
  }

  if (sections.relatedInfra) {
    if (typeof sections.relatedInfra === 'string') {
      lines.push(sections.relatedInfra);
    } else {
      lines.push('## Related Infrastructure', '', '_No co-occurring entities found (2+ shared hunts required)._', '');
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
// findCoOccurrences
// ---------------------------------------------------------------------------

describe('findCoOccurrences', () => {
  it('returns empty array when no shared hunts', () => {
    const target = ['H001', 'H002'];
    const entities = [
      makeEntity('entityA', ['H003', 'H004']),
      makeEntity('entityB', ['H005']),
    ];
    const result = findCoOccurrences(target, entities, 'targetEntity');
    expect(result).toEqual([]);
  });

  it('returns empty array when only 1 shared hunt (below threshold=2)', () => {
    const target = ['H001', 'H002'];
    const entities = [makeEntity('entityA', ['H001', 'H003'])];
    const result = findCoOccurrences(target, entities, 'targetEntity');
    expect(result).toEqual([]);
  });

  it('returns entity with 2 shared hunts', () => {
    const target = ['H001', 'H002', 'H003'];
    const entities = [makeEntity('entityA', ['H001', 'H002', 'H004'])];
    const result = findCoOccurrences(target, entities, 'targetEntity');
    expect(result).toHaveLength(1);
    expect(result[0]!.entityName).toBe('entityA');
    expect(result[0]!.huntCount).toBe(2);
    expect(result[0]!.sharedHunts).toEqual(['H001', 'H002']);
  });

  it('excludes the target entity itself', () => {
    const target = ['H001', 'H002'];
    const entities = [
      makeEntity('targetEntity', ['H001', 'H002']),
      makeEntity('otherEntity', ['H001', 'H002']),
    ];
    const result = findCoOccurrences(target, entities, 'targetEntity');
    expect(result).toHaveLength(1);
    expect(result[0]!.entityName).toBe('otherEntity');
  });

  it('sorts results by huntCount descending', () => {
    const target = ['H001', 'H002', 'H003', 'H004'];
    const entities = [
      makeEntity('entityA', ['H001', 'H002']), // 2 shared
      makeEntity('entityB', ['H001', 'H002', 'H003']), // 3 shared
      makeEntity('entityC', ['H001', 'H002', 'H003', 'H004']), // 4 shared
    ];
    const result = findCoOccurrences(target, entities, 'targetEntity');
    expect(result).toHaveLength(3);
    expect(result[0]!.entityName).toBe('entityC');
    expect(result[0]!.huntCount).toBe(4);
    expect(result[1]!.entityName).toBe('entityB');
    expect(result[1]!.huntCount).toBe(3);
    expect(result[2]!.entityName).toBe('entityA');
    expect(result[2]!.huntCount).toBe(2);
  });

  it('respects custom threshold=3', () => {
    const target = ['H001', 'H002', 'H003', 'H004'];
    const entities = [
      makeEntity('entityA', ['H001', 'H002']), // 2 shared -- below threshold
      makeEntity('entityB', ['H001', 'H002', 'H003']), // 3 shared -- meets threshold
    ];
    const result = findCoOccurrences(target, entities, 'targetEntity', 3);
    expect(result).toHaveLength(1);
    expect(result[0]!.entityName).toBe('entityB');
  });

  it('handles empty allEntities', () => {
    const result = findCoOccurrences(['H001'], [], 'targetEntity');
    expect(result).toEqual([]);
  });

  it('handles empty targetHuntRefs', () => {
    const entities = [makeEntity('entityA', ['H001', 'H002'])];
    const result = findCoOccurrences([], entities, 'targetEntity');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildRelatedInfraSection
// ---------------------------------------------------------------------------

describe('buildRelatedInfraSection', () => {
  it('returns placeholder text for empty co-occurrences', () => {
    const result = buildRelatedInfraSection([]);
    expect(result).toBe(
      '## Related Infrastructure\n\n_No co-occurring entities found (2+ shared hunts required)._\n',
    );
  });

  it('produces wiki-linked format with hunt count and hunt IDs', () => {
    const coOccurrences: CoOccurrence[] = [
      { entityName: 'malware-dropper.exe', huntCount: 3, sharedHunts: ['H001', 'H002', 'H003'] },
    ];
    const result = buildRelatedInfraSection(coOccurrences);
    expect(result).toBe(
      '## Related Infrastructure\n\n- [[malware-dropper.exe]] -- seen together in 3 hunts (H001, H002, H003)\n',
    );
  });

  it('formats multiple co-occurrences', () => {
    const coOccurrences: CoOccurrence[] = [
      { entityName: 'c2-server', huntCount: 4, sharedHunts: ['H001', 'H002', 'H003', 'H004'] },
      { entityName: 'beacon.dll', huntCount: 2, sharedHunts: ['H001', 'H003'] },
    ];
    const result = buildRelatedInfraSection(coOccurrences);
    const lines = result.split('\n');
    expect(lines[0]).toBe('## Related Infrastructure');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('- [[c2-server]] -- seen together in 4 hunts (H001, H002, H003, H004)');
    expect(lines[3]).toBe('- [[beacon.dll]] -- seen together in 2 hunts (H001, H003)');
    expect(lines[4]).toBe('');
  });
});

// ---------------------------------------------------------------------------
// appendRelatedInfraSection
// ---------------------------------------------------------------------------

describe('appendRelatedInfraSection', () => {
  it('inserts after ## Hunt History and before ## Sightings', () => {
    const content = makeEntityNote({ huntHistory: true, relatedInfra: false });
    const coOccurrences: CoOccurrence[] = [
      { entityName: 'entityA', huntCount: 2, sharedHunts: ['H001', 'H002'] },
    ];
    const result = appendRelatedInfraSection(content, coOccurrences);
    const lines = result.split('\n');

    const huntIdx = lines.findIndex((l) => l.trim() === '## Hunt History');
    const relInfraIdx = lines.findIndex((l) => l.trim() === '## Related Infrastructure');
    const sightingsIdx = lines.findIndex((l) => l.trim() === '## Sightings');

    expect(huntIdx).toBeGreaterThan(-1);
    expect(relInfraIdx).toBeGreaterThan(-1);
    expect(sightingsIdx).toBeGreaterThan(-1);
    expect(relInfraIdx).toBeGreaterThan(huntIdx);
    expect(sightingsIdx).toBeGreaterThan(relInfraIdx);
  });

  it('replaces existing ## Related Infrastructure section', () => {
    const content = makeEntityNote({ relatedInfra: true });
    const coOccurrences: CoOccurrence[] = [
      { entityName: 'newEntity', huntCount: 3, sharedHunts: ['H001', 'H002', 'H003'] },
    ];
    const result = appendRelatedInfraSection(content, coOccurrences);

    expect(result).not.toContain('_No co-occurring entities found');
    expect(result).toContain('- [[newEntity]] -- seen together in 3 hunts (H001, H002, H003)');

    // Only one heading
    const headingCount = result.split('\n').filter((l) => l.trim() === '## Related Infrastructure').length;
    expect(headingCount).toBe(1);
  });

  it('inserts before ## Sightings when no Hunt History exists', () => {
    const content = makeEntityNote({ huntHistory: false, relatedInfra: false });
    const coOccurrences: CoOccurrence[] = [
      { entityName: 'entityA', huntCount: 2, sharedHunts: ['H001', 'H002'] },
    ];
    const result = appendRelatedInfraSection(content, coOccurrences);
    const lines = result.split('\n');

    const relInfraIdx = lines.findIndex((l) => l.trim() === '## Related Infrastructure');
    const sightingsIdx = lines.findIndex((l) => l.trim() === '## Sightings');

    expect(relInfraIdx).toBeGreaterThan(-1);
    expect(sightingsIdx).toBeGreaterThan(relInfraIdx);
  });

  it('inserts after frontmatter when no target sections exist', () => {
    const content = [
      '---',
      'schema_version: 1',
      'type: ioc/ip',
      '---',
      '# Test Entity',
      '',
    ].join('\n');
    const coOccurrences: CoOccurrence[] = [
      { entityName: 'entityA', huntCount: 2, sharedHunts: ['H001', 'H002'] },
    ];
    const result = appendRelatedInfraSection(content, coOccurrences);

    expect(result).toContain('## Related Infrastructure');
    expect(result).toContain('- [[entityA]]');

    const lines = result.split('\n');
    const fmCloseIdx = lines.indexOf('---', 1);
    const relInfraIdx = lines.findIndex((l) => l.trim() === '## Related Infrastructure');
    expect(relInfraIdx).toBeGreaterThan(fmCloseIdx);
  });

  it('does not confuse ## Related Infrastructure with ## Related', () => {
    const content = makeEntityNote({ relatedInfra: false });
    const coOccurrences: CoOccurrence[] = [
      { entityName: 'entityA', huntCount: 2, sharedHunts: ['H001', 'H002'] },
    ];
    const result = appendRelatedInfraSection(content, coOccurrences);
    const lines = result.split('\n');

    // Both sections should exist
    const relInfraIdx = lines.findIndex((l) => l.trim() === '## Related Infrastructure');
    const relatedIdx = lines.findIndex((l) => l.trim() === '## Related');

    expect(relInfraIdx).toBeGreaterThan(-1);
    expect(relatedIdx).toBeGreaterThan(-1);
    expect(relInfraIdx).not.toBe(relatedIdx);
  });

  it('preserves all other sections intact', () => {
    const content = makeEntityNote({ verdictHistory: true, huntHistory: true, sightings: true, related: true });
    const coOccurrences: CoOccurrence[] = [
      { entityName: 'entityA', huntCount: 2, sharedHunts: ['H001', 'H002'] },
    ];
    const result = appendRelatedInfraSection(content, coOccurrences);

    expect(result).toContain('## Verdict History');
    expect(result).toContain('## Hunt History');
    expect(result).toContain('## Related Infrastructure');
    expect(result).toContain('## Sightings');
    expect(result).toContain('## Related');
  });
});
