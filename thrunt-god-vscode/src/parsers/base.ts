import * as yaml from 'js-yaml';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmTable } from 'micromark-extension-gfm-table';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { frontmatter } from 'micromark-extension-frontmatter';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import type { ParseResult } from '../types';

/**
 * Extract YAML frontmatter from raw artifact content.
 * Returns empty object if no frontmatter is present.
 * Handles malformed YAML by returning partial parse.
 */
export function extractFrontmatter(raw: string): Record<string, unknown> {
  try {
    const match = raw.match(/^---\r?\n([\s\S]+?)\r?\n---/);
    if (!match) {
      return {};
    }
    const parsed = yaml.load(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch (e) {
    // Malformed YAML -- return empty object rather than throwing
    return {};
  }
}

/**
 * Extract the body of an artifact (everything after the closing --- delimiter).
 * If no frontmatter, returns the entire content trimmed.
 */
export function extractBody(raw: string): string {
  const match = raw.match(/^---\r?\n[\s\S]+?\r?\n---\r?\n?([\s\S]*)$/);
  if (match) {
    return match[1].trim();
  }
  // No frontmatter -- the entire content is the body
  return raw.trim();
}

/**
 * Parse markdown body into sections keyed by ## heading text.
 * Uses mdast-util-from-markdown with GFM table and frontmatter extensions.
 * Each value is the section content between that heading and the next heading
 * of equal or higher level.
 */
export function extractMarkdownSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();

  try {
    const tree = fromMarkdown(body, {
      extensions: [gfmTable(), frontmatter(['yaml'])],
      mdastExtensions: [gfmTableFromMarkdown(), frontmatterFromMarkdown(['yaml'])],
    });

    // Walk children to find headings and their content ranges
    const children = tree.children;
    let currentHeading: string | null = null;
    let currentStart = -1;
    let currentDepth = 0;

    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (node.type === 'heading' && node.depth === 2) {
        // Save previous section
        if (currentHeading !== null && currentStart >= 0 && node.position) {
          const end = node.position.start.offset ?? 0;
          const sectionText = body.slice(currentStart, end).trim();
          sections.set(currentHeading, sectionText);
        }

        // Start new section
        currentDepth = node.depth;
        // Extract heading text from children
        currentHeading = extractTextFromNode(node);
        // Content starts after the heading line
        if (node.position) {
          currentStart = node.position.end.offset ?? 0;
        }
      } else if (node.type === 'heading' && node.depth <= currentDepth && node.depth < 2) {
        // Higher-level heading ends the current section
        if (currentHeading !== null && currentStart >= 0 && node.position) {
          const end = node.position.start.offset ?? 0;
          const sectionText = body.slice(currentStart, end).trim();
          sections.set(currentHeading, sectionText);
          currentHeading = null;
          currentStart = -1;
        }
      }
    }

    // Save last section
    if (currentHeading !== null && currentStart >= 0) {
      const sectionText = body.slice(currentStart).trim();
      sections.set(currentHeading, sectionText);
    }
  } catch (e) {
    // mdast parsing error -- return empty map
    return sections;
  }

  return sections;
}

/** Minimal mdast node shape for text extraction */
interface MdastLike {
  type: string;
  value?: string;
  children?: MdastLike[];
}

/**
 * Recursively extract plain text from an mdast node.
 */
function extractTextFromNode(node: MdastLike): string {
  if (node.value) {
    return node.value;
  }
  if (node.children) {
    return node.children.map(child => extractTextFromNode(child)).join('');
  }
  return '';
}

/**
 * Parse a markdown table within a section into rows.
 * Returns array of objects keyed by header column names.
 */
export function extractTableRows(sectionText: string): Array<Record<string, string>> {
  const rows: Array<Record<string, string>> = [];

  try {
    const tree = fromMarkdown(sectionText, {
      extensions: [gfmTable()],
      mdastExtensions: [gfmTableFromMarkdown()],
    });

    for (const node of tree.children) {
      if (node.type === 'table') {
        const tableNode = node as unknown as MdastLike;
        const tableRows = tableNode.children ?? [];
        if (tableRows.length < 2) continue;

        // First row is header
        const headerCells = tableRows[0].children ?? [];
        const headers = headerCells.map(cell =>
          (cell.children ?? []).map(c => extractTextFromNode(c)).join('').trim()
        );

        // Remaining rows are data
        for (let i = 1; i < tableRows.length; i++) {
          const cells = tableRows[i].children ?? [];
          const row: Record<string, string> = {};
          for (let j = 0; j < headers.length; j++) {
            const cellText = j < cells.length
              ? (cells[j].children ?? []).map(c => extractTextFromNode(c)).join('').trim()
              : '';
            row[headers[j]] = cellText;
          }
          rows.push(row);
        }
      }
    }
  } catch (e) {
    // Table parsing error -- return empty array
    return rows;
  }

  return rows;
}

/**
 * Create a loaded ParseResult.
 */
export function makeLoadedResult<T>(data: T): ParseResult<T> {
  return { status: 'loaded', data };
}

/**
 * Create an error ParseResult.
 */
export function makeErrorResult<T>(error: string, partial?: Partial<T>): ParseResult<T> {
  if (partial !== undefined) {
    return { status: 'error', error, partial };
  }
  return { status: 'error', error };
}

/**
 * Create a missing ParseResult.
 */
export function makeMissingResult<T>(): ParseResult<T> {
  return { status: 'missing' };
}

/**
 * Create a loading ParseResult.
 */
export function makeLoadingResult<T>(): ParseResult<T> {
  return { status: 'loading' };
}

/**
 * Check if body contains expected headings (structural markers).
 * Returns true if ALL markers are present.
 * Used for loading vs loaded state detection during mid-write.
 */
export function hasStructuralMarker(body: string, markers: string[]): boolean {
  return markers.every(marker => body.includes(marker));
}
