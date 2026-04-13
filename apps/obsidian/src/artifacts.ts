import type { ArtifactDefinition } from './types';

/**
 * Canonical artifact registry. Single source of truth for all artifact
 * definitions, templates, and command metadata.
 *
 * Order: MISSION, HYPOTHESES, HUNTMAP, STATE, FINDINGS
 * (STATE before FINDINGS per spec section 3.2)
 */
export const CORE_ARTIFACTS: readonly ArtifactDefinition[] = Object.freeze([
  {
    fileName: 'MISSION.md',
    label: 'Mission',
    description: 'Program charter, scope, and constraints.',
    starterTemplate: `---
thrunt-artifact: mission
hunt-id: ""
updated: ""
---
# Mission

## Objective

Describe the threat-hunting objective for this workspace.

## Scope

- Data sources:
- Time range:
- Constraints:

## Success criteria

-
`,
    commandId: 'open-thrunt-mission',
    commandName: 'Open mission',
  },
  {
    fileName: 'HYPOTHESES.md',
    label: 'Hypotheses',
    description: 'Testable hunt ideas and current validation state.',
    starterTemplate: `---
thrunt-artifact: hypotheses
hunt-id: ""
updated: ""
---
# Hypotheses

| Hypothesis | Status | Notes |
| --- | --- | --- |
`,
    commandId: 'open-thrunt-hypotheses',
    commandName: 'Open hypotheses',
  },
  {
    fileName: 'HUNTMAP.md',
    label: 'Huntmap',
    description: 'Phase breakdown and execution plan.',
    starterTemplate: `---
thrunt-artifact: huntmap
hunt-id: ""
updated: ""
---
# Huntmap

See [[STATE]] for current phase status and [[HYPOTHESES]] for hypothesis tracking.

## Phases

1.
`,
    commandId: 'open-thrunt-huntmap',
    commandName: 'Open huntmap',
  },
  {
    fileName: 'STATE.md',
    label: 'State',
    description: 'Current phase, blockers, and next actions.',
    starterTemplate: `---
thrunt-artifact: state
hunt-id: ""
updated: ""
---
# State

See [[HUNTMAP]] for phase breakdown and [[FINDINGS]] for validated results.

## Current phase

-

## Blockers

- None

## Next actions

-
`,
    commandId: 'open-thrunt-state',
    commandName: 'Open state',
  },
  {
    fileName: 'FINDINGS.md',
    label: 'Findings',
    description: 'Validated findings only.',
    starterTemplate: `---
thrunt-artifact: findings
hunt-id: ""
updated: ""
---
# Findings

See [[HYPOTHESES]] for hypothesis validation status.

## Summary

-
`,
    commandId: 'open-thrunt-findings',
    commandName: 'Open findings',
  },
]);

/**
 * Knowledge Base dashboard template. Created during bootstrap but NOT
 * part of CORE_ARTIFACTS (not tracked in 5-artifact detection).
 *
 * Contains 6 embedded Dataview queries that give analysts an at-a-glance
 * view of their knowledge graph when they open KNOWLEDGE_BASE.md.
 */
export const KNOWLEDGE_BASE_TEMPLATE = `---
thrunt-artifact: knowledge-base
updated: ""
---
# Knowledge Base

This dashboard provides an at-a-glance view of your knowledge graph through Dataview queries. Each section surfaces key entities and relationships across your hunt workspaces.

### IOCs by Confidence

All observed indicators of compromise, ranked by analyst confidence level.

\`\`\`dataview
TABLE confidence, verdict, first_seen, last_seen
FROM "entities/iocs"
WHERE type = "ioc/ip" OR type = "ioc/domain" OR type = "ioc/hash"
SORT confidence DESC
\`\`\`

### TTPs by Hunt Frequency

Techniques, tactics, and procedures ranked by how often they have been hunted.

\`\`\`dataview
TABLE hunt_count, tactic, platforms
FROM "entities/ttps"
WHERE type = "ttp"
SORT hunt_count DESC
\`\`\`

### Coverage Gaps (TTPs Never Hunted)

Techniques that exist in the ontology but have never been the subject of a hunt.

\`\`\`dataview
TABLE tactic, platforms, data_sources
FROM "entities/ttps"
WHERE type = "ttp" AND hunt_count = 0
SORT tactic ASC
\`\`\`

### Actors by Hunt Count

Threat actors ranked by the number of hunts that reference them.

\`\`\`dataview
TABLE aliases, associated_ttps, hunt_refs
FROM "entities/actors"
WHERE type = "actor"
SORT length(hunt_refs) DESC
\`\`\`

### Recent Sightings Timeline

The most recent entity sightings across IOCs, actors, and tools.

\`\`\`dataview
TABLE type, value, last_seen, confidence
FROM "entities/iocs" OR "entities/actors" OR "entities/tools"
WHERE last_seen != null AND last_seen != ""
SORT last_seen DESC
LIMIT 25
\`\`\`

### Cross-Hunt Entity Overlap

Entities that appear across multiple hunts, indicating persistent threats or shared infrastructure.

\`\`\`dataview
TABLE type, hunt_refs
FROM "entities/iocs" OR "entities/actors" OR "entities/tools" OR "entities/infra"
WHERE length(hunt_refs) > 1
SORT length(hunt_refs) DESC
\`\`\`
`;
