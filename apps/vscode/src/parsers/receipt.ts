import type { Receipt, AnomalyFrame, DeviationScore, ParseResult } from '../types';
import {
  extractFrontmatter,
  extractBody,
  extractMarkdownSections,
  makeLoadedResult,
  makeErrorResult,
  hasStructuralMarker,
} from './base';

/**
 * Parse a Receipt artifact (RCT-*.md) into a typed Receipt object.
 *
 * Extracts YAML frontmatter fields (camelCase converted), claim/evidence/confidence
 * body sections, and optional Anomaly Framing with deviation scoring and ATT&CK mapping.
 */
export function parseReceipt(raw: string): ParseResult<Receipt> {
  try {
    if (!raw || !raw.trim()) {
      return makeErrorResult('Empty artifact content');
    }

    const fm = extractFrontmatter(raw);
    const body = extractBody(raw);

    if (!body.trim()) {
      return makeErrorResult('Empty artifact body');
    }

    const markers = ['## Claim', '## Evidence'];
    if (!hasStructuralMarker(body, markers)) {
      return makeErrorResult('Missing structural markers: ' + markers.join(', '));
    }

    const sections = extractMarkdownSections(body);

    // Extract frontmatter fields with camelCase conversion
    const receiptId = String(fm.receipt_id ?? '');
    const querySpecVersion = String(fm.query_spec_version ?? '');
    const createdAt = String(fm.created_at ?? '');
    const source = String(fm.source ?? '');
    const connectorId = String(fm.connector_id ?? '');
    const dataset = String(fm.dataset ?? '');
    const resultStatus = String(fm.result_status ?? '');
    const claimStatus = String(fm.claim_status ?? '');
    const relatedHypotheses = ensureStringArray(fm.related_hypotheses);
    const relatedQueries = ensureStringArray(fm.related_queries);
    const contentHash = String(fm.content_hash ?? '');
    const manifestId = String(fm.manifest_id ?? '');

    // Extract body sections
    const claim = sections.get('Claim') ?? '';
    const evidence = sections.get('Evidence') ?? '';
    const confidence = sections.get('Confidence') ?? '';

    // Parse Anomaly Framing (optional section)
    const anomalyFramingSection = sections.get('Anomaly Framing') ?? '';
    const anomalyFrame = anomalyFramingSection.trim()
      ? parseAnomalyFraming(anomalyFramingSection)
      : null;

    return makeLoadedResult<Receipt>({
      receiptId,
      querySpecVersion,
      createdAt,
      source,
      connectorId,
      dataset,
      resultStatus,
      claimStatus,
      relatedHypotheses,
      relatedQueries,
      contentHash,
      manifestId,
      claim,
      evidence,
      anomalyFrame,
      confidence,
    });
  } catch (e) {
    return makeErrorResult(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Parse the Anomaly Framing section into an AnomalyFrame object.
 * Handles subsections: Baseline, Sequential Prediction, Deviation Scoring/Assessment,
 * ATT&CK Mapping.
 */
function parseAnomalyFraming(sectionText: string): AnomalyFrame {
  const subsections = extractSubsections(sectionText);

  // Baseline
  const baseline = subsections.get('Baseline') ?? '';

  // Prediction and observation from Sequential Prediction section
  let prediction = '';
  let observation = '';
  const seqPred = subsections.get('Sequential Prediction');
  if (seqPred) {
    const predResult = extractPredictions(seqPred);
    prediction = predResult.prediction;
    observation = predResult.observation;
  }

  // Deviation Scoring (may be named "Deviation Scoring" or "Deviation Assessment")
  const deviationSection =
    subsections.get('Deviation Scoring') ??
    subsections.get('Deviation Assessment') ??
    '';
  const deviationScore = parseDeviationScore(deviationSection);

  // ATT&CK Mapping
  const attackSection = subsections.get('ATT&CK Mapping') ?? '';
  const attackMapping = extractAttackTechniques(attackSection);

  return {
    baseline,
    prediction,
    observation,
    deviationScore,
    attackMapping,
  };
}

/**
 * Extract ### subsections from a section's text.
 * Returns a Map<string, string> keyed by subsection heading text.
 */
function extractSubsections(text: string): Map<string, string> {
  const subsections = new Map<string, string>();
  const headingPattern = /^###\s+(.+)$/gm;
  const matches: Array<{ title: string; start: number }> = [];

  let m;
  while ((m = headingPattern.exec(text)) !== null) {
    matches.push({ title: m[1].trim(), start: m.index + m[0].length });
  }

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].start;
    const end = i + 1 < matches.length
      ? text.lastIndexOf('###', matches[i + 1].start)
      : text.length;
    const content = text.slice(start, end).trim();
    subsections.set(matches[i].title, content);
  }

  return subsections;
}

/**
 * Extract predicted and actual lines from Sequential Prediction section.
 * Pattern: **Predicted benign next:** ..., **Predicted malicious next:** ..., **Actual:** ...
 * May contain multiple prediction blocks. Combines all predictions and observations.
 */
function extractPredictions(text: string): { prediction: string; observation: string } {
  const predictions: string[] = [];
  const observations: string[] = [];

  // Match all "Predicted benign/malicious next:" lines
  const predBenignRe = /\*\*Predicted benign next:\*\*\s*(.+)/g;
  const predMaliciousRe = /\*\*Predicted malicious next:\*\*\s*(.+)/g;
  const actualRe = /\*\*Actual:\*\*\s*(.+)/g;

  let match;
  while ((match = predBenignRe.exec(text)) !== null) {
    predictions.push(`Predicted benign: ${match[1].trim()}`);
  }
  while ((match = predMaliciousRe.exec(text)) !== null) {
    predictions.push(`Predicted malicious: ${match[1].trim()}`);
  }
  while ((match = actualRe.exec(text)) !== null) {
    observations.push(match[1].trim());
  }

  return {
    prediction: predictions.join('; '),
    observation: observations.join('; '),
  };
}

/**
 * Parse the Deviation Score table.
 * Table columns: Factor | Value | Contribution
 *
 * First non-Total row: category (from Factor column) + baseScore (from Contribution)
 * Subsequent non-Total rows: modifiers
 * Last row (**Total**): totalScore
 */
function parseDeviationScore(sectionText: string): DeviationScore {
  const defaultScore: DeviationScore = {
    category: '',
    baseScore: 0,
    modifiers: [],
    totalScore: 0,
  };

  if (!sectionText.trim()) {
    return defaultScore;
  }

  // Find the table lines manually since the section may have preamble text
  const lines = sectionText.split('\n');
  const tableLines: string[] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true;
      tableLines.push(trimmed);
    } else if (inTable && !trimmed) {
      // End of table on blank line
      break;
    } else if (inTable) {
      break;
    }
  }

  if (tableLines.length < 3) {
    // Need at least header + separator + 1 data row
    return defaultScore;
  }

  // Parse header -- split by pipe but keep positional alignment (don't filter empties)
  const headers = parsePipeCells(tableLines[0]);

  // Skip separator row (row 1)
  // Data rows start at index 2
  const dataRows: Array<Record<string, string>> = [];
  for (let i = 2; i < tableLines.length; i++) {
    const cells = parsePipeCells(tableLines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = j < cells.length ? cells[j] : '';
    }
    dataRows.push(row);
  }

  let category = '';
  let baseScore = 0;
  const modifiers: Array<{ factor: string; value: string; contribution: number }> = [];
  let totalScore = 0;
  let isFirstDataRow = true;

  for (const row of dataRows) {
    const factor = row['Factor'] ?? '';
    const value = row['Value'] ?? '';
    const contribution = row['Contribution'] ?? '';

    // Check if this is the Total row
    if (factor.includes('**Total**') || factor.includes('Total')) {
      // Extract total score from contribution: "**4 (High)**" -> 4
      const totalMatch = contribution.match(/(\d+)/);
      totalScore = totalMatch ? parseInt(totalMatch[1], 10) : 0;
      continue;
    }

    if (isFirstDataRow) {
      // First data row is the category row
      // Category is one of: EXPECTED_BENIGN, EXPECTED_MALICIOUS, AMBIGUOUS, NOVEL
      const categoryMatch = factor.match(/(EXPECTED_BENIGN|EXPECTED_MALICIOUS|AMBIGUOUS|NOVEL)/);
      category = categoryMatch ? categoryMatch[1] : factor;
      baseScore = parseContribution(contribution);
      isFirstDataRow = false;
    } else {
      // Modifier rows
      modifiers.push({
        factor: stripBold(factor),
        value: stripBold(value),
        contribution: parseContribution(contribution),
      });
    }
  }

  return { category, baseScore, modifiers, totalScore };
}

/**
 * Split a markdown table row by pipe, trimming each cell.
 * Unlike split('|').filter(Boolean), this preserves positional alignment
 * for empty cells (e.g., "| **Total** | | **4** |" -> ["**Total**", "", "**4**"]).
 */
function parsePipeCells(line: string): string[] {
  // Remove leading/trailing pipe and split
  const trimmed = line.replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map(s => s.trim());
}

/**
 * Parse a contribution value like "3", "+1", "+2", "**4 (High)**" into a number.
 */
function parseContribution(s: string): number {
  const stripped = s.replace(/\*\*/g, '').trim();
  const match = stripped.match(/([+-]?\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Strip bold markers from a string.
 */
function stripBold(s: string): string {
  return s.replace(/\*\*/g, '').trim();
}

/**
 * Extract ATT&CK technique IDs from the ATT&CK Mapping section.
 * Looks for **T####** or **T####.###** patterns in bullet list items.
 */
function extractAttackTechniques(sectionText: string): string[] {
  const techniques: string[] = [];
  const re = /\*\*(T\d{4}(?:\.\d{3})?)\*\*/g;
  let match;
  while ((match = re.exec(sectionText)) !== null) {
    techniques.push(match[1]);
  }
  return techniques;
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
