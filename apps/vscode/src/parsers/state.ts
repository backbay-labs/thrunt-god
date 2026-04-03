import type { HuntState, ParseResult } from '../types';
import { extractBody, makeLoadedResult, makeErrorResult, hasStructuralMarker } from './base';

/**
 * Parse a STATE.md artifact into a typed HuntState object.
 * State artifacts have NO YAML frontmatter -- they are pure markdown.
 */
export function parseState(raw: string): ParseResult<HuntState> {
  try {
    const body = extractBody(raw);
    if (!body.trim()) {
      return makeErrorResult('Empty artifact body');
    }

    const markers = ['## Current Position'];
    if (!hasStructuralMarker(body, markers)) {
      return makeErrorResult('Missing structural markers: ' + markers.join(', '));
    }

    // Extract active signal and current focus from bold fields
    const activeSignal = extractBoldField(body, 'Active signal') || '';
    const currentFocus = extractBoldField(body, 'Current focus') || '';

    // Parse "Phase: N of M" from ## Current Position section
    const phaseMatch = body.match(/Phase:\s*(\d+)\s*of\s*(\d+)/);
    const phase = phaseMatch ? parseInt(phaseMatch[1], 10) : 0;
    const totalPhases = phaseMatch ? parseInt(phaseMatch[2], 10) : 0;

    // Parse "Plan: N of M in current phase"
    const planMatch = body.match(/Plan:\s*(\d+)\s*of\s*(\d+)/);
    const planInPhase = planMatch ? parseInt(planMatch[1], 10) : 0;
    const totalPlansInPhase = planMatch ? parseInt(planMatch[2], 10) : 0;

    // Parse "Status: Complete"
    const statusMatch = body.match(/^Status:\s*(.+)$/m);
    const status = statusMatch ? statusMatch[1].trim() : '';

    // Parse "Last activity: ..."
    const lastActivityMatch = body.match(/Last activity:\s*(.+)/);
    const lastActivity = lastActivityMatch ? lastActivityMatch[1].trim() : '';

    // Extract ### Current Scope section
    const scope = extractSubsection(body, '### Current Scope');

    // Extract ### Confidence line
    const confidence = extractSubsection(body, '### Confidence');

    // Extract ### Blockers section
    const blockers = extractSubsection(body, '### Blockers');

    return makeLoadedResult<HuntState>({
      activeSignal,
      currentFocus,
      phase,
      totalPhases,
      planInPhase,
      totalPlansInPhase,
      status,
      lastActivity,
      scope,
      confidence,
      blockers,
    });
  } catch (e) {
    return makeErrorResult(`Parse error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Extract content between a ### heading and the next ### or ## heading.
 */
function extractSubsection(body: string, heading: string): string {
  const start = body.indexOf(heading);
  if (start === -1) return '';

  const afterHeading = start + heading.length;
  // Find next ### or ## heading
  const rest = body.slice(afterHeading);
  const nextHeading = rest.search(/\n#{2,3} /);
  if (nextHeading === -1) {
    return rest.trim();
  }
  return rest.slice(0, nextHeading).trim();
}

/**
 * Extract a value from a bold-prefixed line like "**Active signal:** value".
 */
function extractBoldField(body: string, fieldName: string): string | null {
  const match = body.match(new RegExp(`\\*\\*${fieldName}:\\*\\*\\s*(.+)`));
  return match ? match[1].trim() : null;
}
