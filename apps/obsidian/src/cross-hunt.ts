/**
 * Cross-hunt intelligence module for multi-hunt analysis and dashboard generation.
 *
 * Pure-function module -- NO Obsidian imports. Provides analytical queries
 * across multiple hunts, hunt comparison, and dashboard canvas generation:
 *   - Recurring IOC identification across hunts
 *   - Coverage gap analysis by ATT&CK tactic
 *   - Actor convergence detection via shared IOCs
 *   - Hunt-vs-hunt entity comparison
 *   - Program dashboard canvas layout
 *
 * All functions are pure data transforms suitable for unit testing
 * and consumption by workspace.ts service methods.
 */

import { TACTIC_ORDER } from './canvas-generator';
import type { CanvasNode, CanvasEdge, CanvasData } from './types';

// --- Public types ---

/** Entity note with frontmatter metadata for cross-hunt analysis */
export interface EntityNote {
  name: string;
  entityType: string;
  frontmatter: Record<string, string | number | string[]>;
  sightingsCount: number;
  huntRefs: string[];
}

/** Coverage gap entry: a tactic with unhunted TTPs */
export interface CoverageGap {
  tactic: string;
  gaps: string[];
}

/** Hunt pair sharing IOCs above convergence threshold */
export interface ConvergencePair {
  huntA: string;
  huntB: string;
  sharedIocs: string[];
}

/** Input for hunt-vs-hunt comparison */
export interface ComparisonInput {
  huntAName: string;
  huntAEntities: EntityNote[];
  huntBName: string;
  huntBEntities: EntityNote[];
}

/** Result of a hunt comparison */
export interface ComparisonResult {
  shared: string[];
  uniqueA: string[];
  uniqueB: string[];
  combinedTacticCoverage: { tactic: string; count: number }[];
}

/** Summary of a hunt for dashboard display */
export interface HuntSummary {
  name: string;
  entityCount: number;
  lastModified: string; // ISO 8601
}

/** Top entity by sighting count for dashboard display */
export interface TopEntity {
  name: string;
  entityType: string;
  sightingsCount: number;
}

// --- Functions ---

/**
 * Find IOCs recurring across multiple hunts.
 *
 * Filters entity notes to those with entityType starting with "ioc"
 * and huntRefs.length >= threshold, sorted by huntRefs.length descending.
 */
export function buildRecurringIocs(
  notes: EntityNote[],
  threshold = 2,
): EntityNote[] {
  return notes
    .filter((n) => n.entityType.startsWith('ioc') && n.huntRefs.length >= threshold)
    .sort((a, b) => b.huntRefs.length - a.huntRefs.length);
}

/**
 * Identify ATT&CK coverage gaps -- TTPs with hunt_count === 0.
 *
 * Groups unhunted TTPs by tactic, sorted by TACTIC_ORDER index.
 * Skips TTPs with empty or missing tactic.
 */
export function buildCoverageGaps(ttpNotes: EntityNote[]): CoverageGap[] {
  const gapsByTactic = new Map<string, string[]>();

  for (const note of ttpNotes) {
    const huntCount = note.frontmatter['hunt_count'];
    // Only include TTPs that have never been hunted
    if (huntCount !== undefined && huntCount !== 0) continue;

    const tactic = note.frontmatter['tactic'];
    if (typeof tactic !== 'string' || tactic === '') continue;

    const existing = gapsByTactic.get(tactic);
    if (existing) {
      existing.push(note.name);
    } else {
      gapsByTactic.set(tactic, [note.name]);
    }
  }

  // Sort by TACTIC_ORDER index
  const result: CoverageGap[] = [];
  for (const tactic of TACTIC_ORDER) {
    const gaps = gapsByTactic.get(tactic);
    if (gaps && gaps.length > 0) {
      result.push({ tactic, gaps });
    }
  }

  // Include any tactics not in TACTIC_ORDER at the end
  for (const [tactic, gaps] of gapsByTactic) {
    if (!TACTIC_ORDER.includes(tactic) && gaps.length > 0) {
      result.push({ tactic, gaps });
    }
  }

  return result;
}

/**
 * Detect actor convergence -- hunt pairs sharing IOCs above threshold.
 *
 * For each IOC's huntRefs, generates hunt pairs and counts shared IOCs.
 * Returns pairs where shared count >= threshold, sorted by count descending.
 */
export function buildActorConvergence(
  iocNotes: EntityNote[],
  threshold = 3,
): ConvergencePair[] {
  // Build a map of hunt pair -> list of shared IOC names
  const pairMap = new Map<string, string[]>();

  for (const note of iocNotes) {
    const refs = note.huntRefs;
    // Generate all pairs from this IOC's hunt refs
    for (let i = 0; i < refs.length; i++) {
      for (let j = i + 1; j < refs.length; j++) {
        // Consistent key ordering
        const [a, b] = [refs[i]!, refs[j]!].sort();
        const key = `${a}|||${b}`;
        const existing = pairMap.get(key);
        if (existing) {
          existing.push(note.name);
        } else {
          pairMap.set(key, [note.name]);
        }
      }
    }
  }

  // Filter by threshold and build result
  const result: ConvergencePair[] = [];
  for (const [key, sharedIocs] of pairMap) {
    if (sharedIocs.length >= threshold) {
      const [huntA, huntB] = key.split('|||');
      result.push({ huntA: huntA!, huntB: huntB!, sharedIocs });
    }
  }

  // Sort by shared count descending
  return result.sort((a, b) => b.sharedIocs.length - a.sharedIocs.length);
}

/**
 * Compare two hunts and produce shared/unique entities and tactic coverage.
 *
 * Returns shared entity names, entities unique to each hunt, and
 * combined tactic coverage (distinct TTPs per tactic, deduped by name).
 */
export function compareHunts(input: ComparisonInput): ComparisonResult {
  const namesA = new Set(input.huntAEntities.map((e) => e.name));
  const namesB = new Set(input.huntBEntities.map((e) => e.name));

  const shared: string[] = [];
  const uniqueA: string[] = [];
  const uniqueB: string[] = [];

  for (const name of namesA) {
    if (namesB.has(name)) {
      shared.push(name);
    } else {
      uniqueA.push(name);
    }
  }

  for (const name of namesB) {
    if (!namesA.has(name)) {
      uniqueB.push(name);
    }
  }

  // Combined tactic coverage: distinct TTPs per tactic across both hunts
  const allEntities = [...input.huntAEntities, ...input.huntBEntities];
  const seenTtps = new Set<string>();
  const tacticCounts = new Map<string, number>();

  for (const entity of allEntities) {
    if (entity.entityType !== 'ttp') continue;
    if (seenTtps.has(entity.name)) continue;
    seenTtps.add(entity.name);

    const tactic = entity.frontmatter['tactic'];
    if (typeof tactic !== 'string' || tactic === '') continue;

    tacticCounts.set(tactic, (tacticCounts.get(tactic) ?? 0) + 1);
  }

  // Sort by TACTIC_ORDER
  const combinedTacticCoverage: { tactic: string; count: number }[] = [];
  for (const tactic of TACTIC_ORDER) {
    const count = tacticCounts.get(tactic);
    if (count !== undefined) {
      combinedTacticCoverage.push({ tactic, count });
    }
  }
  // Include unlisted tactics
  for (const [tactic, count] of tacticCounts) {
    if (!TACTIC_ORDER.includes(tactic)) {
      combinedTacticCoverage.push({ tactic, count });
    }
  }

  return { shared, uniqueA, uniqueB, combinedTacticCoverage };
}

/**
 * Generate a program dashboard canvas with hunts, top entities, and edges.
 *
 * Layout:
 * - Central "Program Overview" text node at (400, 300)
 * - Hunt nodes arranged radially around center at radius 350
 * - Top entity nodes below center starting at y=650, stacked vertically
 * - Edges connect each hunt to its linked entities
 */
export function generateDashboardCanvas(
  hunts: HuntSummary[],
  topEntities: TopEntity[],
  huntEntityLinks: Map<string, string[]>,
): CanvasData {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  // Central node
  nodes.push({
    id: 'dashboard-center',
    x: 400,
    y: 300,
    width: 250,
    height: 80,
    type: 'text',
    text: 'Program Overview',
    color: '#2c3e50',
  });

  // Hunt nodes radially around center
  const centerX = 400;
  const centerY = 300;
  const radius = 350;
  const huntNodeIds = new Map<string, string>();

  // Compute width scaling by recency
  const timestamps = hunts.map((h) => new Date(h.lastModified).getTime());
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const timeRange = maxTime - minTime;

  for (let i = 0; i < hunts.length; i++) {
    const hunt = hunts[i]!;
    const angle = (i / hunts.length) * 2 * Math.PI;
    const x = Math.round(centerX + radius * Math.cos(angle));
    const y = Math.round(centerY + radius * Math.sin(angle));

    // Width scales by recency: most recent = 220, oldest = 140
    let width: number;
    if (hunts.length === 1 || timeRange === 0) {
      width = 220;
    } else {
      const t = (new Date(hunt.lastModified).getTime() - minTime) / timeRange;
      width = Math.round(140 + t * 80);
    }

    const nodeId = `hunt-${hunt.name}`;
    huntNodeIds.set(hunt.name, nodeId);

    nodes.push({
      id: nodeId,
      x,
      y,
      width,
      height: 80,
      type: 'text',
      text: hunt.name,
      color: '#1abc9c',
    });
  }

  // Sort top entities by sightingsCount descending
  const sortedEntities = [...topEntities].sort(
    (a, b) => b.sightingsCount - a.sightingsCount,
  );

  // Entity nodes below center
  const entityNodeIds = new Map<string, string>();
  for (let i = 0; i < sortedEntities.length; i++) {
    const entity = sortedEntities[i]!;
    const nodeId = `entity-${entity.name}`;
    entityNodeIds.set(entity.name, nodeId);

    // Use makeNode-like construction but with correct entity colors
    const color = entity.entityType.startsWith('ioc')
      ? '#4a90d9'
      : entity.entityType === 'ttp'
        ? '#d94a4a'
        : entity.entityType === 'actor'
          ? '#9b59b6'
          : entity.entityType === 'tool'
            ? '#e67e22'
            : '#7f8c8d';

    nodes.push({
      id: nodeId,
      x: 400,
      y: 650 + i * 100,
      width: 180,
      height: 80,
      type: 'text',
      text: entity.name,
      color,
    });
  }

  // Edges: connect each hunt to its related entities
  let edgeIdx = 0;
  for (const [huntName, entityNames] of huntEntityLinks) {
    const huntNodeId = huntNodeIds.get(huntName);
    if (!huntNodeId) continue;

    for (const entityName of entityNames) {
      const entityNodeId = entityNodeIds.get(entityName);
      if (!entityNodeId) continue;

      edges.push({
        id: `dashboard-edge-${edgeIdx++}`,
        fromNode: huntNodeId,
        toNode: entityNodeId,
      });
    }
  }

  return { nodes, edges };
}
