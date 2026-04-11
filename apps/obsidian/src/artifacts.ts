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
    starterTemplate: `# Mission

## Objective

Describe the threat-hunting objective for this workspace.
`,
    commandId: 'open-thrunt-mission',
    commandName: 'Open THRUNT mission',
  },
  {
    fileName: 'HYPOTHESES.md',
    label: 'Hypotheses',
    description: 'Testable hunt ideas and current validation state.',
    starterTemplate: `# Hypotheses

| Hypothesis | Status | Notes |
| --- | --- | --- |
`,
    commandId: 'open-thrunt-hypotheses',
    commandName: 'Open THRUNT hypotheses',
  },
  {
    fileName: 'HUNTMAP.md',
    label: 'Huntmap',
    description: 'Phase breakdown and execution plan.',
    starterTemplate: `# Huntmap

## Phases

1.
`,
    commandId: 'open-thrunt-huntmap',
    commandName: 'Open THRUNT huntmap',
  },
  {
    fileName: 'STATE.md',
    label: 'State',
    description: 'Current phase, blockers, and next actions.',
    starterTemplate: `# State

## Current phase

-

## Blockers

- None

## Next actions

-
`,
    commandId: 'open-thrunt-state',
    commandName: 'Open THRUNT state',
  },
  {
    fileName: 'FINDINGS.md',
    label: 'Findings',
    description: 'Validated findings only.',
    starterTemplate: `# Findings

## Summary

-
`,
    commandId: 'open-thrunt-findings',
    commandName: 'Open THRUNT findings',
  },
]);
