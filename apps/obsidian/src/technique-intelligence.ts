/**
 * Technique intelligence coordinator -- orchestrates hunt history,
 * coverage staleness, and FP count for a single ATT&CK technique note.
 *
 * Pure-function module that accepts data (not VaultAdapter) and returns
 * updated content string. The Obsidian-aware wrapper lives in
 * services/intelligence-service.ts.
 *
 * Pure module -- zero Obsidian imports. Safe for testing and CLI usage.
 */

import type { TechniqueHuntEntry } from './technique-hunt-history';
import { appendTechniqueHuntHistorySection } from './technique-hunt-history';
import {
  computeCoverageStatus,
  extractLastHuntedDate,
  type CoverageStatus,
} from './coverage-staleness';
import { updateFrontmatter } from './frontmatter-editor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TechniqueRefreshInput {
  techniqueContent: string; // Current technique note markdown
  techniqueName: string; // Technique file name without .md
  huntEntries: TechniqueHuntEntry[]; // Pre-built hunt entries from receipt scanning
  staleCoverageDays: number; // From settings (default 90)
  now?: Date; // Injectable for testing
}

export interface TechniqueRefreshResult {
  content: string; // Updated technique note markdown
  huntHistoryCount: number;
  coverageStatus: CoverageStatus;
  lastHuntedDate: string | null;
  fpCount: number;
}

// ---------------------------------------------------------------------------
// FP entry counting
// ---------------------------------------------------------------------------

/** Regex matching the locked FP entry format: `- **pattern**: ...` */
const FP_ENTRY_REGEX = /^- \*\*pattern\*\*:/;

/**
 * Count false positive entries in the content.
 * Matches lines with the locked format: `- **pattern**: {description}`
 */
function countFPEntries(content: string): number {
  const lines = content.split('\n');
  let count = 0;
  for (const line of lines) {
    if (FP_ENTRY_REGEX.test(line)) {
      count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Coordinator function
// ---------------------------------------------------------------------------

/**
 * Refresh all technique intelligence for a single ATT&CK technique note.
 *
 * Orchestrates four operations in sequence:
 * 1. Append Hunt History section via appendTechniqueHuntHistorySection
 * 2. Derive lastHuntedDate from new entries or existing content
 * 3. Compute coverage_status via computeCoverageStatus
 * 4. Count FP entries and update frontmatter
 *
 * NOTE: The coordinator does NOT manage the ## Known False Positives section
 * content. FP entries are added individually via the command (Plan 84-02).
 * The coordinator only counts existing FP entries for the fp_count
 * frontmatter field.
 *
 * Returns the updated content string and stats.
 */
export function refreshTechniqueIntelligence(
  input: TechniqueRefreshInput,
): TechniqueRefreshResult {
  const {
    techniqueContent,
    huntEntries,
    staleCoverageDays,
    now,
  } = input;

  // Step 2: Derive lastHuntedDate (BEFORE modifying content, so existing entries are readable)
  let lastHuntedDate: string | null;
  if (huntEntries.length > 0) {
    // Sort by date descending and take the most recent
    const sorted = [...huntEntries].sort((a, b) => b.date.localeCompare(a.date));
    lastHuntedDate = sorted[0]!.date;
  } else {
    // Read from existing section in content (before replacement)
    lastHuntedDate = extractLastHuntedDate(techniqueContent);
  }

  // Step 1: Hunt History section
  let content = appendTechniqueHuntHistorySection(techniqueContent, huntEntries);

  // Step 3: Compute coverage status
  const coverageStatus = computeCoverageStatus(lastHuntedDate, staleCoverageDays, now);

  // Step 4: Count FP entries
  const fpCount = countFPEntries(content);

  // Step 5: Update frontmatter
  content = updateFrontmatter(content, {
    hunt_count: huntEntries.length,
    last_hunted: lastHuntedDate ?? '',
    coverage_status: coverageStatus,
    fp_count: fpCount,
  });

  return {
    content,
    huntHistoryCount: huntEntries.length,
    coverageStatus,
    lastHuntedDate,
    fpCount,
  };
}
