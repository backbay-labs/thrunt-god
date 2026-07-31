/**
 * Technique hunt history -- pure functional hunt history section management
 * for ATT&CK technique notes.
 *
 * Manages the ## Hunt History section for technique notes:
 * - Typed hunt outcomes (TP, FP, inconclusive)
 * - Build hunt history markdown sections from structured entries
 * - Insert/replace ## Hunt History sections in technique note content
 *
 * Key difference from entity hunt-history.ts: technique notes have
 * ## Sub-Techniques > ## Sightings > ## Detections > ## Related structure
 * (NOT ## Verdict History > ## Hunt History > ## Sightings > ## Related).
 * This module does NOT look for ## Verdict History as an anchor.
 *
 * Pure module -- zero Obsidian imports. Safe for testing and CLI usage.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HuntOutcome = 'TP' | 'FP' | 'inconclusive';

export interface TechniqueHuntEntry {
  huntId: string;
  date: string; // YYYY-MM-DD
  queryCount: number;
  dataSources: string[];
  outcome: HuntOutcome;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HUNT_HISTORY_HEADING = '## Hunt History';
const PLACEHOLDER = '_No hunts have targeted this technique yet._';

// ---------------------------------------------------------------------------
// buildTechniqueHuntHistorySection
// ---------------------------------------------------------------------------

/**
 * Build a markdown ## Hunt History section from structured technique hunt entries.
 *
 * Format: `- **{huntId}** ({date}) -- queries: {queryCount}, data_sources: [{dataSources}], outcome: {outcome}`
 *
 * Returns placeholder text when entries is empty.
 */
export function buildTechniqueHuntHistorySection(
  entries: TechniqueHuntEntry[],
): string {
  if (entries.length === 0) {
    return `${HUNT_HISTORY_HEADING}\n\n${PLACEHOLDER}\n`;
  }

  const lines = entries.map(
    (e) =>
      `- **${e.huntId}** (${e.date}) -- queries: ${e.queryCount}, data_sources: [${e.dataSources.join(', ')}], outcome: ${e.outcome}`,
  );

  return `${HUNT_HISTORY_HEADING}\n\n${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// appendTechniqueHuntHistorySection
// ---------------------------------------------------------------------------

/**
 * Insert or replace the ## Hunt History section in technique note content.
 *
 * Section placement priority (for TECHNIQUE notes):
 * 1. Replace existing ## Hunt History section
 * 2. Insert before ## Sightings
 * 3. Insert after frontmatter closing ---
 *
 * NOTE: Does NOT look for ## Verdict History (technique notes don't have it).
 * This is the key difference from entity hunt-history.ts.
 *
 * Uses line-by-line string manipulation only (no YAML parser, no markdown AST).
 */
export function appendTechniqueHuntHistorySection(
  content: string,
  entries: TechniqueHuntEntry[],
): string {
  const sectionContent = buildTechniqueHuntHistorySection(entries);
  const sectionLines = sectionContent.split('\n');
  // Remove trailing empty string from split (buildTechniqueHuntHistorySection ends with \n)
  if (sectionLines[sectionLines.length - 1] === '') {
    sectionLines.pop();
  }

  const lines = content.split('\n');

  // Case 1: Existing ## Hunt History -- replace it
  const huntIdx = lines.findIndex((l) => l.trim() === HUNT_HISTORY_HEADING);
  if (huntIdx !== -1) {
    return replaceExistingSection(lines, huntIdx, sectionLines);
  }

  // Case 2: Insert before ## Sightings
  const sightingsIdx = lines.findIndex((l) => l.trim() === '## Sightings');
  if (sightingsIdx !== -1) {
    return insertSectionBefore(lines, sightingsIdx, sectionLines);
  }

  // Case 3: Insert after frontmatter closing ---
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

  // Remove old section content (heading through end of section)
  result.splice(sectionIdx, endIdx - sectionIdx, ...sectionLines, '');

  return result.join('\n');
}

/**
 * Find the end of a section (the line index of the next ## heading, or end of content).
 * The returned index points to the first line that is NOT part of the current section.
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

  // Find the closing --- of frontmatter (skip opening ---)
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
    // No frontmatter -- prepend section at start
    result.splice(0, 0, ...sectionLines, '');
  }

  return result.join('\n');
}
