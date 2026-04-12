import type { ReceiptSnapshot } from '../types';
import { stripFrontmatter } from './state';

/** Zero snapshot -- returned on any structural parse failure or empty input. */
const ZERO: ReceiptSnapshot = {
  receipt_id: '',
  claim_status: '',
  result_status: '',
  related_hypotheses: [],
  related_queries: [],
  claim: '',
  evidence_summary: '',
  technique_refs: [],
  confidence: '',
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
 * Parse a receipt markdown file into a structured ReceiptSnapshot.
 * Pure function -- never throws. Returns zero snapshot on malformed input.
 */
export function parseReceipt(markdown: string): ReceiptSnapshot {
  if (!markdown || !markdown.trim()) {
    return { ...ZERO, related_hypotheses: [], related_queries: [], technique_refs: [] };
  }

  try {
    // Parse frontmatter
    const fmLines = getFrontmatterLines(markdown);
    const receipt_id = extractScalar(fmLines, 'receipt_id');
    const claim_status = extractScalar(fmLines, 'claim_status');
    const result_status = extractScalar(fmLines, 'result_status');
    const related_hypotheses = extractArray(fmLines, 'related_hypotheses');
    const related_queries = extractArray(fmLines, 'related_queries');

    // Parse body
    const body = stripFrontmatter(markdown);
    const sections = extractSections(body);

    // Extract claim
    const claimLines = sections.get('claim') ?? [];
    const claim = firstNonEmpty(claimLines);

    // Extract evidence summary
    const evidenceLines = sections.get('evidence') ?? [];
    const evidence_summary = firstNonEmpty(evidenceLines);

    // Extract confidence
    const confidenceLines = sections.get('confidence') ?? [];
    const confidenceText = firstNonEmpty(confidenceLines);
    let confidence = '';
    if (confidenceText) {
      const confMatch = confidenceText.match(/^(Low|Medium|High)\b/i);
      if (confMatch && confMatch[1]) {
        // Capitalize first letter
        confidence = confMatch[1].charAt(0).toUpperCase() + confMatch[1].slice(1).toLowerCase();
        // Normalize to expected casing
        if (confidence === 'Low' || confidence === 'Medium' || confidence === 'High') {
          // already correct
        } else {
          confidence = '';
        }
      }
    }

    // Extract technique references from full body
    const techniqueRegex = /T\d{4}(?:\.\d{3})?/g;
    const allMatches = body.match(techniqueRegex) ?? [];
    const technique_refs = [...new Set(allMatches)];

    return {
      receipt_id,
      claim_status,
      result_status,
      related_hypotheses,
      related_queries,
      claim,
      evidence_summary,
      technique_refs,
      confidence,
    };
  } catch {
    return { ...ZERO, related_hypotheses: [], related_queries: [], technique_refs: [] };
  }
}
