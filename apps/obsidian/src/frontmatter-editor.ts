/**
 * FrontmatterEditor -- pure functional YAML frontmatter manipulation.
 *
 * Two exported functions for surgical frontmatter updates:
 * - updateFrontmatter: update existing keys and insert missing ones
 * - addToArray: append values to inline or multiline YAML arrays
 *
 * Uses regex-based line-level manipulation (not full YAML parse/serialize)
 * to preserve comments, quoting style, and key ordering.
 *
 * Pure module -- zero imports, zero dependencies. Safe for testing and CLI usage.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

type QuoteStyle = 'double' | 'single' | 'none';

/**
 * Detect the quoting style of a YAML value string.
 * Returns 'double' for "value", 'single' for 'value', 'none' otherwise.
 */
function detectQuoteStyle(value: string): QuoteStyle {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return 'double';
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return 'single';
  return 'none';
}

/**
 * Format a value with the specified quoting style.
 */
function formatValue(value: unknown, quoteStyle: QuoteStyle): string {
  const str = String(value);
  switch (quoteStyle) {
    case 'double':
      return `"${str}"`;
    case 'single':
      return `'${str}'`;
    case 'none':
      return str;
  }
}

/**
 * Find the frontmatter boundaries in a markdown string.
 * Returns the index of the opening --- (always 0) and the index of the
 * closing --- line start, or null if no valid frontmatter.
 */
function findFrontmatterBounds(
  content: string,
): { start: number; end: number } | null {
  if (!content.startsWith('---')) return null;
  const endIdx = content.indexOf('\n---', 3);
  if (endIdx === -1) return null;
  return { start: 0, end: endIdx };
}

// ---------------------------------------------------------------------------
// updateFrontmatter
// ---------------------------------------------------------------------------

/**
 * Update frontmatter key-value pairs in a markdown string.
 *
 * - Updates existing keys while preserving their quoting style
 * - Inserts missing keys before the closing ---
 * - Preserves YAML comments, key ordering, and markdown body
 * - Returns content unchanged if no valid frontmatter found
 *
 * @param content - Full markdown file content
 * @param updates - Key-value pairs to set
 * @returns Updated content string
 */
export function updateFrontmatter(
  content: string,
  updates: Record<string, unknown>,
): string {
  const bounds = findFrontmatterBounds(content);
  if (!bounds) return content;

  // Split into: opening ---, frontmatter body, closing --- + rest
  const firstNewline = content.indexOf('\n');
  const fmBody = content.slice(firstNewline + 1, bounds.end);
  const afterFm = content.slice(bounds.end + 1); // includes \n--- and everything after

  const lines = fmBody.split('\n');
  const updatedKeys = new Set<string>();

  // Pass 1: update existing keys
  const updatedLines = lines.map((line) => {
    // Match key: value patterns (not comments, not array items)
    const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!match) return line;

    const key = match[1]!;
    if (!(key in updates)) return line;

    const existingValue = match[2]!;
    const newValue = updates[key];
    updatedKeys.add(key);

    // Detect existing quoting style
    const quoteStyle = detectQuoteStyle(existingValue);

    // For empty unquoted values (key: with nothing after), use 'none'
    const effectiveStyle =
      existingValue.trim() === '' ? 'none' : quoteStyle;

    return `${key}: ${formatValue(newValue, effectiveStyle)}`;
  });

  // Pass 2: insert missing keys before closing ---
  const missingKeys = Object.entries(updates).filter(
    ([key]) => !updatedKeys.has(key),
  );
  for (const [key, value] of missingKeys) {
    updatedLines.push(`${key}: ${formatValue(value, 'none')}`);
  }

  // Reassemble: lines joined with \n, then \n before afterFm (which starts with ---)
  return `---\n${updatedLines.join('\n')}\n${afterFm}`;
}

// ---------------------------------------------------------------------------
// addToArray
// ---------------------------------------------------------------------------

/**
 * Append a value to a YAML array field in frontmatter.
 *
 * Supports both inline arrays (`key: [a, b]`) and multiline arrays
 * (`key:\n  - a\n  - b`). Preserves quoting style of existing items.
 *
 * Returns content unchanged if:
 * - No valid frontmatter found
 * - Key not found in frontmatter
 * - Key has a non-array value (graceful no-op)
 *
 * @param content - Full markdown file content
 * @param key - Frontmatter key containing the array
 * @param value - Value to append
 * @returns Updated content string
 */
export function addToArray(
  content: string,
  key: string,
  value: string,
): string {
  const bounds = findFrontmatterBounds(content);
  if (!bounds) return content;

  const firstNewline = content.indexOf('\n');
  const fmBody = content.slice(firstNewline + 1, bounds.end);
  const afterFm = content.slice(bounds.end + 1);

  const lines = fmBody.split('\n');
  let keyFound = false;
  let modified = false;

  const resultLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Check for key match
    const match = line.match(
      new RegExp(`^${escapeRegex(key)}:\\s*(.*)$`),
    );

    if (!match) {
      resultLines.push(line);
      continue;
    }

    keyFound = true;
    const valueAfterColon = match[1]!.trim();

    // Case 1: Inline array [a, b, c]
    if (valueAfterColon.startsWith('[') && valueAfterColon.endsWith(']')) {
      const inner = valueAfterColon.slice(1, -1).trim();

      if (inner === '') {
        // Empty array: []
        resultLines.push(`${key}: [${value}]`);
      } else {
        // Detect quoting style from existing items
        const items = parseInlineArray(inner);
        const itemQuoteStyle =
          items.length > 0 ? detectQuoteStyle(items[0]!) : 'none';
        const formattedValue = formatValue(value, itemQuoteStyle);
        resultLines.push(`${key}: [${inner}, ${formattedValue}]`);
      }
      modified = true;
      continue;
    }

    // Case 2: Multiline array -- key: followed by - items on subsequent lines
    if (
      valueAfterColon === '' &&
      i + 1 < lines.length &&
      /^\s*-\s/.test(lines[i + 1]!)
    ) {
      resultLines.push(line);
      // Collect all the - items
      let j = i + 1;
      let indent = '';
      while (j < lines.length && /^\s*-\s/.test(lines[j]!)) {
        const indentMatch = lines[j]!.match(/^(\s*)-\s/);
        if (indentMatch) indent = indentMatch[1]!;
        resultLines.push(lines[j]!);
        j++;
      }
      // Append new item with same indentation
      resultLines.push(`${indent}- ${value}`);
      modified = true;
      // Skip the lines we already processed
      i = j - 1;
      continue;
    }

    // Case 3: Non-array value -- no-op
    resultLines.push(line);
  }

  if (!keyFound || !modified) return content;

  return `---\n${resultLines.join('\n')}\n${afterFm}`;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse an inline YAML array string (without brackets) into individual items.
 * Preserves quoting on each item.
 */
function parseInlineArray(inner: string): string[] {
  if (inner.trim() === '') return [];
  return inner.split(',').map((s) => s.trim());
}
