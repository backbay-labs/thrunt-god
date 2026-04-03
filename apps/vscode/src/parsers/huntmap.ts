import type { HuntMap, HuntPhase, ParseResult } from '../types';
import { extractBody, extractMarkdownSections, makeLoadedResult, makeErrorResult, hasStructuralMarker } from './base';

/**
 * Parse a HUNTMAP.md artifact into a typed HuntMap object.
 * HuntMap artifacts have NO YAML frontmatter -- they are pure markdown.
 */
export function parseHuntMap(raw: string): ParseResult<HuntMap> {
  try {
    const body = extractBody(raw);
    if (!body.trim()) {
      return makeErrorResult('Empty artifact body');
    }

    const markers = ['## Overview', '## Phases'];
    if (!hasStructuralMarker(body, markers)) {
      return makeErrorResult('Missing structural markers: ' + markers.join(', '));
    }

    const sections = extractMarkdownSections(body);
    const overview = sections.get('Overview') || '';

    // Parse phase status from ## Phases checkbox list
    const phasesSection = sections.get('Phases') || '';
    const phaseStatuses = parsePhaseStatuses(phasesSection);

    // Parse phase details from ## Phase Details section
    const phaseDetailsSection = sections.get('Phase Details') || '';
    const phases = parsePhaseDetails(phaseDetailsSection, phaseStatuses);

    return makeLoadedResult<HuntMap>({ overview, phases });
  } catch (e) {
    return makeErrorResult(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Parse phase statuses from checkbox list in ## Phases section.
 * Format: "- [x] **Phase 1: Signal Intake** - description"
 *         "- [ ] **Phase 2: Identity** - description"
 */
function parsePhaseStatuses(phasesSection: string): Map<number, string> {
  const statuses = new Map<number, string>();
  const lines = phasesSection.split('\n');

  for (const line of lines) {
    const match = line.match(/- \[([x ])\] \*\*Phase (\d+):/);
    if (match) {
      const phaseNum = parseInt(match[2], 10);
      statuses.set(phaseNum, match[1] === 'x' ? 'complete' : 'planned');
    }
  }

  return statuses;
}

/**
 * Parse phase details from ### Phase N: subsections.
 */
function parsePhaseDetails(detailsSection: string, statuses: Map<number, string>): HuntPhase[] {
  const phases: HuntPhase[] = [];

  // Split on ### Phase N: pattern
  const phaseBlocks = detailsSection.split(/(?=### Phase \d+:)/);

  for (const block of phaseBlocks) {
    const headerMatch = block.match(/### Phase (\d+): (.+)/);
    if (!headerMatch) continue;

    const number = parseInt(headerMatch[1], 10);
    const name = headerMatch[2].trim();

    const goal = extractBoldField(block, 'Goal') || '';
    const dependsOn = extractBoldField(block, 'Depends on') || '';
    // Extract plan names from "Plans:" section -- lines matching "- [x] NN-NN: description"
    const plans: string[] = [];
    const planMatches = block.matchAll(/- \[[x ]\] (.+)/g);
    for (const m of planMatches) {
      plans.push(m[1].trim());
    }

    phases.push({
      number,
      name,
      goal,
      status: statuses.get(number) || 'planned',
      dependsOn,
      plans,
    });
  }

  return phases;
}

/**
 * Extract a value from a bold-prefixed line like "**Goal**: value".
 */
function extractBoldField(block: string, fieldName: string): string | null {
  const match = block.match(new RegExp(`\\*\\*${fieldName}\\*\\*:\\s*(.+)`));
  if (match) return match[1].trim();
  // Also try "**Field:** value" format
  const match2 = block.match(new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`));
  return match2 ? match2[1].trim() : null;
}
