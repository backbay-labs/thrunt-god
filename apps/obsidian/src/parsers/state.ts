import type { StateSnapshot } from '../types';

/**
 * Strip YAML frontmatter from a markdown string.
 * If the string does not start with `---`, returns as-is.
 * If no closing `---` is found, returns as-is (incomplete frontmatter treated as content).
 */
export function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown;
  const end = markdown.indexOf('\n---', 3);
  if (end === -1) return markdown;
  return markdown.slice(end + 4).trimStart();
}

/**
 * Parse STATE.md markdown into a structured StateSnapshot.
 * Pure function -- never throws. Returns fallback values on malformed input.
 */
export function parseState(markdown: string): StateSnapshot {
  if (!markdown || !markdown.trim()) {
    return { currentPhase: 'unknown', blockers: [], nextActions: [] };
  }

  const stripped = stripFrontmatter(markdown);
  const lines = stripped.split(/\r?\n/);

  // Step 1: Find all ## headings and their line indices
  const headingRegex = /^##\s+(.+)$/;
  const headingPositions: Array<{ name: string; index: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const match = line.match(headingRegex);
    if (match) {
      const captured = match[1];
      if (captured) {
        headingPositions.push({ name: captured.trim().toLowerCase(), index: i });
      }
    }
  }

  // Step 2: Extract content lines for each section
  const sections = new Map<string, string[]>();
  for (let j = 0; j < headingPositions.length; j++) {
    const current = headingPositions[j];
    const next = headingPositions[j + 1];
    if (!current) continue;
    const start = current.index + 1;
    const end = next ? next.index : lines.length;
    sections.set(current.name, lines.slice(start, end));
  }

  // Step 3: Extract currentPhase
  const phaseLines = sections.get('current phase') ?? [];
  const currentPhase = phaseLines.find(l => l.trim().length > 0)?.trim() ?? 'unknown';

  // Step 4: Extract list items
  const listItemRegex = /^\s*[-*]\s+(.+)$/;

  function extractListItems(sectionKey: string): string[] {
    const sectionLines = sections.get(sectionKey) ?? [];
    const items: string[] = [];
    for (const line of sectionLines) {
      const match = line.match(listItemRegex);
      if (match) {
        const captured = match[1];
        if (captured) {
          items.push(captured.trim());
        }
      }
    }
    return items;
  }

  const blockers = extractListItems('blockers');
  const nextActions = extractListItems('next actions');

  return { currentPhase, blockers, nextActions };
}
