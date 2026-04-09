# Huntmap: acme.corp OAuth Abuse Response Program

## Overview

This program workspace keeps a closed OAuth abuse case under `cases/oauth-session-hijack` and records the rollup metadata the new extension views expect. The root artifacts provide program context, while the child case preserves the investigation details.

## Phases

- [x] **Phase 1: Program Intake** - Define the OAuth abuse response scope and root artifacts
- [x] **Phase 2: Case Preservation** - Keep the completed case as a child hunt with published findings
- [x] **Phase 3: Rollup Readiness** - Record case roster and technique metadata for dashboard testing

## Phase Details

### Phase 1: Program Intake
**Goal**: Establish a program root for OAuth abuse investigations
**Depends on**: Nothing
**Operations**: Document signal, owner, scope, and child-case expectations
**Receipts Required**: Program MISSION.md, program HUNTMAP.md
**Success Criteria**:
  1. Program mission and huntmap parse cleanly
  2. The workspace clearly frames OAuth abuse as the security theme
**Plans**: 1

Plans:
- [x] 01-01: Define the acme.corp OAuth abuse response program

### Phase 2: Case Preservation
**Goal**: Keep the finished OAuth phishing investigation as a child case
**Depends on**: Phase 1
**Operations**: Store mission, hypotheses, queries, receipts, findings, and published findings under `cases/oauth-session-hijack`
**Receipts Required**: Case artifacts and published findings
**Success Criteria**:
  1. Child hunt discovery finds the case
  2. The case shows as published in the dashboard
**Plans**: 1

Plans:
- [x] 02-01: Preserve the closed OAuth case under the new case path

### Phase 3: Rollup Readiness
**Goal**: Expose technique and status metadata at the program layer
**Depends on**: Phase 2
**Operations**: Populate `case_roster`, `.active-case`, and a parseable program state summary
**Receipts Required**: Program STATE.md
**Success Criteria**:
  1. Program Dashboard shows one closed published case
  2. Technique counts match the case frontmatter
**Plans**: 1

Plans:
- [x] 03-01: Write rollup-ready program state metadata
