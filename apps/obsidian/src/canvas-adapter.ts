/**
 * Canvas adapter -- pure module for entity-to-canvas-node appearance mapping.
 *
 * Maps entity frontmatter (type, verdict, confidence) to canvas node visual
 * properties: hex color, CSS class, opacity tier. Also provides JSON patch
 * operations for updating canvas node colors without disturbing positions.
 *
 * Pure functions -- NO Obsidian imports. Safe for testing and CLI usage.
 */

import type { CanvasData } from './types';

// --- Constants ---

/**
 * Locked entity type to hex color mapping per CONTEXT.md decisions.
 *
 * IOC subtypes (ioc/ip, ioc/domain, ioc/hash) all resolve via prefix match.
 * Keyed by base type only -- resolveEntityColor handles prefix matching.
 */
export const ENTITY_TYPE_COLORS: Record<string, string> = {
  'ioc': '#e53935',
  'ttp': '#fb8c00',
  'actor': '#8e24aa',
  'tool': '#1e88e5',
  'infrastructure': '#43a047',
  'datasource': '#757575',
};

/** Default/fallback color for unrecognized entity types */
const FALLBACK_COLOR = '#757575';

/** Verdict string to CSS class mapping */
const VERDICT_CSS_MAP: Record<string, string> = {
  'unknown': 'thrunt-verdict-unknown',
  'suspicious': 'thrunt-verdict-suspicious',
  'confirmed_malicious': 'thrunt-verdict-confirmed-malicious',
  'remediated': 'thrunt-verdict-remediated',
  'resurfaced': 'thrunt-verdict-resurfaced',
};

// --- Functions ---

/**
 * Resolve hex color for an entity type string.
 *
 * IOC subtypes (ioc/ip, ioc/domain, ioc/hash) all resolve to the IOC color
 * via prefix matching. Other types match exactly. Unrecognized types get
 * the fallback gray (#757575).
 */
export function resolveEntityColor(entityType: string): string {
  if (entityType.startsWith('ioc')) return ENTITY_TYPE_COLORS['ioc']!;
  return ENTITY_TYPE_COLORS[entityType] ?? FALLBACK_COLOR;
}

/**
 * Patch canvas node colors for file-nodes matching entity paths.
 *
 * Only updates the `color` field of file-type nodes whose `file` property
 * appears in the entityPathToColor map. Position (x, y), size (width, height),
 * id, edges, and text nodes are all preserved unchanged.
 *
 * Returns the patched canvas data and a count of actually changed nodes
 * (nodes where the color was already correct are not counted).
 */
export function patchCanvasNodeColors(
  canvasData: CanvasData,
  entityPathToColor: Map<string, string>,
): { patched: CanvasData; changedCount: number } {
  let changedCount = 0;

  const patchedNodes = canvasData.nodes.map(node => {
    if (node.type === 'file' && node.file && entityPathToColor.has(node.file)) {
      const newColor = entityPathToColor.get(node.file)!;
      if (node.color !== newColor) {
        changedCount++;
        return { ...node, color: newColor };
      }
    }
    return node;
  });

  return {
    patched: { ...canvasData, nodes: patchedNodes },
    changedCount,
  };
}

/**
 * Map a verdict string to a CSS class name.
 *
 * Recognized verdicts: unknown, suspicious, confirmed_malicious, remediated, resurfaced.
 * Empty or unrecognized verdicts fall back to 'thrunt-verdict-unknown'.
 */
export function mapVerdictToCssClass(verdict: string): string {
  if (!verdict) return 'thrunt-verdict-unknown';
  return VERDICT_CSS_MAP[verdict] ?? 'thrunt-verdict-unknown';
}

/**
 * Compute opacity value from a confidence score.
 *
 * Formula: 0.3 + (confidenceScore * 0.7), clamped to [0.3, 1.0].
 * Undefined scores default to 1.0 (full opacity).
 */
export function computeConfidenceOpacity(confidenceScore: number | undefined): number {
  if (confidenceScore === undefined) return 1.0;
  const raw = 0.3 + (confidenceScore * 0.7);
  return Math.min(1.0, Math.max(0.3, raw));
}

/**
 * Build CSS class array for an entity note's cssclasses frontmatter.
 *
 * Returns verdict class and confidence tier class. These are used by
 * CSS :has() selectors to style canvas nodes containing entity notes.
 *
 * Confidence tiers:
 *   - low:    score < 0.4
 *   - medium: 0.4 <= score <= 0.7
 *   - high:   score > 0.7 or undefined
 */
export function buildEntityCssClasses(verdict: string, confidenceScore: number | undefined): string[] {
  const classes: string[] = [];

  classes.push(mapVerdictToCssClass(verdict));

  let tier: string;
  if (confidenceScore === undefined || confidenceScore > 0.7) {
    tier = 'high';
  } else if (confidenceScore >= 0.4) {
    tier = 'medium';
  } else {
    tier = 'low';
  }
  classes.push(`thrunt-confidence-${tier}`);

  return classes;
}

/**
 * Parse canvas-relevant frontmatter fields from note content.
 *
 * Extracts type, verdict, and confidence_score using regex line scanning.
 * This is a standalone parser (does not import from entity-utils) to keep
 * canvas-adapter fully pure with zero cross-module dependencies beyond types.
 */
export function parseCanvasRelevantFields(content: string): {
  type: string;
  verdict: string;
  confidenceScore: number | undefined;
} {
  const result: { type: string; verdict: string; confidenceScore: number | undefined } = {
    type: '',
    verdict: '',
    confidenceScore: undefined,
  };

  if (!content.startsWith('---')) return result;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return result;

  const block = content.slice(4, end);
  const lines = block.split(/\r?\n/);

  for (const line of lines) {
    const typeMatch = line.match(/^type:\s*(.+)$/);
    if (typeMatch && typeMatch[1]) {
      result.type = typeMatch[1].trim().replace(/^["']|["']$/g, '');
    }

    const verdictMatch = line.match(/^verdict:\s*(.+)$/);
    if (verdictMatch && verdictMatch[1]) {
      result.verdict = verdictMatch[1].trim().replace(/^["']|["']$/g, '');
    }

    const confMatch = line.match(/^confidence_score:\s*([\d.]+)$/);
    if (confMatch && confMatch[1]) {
      result.confidenceScore = parseFloat(confMatch[1]);
    }
  }

  return result;
}
