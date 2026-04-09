# Huntmap: Meridian Identity Abuse Program

## Overview

This program workspace keeps a completed identity-abuse case in the same structure used by the updated CLI and VS Code extension. The root artifacts describe the program context, while the child case holds the investigation record, findings, receipts, and published output.

## Phases

- [x] **Phase 1: Program Intake** - Define the identity-abuse focus area and expected review surfaces
- [x] **Phase 2: Case Execution** - Preserve the closed brute-force case with full artifacts and receipts
- [x] **Phase 3: Program Closeout** - Record case roster metadata, technique coverage, and published findings state

## Phase Details

### Phase 1: Program Intake
**Goal**: Establish a program-level home for Meridian identity-abuse investigations
**Depends on**: Nothing
**Operations**: Define scope, owner, and expected child-case structure
**Receipts Required**: Program MISSION.md, program HUNTMAP.md
**Success Criteria**:
  1. Program root parses cleanly in the extension
  2. The workspace advertises one clear security theme
**Plans**: 1

Plans:
- [x] 01-01: Define the Meridian identity-abuse program shell

### Phase 2: Case Execution
**Goal**: Keep the brute-force investigation as a real child case
**Depends on**: Phase 1
**Operations**: Store mission, hypotheses, queries, receipts, findings, and evidence review under `cases/brute-force-to-persistence`
**Receipts Required**: Case artifacts and published findings
**Success Criteria**:
  1. Child hunt discovery finds the case from `cases/<slug>/MISSION.md`
  2. The case exposes published findings and technique frontmatter
**Plans**: 1

Plans:
- [x] 02-01: Preserve the closed brute-force case under the new case path

### Phase 3: Program Closeout
**Goal**: Surface rollup metadata for dashboard testing
**Depends on**: Phase 2
**Operations**: Populate `case_roster`, active-case pointer, and program state summary
**Receipts Required**: Program STATE.md
**Success Criteria**:
  1. Program Dashboard shows one closed published case
  2. Technique counts match the case frontmatter
**Plans**: 1

Plans:
- [x] 03-01: Write rollup-ready program state metadata
