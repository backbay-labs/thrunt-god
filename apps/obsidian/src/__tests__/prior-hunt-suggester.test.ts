import { describe, it, expect } from 'vitest';
import type { EntityNote } from '../cross-hunt';
import { findPriorHuntMatches } from '../prior-hunt-suggester';

// ---------------------------------------------------------------------------
// Helper -- build EntityNote for testing
// ---------------------------------------------------------------------------

function makeEntityNote(overrides: Partial<EntityNote> = {}): EntityNote {
  return {
    name: 'default-entity',
    entityType: 'ioc/ip',
    frontmatter: {},
    sightingsCount: 0,
    huntRefs: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// findPriorHuntMatches tests
// ---------------------------------------------------------------------------

describe('findPriorHuntMatches', () => {
  it('returns matches where entity name matches and huntRefs >= minHunts with refs from other hunts', () => {
    const notes = [
      makeEntityNote({
        name: '192.168.1.1',
        entityType: 'ioc/ip',
        huntRefs: ['HUNT-001', 'HUNT-002', 'HUNT-042'],
      }),
    ];

    const result = findPriorHuntMatches('192.168.1.1', 'ioc_ipv4', notes, 'HUNT-042', 2);

    expect(result).toHaveLength(1);
    expect(result[0]!.entityName).toBe('192.168.1.1');
    expect(result[0]!.entityType).toBe('ioc/ip');
    expect(result[0]!.matchingHunts).toEqual(['HUNT-001', 'HUNT-002']);
    expect(result[0]!.sourcePath).toBe('');
  });

  it('returns empty array when no entity names match', () => {
    const notes = [
      makeEntityNote({
        name: '10.0.0.1',
        entityType: 'ioc/ip',
        huntRefs: ['HUNT-001', 'HUNT-002', 'HUNT-003'],
      }),
    ];

    const result = findPriorHuntMatches('192.168.1.1', 'ioc_ipv4', notes, 'HUNT-042', 2);

    expect(result).toEqual([]);
  });

  it('returns empty array when matching entity has fewer than minHunts hunt refs', () => {
    const notes = [
      makeEntityNote({
        name: '192.168.1.1',
        entityType: 'ioc/ip',
        huntRefs: ['HUNT-001'],
      }),
    ];

    const result = findPriorHuntMatches('192.168.1.1', 'ioc_ipv4', notes, 'HUNT-042', 2);

    expect(result).toEqual([]);
  });

  it('returns empty array when all matching entity hunt refs are the current hunt', () => {
    const notes = [
      makeEntityNote({
        name: '192.168.1.1',
        entityType: 'ioc/ip',
        huntRefs: ['HUNT-042', 'HUNT-042'],
      }),
    ];

    const result = findPriorHuntMatches('192.168.1.1', 'ioc_ipv4', notes, 'HUNT-042', 2);

    expect(result).toEqual([]);
  });

  it('returns matches with minHunts=1 for single-hunt entities with refs besides current', () => {
    const notes = [
      makeEntityNote({
        name: '192.168.1.1',
        entityType: 'ioc/ip',
        huntRefs: ['HUNT-001'],
      }),
    ];

    const result = findPriorHuntMatches('192.168.1.1', 'ioc_ipv4', notes, 'HUNT-042', 1);

    expect(result).toHaveLength(1);
    expect(result[0]!.matchingHunts).toEqual(['HUNT-001']);
  });

  it('returns matchingHunts excluding the current hunt ID', () => {
    const notes = [
      makeEntityNote({
        name: '192.168.1.1',
        entityType: 'ioc/ip',
        huntRefs: ['HUNT-001', 'HUNT-042', 'HUNT-003'],
      }),
    ];

    const result = findPriorHuntMatches('192.168.1.1', 'ioc_ipv4', notes, 'HUNT-042', 2);

    expect(result).toHaveLength(1);
    expect(result[0]!.matchingHunts).toEqual(['HUNT-001', 'HUNT-003']);
    expect(result[0]!.matchingHunts).not.toContain('HUNT-042');
  });

  it('handles multiple matching entity notes (same name across different folders)', () => {
    const notes = [
      makeEntityNote({
        name: '192.168.1.1',
        entityType: 'ioc/ip',
        huntRefs: ['HUNT-001', 'HUNT-002'],
      }),
      makeEntityNote({
        name: '192.168.1.1',
        entityType: 'ioc/ipv4',
        huntRefs: ['HUNT-003', 'HUNT-004'],
      }),
    ];

    const result = findPriorHuntMatches('192.168.1.1', 'ioc_ipv4', notes, 'HUNT-042', 2);

    expect(result).toHaveLength(2);
    expect(result[0]!.matchingHunts).toEqual(['HUNT-001', 'HUNT-002']);
    expect(result[1]!.matchingHunts).toEqual(['HUNT-003', 'HUNT-004']);
  });

  it('PriorHuntSuggestion includes entityName, entityType, matchingHunts, and sourcePath', () => {
    const notes = [
      makeEntityNote({
        name: 'evil-actor',
        entityType: 'actor',
        huntRefs: ['HUNT-010', 'HUNT-020', 'HUNT-030'],
      }),
    ];

    const result = findPriorHuntMatches('evil-actor', 'actor', notes, 'HUNT-030', 2);

    expect(result).toHaveLength(1);
    const suggestion = result[0]!;
    expect(suggestion).toHaveProperty('entityName', 'evil-actor');
    expect(suggestion).toHaveProperty('entityType', 'actor');
    expect(suggestion).toHaveProperty('matchingHunts');
    expect(suggestion.matchingHunts).toEqual(['HUNT-010', 'HUNT-020']);
    expect(suggestion).toHaveProperty('sourcePath', '');
  });
});
