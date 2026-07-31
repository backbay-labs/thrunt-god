/**
 * Schema migration for entity notes -- additive-only field and section insertion.
 *
 * Provides a versioned migration registry so older entity notes can be brought
 * up to date without losing any existing content. Migrations only ADD fields
 * and sections; they never remove or rename anything.
 *
 * Pure module -- imports only from frontmatter-editor. Safe for testing and CLI usage.
 */

import { updateFrontmatter } from './frontmatter-editor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchemaMigration {
  version: number;
  description: string;
  addFields: Array<{ key: string; defaultValue: unknown }>;
  addSections?: Array<{
    heading: string;
    defaultContent: string;
    beforeSection?: string;
  }>;
}

export interface MigrationPreview {
  filePath: string;
  currentVersion: number;
  targetVersion: number;
  fieldsToAdd: string[];
  sectionsToAdd: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CURRENT_SCHEMA_VERSION = 4;

export const MIGRATIONS: SchemaMigration[] = [
  {
    version: 1,
    description:
      'Add schema_version and verdict fields, add Verdict History section',
    addFields: [
      { key: 'schema_version', defaultValue: 1 },
      { key: 'verdict', defaultValue: 'unknown' },
    ],
    addSections: [
      {
        heading: '## Verdict History',
        defaultContent: '_No verdict changes recorded._',
        beforeSection: '## Sightings',
      },
    ],
  },
  {
    version: 2,
    description:
      'Add confidence factors, Hunt History, and Related Infrastructure sections',
    addFields: [
      { key: 'confidence_score', defaultValue: 0 },
      { key: 'source_count', defaultValue: 0 },
      { key: 'reliability', defaultValue: 0 },
      { key: 'corroboration', defaultValue: 0 },
      { key: 'days_since_validation', defaultValue: 0 },
      {
        key: 'confidence_factors',
        defaultValue:
          '{source_count: 0, reliability: 0, corroboration: 0, days_since_validation: 0}',
      },
    ],
    addSections: [
      {
        heading: '## Hunt History',
        defaultContent: '_No hunt references found._',
        beforeSection: '## Sightings',
      },
      {
        heading: '## Related Infrastructure',
        defaultContent:
          '_No co-occurring entities found (2+ shared hunts required)._',
        beforeSection: '## Sightings',
      },
    ],
  },
  {
    version: 3,
    description:
      'Add coverage_status and fp_count fields, add Known False Positives section',
    addFields: [
      { key: 'coverage_status', defaultValue: 'stale' },
      { key: 'fp_count', defaultValue: 0 },
    ],
    addSections: [
      {
        heading: '## Known False Positives',
        defaultContent: '_No false positives recorded._',
        beforeSection: '## Sightings',
      },
    ],
  },
  {
    version: 4,
    description: 'Add linked_detections array for detection coverage tracking',
    addFields: [
      { key: 'linked_detections', defaultValue: '[]' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the frontmatter block as raw text (between the --- delimiters).
 * Returns empty string if no valid frontmatter.
 */
function getFrontmatterBlock(content: string): string {
  if (!content.startsWith('---')) return '';
  const endIdx = content.indexOf('\n---', 3);
  if (endIdx === -1) return '';
  return content.slice(0, endIdx + 4); // include closing ---
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Extract the schema_version integer from frontmatter.
 * Returns 0 if schema_version is missing or content has no frontmatter.
 */
export function extractSchemaVersion(content: string): number {
  const fm = getFrontmatterBlock(content);
  if (!fm) return 0;
  const match = fm.match(/^schema_version:\s*(\d+)\s*$/m);
  if (!match || !match[1]) return 0;
  return parseInt(match[1], 10);
}

/**
 * Check whether a given key exists in the frontmatter block.
 * Only matches keys within the frontmatter delimiters, not in body text.
 */
export function hasFrontmatterKey(content: string, key: string): boolean {
  const fm = getFrontmatterBlock(content);
  if (!fm) return false;
  const regex = new RegExp(`^${escapeRegex(key)}:`, 'm');
  return regex.test(fm);
}

/**
 * Preview what a migration would do to a note.
 * Returns null if the note is already at or above CURRENT_SCHEMA_VERSION.
 */
export function previewMigration(
  content: string,
  filePath: string,
): MigrationPreview | null {
  const currentVersion = extractSchemaVersion(content);
  if (currentVersion >= CURRENT_SCHEMA_VERSION) return null;

  const fieldsToAdd: string[] = [];
  const sectionsToAdd: string[] = [];

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;

    // Check which fields are missing
    for (const field of migration.addFields) {
      if (!hasFrontmatterKey(content, field.key)) {
        fieldsToAdd.push(field.key);
      }
    }

    // Check which sections are missing
    if (migration.addSections) {
      for (const section of migration.addSections) {
        if (!content.includes(section.heading)) {
          sectionsToAdd.push(section.heading);
        }
      }
    }
  }

  return {
    filePath,
    currentVersion,
    targetVersion: CURRENT_SCHEMA_VERSION,
    fieldsToAdd,
    sectionsToAdd,
  };
}

/**
 * Apply all pending migrations to a note's content.
 *
 * - Adds missing frontmatter fields via updateFrontmatter (additive only)
 * - Updates verdict from empty string to "unknown" if present
 * - Inserts missing markdown sections at specified positions
 * - Sets schema_version to CURRENT_SCHEMA_VERSION
 * - Preserves all existing content (frontmatter fields, body text, analyst notes)
 *
 * Idempotent: running on an already-current note returns it unchanged.
 */
export function applyMigration(content: string): string {
  const currentVersion = extractSchemaVersion(content);
  if (currentVersion >= CURRENT_SCHEMA_VERSION) return content;

  let result = content;

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;

    // --- Apply field additions ---
    const fieldUpdates: Record<string, unknown> = {};

    for (const field of migration.addFields) {
      if (!hasFrontmatterKey(result, field.key)) {
        fieldUpdates[field.key] = field.defaultValue;
      }
    }

    // Update verdict from empty string to "unknown" if it exists but is empty
    if (hasFrontmatterKey(result, 'verdict')) {
      const verdictMatch = getFrontmatterBlock(result).match(
        /^verdict:\s*"?"?\s*"?"?\s*$/m,
      );
      if (verdictMatch) {
        fieldUpdates['verdict'] = 'unknown';
      }
    }

    // Always set schema_version to target version
    fieldUpdates['schema_version'] = migration.version;

    if (Object.keys(fieldUpdates).length > 0) {
      result = updateFrontmatter(result, fieldUpdates);
    }

    // --- Apply section additions ---
    if (migration.addSections) {
      for (const section of migration.addSections) {
        if (result.includes(section.heading)) continue;

        const sectionBlock = `${section.heading}\n\n${section.defaultContent}\n\n`;

        if (section.beforeSection && result.includes(section.beforeSection)) {
          // Insert before the specified section
          const beforeIdx = result.indexOf(section.beforeSection);
          result =
            result.slice(0, beforeIdx) +
            sectionBlock +
            result.slice(beforeIdx);
        } else {
          // Fallback: insert after frontmatter closing ---
          const fmEnd = result.indexOf('\n---', 3);
          if (fmEnd !== -1) {
            const insertPoint = result.indexOf('\n', fmEnd + 1);
            if (insertPoint !== -1) {
              result =
                result.slice(0, insertPoint + 1) +
                '\n' +
                sectionBlock +
                result.slice(insertPoint + 1);
            }
          }
        }
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
