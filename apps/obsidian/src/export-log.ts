/**
 * Export log formatter -- pure data module (zero Obsidian imports).
 *
 * Produces markdown log entries for the EXPORT_LOG.md file, recording
 * each Hyper Copy action with source, profile, token estimate, and
 * entity counts for audit trail.
 */

import type { AssembledContext } from './types';

// ---------------------------------------------------------------------------
// ExportLogEntry
// ---------------------------------------------------------------------------

export interface ExportLogEntry {
  timestamp: string;                   // ISO string
  sourceNote: string;                  // vault path of source note
  profileId: string;                   // agentId
  profileLabel: string;               // human label
  tokenEstimate: number;              // from AssembledContext
  sectionCount: number;               // assembled.sections.length
  entityCounts: Record<string, number>; // e.g. { ttps: 2, iocs: 3 }
}

// ---------------------------------------------------------------------------
// formatExportLog
// ---------------------------------------------------------------------------

/**
 * Returns a markdown block for appending to EXPORT_LOG.md:
 *
 * ```
 * ## {timestamp}
 *
 * - Source: {sourceNote}
 * - Profile: {profileLabel} ({profileId})
 * - Token estimate: {tokenEstimate}
 * - Sections: {sectionCount}
 *
 * ### Entities
 * - {type}: {count}
 * ```
 */
export function formatExportLog(entry: ExportLogEntry): string {
  const lines: string[] = [];

  lines.push(`## ${entry.timestamp}`);
  lines.push('');
  lines.push(`- Source: ${entry.sourceNote}`);
  lines.push(`- Profile: ${entry.profileLabel} (${entry.profileId})`);
  lines.push(`- Token estimate: ${entry.tokenEstimate}`);
  lines.push(`- Sections: ${entry.sectionCount}`);
  lines.push('');
  lines.push('### Entities');

  for (const [type, count] of Object.entries(entry.entityCounts)) {
    lines.push(`- ${type}: ${count}`);
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// buildExportLogEntry
// ---------------------------------------------------------------------------

/** Entity folder prefix used to detect entity sections. */
const ENTITY_PREFIX = 'entities/';

/**
 * Extracts entity type from a source path.
 * e.g. "entities/ttps/T1059.001.md" -> "ttps"
 *      "entities/iocs/192.168.1.100.md" -> "iocs"
 *      "hunts/APT29.md" -> null (not an entity)
 */
function extractEntityType(sourcePath: string): string | null {
  if (!sourcePath.startsWith(ENTITY_PREFIX)) return null;
  const rest = sourcePath.slice(ENTITY_PREFIX.length);
  const slashIdx = rest.indexOf('/');
  if (slashIdx === -1) return null;
  return rest.slice(0, slashIdx);
}

/**
 * Builds an ExportLogEntry from an AssembledContext and profile label.
 *
 * Entity types are derived from section sourcePath folder prefixes
 * (entities/ttps/ -> ttps, entities/iocs/ -> iocs, etc.).
 * Duplicate source paths are counted only once.
 */
export function buildExportLogEntry(
  assembled: AssembledContext,
  profileLabel: string,
): ExportLogEntry {
  const seen = new Set<string>();
  const entityCounts: Record<string, number> = {};

  for (const section of assembled.sections) {
    if (seen.has(section.sourcePath)) continue;
    seen.add(section.sourcePath);

    const entityType = extractEntityType(section.sourcePath);
    if (entityType !== null) {
      entityCounts[entityType] = (entityCounts[entityType] ?? 0) + 1;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    sourceNote: assembled.sourceNote,
    profileId: assembled.profileUsed,
    profileLabel,
    tokenEstimate: assembled.tokenEstimate,
    sectionCount: assembled.sections.length,
    entityCounts,
  };
}
