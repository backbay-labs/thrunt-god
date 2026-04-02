import type { Query, DrainTemplate, ParseResult } from '../types';
import {
  extractFrontmatter,
  extractBody,
  extractMarkdownSections,
  extractTableRows,
  makeLoadedResult,
  makeErrorResult,
  hasStructuralMarker,
} from './base';

/**
 * Parse a Query artifact (QRY-*.md) into a typed Query object.
 *
 * Extracts YAML frontmatter fields (camelCase converted), intent section,
 * query text from code block, Result Summary header line with event/template/entity
 * counts, and Drain template metadata from the Result Summary table.
 */
export function parseQuery(raw: string): ParseResult<Query> {
  try {
    if (!raw || !raw.trim()) {
      return makeErrorResult('Empty artifact content');
    }

    const fm = extractFrontmatter(raw);
    const body = extractBody(raw);

    if (!body.trim()) {
      return makeErrorResult('Empty artifact body');
    }

    const markers = ['## Intent', '## Result Summary'];
    if (!hasStructuralMarker(body, markers)) {
      return makeErrorResult('Missing structural markers: ' + markers.join(', '));
    }

    const sections = extractMarkdownSections(body);

    // Extract frontmatter fields with camelCase conversion
    const queryId = String(fm.query_id ?? '');
    const querySpecVersion = String(fm.query_spec_version ?? '');
    const source = String(fm.source ?? '');
    const connectorId = String(fm.connector_id ?? '');
    const dataset = String(fm.dataset ?? '');
    const executedAt = String(fm.executed_at ?? '');
    const author = String(fm.author ?? '');
    const relatedHypotheses = ensureStringArray(fm.related_hypotheses);
    const relatedReceipts = ensureStringArray(fm.related_receipts);
    const contentHash = String(fm.content_hash ?? '');
    const manifestId = String(fm.manifest_id ?? '');

    // Extract body sections
    const intent = sections.get('Intent') ?? '';
    const queryText = extractCodeBlock(sections.get('Query Or Procedure') ?? '');
    const resultSummarySection = sections.get('Result Summary') ?? '';

    // Parse Result Summary header line: **events=N, templates=N, entities=N**
    const summaryMatch = resultSummarySection.match(
      /\*?\*?events=(\d[\d,]*),\s*templates=(\d[\d,]*),\s*entities=(\d[\d,]*)\*?\*?/
    );

    let eventCount = 0;
    let templateCount = 0;
    let entityCount = 0;
    let resultSummary = '';

    if (summaryMatch) {
      eventCount = parseIntClean(summaryMatch[1]);
      templateCount = parseIntClean(summaryMatch[2]);
      entityCount = parseIntClean(summaryMatch[3]);
      resultSummary = `events=${eventCount}, templates=${templateCount}, entities=${entityCount}`;
    }

    // Parse Drain template table from Result Summary section
    const templates = parseTemplateTable(resultSummarySection);

    return makeLoadedResult<Query>({
      queryId,
      querySpecVersion,
      source,
      connectorId,
      dataset,
      executedAt,
      author,
      relatedHypotheses,
      relatedReceipts,
      contentHash,
      manifestId,
      intent,
      queryText,
      resultSummary,
      templates,
      eventCount,
      templateCount,
      entityCount,
    });
  } catch (e) {
    return makeErrorResult(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Parse the Drain template table from the Result Summary section.
 * Table columns: Template | Pattern | Count | % of Total
 *
 * Only considers rows from tables that have both "Pattern" and "% of Total" headers,
 * avoiding confusion with other tables (entity timelines, etc.) in the same section.
 */
function parseTemplateTable(sectionText: string): DrainTemplate[] {
  // Find the template table specifically by locating its header line
  // Header format: | Template | Pattern | Count | % of Total |
  const tableStart = sectionText.indexOf('| Template | Pattern |');
  if (tableStart === -1) {
    return [];
  }

  // Extract only the template table (up to the next blank line or ### heading)
  const afterTable = sectionText.slice(tableStart);
  const tableEnd = afterTable.search(/\n\s*\n|\n###/);
  const tableText = tableEnd === -1 ? afterTable : afterTable.slice(0, tableEnd);

  const rows = extractTableRows(tableText);
  const templates: DrainTemplate[] = [];

  for (const row of rows) {
    const templateId = (row['Template'] ?? '').trim();
    // Only process rows that look like template IDs (T1, T2, etc.)
    if (!templateId || !/^T\d+$/.test(templateId)) {
      continue;
    }

    const pattern = (row['Pattern'] ?? '').trim();
    // Strip backtick wrapping from template text
    const template = pattern.replace(/^`|`$/g, '');

    const countStr = (row['Count'] ?? '').trim();
    const count = parseIntClean(countStr);

    const percentStr = (row['% of Total'] ?? '').trim();
    const percentage = parseFloat(percentStr.replace(/%/g, '')) || 0;

    templates.push({ templateId, template, count, percentage });
  }

  return templates;
}

/**
 * Extract the text content of a ~~~text or ```text code block from a section.
 */
function extractCodeBlock(sectionText: string): string {
  const match = sectionText.match(/(?:~~~|```)(?:text)?\r?\n([\s\S]*?)(?:~~~|```)/);
  return match ? match[1].trim() : sectionText.trim();
}

/**
 * Parse an integer from a string, stripping commas.
 */
function parseIntClean(s: string): number {
  return parseInt(s.replace(/,/g, ''), 10) || 0;
}

/**
 * Ensure a value is a string array.
 */
function ensureStringArray(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.map(String);
  }
  if (typeof val === 'string' && val.trim()) {
    return [val];
  }
  return [];
}
