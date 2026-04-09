# Hunt Program Huntmap Template

Template for `.planning/HUNTMAP.md` when bootstrapping `/hunt-new-program`.

<template>

```markdown
# Huntmap: TBD

## Overview

TBD

## Phases

- [ ] **Phase 1: Environment Mapping** - Inventory telemetry, pivots, blind spots, and retention
- [ ] **Phase 2: Tool & Access Validation** - Confirm consoles, auth, datasets, and query paths
- [ ] **Phase 3: Hypothesis Library** - Define reusable hunts, assumptions, and success criteria
- [ ] **Phase 4: Pilot Hunts** - Run the first repeatable hunts against live data
- [ ] **Phase 5: Publish Cadence** - Package findings, detections, and the ongoing operating rhythm

## Phase Details

### Phase 1: Environment Mapping
**Goal**: Capture the current telemetry surfaces, identifiers, and blind spots in `ENVIRONMENT.md`
**Depends on**: Nothing
**Operations**: Interview the environment, document the tools, and map the telemetry coverage
**Receipts Required**: [environment notes, access notes]
**Success Criteria**:
  1. `ENVIRONMENT.md` documents the primary telemetry surfaces and retention windows
  2. Query pivots and known blind spots are captured for the main domains
**Plans**: 1 plan

Plans:
- [ ] 01-01: Build the baseline environment map

### Phase 2: Tool & Access Validation
**Goal**: Prove the team can access the required tools and execute the expected query paths
**Depends on**: Phase 1
**Operations**: Validate auth, query languages, saved searches, and operator workflows
**Receipts Required**: [tool access checklist, validation notes]
**Success Criteria**:
  1. Required tools and query paths are confirmed or marked as blocked
  2. Missing access or tooling gaps are captured with owners and workarounds
**Plans**: 1 plan

Plans:
- [ ] 02-01: Validate toolchain access and query paths

### Phase 3: Hypothesis Library
**Goal**: Turn environment knowledge into reusable hunt hypotheses
**Depends on**: Phase 2
**Operations**: Define the first wave of repeatable hunt ideas and decision points
**Receipts Required**: [hypothesis notes, scope decisions]
**Success Criteria**:
  1. Initial hypotheses are documented with data-source requirements
  2. Success criteria are specific enough to drive execution
**Plans**: 1 plan

Plans:
- [ ] 03-01: Draft the initial reusable hypotheses

### Phase 4: Pilot Hunts
**Goal**: Execute the first repeatable hunts using the validated toolchain
**Depends on**: Phase 3
**Operations**: Run the first hunts, record real query logs and real receipts, and refine the loop
**Receipts Required**: [query logs, evidence receipts]
**Success Criteria**:
  1. At least one pilot hunt runs end-to-end against live data
  2. Real queries and receipts exist for the executed hunts
**Plans**: 1 plan

Plans:
- [ ] 04-01: Run the first pilot hunt

### Phase 5: Publish Cadence
**Goal**: Package the program into a repeatable operating rhythm
**Depends on**: Phase 4
**Operations**: Publish findings, promote detections, and define the recurring cadence
**Receipts Required**: [published brief, promoted detections, cadence notes]
**Success Criteria**:
  1. The first program output is published
  2. The recurring cadence and owners are documented
**Plans**: 1 plan

Plans:
- [ ] 05-01: Publish the first program brief and cadence

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Environment Mapping | 0/1 | Not started | - |
| 2. Tool & Access Validation | 0/1 | Not started | - |
| 3. Hypothesis Library | 0/1 | Not started | - |
| 4. Pilot Hunts | 0/1 | Not started | - |
| 5. Publish Cadence | 0/1 | Not started | - |
```

</template>

<guidelines>

- Bootstrap should always replace the huntmap title and overview when the program name or high-level goal is already known.
- Bootstrap only scaffolds the program. Do not mark any phase or plan complete.
- Do not write sample query logs or sample receipts during bootstrap.
- Phase 1 should usually feed `.planning/environment/ENVIRONMENT.md`.
- Phase 2 should focus on tool access and query-path validation before evidence collection starts.

</guidelines>
