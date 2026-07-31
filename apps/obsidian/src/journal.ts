/**
 * Hunt journal engine -- pure functional journal note management.
 *
 * Manages the hunt journal note type:
 * - Template generation with YAML frontmatter and initial entry
 * - Timestamped entry appending with correct section positioning
 * - Inline tag extraction (#thrunt/h/, #thrunt/ev/, #thrunt/dp/)
 * - Summary section building and replacement
 *
 * Pure module -- zero Obsidian imports. Safe for testing and CLI usage.
 */

import { formatTimestamp } from './verdict';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JournalEntry {
  timestamp: string;
  content: string;
}

export interface ExtractedTag {
  type: 'hypothesis' | 'evidence' | 'decision';
  value: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAG_REGEX = /#thrunt\/(h|ev|dp)\/([a-zA-Z0-9_-]+)/g;

const TAG_TYPE_MAP: Record<string, ExtractedTag['type']> = {
  h: 'hypothesis',
  ev: 'evidence',
  dp: 'decision',
};

// ---------------------------------------------------------------------------
// createJournalNote
// ---------------------------------------------------------------------------

/**
 * Create a new hunt journal note with YAML frontmatter and initial entry.
 *
 * Produces a complete markdown string with:
 * - Frontmatter: hunt_id, hypothesis, status, linked_entities, created, updated
 * - ## Reasoning Log section with initial timestamped entry placeholder
 *
 * @param huntId - Hunt identifier (e.g., "HUNT-042")
 * @param hypothesis - Primary hypothesis for the hunt
 * @param now - Current date/time for timestamps
 * @returns Complete markdown string for the journal note
 */
export function createJournalNote(
  huntId: string,
  hypothesis: string,
  now: Date,
): string {
  const ts = formatTimestamp(now);
  const dateStr = now.toISOString().slice(0, 10);
  return [
    '---',
    `hunt_id: ${huntId}`,
    `hypothesis: "${hypothesis}"`,
    `status: active`,
    `linked_entities: []`,
    `created: ${dateStr}`,
    `updated: ${dateStr}`,
    '---',
    '',
    '## Reasoning Log',
    '',
    `### [${ts}]`,
    '',
    '_Initial entry -- describe your starting hypothesis and reasoning._',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// appendJournalEntry
// ---------------------------------------------------------------------------

/**
 * Append a timestamped entry to a journal note.
 *
 * Insertion priority:
 * 1. Before ## Summary (if it exists)
 * 2. At end of ## Reasoning Log section (before next ## heading or EOF)
 * 3. At end of file (fallback)
 *
 * Does NOT update frontmatter -- caller is responsible for updating the
 * `updated` field via FrontmatterEditor.
 *
 * @param content - Full journal note markdown content
 * @param timestamp - Formatted timestamp string (YYYY-MM-DD HH:mm)
 * @param entryText - Body text for the entry
 * @returns Updated content string
 */
export function appendJournalEntry(
  content: string,
  timestamp: string,
  entryText: string,
): string {
  const entryBlock = [`### [${timestamp}]`, '', entryText, ''];
  const lines = content.split('\n');

  // Priority 1: Insert before ## Summary
  const summaryIdx = lines.findIndex((l) => l.trim() === '## Summary');
  if (summaryIdx !== -1) {
    const result = [...lines];
    // Insert entry block before ## Summary with blank line separator
    result.splice(summaryIdx, 0, ...entryBlock);
    return result.join('\n');
  }

  // Priority 2: Insert at end of ## Reasoning Log section
  const reasoningIdx = lines.findIndex(
    (l) => l.trim() === '## Reasoning Log',
  );
  if (reasoningIdx !== -1) {
    const endIdx = findReasoningLogEnd(lines, reasoningIdx);
    const result = [...lines];
    result.splice(endIdx, 0, ...entryBlock);
    return result.join('\n');
  }

  // Priority 3: Append at end of file
  return content.trimEnd() + '\n\n' + entryBlock.join('\n');
}

// ---------------------------------------------------------------------------
// parseTimestampedEntries
// ---------------------------------------------------------------------------

const TIMESTAMP_HEADING_REGEX = /^### \[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]$/;

/**
 * Parse journal content into an array of timestamped entries.
 *
 * Matches ### [YYYY-MM-DD HH:mm] headings and collects content until
 * the next ### [ heading, ## heading, or end of file.
 *
 * @param content - Full journal note markdown content
 * @returns Array of {timestamp, content} entries
 */
export function parseTimestampedEntries(content: string): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const lines = content.split('\n');

  let currentTimestamp: string | null = null;
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = line.match(TIMESTAMP_HEADING_REGEX);

    if (match) {
      // Save previous entry if any
      if (currentTimestamp !== null) {
        entries.push({
          timestamp: currentTimestamp,
          content: currentLines.join('\n').trim(),
        });
      }
      currentTimestamp = match[1]!;
      currentLines = [];
      continue;
    }

    // Stop current entry at ## heading (not ### [timestamp])
    if (currentTimestamp !== null && line.startsWith('## ')) {
      entries.push({
        timestamp: currentTimestamp,
        content: currentLines.join('\n').trim(),
      });
      currentTimestamp = null;
      currentLines = [];
      continue;
    }

    if (currentTimestamp !== null) {
      currentLines.push(line);
    }
  }

  // Save last entry
  if (currentTimestamp !== null) {
    entries.push({
      timestamp: currentTimestamp,
      content: currentLines.join('\n').trim(),
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// extractTags
// ---------------------------------------------------------------------------

/**
 * Extract #thrunt/ inline tags from journal content.
 *
 * Parses timestamped entries, strips code blocks and inline code, then
 * scans for #thrunt/(h|ev|dp)/value tags.
 *
 * @param content - Full journal note markdown content
 * @returns Array of extracted tags with type, value, and entry timestamp
 */
export function extractTags(content: string): ExtractedTag[] {
  const tags: ExtractedTag[] = [];
  const entries = parseTimestampedEntries(content);

  for (const entry of entries) {
    const cleaned = stripCodeBlocks(entry.content);
    const regex = new RegExp(TAG_REGEX.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(cleaned)) !== null) {
      const tagType = TAG_TYPE_MAP[match[1]!];
      if (tagType) {
        tags.push({
          type: tagType,
          value: match[2]!,
          timestamp: entry.timestamp,
        });
      }
    }
  }

  return tags;
}

// ---------------------------------------------------------------------------
// buildSummarySection
// ---------------------------------------------------------------------------

/**
 * Build a ## Summary section from extracted tags.
 *
 * Groups tags by type (Hypotheses, Evidence, Decisions) chronologically.
 * Hypotheses are deduplicated by value, showing first occurrence timestamp.
 * Empty tag types omit their subsection entirely.
 *
 * @param tags - Array of extracted tags
 * @returns Markdown string for the summary section
 */
export function buildSummarySection(tags: ExtractedTag[]): string {
  const hypotheses = uniqueByValue(
    tags.filter((t) => t.type === 'hypothesis'),
  );
  const evidence = tags.filter((t) => t.type === 'evidence');
  const decisions = tags.filter((t) => t.type === 'decision');

  const lines = ['## Summary', ''];

  if (hypotheses.length > 0) {
    lines.push('### Hypotheses');
    for (const h of hypotheses) {
      lines.push(`- **${h.value}** (first: ${h.timestamp})`);
    }
    lines.push('');
  }

  if (evidence.length > 0) {
    lines.push('### Evidence');
    for (const e of evidence) {
      lines.push(`- [${e.timestamp}] ${e.value}`);
    }
    lines.push('');
  }

  if (decisions.length > 0) {
    lines.push('### Decisions');
    for (const d of decisions) {
      lines.push(`- [${d.timestamp}] ${d.value}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// replaceSummarySection
// ---------------------------------------------------------------------------

/**
 * Replace or create the ## Summary section in journal content.
 *
 * If ## Summary exists: splice-replace from heading to next ## heading or EOF.
 * If missing: append at end of file with blank line separator.
 *
 * @param content - Full journal note markdown content
 * @param summaryContent - New summary section content (including ## Summary heading)
 * @returns Updated content string
 */
export function replaceSummarySection(
  content: string,
  summaryContent: string,
): string {
  const lines = content.split('\n');
  const summaryIdx = lines.findIndex((l) => l.trim() === '## Summary');

  if (summaryIdx !== -1) {
    // Replace existing section
    const endIdx = findSectionEnd(lines, summaryIdx);
    const result = [...lines];
    const sectionLines = summaryContent.split('\n');
    // Remove trailing empty string from split if present
    if (sectionLines[sectionLines.length - 1] === '') {
      sectionLines.pop();
    }
    result.splice(summaryIdx, endIdx - summaryIdx, ...sectionLines);
    return result.join('\n');
  }

  // Append at end of file
  return content.trimEnd() + '\n\n' + summaryContent;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
 * Find the end of the ## Reasoning Log section.
 * Returns the index where new entries should be inserted.
 */
function findReasoningLogEnd(lines: string[], reasoningIdx: number): number {
  for (let i = reasoningIdx + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith('## ')) {
      return i;
    }
  }
  return lines.length;
}

/**
 * Strip fenced code blocks and inline code from text.
 * Removes content between ``` markers and between ` markers.
 */
function stripCodeBlocks(text: string): string {
  // Remove fenced code blocks (```...```)
  let result = text.replace(/```[\s\S]*?```/g, '');
  // Remove inline code (`...`)
  result = result.replace(/`[^`]*`/g, '');
  return result;
}

/**
 * Deduplicate tags by value, keeping the first occurrence.
 */
function uniqueByValue(tags: ExtractedTag[]): ExtractedTag[] {
  const seen = new Set<string>();
  const unique: ExtractedTag[] = [];
  for (const tag of tags) {
    if (!seen.has(tag.value)) {
      seen.add(tag.value);
      unique.push(tag);
    }
  }
  return unique;
}
