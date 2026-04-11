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
