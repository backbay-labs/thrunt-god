import type { Mission, ParseResult } from '../types';
import { extractBody, extractMarkdownSections, makeLoadedResult, makeErrorResult, hasStructuralMarker } from './base';

/**
 * Parse a MISSION.md artifact into a typed Mission object.
 * Mission artifacts have NO YAML frontmatter -- they are pure markdown.
 */
export function parseMission(raw: string): ParseResult<Mission> {
  try {
    const body = extractBody(raw);
    if (!body.trim()) {
      return makeErrorResult('Empty artifact body');
    }

    const markers = ['## Signal', '## Desired Outcome', '## Scope'];
    if (!hasStructuralMarker(body, markers)) {
      return makeErrorResult('Missing structural markers: ' + markers.join(', '));
    }

    // Extract metadata from bold-prefixed lines at the top
    const mode = extractBoldField(body, 'Mode') || '';
    const opened = extractBoldField(body, 'Opened') || '';
    const owner = extractBoldField(body, 'Owner') || '';
    const status = extractBoldField(body, 'Status') || '';

    const sections = extractMarkdownSections(body);

    return makeLoadedResult<Mission>({
      mode,
      opened,
      owner,
      status,
      signal: sections.get('Signal') || '',
      desiredOutcome: sections.get('Desired Outcome') || '',
      scope: sections.get('Scope') || '',
      workingTheory: sections.get('Working Theory') || '',
    });
  } catch (e) {
    return makeErrorResult(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Extract a value from a bold-prefixed line like "**Mode:** case".
 */
function extractBoldField(body: string, fieldName: string): string | null {
  const match = body.match(new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`));
  return match ? match[1].trim() : null;
}
