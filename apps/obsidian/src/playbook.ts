/**
 * Playbook distillation -- pure functional playbook extraction and generation.
 *
 * Manages the playbook note type:
 * - Extracting playbook data from journal content and receipt timelines
 * - Generating playbook markdown notes with frontmatter and structured sections
 * - Parsing playbook frontmatter for application to new hunts
 * - Applying playbook trigger conditions to MISSION.md
 * - Building journal entries from playbook trigger conditions
 *
 * Pure module -- zero Obsidian imports. Safe for testing and CLI usage.
 */

import { extractTags, parseTimestampedEntries } from './journal';
import type { ReceiptTimelineEntry } from './types';
import { formatTimestamp } from './verdict';
import { updateFrontmatter } from './frontmatter-editor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlaybookData {
  huntId: string;
  triggerConditions: string[]; // from #thrunt/h/ tag values
  decisionTree: DecisionNode[]; // from #thrunt/dp/ tags chronologically
  querySequences: QueryStep[]; // from receipt timeline
  entityTypes: string[]; // unique entity types from hunt
  techniques: string[]; // unique technique refs from receipts
}

export interface DecisionNode {
  timestamp: string;
  decision: string; // dp tag value
  context: string; // surrounding entry text
}

export interface QueryStep {
  receiptId: string;
  claim: string;
  claimStatus: string;
  techniqueRefs: string[];
  hypothesis: string;
}

// ---------------------------------------------------------------------------
// extractPlaybookData
// ---------------------------------------------------------------------------

/**
 * Extract playbook data from journal content and receipt timeline.
 *
 * Uses extractTags from journal.ts to identify hypothesis and decision tags,
 * maps receipt timeline entries to query steps, deduplicates entity types,
 * and collects unique technique references.
 *
 * @param journalContent - Full journal note markdown content
 * @param receiptTimeline - Array of receipt timeline entries
 * @param entityTypes - Array of entity type strings (may contain duplicates)
 * @returns Structured playbook data
 */
export function extractPlaybookData(
  journalContent: string,
  receiptTimeline: ReceiptTimelineEntry[],
  entityTypes: string[],
): PlaybookData {
  const tags = extractTags(journalContent);
  const entries = parseTimestampedEntries(journalContent);

  // Detect huntId from frontmatter
  const huntIdMatch = journalContent.match(/hunt_id:\s*"?([^"\n]+)/);
  const huntId = huntIdMatch ? huntIdMatch[1]!.trim() : '';

  // Map hypothesis tags to trigger conditions
  const triggerConditions = tags
    .filter((t) => t.type === 'hypothesis')
    .map((t) => t.value);

  // Map decision tags to decision nodes with context from entries
  const decisionTree: DecisionNode[] = tags
    .filter((t) => t.type === 'decision')
    .map((t) => {
      const entry = entries.find((e) => e.timestamp === t.timestamp);
      return {
        timestamp: t.timestamp,
        decision: t.value,
        context: entry ? entry.content : '',
      };
    });

  // Map receipt timeline to query steps
  const querySequences: QueryStep[] = receiptTimeline.map((r) => ({
    receiptId: r.receipt_id,
    claim: r.claim,
    claimStatus: r.claim_status,
    techniqueRefs: r.technique_refs,
    hypothesis: r.hypothesis,
  }));

  // Deduplicate entity types
  const uniqueEntityTypes = [...new Set(entityTypes)];

  // Collect unique techniques from receipt timeline
  const techniqueSet = new Set<string>();
  for (const r of receiptTimeline) {
    for (const t of r.technique_refs) {
      techniqueSet.add(t);
    }
  }
  const techniques = [...techniqueSet];

  return {
    huntId,
    triggerConditions,
    decisionTree,
    querySequences,
    entityTypes: uniqueEntityTypes,
    techniques,
  };
}

// ---------------------------------------------------------------------------
// generatePlaybookNote
// ---------------------------------------------------------------------------

/**
 * Generate a complete playbook markdown note from structured data.
 *
 * Produces frontmatter with source_hunt, trigger_conditions (inline array),
 * entity_types, techniques, created date, status: draft, and all body sections.
 *
 * @param data - Structured playbook data
 * @param now - Current date/time for timestamps
 * @returns Complete markdown string for the playbook note
 */
export function generatePlaybookNote(data: PlaybookData, now: Date): string {
  const dateStr = now.toISOString().slice(0, 10);

  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push(`source_hunt: ${data.huntId}`);
  lines.push(`trigger_conditions: [${data.triggerConditions.join(', ')}]`);
  lines.push(`entity_types: [${data.entityTypes.join(', ')}]`);
  lines.push(`techniques: [${data.techniques.join(', ')}]`);
  lines.push(`created: ${dateStr}`);
  lines.push('status: draft');
  lines.push('applied_count: 0');
  lines.push('last_applied: ""');
  lines.push('---');
  lines.push('');

  // ## Trigger Conditions
  lines.push('## Trigger Conditions');
  lines.push('');
  for (const tc of data.triggerConditions) {
    lines.push(`- ${tc}`);
  }
  lines.push('');

  // ## Decision Tree
  lines.push('## Decision Tree');
  lines.push('');
  if (data.decisionTree.length === 0) {
    lines.push('_No decision points recorded._');
  } else {
    for (const node of data.decisionTree) {
      lines.push(
        `- IF [${node.context}] (${node.timestamp}) THEN [${node.decision}]`,
      );
    }
  }
  lines.push('');

  // ## Query Sequences (omit if empty)
  if (data.querySequences.length > 0) {
    lines.push('## Query Sequences');
    lines.push('');

    // Group by hypothesis
    const groups = new Map<string, QueryStep[]>();
    for (const qs of data.querySequences) {
      const group = groups.get(qs.hypothesis) ?? [];
      group.push(qs);
      groups.set(qs.hypothesis, group);
    }

    for (const [hypothesis, steps] of groups) {
      lines.push(`### ${hypothesis}`);
      lines.push('');
      for (const step of steps) {
        lines.push(
          `- **${step.receiptId}** (${step.claimStatus}): ${step.claim} [${step.techniqueRefs.join(', ')}]`,
        );
      }
      lines.push('');
    }
  }

  // ## Expected Entity Types
  lines.push('## Expected Entity Types');
  lines.push('');
  for (const et of data.entityTypes) {
    lines.push(`- ${et}`);
  }
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// parsePlaybookFrontmatter
// ---------------------------------------------------------------------------

/**
 * Parse playbook frontmatter fields using regex (no YAML parser).
 *
 * Extracts trigger_conditions, techniques arrays, and source_hunt string
 * from playbook markdown content.
 *
 * @param content - Full playbook note markdown content
 * @returns Parsed frontmatter fields
 */
export function parsePlaybookFrontmatter(content: string): {
  sourceHunt: string;
  triggerConditions: string[];
  techniques: string[];
} {
  const sourceHuntMatch = content.match(/^source_hunt:\s*(.+)$/m);
  const sourceHunt = sourceHuntMatch ? sourceHuntMatch[1]!.trim() : '';

  const triggerConditions = parseInlineArray(content, 'trigger_conditions');
  const techniques = parseInlineArray(content, 'techniques');

  return { sourceHunt, triggerConditions, techniques };
}

// ---------------------------------------------------------------------------
// applyPlaybookToMission
// ---------------------------------------------------------------------------

/**
 * Apply playbook trigger conditions to MISSION.md content.
 *
 * Sets the hypothesis frontmatter field to the first trigger condition.
 * Returns content unchanged if triggerConditions is empty.
 *
 * @param missionContent - Full MISSION.md markdown content
 * @param triggerConditions - Array of trigger condition strings
 * @returns Updated MISSION.md content
 */
export function applyPlaybookToMission(
  missionContent: string,
  triggerConditions: string[],
): string {
  if (triggerConditions.length === 0) return missionContent;
  return updateFrontmatter(missionContent, {
    hypothesis: triggerConditions[0]!,
  });
}

// ---------------------------------------------------------------------------
// buildPlaybookJournalEntries
// ---------------------------------------------------------------------------

/**
 * Build timestamped journal entries from playbook trigger conditions.
 *
 * For each trigger condition, produces a timestamped entry with a
 * #thrunt/h/{condition} tag for the journal reasoning log.
 *
 * @param triggerConditions - Array of trigger condition strings
 * @param now - Current date/time for timestamps
 * @returns Markdown string with timestamped entries, or empty string if no conditions
 */
export function buildPlaybookJournalEntries(
  triggerConditions: string[],
  now: Date,
): string {
  if (triggerConditions.length === 0) return '';

  const ts = formatTimestamp(now);
  const entries: string[] = [];

  for (const condition of triggerConditions) {
    entries.push(`### [${ts}]`);
    entries.push('');
    entries.push(
      `Starting hunt from playbook. Initial hypothesis: #thrunt/h/${condition}`,
    );
    entries.push('');
  }

  return entries.join('\n');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse an inline YAML array from frontmatter content.
 * Matches `key: [val1, val2]` and returns values as string[].
 */
function parseInlineArray(content: string, key: string): string[] {
  const regex = new RegExp(`^${key}:\\s*\\[(.*)\\]`, 'm');
  const match = content.match(regex);
  if (!match || !match[1] || match[1].trim() === '') return [];
  return match[1].split(',').map((s) => s.trim());
}
