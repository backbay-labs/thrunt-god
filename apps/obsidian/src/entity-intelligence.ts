/**
 * Entity intelligence coordinator -- orchestrates hunt history, co-occurrence,
 * and confidence computation for a single entity note.
 *
 * Pure-function module that accepts data (not VaultAdapter) and returns
 * updated content string. The Obsidian-aware wrapper lives in
 * services/intelligence-service.ts.
 *
 * Pure module -- zero Obsidian imports. Safe for testing and CLI usage.
 */

import type { EntityNote } from './cross-hunt';
import type { HuntHistoryEntry } from './hunt-history';
import { appendHuntHistorySection } from './hunt-history';
import { findCoOccurrences, appendRelatedInfraSection } from './co-occurrence';
import {
  computeConfidence,
  formatConfidenceFactors,
  type ConfidenceFactors,
  type ConfidenceConfig,
} from './confidence';
import { updateFrontmatter } from './frontmatter-editor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RefreshInput {
  entityContent: string; // Current entity note markdown
  entityName: string; // Entity file name without .md
  entityHuntRefs: string[]; // hunt_refs from the entity's frontmatter
  huntEntries: HuntHistoryEntry[]; // Pre-built hunt history entries
  allEntities: EntityNote[]; // All entity notes for co-occurrence
  confidenceFactors: ConfidenceFactors; // Pre-computed factors
  confidenceConfig: ConfidenceConfig;
}

export interface RefreshResult {
  content: string; // Updated entity note markdown
  confidenceScore: number;
  coOccurrenceCount: number;
  huntHistoryCount: number;
}

// ---------------------------------------------------------------------------
// Coordinator function
// ---------------------------------------------------------------------------

/**
 * Refresh all entity intelligence for a single entity note.
 *
 * Orchestrates three operations in sequence:
 * 1. Build and append Hunt History section
 * 2. Find co-occurrences and append Related Infrastructure section
 * 3. Compute confidence and update frontmatter with score + factors
 *
 * Returns the updated content string and stats.
 */
export function refreshEntityIntelligence(input: RefreshInput): RefreshResult {
  const {
    entityContent,
    entityName,
    entityHuntRefs,
    huntEntries,
    allEntities,
    confidenceFactors,
    confidenceConfig,
  } = input;

  // Step 1: Hunt History section
  let content = appendHuntHistorySection(entityContent, huntEntries);

  // Step 2: Co-occurrence / Related Infrastructure section
  const coOccurrences = findCoOccurrences(
    entityHuntRefs,
    allEntities,
    entityName,
  );
  content = appendRelatedInfraSection(content, coOccurrences);

  // Step 3: Confidence computation + frontmatter update
  const confidenceScore = computeConfidence(confidenceFactors, confidenceConfig);
  content = updateFrontmatter(content, {
    confidence_score: confidenceScore,
    confidence_factors: formatConfidenceFactors(confidenceFactors),
  });

  return {
    content,
    confidenceScore,
    coOccurrenceCount: coOccurrences.length,
    huntHistoryCount: huntEntries.length,
  };
}
