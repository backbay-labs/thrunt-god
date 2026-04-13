import type { HypothesisSnapshot } from '../types';
import { stripFrontmatter } from './state';

/** Maps recognized status values to display buckets. */
const STATUS_BUCKETS: Record<string, 'validated' | 'pending' | 'rejected'> = {
  'validated': 'validated',
  'testing': 'pending',
  'draft': 'pending',
  'pending': 'pending',
  'active': 'pending',
  'rejected': 'rejected',
  'disproved': 'rejected',
};

/** Zero snapshot -- returned on any structural parse failure. */
const ZERO: HypothesisSnapshot = { total: 0, validated: 0, pending: 0, rejected: 0, unknown: 0 };

/**
 * Split a markdown table row into trimmed cell values.
 * Handles leading/trailing pipes and whitespace.
 */
function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) {
    trimmed = trimmed.substring(1);
  }
  if (trimmed.endsWith('|')) {
    trimmed = trimmed.substring(0, trimmed.length - 1);
  }
  return trimmed.split('|').map(cell => cell.trim());
}

/**
 * Parse HYPOTHESES.md markdown into a structured HypothesisSnapshot.
 * Pure function -- never throws. Returns zero snapshot on malformed input.
 */
export function parseHypotheses(markdown: string): HypothesisSnapshot {
  if (!markdown || !markdown.trim()) {
    return { ...ZERO };
  }

  const stripped = stripFrontmatter(markdown);
  const lines = stripped.split(/\r?\n/);

  // Step 1: Find the first separator row (identifies the table)
  const separatorRegex = /^\s*\|?\s*[-:]+[-:\s|]+$/;
  let separatorIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && separatorRegex.test(line)) {
      separatorIndex = i;
      break;
    }
  }

  // No separator found, or separator is line 0 (no header above)
  if (separatorIndex < 1) {
    return { ...ZERO };
  }

  // Step 2: Parse header row
  const headerLine = lines[separatorIndex - 1];
  if (!headerLine) {
    return { ...ZERO };
  }
  const headerCells = splitTableRow(headerLine);
  const statusColIndex = headerCells.findIndex(cell => /^status$/i.test(cell.trim()));
  if (statusColIndex === -1) {
    return { ...ZERO };
  }

  // Step 3: Parse body rows
  const counts = { validated: 0, pending: 0, rejected: 0, unknown: 0 };

  for (let i = separatorIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || !line.includes('|')) {
      break; // table ended
    }

    const cells = splitTableRow(line);
    if (cells.length <= statusColIndex) {
      continue; // row too short, skip
    }

    const statusCell = cells[statusColIndex];
    const status = statusCell ? statusCell.trim().toLowerCase() : '';
    if (status === '') {
      counts.unknown++;
    } else {
      const bucket = STATUS_BUCKETS[status];
      if (bucket) {
        counts[bucket]++;
      } else {
        counts.unknown++;
      }
    }
  }

  const total = counts.validated + counts.pending + counts.rejected + counts.unknown;

  return { total, ...counts };
}
