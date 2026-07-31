import { describe, it, expect } from 'vitest';
import {
  buildRecurringIocs,
  buildCoverageGaps,
  buildActorConvergence,
  compareHunts,
  generateDashboardCanvas,
} from '../cross-hunt';
import type {
  EntityNote,
  ComparisonInput,
  HuntSummary,
  TopEntity,
} from '../cross-hunt';

describe('cross-hunt', () => {
  // --- Helper factory ---

  function makeEntityNote(overrides: Partial<EntityNote> = {}): EntityNote {
    return {
      name: 'test-entity',
      entityType: 'ioc/ip',
      frontmatter: {},
      sightingsCount: 0,
      huntRefs: [],
      ...overrides,
    };
  }

  // --- buildRecurringIocs ---

  describe('buildRecurringIocs', () => {
    it('returns IOCs with 2+ hunt_refs sorted by huntRefs.length desc', () => {
      const notes: EntityNote[] = [
        makeEntityNote({
          name: '192.168.1.1',
          entityType: 'ioc/ip',
          huntRefs: ['hunt-1', 'hunt-2', 'hunt-3'],
        }),
        makeEntityNote({
          name: '10.0.0.1',
          entityType: 'ioc/ip',
          huntRefs: ['hunt-1', 'hunt-2'],
        }),
        makeEntityNote({
          name: 'single-ref',
          entityType: 'ioc/ip',
          huntRefs: ['hunt-1'],
        }),
      ];
      const result = buildRecurringIocs(notes);
      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('192.168.1.1');
      expect(result[1]!.name).toBe('10.0.0.1');
    });

    it('returns empty array when all IOCs have 0 or 1 hunt_refs', () => {
      const notes: EntityNote[] = [
        makeEntityNote({ name: 'a', huntRefs: ['hunt-1'] }),
        makeEntityNote({ name: 'b', huntRefs: [] }),
      ];
      const result = buildRecurringIocs(notes);
      expect(result).toHaveLength(0);
    });

    it('returns empty array for empty input', () => {
      const result = buildRecurringIocs([]);
      expect(result).toHaveLength(0);
    });

    it('only returns entities where entityType starts with "ioc"', () => {
      const notes: EntityNote[] = [
        makeEntityNote({
          name: 'ttp-note',
          entityType: 'ttp',
          huntRefs: ['hunt-1', 'hunt-2', 'hunt-3'],
        }),
        makeEntityNote({
          name: 'actor-note',
          entityType: 'actor',
          huntRefs: ['hunt-1', 'hunt-2'],
        }),
        makeEntityNote({
          name: 'ioc-note',
          entityType: 'ioc/domain',
          huntRefs: ['hunt-1', 'hunt-2'],
        }),
      ];
      const result = buildRecurringIocs(notes);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('ioc-note');
    });

    it('respects custom threshold parameter', () => {
      const notes: EntityNote[] = [
        makeEntityNote({
          name: 'two-refs',
          entityType: 'ioc/ip',
          huntRefs: ['hunt-1', 'hunt-2'],
        }),
        makeEntityNote({
          name: 'three-refs',
          entityType: 'ioc/hash',
          huntRefs: ['hunt-1', 'hunt-2', 'hunt-3'],
        }),
      ];
      const result = buildRecurringIocs(notes, 3);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('three-refs');
    });
  });

  // --- buildCoverageGaps ---

  describe('buildCoverageGaps', () => {
    it('returns TTPs with hunt_count === 0 grouped by tactic', () => {
      const notes: EntityNote[] = [
        makeEntityNote({
          name: 'T1059',
          entityType: 'ttp',
          frontmatter: { tactic: 'Execution', hunt_count: 0 },
        }),
        makeEntityNote({
          name: 'T1078',
          entityType: 'ttp',
          frontmatter: { tactic: 'Persistence', hunt_count: 0 },
        }),
        makeEntityNote({
          name: 'T1053',
          entityType: 'ttp',
          frontmatter: { tactic: 'Execution', hunt_count: 3 },
        }),
      ];
      const result = buildCoverageGaps(notes);
      expect(result).toHaveLength(2);
      // Execution (index 3) comes before Persistence (index 4)
      expect(result[0]!.tactic).toBe('Execution');
      expect(result[0]!.gaps).toEqual(['T1059']);
      expect(result[1]!.tactic).toBe('Persistence');
      expect(result[1]!.gaps).toEqual(['T1078']);
    });

    it('sorts results by TACTIC_ORDER', () => {
      const notes: EntityNote[] = [
        makeEntityNote({
          name: 'T9999',
          entityType: 'ttp',
          frontmatter: { tactic: 'Impact', hunt_count: 0 },
        }),
        makeEntityNote({
          name: 'T0001',
          entityType: 'ttp',
          frontmatter: { tactic: 'Reconnaissance', hunt_count: 0 },
        }),
      ];
      const result = buildCoverageGaps(notes);
      expect(result).toHaveLength(2);
      expect(result[0]!.tactic).toBe('Reconnaissance');
      expect(result[1]!.tactic).toBe('Impact');
    });

    it('skips TTPs where tactic is empty or missing', () => {
      const notes: EntityNote[] = [
        makeEntityNote({
          name: 'no-tactic',
          entityType: 'ttp',
          frontmatter: { hunt_count: 0 },
        }),
        makeEntityNote({
          name: 'empty-tactic',
          entityType: 'ttp',
          frontmatter: { tactic: '', hunt_count: 0 },
        }),
        makeEntityNote({
          name: 'valid',
          entityType: 'ttp',
          frontmatter: { tactic: 'Execution', hunt_count: 0 },
        }),
      ];
      const result = buildCoverageGaps(notes);
      expect(result).toHaveLength(1);
      expect(result[0]!.gaps).toEqual(['valid']);
    });

    it('returns empty array for empty input', () => {
      const result = buildCoverageGaps([]);
      expect(result).toHaveLength(0);
    });
  });

  // --- buildActorConvergence ---

  describe('buildActorConvergence', () => {
    it('returns hunt pairs sharing 3+ IOCs when threshold is 3', () => {
      const notes: EntityNote[] = [
        makeEntityNote({
          name: 'ioc-1',
          entityType: 'ioc/ip',
          huntRefs: ['hunt-A', 'hunt-B'],
        }),
        makeEntityNote({
          name: 'ioc-2',
          entityType: 'ioc/domain',
          huntRefs: ['hunt-A', 'hunt-B'],
        }),
        makeEntityNote({
          name: 'ioc-3',
          entityType: 'ioc/hash',
          huntRefs: ['hunt-A', 'hunt-B'],
        }),
      ];
      const result = buildActorConvergence(notes, 3);
      expect(result).toHaveLength(1);
      expect(result[0]!.huntA).toBe('hunt-A');
      expect(result[0]!.huntB).toBe('hunt-B');
      expect(result[0]!.sharedIocs).toHaveLength(3);
      expect(result[0]!.sharedIocs).toContain('ioc-1');
      expect(result[0]!.sharedIocs).toContain('ioc-2');
      expect(result[0]!.sharedIocs).toContain('ioc-3');
    });

    it('returns empty when hunt pair shares exactly 2 IOCs with threshold 3', () => {
      const notes: EntityNote[] = [
        makeEntityNote({
          name: 'ioc-1',
          entityType: 'ioc/ip',
          huntRefs: ['hunt-A', 'hunt-B'],
        }),
        makeEntityNote({
          name: 'ioc-2',
          entityType: 'ioc/domain',
          huntRefs: ['hunt-A', 'hunt-B'],
        }),
      ];
      const result = buildActorConvergence(notes, 3);
      expect(result).toHaveLength(0);
    });

    it('returns empty array for empty input', () => {
      const result = buildActorConvergence([]);
      expect(result).toHaveLength(0);
    });

    it('sorts results by sharedIocs.length descending', () => {
      const notes: EntityNote[] = [
        makeEntityNote({
          name: 'ioc-1',
          entityType: 'ioc/ip',
          huntRefs: ['hunt-A', 'hunt-B'],
        }),
        makeEntityNote({
          name: 'ioc-2',
          entityType: 'ioc/domain',
          huntRefs: ['hunt-A', 'hunt-B'],
        }),
        makeEntityNote({
          name: 'ioc-3',
          entityType: 'ioc/hash',
          huntRefs: ['hunt-A', 'hunt-B'],
        }),
        makeEntityNote({
          name: 'ioc-4',
          entityType: 'ioc/ip',
          huntRefs: ['hunt-A', 'hunt-B', 'hunt-C'],
        }),
        makeEntityNote({
          name: 'ioc-5',
          entityType: 'ioc/domain',
          huntRefs: ['hunt-A', 'hunt-B', 'hunt-C'],
        }),
        makeEntityNote({
          name: 'ioc-6',
          entityType: 'ioc/hash',
          huntRefs: ['hunt-A', 'hunt-B', 'hunt-C'],
        }),
        makeEntityNote({
          name: 'ioc-7',
          entityType: 'ioc/ip',
          huntRefs: ['hunt-A', 'hunt-C'],
        }),
        makeEntityNote({
          name: 'ioc-8',
          entityType: 'ioc/domain',
          huntRefs: ['hunt-A', 'hunt-C'],
        }),
        makeEntityNote({
          name: 'ioc-9',
          entityType: 'ioc/hash',
          huntRefs: ['hunt-A', 'hunt-C'],
        }),
      ];
      const result = buildActorConvergence(notes, 3);
      // hunt-A/hunt-B share 6 IOCs (ioc-1..ioc-6), hunt-A/hunt-C share 6 (ioc-4..ioc-9), hunt-B/hunt-C share 3 (ioc-4..ioc-6)
      expect(result.length).toBeGreaterThanOrEqual(2);
      // Sorted by descending shared count
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1]!.sharedIocs.length).toBeGreaterThanOrEqual(
          result[i]!.sharedIocs.length,
        );
      }
    });
  });

  // --- compareHunts ---

  describe('compareHunts', () => {
    it('places shared entity names in shared, not uniqueA or uniqueB', () => {
      const input: ComparisonInput = {
        huntAName: 'Hunt Alpha',
        huntAEntities: [
          makeEntityNote({ name: 'T1059', entityType: 'ttp', frontmatter: { tactic: 'Execution' } }),
          makeEntityNote({ name: '192.168.1.1', entityType: 'ioc/ip' }),
        ],
        huntBName: 'Hunt Beta',
        huntBEntities: [
          makeEntityNote({ name: 'T1059', entityType: 'ttp', frontmatter: { tactic: 'Execution' } }),
          makeEntityNote({ name: 'evil.com', entityType: 'ioc/domain' }),
        ],
      };
      const result = compareHunts(input);
      expect(result.shared).toContain('T1059');
      expect(result.uniqueA).not.toContain('T1059');
      expect(result.uniqueB).not.toContain('T1059');
    });

    it('places entity in uniqueA if only in hunt A', () => {
      const input: ComparisonInput = {
        huntAName: 'Hunt Alpha',
        huntAEntities: [
          makeEntityNote({ name: 'only-in-A', entityType: 'ioc/ip' }),
        ],
        huntBName: 'Hunt Beta',
        huntBEntities: [],
      };
      const result = compareHunts(input);
      expect(result.uniqueA).toContain('only-in-A');
      expect(result.shared).not.toContain('only-in-A');
      expect(result.uniqueB).not.toContain('only-in-A');
    });

    it('computes combinedTacticCoverage counting distinct TTPs per tactic deduped', () => {
      const input: ComparisonInput = {
        huntAName: 'Hunt Alpha',
        huntAEntities: [
          makeEntityNote({ name: 'T1059', entityType: 'ttp', frontmatter: { tactic: 'Execution' } }),
          makeEntityNote({ name: 'T1053', entityType: 'ttp', frontmatter: { tactic: 'Execution' } }),
        ],
        huntBName: 'Hunt Beta',
        huntBEntities: [
          makeEntityNote({ name: 'T1059', entityType: 'ttp', frontmatter: { tactic: 'Execution' } }),
          makeEntityNote({ name: 'T1078', entityType: 'ttp', frontmatter: { tactic: 'Persistence' } }),
        ],
      };
      const result = compareHunts(input);
      const execution = result.combinedTacticCoverage.find((c) => c.tactic === 'Execution');
      expect(execution).toBeDefined();
      // T1059 + T1053 = 2 distinct TTPs under Execution
      expect(execution!.count).toBe(2);
      const persistence = result.combinedTacticCoverage.find((c) => c.tactic === 'Persistence');
      expect(persistence).toBeDefined();
      expect(persistence!.count).toBe(1);
    });

    it('returns all empty arrays for empty hunts', () => {
      const input: ComparisonInput = {
        huntAName: 'Empty A',
        huntAEntities: [],
        huntBName: 'Empty B',
        huntBEntities: [],
      };
      const result = compareHunts(input);
      expect(result.shared).toHaveLength(0);
      expect(result.uniqueA).toHaveLength(0);
      expect(result.uniqueB).toHaveLength(0);
      expect(result.combinedTacticCoverage).toHaveLength(0);
    });
  });

  // --- generateDashboardCanvas ---

  describe('generateDashboardCanvas', () => {
    it('produces canvas with central Program Overview text node', () => {
      const result = generateDashboardCanvas([], [], new Map());
      const center = result.nodes.find((n) => n.text === 'Program Overview');
      expect(center).toBeDefined();
      expect(center!.x).toBe(400);
      expect(center!.y).toBe(300);
      expect(center!.width).toBe(250);
      expect(center!.height).toBe(80);
      expect(center!.type).toBe('text');
      expect(center!.color).toBe('#2c3e50');
    });

    it('produces only center node for empty hunts and entities', () => {
      const result = generateDashboardCanvas([], [], new Map());
      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toHaveLength(0);
    });

    it('places hunt nodes radially around center', () => {
      const hunts: HuntSummary[] = [
        { name: 'Hunt-1', entityCount: 5, lastModified: '2026-01-01T00:00:00Z' },
        { name: 'Hunt-2', entityCount: 3, lastModified: '2026-02-01T00:00:00Z' },
      ];
      const result = generateDashboardCanvas(hunts, [], new Map());
      // Center + 2 hunt nodes
      expect(result.nodes).toHaveLength(3);
      const huntNodes = result.nodes.filter((n) => n.text !== 'Program Overview');
      expect(huntNodes).toHaveLength(2);
      // Hunt nodes should have color '#1abc9c'
      for (const node of huntNodes) {
        expect(node.color).toBe('#1abc9c');
        expect(node.type).toBe('text');
      }
    });

    it('scales hunt node width by recency -- most recent gets 220, oldest 140', () => {
      const hunts: HuntSummary[] = [
        { name: 'Oldest', entityCount: 5, lastModified: '2025-01-01T00:00:00Z' },
        { name: 'Newest', entityCount: 3, lastModified: '2026-06-01T00:00:00Z' },
      ];
      const result = generateDashboardCanvas(hunts, [], new Map());
      const oldNode = result.nodes.find((n) => n.text?.includes('Oldest'));
      const newNode = result.nodes.find((n) => n.text?.includes('Newest'));
      expect(oldNode).toBeDefined();
      expect(newNode).toBeDefined();
      expect(newNode!.width).toBe(220);
      expect(oldNode!.width).toBe(140);
    });

    it('places top entities below center sorted by sightingsCount desc', () => {
      const topEntities: TopEntity[] = [
        { name: 'entity-low', entityType: 'ioc/ip', sightingsCount: 1 },
        { name: 'entity-high', entityType: 'ttp', sightingsCount: 10 },
      ];
      const result = generateDashboardCanvas([], topEntities, new Map());
      // Center + 2 entity nodes
      expect(result.nodes).toHaveLength(3);
      const entityNodes = result.nodes.filter((n) => n.text !== 'Program Overview');
      // Sorted by sightingsCount desc -- entity-high first
      expect(entityNodes[0]!.id).toContain('entity-high');
      // Both below center (y >= 650)
      for (const node of entityNodes) {
        expect(node.y).toBeGreaterThanOrEqual(650);
      }
    });

    it('creates edges from hunts to their related entities', () => {
      const hunts: HuntSummary[] = [
        { name: 'Hunt-1', entityCount: 5, lastModified: '2026-01-01T00:00:00Z' },
      ];
      const topEntities: TopEntity[] = [
        { name: 'T1059', entityType: 'ttp', sightingsCount: 5 },
      ];
      const huntEntityLinks = new Map<string, string[]>([
        ['Hunt-1', ['T1059']],
      ]);
      const result = generateDashboardCanvas(hunts, topEntities, huntEntityLinks);
      expect(result.edges).toHaveLength(1);
      // Edge connects hunt node to entity node
      const huntNode = result.nodes.find((n) => n.text?.includes('Hunt-1'));
      const entityNode = result.nodes.find((n) => n.id.includes('T1059'));
      expect(huntNode).toBeDefined();
      expect(entityNode).toBeDefined();
      expect(result.edges[0]!.fromNode).toBe(huntNode!.id);
      expect(result.edges[0]!.toNode).toBe(entityNode!.id);
    });
  });
});
