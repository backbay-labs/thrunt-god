# Huntmap: Meridian Brute Force to Persistence

## Overview

This hunt follows a four-phase progression from signal intake through evidence synthesis. The initial Okta brute-force alert drives identity telemetry collection (spray analysis and post-compromise timeline), which pivots into cloud telemetry (SharePoint access patterns), culminating in correlated findings with anomaly-framed deviation scores.

## Phases

- [x] **Phase 1: Signal Intake** - Clarify the Okta alert, scope entities, map telemetry surfaces
- [x] **Phase 2: Identity Telemetry** - Query Okta for spray pattern and david.park post-compromise activity
- [x] **Phase 3: Endpoint Correlation** - Query M365 for SharePoint access and check other account status
- [x] **Phase 4: Evidence Synthesis** - Correlate receipts, apply anomaly framing, produce findings

## Phase Details

### Phase 1: Signal Intake
**Goal**: Understand the Okta alert, identify all targeted accounts, scope the investigation
**Depends on**: Nothing
**Operations**: Parse alert metadata, enumerate targeted accounts, map available telemetry
**Receipts Required**: MISSION.md, ENVIRONMENT.md, initial entity list
**Success Criteria**:
  1. All 15 targeted accounts identified with UPNs
  2. Time window established with buffer
  3. Telemetry surfaces mapped with retention windows
**Plans**: 1

Plans:
- [x] 01-01: Parse Okta alert and establish scope

### Phase 2: Identity Telemetry
**Goal**: Collect and cluster authentication events to confirm spray pattern and identify compromised accounts
**Depends on**: Phase 1
**Operations**: Okta System Log queries for failed/successful auth events, template clustering via Drain, entity timeline construction for david.park
**Receipts Required**: QRY-20260329-001, QRY-20260329-002, RCT-20260329-001, RCT-20260329-002
**Success Criteria**:
  1. Authentication events clustered into structural templates (templates >= 3)
  2. Spray pattern confirmed or disproved with receipt
  3. Compromised account(s) identified with post-auth timeline
  4. Deduplication applied to paginated results
**Plans**: 2

Plans:
- [x] 02-01: Query Okta for spray-window authentication events
- [x] 02-02: Query Okta for david.park post-compromise activity

### Phase 3: Endpoint Correlation
**Goal**: Determine what the attacker accessed after compromising david.park, and verify other accounts
**Depends on**: Phase 2
**Operations**: M365 UAL query for SharePoint file operations, Okta query for remaining 14 accounts
**Receipts Required**: QRY-20260329-003, RCT-20260329-003, RCT-20260329-004
**Success Criteria**:
  1. SharePoint access events collected and clustered
  2. Sensitive file access identified with file names and timestamps
  3. All 14 other accounts verified as not compromised
**Plans**: 2

Plans:
- [x] 03-01: Query M365 for david.park SharePoint activity
- [x] 03-02: Verify status of remaining 14 targeted accounts

### Phase 4: Evidence Synthesis
**Goal**: Correlate all receipts, apply anomaly framing scores, produce actionable findings
**Depends on**: Phase 3
**Operations**: Entity timeline correlation across identity and cloud surfaces, sequential prediction scoring, findings generation, evidence review
**Receipts Required**: FINDINGS.md, EVIDENCE_REVIEW.md
**Success Criteria**:
  1. All hypothesis verdicts supported by receipts with deviation scores
  2. Attack timeline reconstructed with cross-surface correlation
  3. Blind spots documented
  4. Recommendations actionable
**Plans**: 1

Plans:
- [x] 04-01: Synthesize findings and validate evidence

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Signal Intake | 1/1 | Complete | 2026-03-29 |
| 2. Identity Telemetry | 2/2 | Complete | 2026-03-29 |
| 3. Endpoint Correlation | 2/2 | Complete | 2026-03-29 |
| 4. Evidence Synthesis | 1/1 | Complete | 2026-03-29 |
