/**
 * Verdict lifecycle -- pure functional verdict history management.
 *
 * Manages the verdict lifecycle for entity notes:
 * - Typed verdict values (unknown -> suspicious -> confirmed_malicious -> remediated -> resurfaced)
 * - Append-only verdict history with timestamps, rationale, and hunt attribution
 * - Section creation/insertion for ## Verdict History
 *
 * Pure module -- zero Obsidian imports. Safe for testing and CLI usage.
 */

// ---------------------------------------------------------------------------
// Types and constants
// ---------------------------------------------------------------------------

export const VERDICT_VALUES = Object.freeze([
  'unknown',
  'suspicious',
  'confirmed_malicious',
  'remediated',
  'resurfaced',
] as const);

export type VerdictValue = (typeof VERDICT_VALUES)[number];

export interface VerdictEntry {
  timestamp: string;
  verdict: VerdictValue;
  rationale: string;
  huntId: string;
}

// ---------------------------------------------------------------------------
// formatTimestamp
// ---------------------------------------------------------------------------

/**
 * Format a Date into YYYY-MM-DD HH:mm (zero-padded).
 */
export function formatTimestamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

// ---------------------------------------------------------------------------
// detectHuntId
// ---------------------------------------------------------------------------

/**
 * Detect the current hunt ID from MISSION.md content or planning directory.
 *
 * Priority: MISSION.md hunt_id field > last segment of planning dir path > "manual"
 */
export function detectHuntId(
  missionContent: string | null,
  planningDir: string,
): string {
  if (missionContent) {
    const match = missionContent.match(/^hunt_id:\s*(.+)$/m);
    if (match && match[1]) return match[1].trim().replace(/^["']|["']$/g, '');
  }
  const parts = planningDir.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'manual';
}

// ---------------------------------------------------------------------------
// appendVerdictEntry
// ---------------------------------------------------------------------------

const VERDICT_HISTORY_HEADING = '## Verdict History';
const PLACEHOLDER = '_No verdict changes recorded._';

/**
 * Format a verdict entry line.
 *
 * Format: `- [YYYY-MM-DD HH:mm] verdict -- "rationale" (hunt: huntId)`
 */
function formatEntryLine(entry: VerdictEntry): string {
  return `- [${entry.timestamp}] ${entry.verdict} -- "${entry.rationale}" (hunt: ${entry.huntId})`;
}

/**
 * Append a verdict entry to the ## Verdict History section of a markdown string.
 *
 * - If ## Verdict History exists: appends after last entry in section
 * - If ## Verdict History missing but ## Sightings exists: inserts section before ## Sightings
 * - If neither: inserts section after frontmatter closing ---
 * - Removes placeholder text "_No verdict changes recorded._" when first real entry is added
 *
 * @param content - Full markdown file content
 * @param entry - Verdict entry to append
 * @returns Updated content string
 */
export function appendVerdictEntry(
  content: string,
  entry: VerdictEntry,
): string {
  const entryLine = formatEntryLine(entry);
  const lines = content.split('\n');

  // Find the ## Verdict History section
  const historyIdx = lines.findIndex(
    (l) => l.trim() === VERDICT_HISTORY_HEADING,
  );

  if (historyIdx !== -1) {
    // Section exists -- find where to insert
    return appendToExistingSection(lines, historyIdx, entryLine);
  }

  // Section missing -- need to create it
  const sightingsIdx = lines.findIndex((l) => l.trim() === '## Sightings');

  if (sightingsIdx !== -1) {
    // Insert before ## Sightings
    return insertSectionBefore(lines, sightingsIdx, entryLine);
  }

  // No ## Sightings either -- insert after frontmatter closing ---
  return insertSectionAfterFrontmatter(lines, entryLine);
}

/**
 * Append entry to an existing ## Verdict History section.
 */
function appendToExistingSection(
  lines: string[],
  historyIdx: number,
  entryLine: string,
): string {
  const result = [...lines];

  // Remove placeholder if present
  const placeholderOffset = findPlaceholder(result, historyIdx);
  if (placeholderOffset !== -1) {
    result.splice(placeholderOffset, 1);
  }

  // Find the end of the verdict history section (next heading or end of content)
  let insertIdx = historyIdx + 1;
  for (let i = historyIdx + 1; i < result.length; i++) {
    if (result[i]!.startsWith('## ') && result[i]!.trim() !== VERDICT_HISTORY_HEADING) {
      break;
    }
    // Track last non-empty line or entry line within section
    if (result[i]!.startsWith('- [')) {
      insertIdx = i + 1;
    }
  }

  // If no entries were found, insert right after the heading (+ blank line)
  if (insertIdx === historyIdx + 1) {
    // Find first non-blank line after heading, or use next line
    let pos = historyIdx + 1;
    while (pos < result.length && result[pos]!.trim() === '') {
      pos++;
    }
    // Insert at the position after blank lines following heading
    result.splice(pos, 0, entryLine);
  } else {
    result.splice(insertIdx, 0, entryLine);
  }

  return result.join('\n');
}

/**
 * Find the placeholder line index within the verdict history section.
 */
function findPlaceholder(lines: string[], historyIdx: number): number {
  for (let i = historyIdx + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith('## ') && lines[i]!.trim() !== VERDICT_HISTORY_HEADING) {
      break;
    }
    if (lines[i]!.trim() === PLACEHOLDER) {
      return i;
    }
  }
  return -1;
}

/**
 * Insert a new ## Verdict History section before a target line index.
 */
function insertSectionBefore(
  lines: string[],
  targetIdx: number,
  entryLine: string,
): string {
  const result = [...lines];
  const sectionBlock = [VERDICT_HISTORY_HEADING, '', entryLine, ''];
  result.splice(targetIdx, 0, ...sectionBlock);
  return result.join('\n');
}

/**
 * Insert a new ## Verdict History section after the frontmatter closing ---.
 */
function insertSectionAfterFrontmatter(
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

  if (fmCloseIdx !== -1) {
    // Insert after the closing --- line
    const sectionBlock = ['', VERDICT_HISTORY_HEADING, '', entryLine, ''];
    result.splice(fmCloseIdx + 1, 0, ...sectionBlock);
  } else {
    // No frontmatter at all -- prepend section at start
    const sectionBlock = [VERDICT_HISTORY_HEADING, '', entryLine, ''];
    result.splice(0, 0, ...sectionBlock);
  }

  return result.join('\n');
}
