import type {
  Query,
  DrainTemplate,
  DrainTemplateDetail,
  ParseResult,
  QueryTimeWindow,
} from '../types';
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
    const title = extractTitle(body, queryId);
    const intent = sections.get('Intent') ?? '';
    const queryText = extractCodeBlock(sections.get('Query Or Procedure') ?? '');
    const parametersSection = sections.get('Parameters') ?? '';
    const resultSummarySection = sections.get('Result Summary') ?? '';
    const timeWindow = parseTimeWindow(parametersSection);

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
    const templateDetails = parseTemplateDetails(body);

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
      title,
      intent,
      queryText,
      resultSummary,
      templates,
      templateDetails,
      eventCount,
      templateCount,
      entityCount,
      timeWindow,
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
 * Parse "### Template Tn Details" subsections from the body.
 */
function parseTemplateDetails(body: string): DrainTemplateDetail[] {
  const details: DrainTemplateDetail[] = [];
  const regex =
    /^###\s+Template\s+(T\d+)\s+Details(?:\s+\(([^)]+)\))?\s*\n([\s\S]*?)(?=^###\s+Template\s+T\d+\s+Details|^##\s+|$)/gm;

  for (const match of body.matchAll(regex)) {
    const templateId = match[1];
    const detailLabel = match[2] ? ` (${match[2]})` : '';
    const summary = match[3].trim();
    const detailLines = summary
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const sampleEventText = extractSampleEventText(detailLines);
    const eventIds = extractEventIds(summary);

    details.push({
      templateId,
      heading: `Template ${templateId} Details${detailLabel}`,
      summary,
      detailLines,
      sampleEventText,
      sampleEventId: eventIds[0] ?? null,
      eventIds,
    });
  }

  return details;
}

/**
 * Extract the text content of a ~~~text or ```text code block from a section.
 */
function extractCodeBlock(sectionText: string): string {
  const match = sectionText.match(/(?:~~~|```)(?:text)?\r?\n([\s\S]*?)(?:~~~|```)/);
  return match ? match[1].trim() : sectionText.trim();
}

/**
 * Extract the H1 query title from the markdown body.
 */
function extractTitle(body: string, queryId: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : queryId;
}

/**
 * Extract a structured time window from the Parameters section.
 */
function parseTimeWindow(parametersSection: string): QueryTimeWindow | null {
  const match = parametersSection.match(
    /\*\*Time window:\*\*\s*([^\n]+?)\s*--\s*([^\n]+)/
  );

  if (!match) {
    return null;
  }

  return {
    start: match[1].trim(),
    end: match[2].trim(),
  };
}

/**
 * Derive the most useful human-readable sample line from a template detail block.
 */
function extractSampleEventText(detailLines: string[]): string | null {
  for (const line of detailLines) {
    const normalized = line.replace(/^[-*]\s+/, '').trim();
    if (!normalized || normalized.startsWith('###')) {
      continue;
    }
    return normalized;
  }
  return null;
}

/**
 * Extract serialized sample event identifiers when present.
 * Current fixtures do not expose them, so this usually returns [].
 */
function extractEventIds(text: string): string[] {
  const ids = text.match(/\bevt-[A-Za-z0-9_-]+\b/g) ?? [];
  return [...new Set(ids)];
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
