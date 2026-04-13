/**
 * Export profile registry -- pure data module defining what context each
 * agent needs when exporting from a hunt workspace.
 *
 * Zero Obsidian imports. Safe for testing and CLI usage.
 *
 * Profiles tell the context assembly engine (Plan 02) which sections,
 * entity types, link depth, and prompt template each agent needs.
 */

import type { ExportProfile } from './types';

// ---------------------------------------------------------------------------
// Default profiles
// ---------------------------------------------------------------------------

/**
 * 5 default agent export profiles. Each specifies the sections to extract,
 * related entity types to traverse, link depth, prompt template, and a
 * soft token budget estimate.
 */
export const DEFAULT_PROFILES: readonly ExportProfile[] = Object.freeze([
  {
    agentId: 'query-writer',
    label: 'Query Writer',
    includeSections: ['hypothesis', 'environment', 'data-sources', 'technique-details'],
    includeRelated: {
      entityTypes: ['ttp', 'datasource'],
      depth: 1,
    },
    promptTemplate:
      'You are a query writer. Use the following hunt context to write detection queries that validate the hypothesis.\n\n{{context}}',
    maxTokenEstimate: 8000,
  },
  {
    agentId: 'intel-advisor',
    label: 'Intel Advisor',
    includeSections: ['entity-notes', 'sightings', 'related-entities', 'enrichment'],
    includeRelated: {
      entityTypes: ['ttp', 'actor', 'tool', 'ioc/ip', 'ioc/domain', 'ioc/hash'],
      depth: 1,
    },
    promptTemplate:
      'You are an intelligence advisor. Analyze the following entity context and provide strategic intelligence assessments.\n\n{{context}}',
    maxTokenEstimate: 12000,
  },
  {
    agentId: 'findings-validator',
    label: 'Findings Validator',
    includeSections: ['hypothesis', 'receipts', 'evidence-review', 'contradictions'],
    includeRelated: {
      entityTypes: ['ttp'],
      depth: 1,
    },
    promptTemplate:
      'You are a findings validator. Review the following hypothesis, supporting receipts, and evidence to assess the validity of the findings.\n\n{{context}}',
    maxTokenEstimate: 10000,
  },
  {
    agentId: 'signal-triager',
    label: 'Signal Triager',
    includeSections: ['signal', 'environment', 'sightings', 'historical-context'],
    includeRelated: {
      entityTypes: ['ioc/ip', 'ioc/domain', 'ioc/hash'],
      depth: 1,
    },
    promptTemplate:
      'You are a signal triager. Evaluate the following signal context against the environment and historical sightings to determine priority and next steps.\n\n{{context}}',
    maxTokenEstimate: 6000,
  },
  {
    agentId: 'hunt-planner',
    label: 'Hunt Planner',
    includeSections: ['mission', 'hypotheses', 'coverage-gaps', 'data-sources', 'prior-hunts'],
    includeRelated: {
      entityTypes: ['ttp', 'datasource', 'actor'],
      depth: 2,
    },
    promptTemplate:
      'You are a hunt planner. Use the following mission context, hypotheses, coverage gaps, and data source inventory to plan the next hunt iteration.\n\n{{context}}',
    maxTokenEstimate: 15000,
  },
]);

// ---------------------------------------------------------------------------
// loadProfiles
// ---------------------------------------------------------------------------

/**
 * Merge custom profiles from a JSON string with the default registry.
 *
 * - If customJson is null, empty, or malformed, returns a copy of defaults.
 * - For each valid custom profile:
 *   - If its agentId matches a default, the custom profile replaces it.
 *   - Otherwise it is appended.
 * - Custom profiles missing required fields (agentId, label, includeSections,
 *   includeRelated) are silently skipped.
 */
export function loadProfiles(customJson: string | null): ExportProfile[] {
  const defaults = DEFAULT_PROFILES.map((p) => ({ ...p, includeRelated: { ...p.includeRelated } }));

  if (!customJson) {
    return defaults;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(customJson);
  } catch {
    return defaults;
  }

  if (!Array.isArray(parsed)) {
    return defaults;
  }

  for (const entry of parsed) {
    if (!isValidProfile(entry)) {
      continue;
    }

    const custom = entry as ExportProfile;
    const existingIndex = defaults.findIndex((p) => p.agentId === custom.agentId);

    if (existingIndex !== -1) {
      defaults[existingIndex] = custom;
    } else {
      defaults.push(custom);
    }
  }

  return defaults;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Validates that a parsed JSON value has the minimum required ExportProfile
 * shape before accepting it.
 */
function isValidProfile(value: unknown): value is ExportProfile {
  if (typeof value !== 'object' || value === null) return false;

  const obj = value as Record<string, unknown>;

  if (typeof obj.agentId !== 'string' || obj.agentId.length === 0) return false;
  if (typeof obj.label !== 'string' || obj.label.length === 0) return false;
  if (!Array.isArray(obj.includeSections)) return false;
  if (typeof obj.includeRelated !== 'object' || obj.includeRelated === null) return false;

  const related = obj.includeRelated as Record<string, unknown>;
  if (!Array.isArray(related.entityTypes)) return false;
  if (typeof related.depth !== 'number') return false;

  return true;
}
