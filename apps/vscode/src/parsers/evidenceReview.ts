import type { EvidenceReview, EvidenceCheck, AntiPatternCheck, ParseResult } from '../types';
import { extractBody, extractMarkdownSections, extractTableRows, makeLoadedResult, makeErrorResult, hasStructuralMarker } from './base';

/**
 * Parse an EVIDENCE_REVIEW.md artifact into a typed EvidenceReview object.
 * EvidenceReview artifacts have NO YAML frontmatter -- they are pure markdown.
 */
export function parseEvidenceReview(raw: string): ParseResult<EvidenceReview> {
  try {
    const body = extractBody(raw);
    if (!body.trim()) {
      return makeErrorResult('Empty artifact body');
    }

    const markers = ['## Publishability Verdict', '## Evidence Quality Checks'];
    if (!hasStructuralMarker(body, markers)) {
      return makeErrorResult('Missing structural markers: ' + markers.join(', '));
    }

    const sections = extractMarkdownSections(body);

    // Extract publishability verdict
    const publishabilityVerdict = sections.get('Publishability Verdict') || '';

    // Parse evidence quality checks table
    const evidenceChecksSection = sections.get('Evidence Quality Checks') || '';
    const evidenceCheckRows = extractTableRows(evidenceChecksSection);
    const evidenceChecks: EvidenceCheck[] = evidenceCheckRows.map(row => ({
      check: row['Check'] || '',
      status: row['Status'] || '',
      notes: row['Notes'] || '',
    }));

    // Parse sequential evidence anti-patterns table
    const antiPatternSection = sections.get('Sequential Evidence Anti-Patterns') || '';
    const antiPatternRows = extractTableRows(antiPatternSection);
    const antiPatternChecks: AntiPatternCheck[] = antiPatternRows.map(row => ({
      pattern: row['Anti-Pattern'] || '',
      signal: row['Signal'] || '',
      status: row['Status'] || '',
    }));

    // Extract text sections
    const contradictoryEvidence = sections.get('Contradictory Evidence') || '';
    const blindSpots = sections.get('Blind Spots') || '';
    const followUpNeeded = sections.get('Follow-Up Needed') || '';

    return makeLoadedResult<EvidenceReview>({
      publishabilityVerdict,
      evidenceChecks,
      antiPatternChecks,
      contradictoryEvidence,
      blindSpots,
      followUpNeeded,
    });
  } catch (e) {
    return makeErrorResult(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
  }
}
