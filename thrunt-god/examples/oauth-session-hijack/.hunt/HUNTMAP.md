# Huntmap: OAuth Phishing Campaign — acme.corp M365

## Overview

This hunt proceeds from the Defender alert through identity and email telemetry collection, cross-IdP correlation with Okta, and evidence synthesis. The pack `family.oauth-phishing-session-hijack` provides the expected progression pattern against which observations are scored.

## Phases

- [x] **Phase 1: Signal Intake** - Clarify the alert, scope entities, and establish the environment map
- [x] **Phase 2: Telemetry Collection** - Query M365 identity, M365 email/alerts, and Okta for focus entities
- [x] **Phase 3: Evidence Correlation** - Score deviations, test hypotheses, produce findings

## Phase Details

### Phase 1: Signal Intake
**Goal**: Understand the Defender alert, identify all targeted users, establish available telemetry
**Depends on**: Nothing
**Operations**: Review alert metadata, search email logs for related phishing delivery, map environment
**Receipts Required**: Alert metadata, entity list, environment map
**Success Criteria**:
  1. All targeted users identified from email delivery logs
  2. Environment map documents available telemetry surfaces and retention windows
  3. Hypotheses shaped with testable assertions and disproof conditions
**Plans**: 1

Plans:
- [x] 01-01: Ingest Defender alert, search for phishing delivery to other users, map environment

### Phase 2: Telemetry Collection
**Goal**: Collect identity, email, and cross-IdP telemetry for all focus entities with template clustering
**Depends on**: Phase 1
**Operations**: Execute three parallel queries: M365 identity sign-ins, M365 email/alerts, Okta identity logs
**Receipts Required**: Query logs with template clustering results, entity timelines
**Success Criteria**:
  1. M365 identity events collected and clustered into templates
  2. Mailbox rule events identified if they exist
  3. Okta sign-in events collected for cross-IdP correlation
**Plans**: 1

Plans:
- [x] 02-01: Execute QRY-20260328-001 (M365 identity), QRY-20260328-002 (M365 email/alerts), QRY-20260328-003 (Okta identity)

### Phase 3: Evidence Correlation
**Goal**: Score deviations against pack progressions, resolve all hypotheses, produce publishable findings
**Depends on**: Phase 2
**Operations**: Construct entity timelines, apply anomaly framing, match against pack expected_progressions, create receipts
**Receipts Required**: RCT-20260328-001 (HYP-01), RCT-20260328-002 (HYP-02), RCT-20260328-003 (HYP-03)
**Success Criteria**:
  1. All three hypotheses resolved with receipts
  2. Sequential evidence integrity verified (baselines, predictions, scored deviations)
  3. Pack progression match documented
**Plans**: 1

Plans:
- [x] 03-01: Correlate evidence, create receipts, produce findings and evidence review

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Signal Intake | 1/1 | Complete | 2026-03-28 |
| 2. Telemetry Collection | 1/1 | Complete | 2026-03-28 |
| 3. Evidence Correlation | 1/1 | Complete | 2026-03-28 |
