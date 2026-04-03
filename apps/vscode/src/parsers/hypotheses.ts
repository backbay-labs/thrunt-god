import type { Hypothesis, Hypotheses, ParseResult } from '../types';
import { extractBody, makeLoadedResult, makeErrorResult, hasStructuralMarker } from './base';

/**
 * Parse a HYPOTHESES.md artifact into a typed Hypotheses object.
 * Hypotheses artifacts have NO YAML frontmatter -- they are pure markdown.
 */
export function parseHypotheses(raw: string): ParseResult<Hypotheses> {
  try {
    const body = extractBody(raw);
    if (!body.trim()) {
      return makeErrorResult('Empty artifact body');
    }

    const markers = ['## Active Hypotheses'];
    if (!hasStructuralMarker(body, markers)) {
      return makeErrorResult('Missing structural markers: ' + markers.join(', '));
    }

    // Split into major sections
    const activeSection = extractSection(body, '## Active Hypotheses');
    const parkedSection = extractSection(body, '## Parked Hypotheses');
    const disprovedSection = extractSection(body, '## Disproved Hypotheses');

    const active = parseHypothesisList(activeSection);
    const parked = parseHypothesisList(parkedSection);
    const disproved = parseHypothesisList(disprovedSection);

    return makeLoadedResult<Hypotheses>({ active, parked, disproved });
  } catch (e) {
    return makeErrorResult(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Extract content between a ## heading and the next ## heading.
 */
function extractSection(body: string, heading: string): string {
  const start = body.indexOf(heading);
  if (start === -1) return '';

  const afterHeading = start + heading.length;
  // Find next ## heading
  const nextHeading = body.indexOf('\n## ', afterHeading);
  if (nextHeading === -1) {
    return body.slice(afterHeading).trim();
  }
  return body.slice(afterHeading, nextHeading).trim();
}

/**
 * Parse ### HYP-XX: subsections into Hypothesis objects.
 */
function parseHypothesisList(section: string): Hypothesis[] {
  const hypotheses: Hypothesis[] = [];
  if (!section.trim()) return hypotheses;

  // Split on ### HYP- pattern
  const hypBlocks = section.split(/(?=### HYP-)/);

  for (const block of hypBlocks) {
    const idMatch = block.match(/### (HYP-\d+):/);
    if (!idMatch) continue;

    const id = idMatch[1];
    hypotheses.push({
      id,
      signal: extractBoldField(block, 'Signal') || '',
      assertion: extractBoldField(block, 'Assertion') || '',
      priority: extractBoldField(block, 'Priority') || '',
      status: extractBoldField(block, 'Status') || '',
      confidence: extractBoldField(block, 'Confidence') || '',
      scope: extractBoldField(block, 'Scope') || '',
      dataSources: extractBoldField(block, 'Data sources')?.split(',').map(s => s.trim()) || [],
      evidenceNeeded: extractBoldField(block, 'Evidence needed') || '',
      disproofCondition: extractBoldField(block, 'Disproof condition') || '',
    });
  }

  return hypotheses;
}

/**
 * Extract a value from a bold-prefixed line like "- **Signal:** value"
 * or "**Signal:** value".
 */
function extractBoldField(block: string, fieldName: string): string | null {
  const match = block.match(new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`));
  return match ? match[1].trim() : null;
}
