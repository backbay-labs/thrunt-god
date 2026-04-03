/**
 * Parser barrel export and dispatch function.
 *
 * Re-exports all 8 artifact parsers and provides a unified parseArtifact
 * dispatch function that routes to the correct parser by ArtifactType.
 */

export { parseMission } from './mission';
export { parseHypotheses } from './hypotheses';
export { parseHuntMap } from './huntmap';
export { parseState } from './state';
export { parseQuery } from './query';
export { parseReceipt } from './receipt';
export { parseEvidenceReview } from './evidenceReview';
export { parsePhaseSummary } from './phaseSummary';

import type { ArtifactType, ParseResult } from '../types';
import { parseMission } from './mission';
import { parseHypotheses } from './hypotheses';
import { parseHuntMap } from './huntmap';
import { parseState } from './state';
import { parseQuery } from './query';
import { parseReceipt } from './receipt';
import { parseEvidenceReview } from './evidenceReview';
import { parsePhaseSummary } from './phaseSummary';

/**
 * Dispatch to the correct parser based on artifact type.
 * Returns a ParseResult<unknown> since the specific type depends on the artifact.
 */
export function parseArtifact(artifactType: ArtifactType, raw: string): ParseResult<unknown> {
  switch (artifactType) {
    case 'mission': return parseMission(raw);
    case 'hypotheses': return parseHypotheses(raw);
    case 'huntmap': return parseHuntMap(raw);
    case 'state': return parseState(raw);
    case 'query': return parseQuery(raw);
    case 'receipt': return parseReceipt(raw);
    case 'evidenceReview': return parseEvidenceReview(raw);
    case 'phaseSummary': return parsePhaseSummary(raw);
    default: return { status: 'error', error: `Unknown artifact type: ${artifactType}` };
  }
}
