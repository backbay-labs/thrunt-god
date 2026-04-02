import type { PhaseSummary, HypothesisVerdict, ParseResult } from '../types';
import { extractBody, extractMarkdownSections, extractTableRows, makeLoadedResult, makeErrorResult, hasStructuralMarker } from './base';

/**
 * Parse a FINDINGS.md artifact into a typed PhaseSummary object.
 * PhaseSummary (Findings) artifacts have NO YAML frontmatter -- they are pure markdown.
 */
export function parsePhaseSummary(raw: string): ParseResult<PhaseSummary> {
  try {
    const body = extractBody(raw);
    if (!body.trim()) {
      return makeErrorResult('Empty artifact body');
    }

    const markers = ['## Executive Summary', '## Hypothesis Verdicts'];
    if (!hasStructuralMarker(body, markers)) {
      return makeErrorResult('Missing structural markers: ' + markers.join(', '));
    }

    const sections = extractMarkdownSections(body);

    // Extract executive summary
    const executiveSummary = sections.get('Executive Summary') || '';

    // Parse hypothesis verdicts table
    const verdictsSection = sections.get('Hypothesis Verdicts') || '';
    const verdictRows = extractTableRows(verdictsSection);
    const hypothesisVerdicts: HypothesisVerdict[] = verdictRows.map(row => ({
      hypothesisId: row['Hypothesis'] || '',
      verdict: row['Verdict'] || '',
      confidence: row['Confidence'] || '',
      evidence: row['Evidence'] || '',
    }));

    // Extract impacted scope
    const impactedScope = sections.get('Impacted Scope') || '';

    // Extract attack timeline as raw markdown (preserve table formatting)
    const attackTimeline = sections.get('Attack Timeline') || '';

    return makeLoadedResult<PhaseSummary>({
      executiveSummary,
      hypothesisVerdicts,
      impactedScope,
      attackTimeline,
    });
  } catch (e) {
    return makeErrorResult(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
  }
}
