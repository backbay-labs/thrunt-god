/**
 * False positive registry -- pure functional false positive section management
 * for ATT&CK technique notes.
 *
 * Manages the ## Known False Positives section for technique notes:
 * - Build false positive sections from structured entries
 * - Append individual FP entries (append-only pattern)
 * - Placeholder removal on first real entry
 *
 * Technique note section ordering (per RESEARCH.md):
 * ## Sub-Techniques > ## Hunt History > ## Known False Positives > ## Sightings > ## Detections > ## Related
 *
 * Pure module -- zero Obsidian imports. Safe for testing and CLI usage.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FalsePositiveEntry {
  pattern: string;
  date: string; // YYYY-MM-DD
  huntId: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FP_HEADING = '## Known False Positives';
const FP_PLACEHOLDER = '_No false positives recorded._';

// ---------------------------------------------------------------------------
// buildFPSection
// ---------------------------------------------------------------------------

/**
 * Build a markdown ## Known False Positives section from structured entries.
 *
 * Format: `- **pattern**: {description} -- added: {date}, hunt: {huntId}`
 *
 * Returns placeholder text when entries is empty.
 */
export function buildFPSection(entries: FalsePositiveEntry[]): string {
  if (entries.length === 0) {
    return `${FP_HEADING}\n\n${FP_PLACEHOLDER}\n`;
  }

  const lines = entries.map(
    (e) => `- **pattern**: ${e.pattern} -- added: ${e.date}, hunt: ${e.huntId}`,
  );

  return `${FP_HEADING}\n\n${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// appendFalsePositiveEntry
// ---------------------------------------------------------------------------

/**
 * Append a single false positive entry to the ## Known False Positives section.
 *
 * Placement priority:
 * 1. Find existing ## Known False Positives -- append after last entry line
 * 2. No existing section -- insert before ## Sightings
 * 3. Fallback -- insert after ## Hunt History if it exists
 * 4. Final fallback -- after frontmatter
 *
 * Removes FP_PLACEHOLDER line when appending first real entry.
 *
 * @param content - Full markdown file content
 * @param entry - Single FP entry to append
 * @returns Updated content string
 */
export function appendFalsePositiveEntry(
  content: string,
  entry: FalsePositiveEntry,
): string {
  const entryLine = `- **pattern**: ${entry.pattern} -- added: ${entry.date}, hunt: ${entry.huntId}`;
  const lines = content.split('\n');

  // Case 1: Existing ## Known False Positives -- append entry
  const fpIdx = lines.findIndex((l) => l.trim() === FP_HEADING);
  if (fpIdx !== -1) {
    return appendToExistingFPSection(lines, fpIdx, entryLine);
  }

  // Case 2: Insert before ## Sightings
  const sightingsIdx = lines.findIndex((l) => l.trim() === '## Sightings');
  if (sightingsIdx !== -1) {
    return insertNewFPSectionBefore(lines, sightingsIdx, entryLine);
  }

  // Case 3: Insert after ## Hunt History
  const huntHistoryIdx = lines.findIndex((l) => l.trim() === '## Hunt History');
  if (huntHistoryIdx !== -1) {
    const endIdx = findSectionEnd(lines, huntHistoryIdx);
    return insertNewFPSectionAt(lines, endIdx, entryLine);
  }

  // Case 4: Insert after frontmatter
  return insertNewFPSectionAfterFrontmatter(lines, entryLine);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Append an entry to an existing ## Known False Positives section.
 * Removes placeholder if present.
 */
function appendToExistingFPSection(
  lines: string[],
  fpIdx: number,
  entryLine: string,
): string {
  const result = [...lines];

  // Remove placeholder if present
  const placeholderIdx = findPlaceholder(result, fpIdx);
  if (placeholderIdx !== -1) {
    result.splice(placeholderIdx, 1);
  }

  // Find the end of the FP section (next ## heading or end of content)
  const sectionEnd = findSectionEnd(result, fpIdx);

  // Find the last entry line (line starting with `- `) within the section
  let insertIdx = fpIdx + 1;
  for (let i = fpIdx + 1; i < sectionEnd; i++) {
    if (result[i]!.startsWith('- ')) {
      insertIdx = i + 1;
    }
  }

  // If no entries were found, insert right after the heading + blank line
  if (insertIdx === fpIdx + 1) {
    let pos = fpIdx + 1;
    while (pos < result.length && result[pos]!.trim() === '') {
      pos++;
    }
    // If we skipped blank lines and are now at section end or next heading,
    // insert at the blank line position
    if (pos >= sectionEnd || result[pos]!.startsWith('## ')) {
      result.splice(pos, 0, entryLine);
    } else {
      result.splice(pos, 0, entryLine);
    }
  } else {
    result.splice(insertIdx, 0, entryLine);
  }

  return result.join('\n');
}

/**
 * Find the placeholder line index within the FP section.
 */
function findPlaceholder(lines: string[], fpIdx: number): number {
  const sectionEnd = findSectionEnd(lines, fpIdx);
  for (let i = fpIdx + 1; i < sectionEnd; i++) {
    if (lines[i]!.trim() === FP_PLACEHOLDER) {
      return i;
    }
  }
  return -1;
}

/**
 * Find the end of a section (the line index of the next ## heading, or end of content).
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
 * Insert a new ## Known False Positives section before a target line.
 */
function insertNewFPSectionBefore(
  lines: string[],
  targetIdx: number,
  entryLine: string,
): string {
  const result = [...lines];
  const sectionBlock = [FP_HEADING, '', entryLine, ''];
  result.splice(targetIdx, 0, ...sectionBlock);
  return result.join('\n');
}

/**
 * Insert a new ## Known False Positives section at a specific line index.
 */
function insertNewFPSectionAt(
  lines: string[],
  targetIdx: number,
  entryLine: string,
): string {
  const result = [...lines];
  const sectionBlock = [FP_HEADING, '', entryLine, ''];
  result.splice(targetIdx, 0, ...sectionBlock);
  return result.join('\n');
}

/**
 * Insert a new ## Known False Positives section after the frontmatter closing ---.
 */
function insertNewFPSectionAfterFrontmatter(
  lines: string[],
  entryLine: string,
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

  const sectionBlock = [FP_HEADING, '', entryLine, ''];

  if (fmCloseIdx !== -1) {
    result.splice(fmCloseIdx + 1, 0, '', ...sectionBlock);
  } else {
    result.splice(0, 0, ...sectionBlock);
  }

  return result.join('\n');
}
