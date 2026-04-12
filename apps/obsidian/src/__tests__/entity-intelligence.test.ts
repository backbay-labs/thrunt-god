import { describe, it, expect } from 'vitest';
import { refreshEntityIntelligence, type RefreshInput } from '../entity-intelligence';
import type { EntityNote } from '../cross-hunt';
import type { HuntHistoryEntry } from '../hunt-history';
import type { ConfidenceFactors } from '../confidence';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ENTITY_CONTENT = `---
type: ioc/ip
hunt_refs: [hunt-alpha, hunt-beta]
confidence: "high"
verdict: unknown
schema_version: 1
---
# 192.168.1.100

## Verdict History

_No verdict changes recorded._

## Sightings

- 2024-01-15: Seen in hunt-alpha
- 2024-02-10: Seen in hunt-beta

## Related

- [[T1059.001]]
`;

const HUNT_ENTRIES: HuntHistoryEntry[] = [
  { huntId: 'hunt-alpha', date: '2024-01-15', role: 'indicator', outcome: 'suspicious' },
  { huntId: 'hunt-beta', date: '2024-02-10', role: 'target', outcome: 'confirmed_malicious' },
];

const ALL_ENTITIES: EntityNote[] = [
  {
    name: '192.168.1.100',
    entityType: 'ioc/ip',
    frontmatter: { type: 'ioc/ip' },
    sightingsCount: 2,
    huntRefs: ['hunt-alpha', 'hunt-beta'],
  },
  {
    name: 'evil-domain.com',
    entityType: 'ioc/domain',
    frontmatter: { type: 'ioc/domain' },
    sightingsCount: 3,
    huntRefs: ['hunt-alpha', 'hunt-beta', 'hunt-gamma'],
  },
  {
    name: 'benign-host',
    entityType: 'ioc/ip',
    frontmatter: { type: 'ioc/ip' },
    sightingsCount: 1,
    huntRefs: ['hunt-gamma'],
  },
];

const CONFIDENCE_FACTORS: ConfidenceFactors = {
  source_count: 2,
  reliability: 0.8,
  corroboration: 1,
  days_since_validation: 30,
};

function makeInput(overrides?: Partial<RefreshInput>): RefreshInput {
  return {
    entityContent: ENTITY_CONTENT,
    entityName: '192.168.1.100',
    entityHuntRefs: ['hunt-alpha', 'hunt-beta'],
    huntEntries: HUNT_ENTRIES,
    allEntities: ALL_ENTITIES,
    confidenceFactors: CONFIDENCE_FACTORS,
    confidenceConfig: { half_life_days: 90 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('refreshEntityIntelligence', () => {
  it('inserts Hunt History section with correct entries', () => {
    const result = refreshEntityIntelligence(makeInput());
    expect(result.content).toContain('## Hunt History');
    expect(result.content).toContain('**hunt-alpha** (2024-01-15) -- role: indicator, outcome: suspicious');
    expect(result.content).toContain('**hunt-beta** (2024-02-10) -- role: target, outcome: confirmed_malicious');
    expect(result.huntHistoryCount).toBe(2);
  });

  it('inserts Related Infrastructure section with co-occurring entities', () => {
    const result = refreshEntityIntelligence(makeInput());
    expect(result.content).toContain('## Related Infrastructure');
    // evil-domain.com shares hunt-alpha + hunt-beta (2 hunts >= threshold 2)
    expect(result.content).toContain('[[evil-domain.com]]');
    // benign-host only shares 0 hunts with target
    expect(result.content).not.toContain('[[benign-host]]');
    expect(result.coOccurrenceCount).toBe(1);
  });

  it('updates frontmatter with confidence_score and confidence_factors', () => {
    const result = refreshEntityIntelligence(makeInput());
    expect(result.content).toContain('confidence_score:');
    expect(result.content).toContain('confidence_factors:');
    // Verify the factors string format
    expect(result.content).toContain('source_count: 2');
    expect(result.content).toContain('reliability: 0.8');
    expect(result.confidenceScore).toBeGreaterThan(0);
    expect(result.confidenceScore).toBeLessThanOrEqual(1);
  });

  it('produces placeholder sections when inputs are empty', () => {
    const result = refreshEntityIntelligence(
      makeInput({
        huntEntries: [],
        entityHuntRefs: [],
        allEntities: [],
        confidenceFactors: {
          source_count: 0,
          reliability: 0,
          corroboration: 0,
          days_since_validation: 0,
        },
      }),
    );
    expect(result.content).toContain('## Hunt History');
    expect(result.content).toContain('_No hunt references found._');
    expect(result.content).toContain('## Related Infrastructure');
    expect(result.content).toContain('_No co-occurring entities found');
    expect(result.huntHistoryCount).toBe(0);
    expect(result.coOccurrenceCount).toBe(0);
  });

  it('composes all three operations on the same content string', () => {
    const result = refreshEntityIntelligence(makeInput());
    // Verify section ordering: Hunt History before Related Infrastructure before Sightings
    const huntHistoryIdx = result.content.indexOf('## Hunt History');
    const relatedInfraIdx = result.content.indexOf('## Related Infrastructure');
    const sightingsIdx = result.content.indexOf('## Sightings');
    expect(huntHistoryIdx).toBeGreaterThan(-1);
    expect(relatedInfraIdx).toBeGreaterThan(-1);
    expect(sightingsIdx).toBeGreaterThan(-1);
    expect(huntHistoryIdx).toBeLessThan(relatedInfraIdx);
    expect(relatedInfraIdx).toBeLessThan(sightingsIdx);

    // Frontmatter should still contain original fields
    expect(result.content).toContain('type: ioc/ip');
    expect(result.content).toContain('verdict: unknown');
  });

  it('preserves existing content sections (Sightings, Related)', () => {
    const result = refreshEntityIntelligence(makeInput());
    expect(result.content).toContain('## Sightings');
    expect(result.content).toContain('- 2024-01-15: Seen in hunt-alpha');
    expect(result.content).toContain('## Related');
    expect(result.content).toContain('- [[T1059.001]]');
  });
});
