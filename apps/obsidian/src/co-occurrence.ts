/**
 * Co-occurrence analysis -- pure functional entity co-occurrence detection.
 *
 * Detects entities that appear together across multiple hunts and manages
 * the ## Related Infrastructure section in entity notes:
 * - Co-occurrence detection with configurable threshold (default 2)
 * - Wiki-linked markdown section for Obsidian graph integration
 * - Section insert/replace following the same pattern as verdict.ts
 *
 * Pure module -- zero Obsidian imports. Safe for testing and CLI usage.
 */

import type { EntityNote } from './cross-hunt';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoOccurrence {
  entityName: string;
  huntCount: number;
  sharedHunts: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RELATED_INFRA_HEADING = '## Related Infrastructure';
const PLACEHOLDER = '_No co-occurring entities found (2+ shared hunts required)._';

// ---------------------------------------------------------------------------
// findCoOccurrences
// ---------------------------------------------------------------------------

/**
 * Find entities that share hunts with the target entity.
 *
 * Builds a Set from targetHuntRefs for O(1) lookups, then checks each entity's
 * huntRefs for overlap. Returns entities meeting the threshold, sorted by
 * huntCount descending.
 *
 * @param targetHuntRefs - Hunt IDs the target entity appears in
 * @param allEntities - All entity notes to check against
 * @param targetName - Name of the target entity (excluded from results)
 * @param threshold - Minimum shared hunts required (default 2)
 */
export function findCoOccurrences(
  targetHuntRefs: string[],
  allEntities: EntityNote[],
  targetName: string,
  threshold = 2,
): CoOccurrence[] {
  const targetHunts = new Set(targetHuntRefs);
  const results: CoOccurrence[] = [];

  for (const entity of allEntities) {
    if (entity.name === targetName) continue;

    const sharedHunts = entity.huntRefs.filter((h) => targetHunts.has(h));

    if (sharedHunts.length >= threshold) {
      results.push({
        entityName: entity.name,
        huntCount: sharedHunts.length,
        sharedHunts,
      });
    }
  }

  // Sort by huntCount descending
  results.sort((a, b) => b.huntCount - a.huntCount);

  return results;
}

// ---------------------------------------------------------------------------
// buildRelatedInfraSection
// ---------------------------------------------------------------------------

/**
 * Build a markdown ## Related Infrastructure section from co-occurrence data.
 *
 * Format: `- [[{entityName}]] -- seen together in {huntCount} hunts ({hunt1}, {hunt2})`
 *
 * Uses wiki-link format `[[entity_name]]` for Obsidian graph integration.
 * Returns placeholder text when coOccurrences is empty.
 */
export function buildRelatedInfraSection(coOccurrences: CoOccurrence[]): string {
  if (coOccurrences.length === 0) {
    return `${RELATED_INFRA_HEADING}\n\n${PLACEHOLDER}\n`;
  }

  const lines = coOccurrences.map(
    (c) =>
      `- [[${c.entityName}]] -- seen together in ${c.huntCount} hunts (${c.sharedHunts.join(', ')})`,
  );

  return `${RELATED_INFRA_HEADING}\n\n${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// appendRelatedInfraSection
// ---------------------------------------------------------------------------

/**
 * Insert or replace the ## Related Infrastructure section in entity note content.
 *
 * Section placement priority:
 * 1. Replace existing ## Related Infrastructure section
 * 2. Insert after ## Hunt History (before next ## heading)
 * 3. Insert before ## Sightings
 * 4. Insert after frontmatter closing ---
 *
 * IMPORTANT: ## Related Infrastructure is distinct from the existing ## Related
 * section at the end of entity notes.
 *
 * Uses line-by-line string manipulation only (no YAML parser, no markdown AST).
 */
export function appendRelatedInfraSection(
  content: string,
  coOccurrences: CoOccurrence[],
): string {
  const sectionContent = buildRelatedInfraSection(coOccurrences);
  const sectionLines = sectionContent.split('\n');
  // Remove trailing empty string from split (buildRelatedInfraSection ends with \n)
  if (sectionLines[sectionLines.length - 1] === '') {
    sectionLines.pop();
  }

  const lines = content.split('\n');

  // Case 1: Existing ## Related Infrastructure -- replace it
  const relInfraIdx = lines.findIndex((l) => l.trim() === RELATED_INFRA_HEADING);
  if (relInfraIdx !== -1) {
    return replaceExistingSection(lines, relInfraIdx, sectionLines);
  }

  // Case 2: Insert after ## Hunt History
  const huntHistoryIdx = lines.findIndex((l) => l.trim() === '## Hunt History');
  if (huntHistoryIdx !== -1) {
    const endIdx = findSectionEnd(lines, huntHistoryIdx);
    return insertSectionAt(lines, endIdx, sectionLines);
  }

  // Case 3: Insert before ## Sightings
  const sightingsIdx = lines.findIndex((l) => l.trim() === '## Sightings');
  if (sightingsIdx !== -1) {
    return insertSectionBefore(lines, sightingsIdx, sectionLines);
  }

  // Case 4: Insert after frontmatter closing ---
  return insertSectionAfterFrontmatter(lines, sectionLines);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Replace an existing section (from heading to next ## heading) with new content.
 */
function replaceExistingSection(
  lines: string[],
  sectionIdx: number,
  sectionLines: string[],
): string {
  const endIdx = findSectionEnd(lines, sectionIdx);
  const result = [...lines];
  result.splice(sectionIdx, endIdx - sectionIdx, ...sectionLines, '');
  return result.join('\n');
}

/**
 * Find the end of a section (the line index of the next ## heading, or end of content).
 * The returned index points to the first line that is NOT part of the current section.
 *
 * IMPORTANT: Matches exactly `## ` prefix but distinguishes ## Related Infrastructure
 * from ## Related by checking for exact heading matches.
 */
function findSectionEnd(lines: string[], headingIdx: number): number {
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith('## ')) {
      return i;
    }
  }
  return lines.length;
}

/**
 * Insert a section block at a specific line index.
 */
function insertSectionAt(
  lines: string[],
  targetIdx: number,
  sectionLines: string[],
): string {
  const result = [...lines];
  result.splice(targetIdx, 0, ...sectionLines, '');
  return result.join('\n');
}

/**
 * Insert a section block before a target line index.
 */
function insertSectionBefore(
  lines: string[],
  targetIdx: number,
  sectionLines: string[],
): string {
  const result = [...lines];
  result.splice(targetIdx, 0, ...sectionLines, '');
  return result.join('\n');
}

/**
 * Insert a section block after the frontmatter closing ---.
 */
function insertSectionAfterFrontmatter(
  lines: string[],
  sectionLines: string[],
): string {
  const result = [...lines];

  let fmCloseIdx = -1;
  if (result[0]?.trim() === '---') {
    for (let i = 1; i < result.length; i++) {
      if (result[i]!.trim() === '---') {
        fmCloseIdx = i;
        break;
      }
    }
  }

  if (fmCloseIdx !== -1) {
    result.splice(fmCloseIdx + 1, 0, '', ...sectionLines, '');
  } else {
    result.splice(0, 0, ...sectionLines, '');
  }

  return result.join('\n');
}
