/**
 * MCP enrichment engine -- pure module for merging enrichment data into TTP
 * notes, building coverage reports, and formatting decision/learning log
 * entries.
 *
 * Zero Obsidian imports. All functions are pure -- they accept data and return
 * markdown strings. The actual vault I/O is wired in Plan 02.
 */

import type { EnrichmentData, CoverageTactic } from './types';

// ---------------------------------------------------------------------------
// mergeEnrichment
// ---------------------------------------------------------------------------

/**
 * Appends (or replaces) a `## MCP Enrichment` section in a TTP note.
 *
 * - If no `## MCP Enrichment` heading exists, appends the section at the end.
 * - If it already exists, replaces its content (between the heading and the
 *   next `## ` heading or EOF) without touching any other content.
 */
export function mergeEnrichment(
  existingContent: string,
  data: EnrichmentData,
): string {
  const enrichmentBlock = buildEnrichmentBlock(data);
  const heading = '## MCP Enrichment';
  const headingIndex = existingContent.indexOf(heading);

  if (headingIndex === -1) {
    // No existing section -- append at end
    const trimmed = existingContent.trimEnd();
    return trimmed + '\n\n' + heading + '\n\n' + enrichmentBlock + '\n';
  }

  // Find the end of the enrichment section: next ## heading or EOF
  const afterHeading = headingIndex + heading.length;
  const rest = existingContent.slice(afterHeading);
  const nextHeadingMatch = rest.match(/\n## /);

  if (nextHeadingMatch && nextHeadingMatch.index !== undefined) {
    // There is a subsequent heading -- preserve everything from it onward
    const sectionEnd = afterHeading + nextHeadingMatch.index;
    const before = existingContent.slice(0, headingIndex + heading.length);
    const after = existingContent.slice(sectionEnd);
    return before + '\n\n' + enrichmentBlock + after;
  }

  // No subsequent heading -- replace everything after ## MCP Enrichment
  const before = existingContent.slice(0, headingIndex + heading.length);
  return before + '\n\n' + enrichmentBlock + '\n';
}

/**
 * Build the enrichment content block (without the heading).
 */
function buildEnrichmentBlock(data: EnrichmentData): string {
  const description = data.description || 'No description available.';
  const groups = data.groups.length > 0 ? data.groups.join(', ') : 'None';
  const detectionSources =
    data.detectionSources.length > 0
      ? data.detectionSources.join(', ')
      : 'None';
  const relatedTechniques =
    data.relatedTechniques.length > 0
      ? data.relatedTechniques.map((t) => `[[${t}]]`).join(', ')
      : 'None';

  return [
    `**Description:** ${description}`,
    '',
    `**Groups:** ${groups}`,
    '',
    `**Detection Sources:** ${detectionSources}`,
    '',
    `**Related Techniques:** ${relatedTechniques}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// buildCoverageReport
// ---------------------------------------------------------------------------

/**
 * Produces a full markdown coverage report with a table of tactics,
 * overall summary, and gap list.
 */
export function buildCoverageReport(
  tactics: CoverageTactic[],
  totalTechniques: number,
  huntedTechniques: number,
  overallPercentage: number,
  gaps: string[],
): string {
  const lines: string[] = [];
  const timestamp = new Date().toISOString();

  lines.push('# Detection Coverage Report');
  lines.push('');
  lines.push(`_Generated: ${timestamp}_`);
  lines.push('');

  // Table header
  lines.push('| Tactic | Total | Hunted | Coverage |');
  lines.push('|--------|-------|--------|----------|');

  // Table rows
  for (const t of tactics) {
    lines.push(`| ${t.tactic} | ${t.total} | ${t.hunted} | ${t.percentage}% |`);
  }

  lines.push('');
  lines.push(`**Overall: ${huntedTechniques}/${totalTechniques} (${overallPercentage}%)**`);
  lines.push('');

  // Gaps section
  lines.push('## Detection Gaps');
  lines.push('');

  if (gaps.length > 0) {
    for (const gapId of gaps) {
      lines.push(`- [[${gapId}]]`);
    }
  } else {
    lines.push('No detection gaps identified.');
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// formatDecisionEntry
// ---------------------------------------------------------------------------

/**
 * Returns a markdown block for appending to a TTP note's ## Decisions section.
 */
export function formatDecisionEntry(
  techniqueId: string,
  decision: string,
  rationale: string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  return [
    `### ${date} - ${techniqueId}`,
    '',
    `**Decision:** ${decision}`,
    '',
    `**Rationale:** ${rationale}`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// formatLearningEntry
// ---------------------------------------------------------------------------

/**
 * Returns a markdown block for appending to LEARNINGS.md.
 */
export function formatLearningEntry(
  topic: string,
  learning: string,
): string {
  const date = new Date().toISOString().slice(0, 10);
  return [
    `### ${date} - ${topic}`,
    '',
    learning,
    '',
  ].join('\n');
}
