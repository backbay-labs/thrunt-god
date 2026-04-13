import type { QuerySnapshot } from '../types';
import { stripFrontmatter } from './state';

/** Zero snapshot -- returned on any structural parse failure or empty input. */
const ZERO: QuerySnapshot = {
  query_id: '',
  dataset: '',
  result_status: '',
  related_hypotheses: [],
  related_receipts: [],
  intent: '',
  entity_refs: { ips: [], domains: [], hashes: [] },
};

/**
 * Extract a simple key: value from frontmatter lines.
 * Returns empty string if key not found.
 */
function extractScalar(lines: string[], key: string): string {
  for (const line of lines) {
    const match = line.match(new RegExp(`^${key}:\\s*(.+)$`));
    if (match && match[1]) {
      return match[1].trim().replace(/^["']|["']$/g, '');
    }
  }
  return '';
}

/**
 * Extract a YAML array from frontmatter lines.
 * Looks for `key:` followed by lines matching /^\s+-\s+(.+)$/.
 */
function extractArray(lines: string[], key: string): string[] {
  const items: string[] = [];
  let capturing = false;
  for (const line of lines) {
    if (new RegExp(`^${key}:\\s*$`).test(line)) {
      capturing = true;
      continue;
    }
    if (capturing) {
      const itemMatch = line.match(/^\s+-\s+(.+)$/);
      if (itemMatch && itemMatch[1]) {
        items.push(itemMatch[1].trim());
      } else {
        capturing = false;
      }
    }
  }
  return items;
}

/**
 * Extract frontmatter lines from markdown string.
 * Returns empty array if no valid frontmatter.
 */
function getFrontmatterLines(markdown: string): string[] {
  if (!markdown.startsWith('---')) return [];
  const end = markdown.indexOf('\n---', 3);
  if (end === -1) return [];
  const block = markdown.slice(4, end);
  return block.split(/\r?\n/);
}

/**
 * Extract sections keyed by lowercase ## heading name.
 */
function extractSections(body: string): Map<string, string[]> {
  const lines = body.split(/\r?\n/);
  const headingRegex = /^##\s+(.+)$/;
  const headingPositions: Array<{ name: string; index: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const match = line.match(headingRegex);
    if (match && match[1]) {
      headingPositions.push({ name: match[1].trim().toLowerCase(), index: i });
    }
  }

  const sections = new Map<string, string[]>();
  for (let j = 0; j < headingPositions.length; j++) {
    const current = headingPositions[j];
    const next = headingPositions[j + 1];
    if (!current) continue;
    const start = current.index + 1;
    const end = next ? next.index : lines.length;
    sections.set(current.name, lines.slice(start, end));
  }
  return sections;
}

/**
 * Get the first non-empty line from a section's content lines.
 */
function firstNonEmpty(lines: string[]): string {
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return '';
}

/**
 * Validate an IPv4 address -- each octet must be 0-255.
 */
function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  for (const part of parts) {
    const num = Number(part);
    if (Number.isNaN(num) || num < 0 || num > 255) return false;
  }
  return true;
}

/**
 * Extract IPv4 addresses from text.
 */
function extractIPs(text: string): string[] {
  const regex = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g;
  const matches: string[] = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m[1] && isValidIPv4(m[1])) {
      matches.push(m[1]);
    }
  }
  return [...new Set(matches)];
}

/**
 * Extract domain names from text.
 * Requires TLD of 2+ alpha chars to exclude version numbers.
 */
function extractDomains(text: string): string[] {
  const regex = /\b([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,})\b/g;
  const matches: string[] = [];
  let m;
  // Set of IPs to exclude (they can match the domain regex)
  const ipRegex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  while ((m = regex.exec(text)) !== null) {
    if (m[1] && !ipRegex.test(m[1])) {
      matches.push(m[1]);
    }
  }
  return [...new Set(matches)];
}

/**
 * Extract hex hashes (MD5=32, SHA1=40, SHA256=64 chars) from text.
 */
function extractHashes(text: string): string[] {
  const matches: string[] = [];
  // Match 64-char, 40-char, 32-char hex strings at word boundaries
  // Order matters: check longest first to avoid partial matches
  const regex = /\b([a-fA-F0-9]{64}|[a-fA-F0-9]{40}|[a-fA-F0-9]{32})\b/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m[1]) {
      matches.push(m[1]);
    }
  }
  return [...new Set(matches)];
}

/**
 * Parse a query log markdown file into a structured QuerySnapshot.
 * Pure function -- never throws. Returns zero snapshot on malformed input.
 */
export function parseQueryLog(markdown: string): QuerySnapshot {
  if (!markdown || !markdown.trim()) {
    return { ...ZERO, related_hypotheses: [], related_receipts: [], entity_refs: { ips: [], domains: [], hashes: [] } };
  }

  try {
    // Parse frontmatter
    const fmLines = getFrontmatterLines(markdown);
    const query_id = extractScalar(fmLines, 'query_id');
    const dataset = extractScalar(fmLines, 'dataset');
    let result_status = extractScalar(fmLines, 'result_status');
    const related_hypotheses = extractArray(fmLines, 'related_hypotheses');
    const related_receipts = extractArray(fmLines, 'related_receipts');

    // Parse body
    const body = stripFrontmatter(markdown);
    const sections = extractSections(body);

    // Extract intent
    const intentLines = sections.get('intent') ?? [];
    const intent = firstNonEmpty(intentLines);

    // Fallback for result_status: check ## Runtime Metadata section
    if (!result_status) {
      const runtimeLines = sections.get('runtime metadata') ?? [];
      for (const line of runtimeLines) {
        const statusMatch = line.match(/\*\*Result status:\*\*\s*(.+)/i);
        if (statusMatch && statusMatch[1]) {
          result_status = statusMatch[1].trim();
          break;
        }
      }
    }

    // Extract entity references from full body
    const ips = extractIPs(body);
    const domains = extractDomains(body);
    const hashes = extractHashes(body);

    return {
      query_id,
      dataset,
      result_status,
      related_hypotheses,
      related_receipts,
      intent,
      entity_refs: { ips, domains, hashes },
    };
  } catch {
    return { ...ZERO, related_hypotheses: [], related_receipts: [], entity_refs: { ips: [], domains: [], hashes: [] } };
  }
}
