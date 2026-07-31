/**
 * Canvas generation engine for Obsidian .canvas files.
 *
 * Pure-function module -- NO Obsidian imports. Generates valid Obsidian
 * Canvas JSON from entity data using 4 layout templates:
 *   - Kill Chain: 14-column ATT&CK tactic layout
 *   - Diamond Model: 4-quadrant adversary/infrastructure/capability/victim
 *   - Lateral Movement: IOC grid with co-occurrence edges
 *   - Hunt Progression: Vertical timeline with sequential edges
 *
 * All functions produce CanvasData that can be serialized to JSON and
 * saved as .canvas files that Obsidian renders natively.
 */

import type { CanvasEntity, CanvasNode, CanvasEdge, CanvasData } from './types';
import { resolveEntityColor } from './canvas-adapter';

// --- Public types ---

/** Group of entity IDs that co-occur (e.g. in the same receipt) */
export interface EdgeGroup {
  entities: string[];
}

// --- Constants ---

/**
 * ATT&CK Enterprise tactics in kill chain order.
 * 14 tactics from Reconnaissance through Impact.
 */
export const TACTIC_ORDER: readonly string[] = Object.freeze([
  'Reconnaissance',
  'Resource Development',
  'Initial Access',
  'Execution',
  'Persistence',
  'Privilege Escalation',
  'Defense Evasion',
  'Credential Access',
  'Discovery',
  'Lateral Movement',
  'Collection',
  'Command and Control',
  'Exfiltration',
  'Impact',
]);

// ENTITY_COLORS removed -- canonical colors now live in canvas-adapter.ts
// Use resolveEntityColor() or ENTITY_TYPE_COLORS from './canvas-adapter'.

// --- Card dimensions by entity type ---

const CARD_DIMENSIONS: Record<string, { width: number; height: number }> = {
  ttp: { width: 200, height: 100 },
  ioc: { width: 150, height: 80 },
};

const DEFAULT_DIMENSIONS = { width: 180, height: 90 };

// --- Helpers ---

/**
 * Resolve color for an entity type string.
 * Delegates to resolveEntityColor from canvas-adapter (single source of truth).
 */
export function getEntityColor(entityType: string): string {
  return resolveEntityColor(entityType);
}

/**
 * Get card dimensions for an entity type.
 */
function getDimensions(entityType: string): { width: number; height: number } {
  if (entityType.startsWith('ioc')) return CARD_DIMENSIONS['ioc']!;
  return CARD_DIMENSIONS[entityType] ?? DEFAULT_DIMENSIONS;
}

/**
 * Build a CanvasNode from an entity with position.
 */
export function makeNode(entity: CanvasEntity, x: number, y: number): CanvasNode {
  const dims = getDimensions(entity.entityType);
  return {
    id: entity.id,
    x,
    y,
    width: dims.width,
    height: dims.height,
    type: entity.notePath ? 'file' : 'text',
    ...(entity.notePath ? { file: entity.notePath } : { text: entity.name }),
    color: getEntityColor(entity.entityType),
  };
}

/**
 * Generate edges from edge groups.
 * For each group, create edges between all pairs of entities in the group.
 */
function buildEdges(edgeGroups: EdgeGroup[]): CanvasEdge[] {
  const edges: CanvasEdge[] = [];
  let edgeIdx = 0;

  for (const group of edgeGroups) {
    const ids = group.entities;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        edges.push({
          id: `edge-${edgeIdx++}`,
          fromNode: ids[i]!,
          toNode: ids[j]!,
        });
      }
    }
  }

  return edges;
}

// --- Generators ---

/**
 * Generate a Kill Chain canvas with entities laid out across 14 tactic columns.
 *
 * - TTPs are placed at their tactic's column x-position, stacked vertically
 * - Non-TTP entities are placed at column 0, stacked vertically
 * - Column spacing: 250px per tactic
 */
export function generateKillChainCanvas(
  entities: CanvasEntity[],
  edgeGroups: EdgeGroup[] = [],
): CanvasData {
  const nodes: CanvasNode[] = [];

  // Track vertical offset per column for stacking
  const columnYOffset: Record<number, number> = {};

  for (const entity of entities) {
    let colIndex = 0; // default: leftmost column for non-TTP

    if (entity.entityType === 'ttp' && entity.tactic) {
      const tacticIdx = TACTIC_ORDER.indexOf(entity.tactic);
      if (tacticIdx >= 0) {
        colIndex = tacticIdx;
      }
    }

    const x = colIndex * 250;
    const yOffset = columnYOffset[colIndex] ?? 0;
    const dims = getDimensions(entity.entityType);

    nodes.push(makeNode(entity, x, yOffset));
    columnYOffset[colIndex] = yOffset + dims.height + 20;
  }

  return { nodes, edges: buildEdges(edgeGroups) };
}

/**
 * Generate a Diamond Model canvas with 4 quadrant positions.
 *
 * Layout:
 * - Actors at top (x=400, y=-300 stacked)
 * - Tools at right (x=800, y=0 stacked)
 * - IOCs at bottom (x=400, y=300 stacked, mapped as infrastructure)
 * - TTPs at left (x=0, y=0 stacked)
 * - Center label: "Diamond Model" at (400, 0)
 */
export function generateDiamondCanvas(
  entities: CanvasEntity[],
  edgeGroups: EdgeGroup[] = [],
): CanvasData {
  const nodes: CanvasNode[] = [];

  // Center label
  nodes.push({
    id: 'diamond-center',
    x: 400,
    y: 0,
    width: 200,
    height: 60,
    type: 'text',
    text: 'Diamond Model',
    color: '#7f8c8d',
  });

  // Quadrant offsets for stacking
  const quadrantOffsets = { top: 0, right: 0, bottom: 0, left: 0 };

  for (const entity of entities) {
    let quadrant: 'top' | 'right' | 'bottom' | 'left';

    if (entity.entityType === 'actor') {
      quadrant = 'top';
    } else if (entity.entityType === 'tool') {
      quadrant = 'right';
    } else if (entity.entityType.startsWith('ioc') || entity.entityType === 'infrastructure') {
      quadrant = 'bottom';
    } else {
      // TTPs and others go left
      quadrant = 'left';
    }

    const dims = getDimensions(entity.entityType);
    let x: number, y: number;

    switch (quadrant) {
      case 'top':
        x = 400;
        y = -300 - quadrantOffsets.top;
        quadrantOffsets.top += dims.height + 20;
        break;
      case 'right':
        x = 800;
        y = quadrantOffsets.right;
        quadrantOffsets.right += dims.height + 20;
        break;
      case 'bottom':
        x = 400;
        y = 300 + quadrantOffsets.bottom;
        quadrantOffsets.bottom += dims.height + 20;
        break;
      case 'left':
        x = 0;
        y = quadrantOffsets.left;
        quadrantOffsets.left += dims.height + 20;
        break;
    }

    nodes.push(makeNode(entity, x, y));
  }

  return { nodes, edges: buildEdges(edgeGroups) };
}

/**
 * Generate a Lateral Movement canvas with IOCs in a grid and connections.
 *
 * - IOC entities spread in a grid (row of 4, wrap)
 * - Non-IOC entities placed below the IOC grid
 * - Edges from edgeGroups connect co-occurring entities
 */
export function generateLateralMovementCanvas(
  entities: CanvasEntity[],
  edgeGroups: EdgeGroup[] = [],
): CanvasData {
  const nodes: CanvasNode[] = [];

  const iocs = entities.filter((e) => e.entityType.startsWith('ioc'));
  const nonIocs = entities.filter((e) => !e.entityType.startsWith('ioc'));

  // Layout IOCs in a 4-column grid
  const colsPerRow = 4;
  const cellWidth = 200;
  const cellHeight = 120;

  for (let i = 0; i < iocs.length; i++) {
    const col = i % colsPerRow;
    const row = Math.floor(i / colsPerRow);
    nodes.push(makeNode(iocs[i]!, col * cellWidth, row * cellHeight));
  }

  // Non-IOC entities below IOC grid
  const iocRows = Math.max(1, Math.ceil(iocs.length / colsPerRow));
  const nonIocStartY = iocRows * cellHeight + 60;

  for (let i = 0; i < nonIocs.length; i++) {
    nodes.push(makeNode(nonIocs[i]!, 0, nonIocStartY + i * 120));
  }

  return { nodes, edges: buildEdges(edgeGroups) };
}

/**
 * Generate a Hunt Progression canvas with vertical timeline ordering.
 *
 * - All entities stacked vertically at x=200
 * - y increments by 150 per entity
 * - Sequential edges: entity[0] -> entity[1] -> entity[2] -> ...
 */
export function generateHuntProgressionCanvas(
  entities: CanvasEntity[],
  _edgeGroups: EdgeGroup[] = [],
): CanvasData {
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  for (let i = 0; i < entities.length; i++) {
    nodes.push(makeNode(entities[i]!, 200, i * 150));
  }

  // Sequential timeline edges
  for (let i = 0; i < entities.length - 1; i++) {
    edges.push({
      id: `progression-edge-${i}`,
      fromNode: entities[i]!.id,
      toNode: entities[i + 1]!.id,
    });
  }

  return { nodes, edges };
}
