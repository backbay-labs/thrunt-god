# Huntmap Template

Template for `.planning/HUNTMAP.md`.

<template>

```markdown
# Huntmap: TBD

## Overview

TBD

## Phases

- [ ] **Phase 1: Signal Intake** - Clarify the lead, scope, and known facts
- [ ] **Phase 2: Hypothesis Shaping** - Convert suspicion into testable assertions
- [ ] **Phase 3: Swarm Execution** - Collect evidence across telemetry domains
- [ ] **Phase 4: Evidence Correlation** - Reconcile receipts, contradictions, and gaps
- [ ] **Phase 5: Publish** - Deliver the smallest useful report

## Phase Details

### Phase 1: Signal Intake
**Goal**: Clarify the incoming signal, scope boundaries, and known constraints
**Depends on**: Nothing
**Operations**: Review the source lead, capture confirmed facts, and record the most important unknowns
**Receipts Required**: intake notes, alert metadata, scoping facts
**Success Criteria**:
  1. The signal source, scope, and time window are captured or marked `TBD`
  2. Open questions and blockers are recorded before hypothesis work starts
**Plans**: 1 plan

Plans:
- [ ] 01-01: Clarify signal and initial scope

### Phase 2: Hypothesis Shaping
**Goal**: Convert suspicion into explicit, testable hypotheses
**Depends on**: Phase 1
**Operations**: Define assertions, disproof paths, and the data sources required to test each theory
**Receipts Required**: hypothesis artifacts, scope decisions
**Success Criteria**:
  1. At least one falsifiable hypothesis is documented or the lack of one is explained
  2. Required data sources and disproof conditions are explicit
**Plans**: 1 plan

Plans:
- [ ] 02-01: Shape the first testable hypotheses

### Phase 3: Swarm Execution
**Goal**: Collect the evidence needed to support or disprove the active hypotheses
**Depends on**: Phase 2
**Operations**: Run queries across the confirmed telemetry surfaces and record real evidence receipts
**Receipts Required**: query logs, evidence receipts
**Success Criteria**:
  1. Real query logs exist for each material investigation step
  2. Supporting and contradictory evidence are both recorded when present
  3. Missing telemetry or access blockers are documented explicitly
**Plans**: 1 plan

Plans:
- [ ] 03-01: Execute the first evidence collection wave

### Phase 4: Evidence Correlation
**Goal**: Reconcile receipts, contradictions, and residual gaps
**Depends on**: Phase 3
**Operations**: Correlate findings, resolve conflicts, and isolate what remains unknown
**Receipts Required**: correlation notes, final evidence set
**Success Criteria**:
  1. The evidence set supports a coherent conclusion or a clearly bounded inconclusive result
  2. Confidence and remaining blind spots are documented
**Plans**: 1 plan

Plans:
- [ ] 04-01: Correlate evidence and contradictions

### Phase 5: Publish
**Goal**: Deliver the smallest useful report, escalation, or follow-up package
**Depends on**: Phase 4
**Operations**: Produce the final report, escalation, or detection follow-up based on the evidence
**Receipts Required**: final findings, publish artifact
**Success Criteria**:
  1. The final output states scope, confidence, and recommended next actions
  2. Every material claim is backed by receipts or explicitly marked as unknown
**Plans**: 1 plan

Plans:
- [ ] 05-01: Publish the first useful output

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Signal Intake | 0/1 | Not started | - |
| 2. Hypothesis Shaping | 0/1 | Not started | - |
| 3. Swarm Execution | 0/1 | Not started | - |
| 4. Evidence Correlation | 0/1 | Not started | - |
| 5. Publish | 0/1 | Not started | - |
```

</template>

<guidelines>

- Bootstrap should always replace the huntmap title and overview when the case name or signal is already known.
- Keep phase names operational.
- Each phase should produce evidence, decisions, or a publishable artifact.

</guidelines>
