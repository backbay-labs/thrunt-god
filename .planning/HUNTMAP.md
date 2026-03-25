# Huntmap: THRUNT GOD Platform Expansion

## Overview

Turn THRUNT from a strong hunt-orchestration substrate into a full threat hunting platform. The dependency path is deliberate: establish a normalized query runtime first, layer reusable hunt packs on top, make evidence defensible, turn findings into durable detections, and finally use historical outcomes to improve future hunts automatically.

## Milestones

- ✅ **v1.0 Query Runtime & Connector SDK** — Archived 2026-03-25
- ✅ **v1.1 Hunt Packs & Technique Packs** — Archived 2026-03-25
- 🚧 **v1.2 Evidence Integrity & Provenance** — Phases 12-16 (in progress)
- 📋 **v1.3 Detection Promotion Pipeline** — Phases 17-19 (planned)
- 📋 **v1.4 Hunt Learning & Recommendation Engine** — Phases 20-22 (planned)

## ✅ v1.0 Query Runtime & Connector SDK (Archived)

**Status:** Shipped 2026-03-25
**Archive:** `.planning/milestones/v1.0-HUNTMAP.md`
**Audit:** `.planning/milestones/v1.0-MILESTONE-AUDIT.md`

Delivered:
- normalized query runtime contract and execution engine
- built-in connectors for Splunk, Elastic, Sentinel, Okta, M365, CrowdStrike, AWS, and GCP
- runtime-backed connector discovery and execution CLI with query-log and receipt emission

See the archived huntmap and archived phase summaries for full phase detail.

## ✅ v1.1 Hunt Packs & Technique Packs (Archived)

**Status:** Shipped 2026-03-25
**Archive:** `.planning/milestones/v1.1-HUNTMAP.md`
**Audit:** `.planning/milestones/v1.1-MILESTONE-AUDIT.md`
**Archived Phases:** `.planning/milestones/v1.1-phases/`

Delivered:
- canonical pack schema, registry, and fail-closed parameter validation
- shipped ATT&CK technique packs plus composed domain and threat-family packs
- pack-powered bootstrap and runtime execution through the shared `QuerySpec` runtime
- maintainer pack lint, smoke-test, and local authoring workflow

See the archived huntmap, milestone audit, and archived phase summaries for full phase detail.

## 📋 v1.2 Evidence Integrity & Provenance (Planned)

### Milestone Outcome

THRUNT can certify connector readiness against live backends, then turn the resulting receipts into hashable, exportable, provenance-rich evidence suitable for higher-trust publication and handoff workflows.

### Phases

- [x] **Phase 12: Connector Certification & Live Readiness** - Prove configured connectors can preflight and smoke-test against real backends safely (completed 2026-03-25)
- [ ] **Phase 13: Receipt Manifest Canonicalization** - Standardize query logs, receipts, and evidence manifests
- [ ] **Phase 14: Hashing, Signatures & Provenance** - Add tamper-evident integrity and signer metadata
- [ ] **Phase 15: Evidence Export Bundles** - Package findings, receipts, and chain-of-custody data for handoff
- [ ] **Phase 16: Evidence Review & Publish Gates** - Make publication and escalation depend on evidence quality

### Phase 12: Connector Certification & Live Readiness
**Goal**: Add an operator-visible trust layer proving configured connectors can preflight and smoke-test against real backends safely
**Depends on**: Phase 11
**Hypotheses**: [HYP-01]
**Operations**: readiness scoring, doctor UX, live smoke execution, profile-defined smoke specs, connector certification docs
**Receipts Required**: readiness report schema, live smoke examples, connector certification docs
**Success Criteria**:
  1. THRUNT exposes `runtime doctor` and `runtime smoke` so operators can certify a connector before trusting hunt output.
  2. Connectors without a shipped safe smoke query can define `connector_profiles.<connector>.<profile>.smoke_test`.
  3. Readiness output distinguishes unconfigured, ready, and live-verified connectors with a defensible score and per-check detail.
**Plans**: 1/1 complete

Plans:
- [x] 12-01: Build connector doctor, live smoke execution, readiness scoring, and profile-defined smoke specs (completed 2026-03-25)

### Phase 13: Receipt Manifest Canonicalization
**Goal**: Standardize the evidence objects that every execution and publication flow depends on
**Depends on**: Phase 12
**Hypotheses**: [HYP-03]
**Operations**: receipt schema, query log schema, evidence manifest schema, canonical serialization
**Receipts Required**: schema docs, manifest examples, canonicalization rules
**Success Criteria**:
  1. THRUNT has one canonical manifest format linking findings to queries and receipts.
  2. Query logs and receipts can be serialized consistently across connectors and packs.
  3. Evidence objects preserve enough metadata for later integrity and handoff steps.
**Plans**: 1/1 planned

Plans:
- [ ] 13-01: Canonicalize receipt, query log, and evidence manifest schemas

### Phase 14: Hashing, Signatures & Provenance
**Goal**: Make evidence tamper-evident and attributable
**Depends on**: Phase 13
**Hypotheses**: [HYP-03]
**Operations**: hashing strategy, optional signatures, provenance metadata, signer/runner identity model
**Receipts Required**: hash strategy ADR, provenance fields, signature workflow notes
**Success Criteria**:
  1. Material evidence artifacts can be hashed deterministically.
  2. THRUNT can record who executed, generated, or signed a receipt bundle.
  3. Integrity failures can be detected and surfaced clearly in review flows.
**Plans**: 1/1 planned

Plans:
- [ ] 14-01: Add deterministic hashing, provenance metadata, and signing hooks

### Phase 15: Evidence Export Bundles
**Goal**: Package evidence for handoff without losing provenance or context
**Depends on**: Phase 14
**Hypotheses**: [HYP-03]
**Operations**: export packaging, manifest bundling, case handoff bundle design, integrity verification tools
**Receipts Required**: export bundle spec, verification examples, bundle inventory outputs
**Success Criteria**:
  1. THRUNT can export findings, receipts, and manifests as a coherent bundle.
  2. Bundles can be verified later for completeness and integrity.
  3. Bundle contents are usable by IR, escalation, or audit consumers without raw runtime context.
**Plans**: 1/1 planned

Plans:
- [ ] 15-01: Build export bundles and bundle verification tooling

### Phase 16: Evidence Review & Publish Gates
**Goal**: Make publication quality depend on evidence quality instead of optimism
**Depends on**: Phase 15
**Hypotheses**: [HYP-03]
**Operations**: evidence review logic, publish gating, escalation gating, contradiction handling, chain-of-custody surfacing
**Receipts Required**: review checklist updates, publish gate logic, contradiction examples
**Success Criteria**:
  1. Publication and escalation workflows can block on missing or weak evidence.
  2. Contradictory evidence and blind spots are surfaced explicitly in the review flow.
  3. Chain-of-custody details are visible enough for downstream trust decisions.
**Plans**: 1/1 planned

Plans:
- [ ] 16-01: Wire evidence quality gates into review, publish, and escalation flows

## 📋 v1.3 Detection Promotion Pipeline (Planned)

### Milestone Outcome

THRUNT can turn validated findings into tested detection candidates instead of stopping at narrative output.

### Phases

- [ ] **Phase 17: Detection Mapping Model** - Define how findings, evidence, and hypotheses map to detection candidates
- [ ] **Phase 18: Detection Generation & Backtesting** - Generate detection content and validate it against historical data
- [ ] **Phase 19: Promotion Workflow & Integrations** - Promote tested detections into target content systems

### Phase 17: Detection Mapping Model
**Goal**: Formalize the bridge between THRUNT findings and detection engineering outputs
**Depends on**: Phase 16
**Hypotheses**: [HYP-04]
**Operations**: finding-to-detection mapping, candidate scoring, detection metadata model, evidence linkage
**Receipts Required**: detection mapping schema, candidate examples, promotion guardrails
**Success Criteria**:
  1. Findings can be translated into structured detection candidates with explicit source evidence.
  2. THRUNT can represent target detection formats and required metadata without collapsing into one backend.
  3. Candidate detections carry enough context to explain why they exist and what evidence supports them.
**Plans**: 1/1 planned

Plans:
- [ ] 17-01: Define the findings-to-detection mapping and candidate model

### Phase 18: Detection Generation & Backtesting
**Goal**: Prove generated detections before promotion
**Depends on**: Phase 17
**Hypotheses**: [HYP-04]
**Operations**: rule generation templates, backtesting workflow, shadow-mode expectations, noise evaluation
**Receipts Required**: generated rule examples, backtest outputs, scoring criteria
**Success Criteria**:
  1. THRUNT can generate at least one set of detection candidates from validated findings.
  2. Detection candidates can be backtested or shadow-tested before promotion.
  3. Backtest results feed directly into promotion decisions instead of becoming side notes.
**Plans**: 1/1 planned

Plans:
- [ ] 18-01: Generate detection candidates and add backtesting/shadow-mode evaluation

### Phase 19: Promotion Workflow & Integrations
**Goal**: Move good detections into operational systems with explicit gates and receipts
**Depends on**: Phase 18
**Hypotheses**: [HYP-04]
**Operations**: promotion workflow, approval gates, registry/export integrations, detection publication receipts
**Receipts Required**: promotion flow docs, approval artifacts, published detection receipts
**Success Criteria**:
  1. THRUNT can promote passing detection candidates into target content systems or export formats.
  2. Promotion captures approval state, provenance, and publication receipts.
  3. Detection promotion failures or caveats are surfaced clearly back into findings and evidence review.
**Plans**: 1/1 planned

Plans:
- [ ] 19-01: Build promotion workflows and target detection content integrations

## 📋 v1.4 Hunt Learning & Recommendation Engine (Planned)

### Milestone Outcome

THRUNT uses historical hunt outcomes to prioritize better packs, hypotheses, and execution paths instead of treating every hunt as stateless.

### Phases

- [ ] **Phase 20: Hunt Telemetry & Metrics Store** - Record yield, noise, duration, outcomes, and connector-level metrics
- [ ] **Phase 21: Outcome Scoring & Analyst Feedback** - Score hunts and packs using evidence outcomes plus explicit analyst feedback
- [ ] **Phase 22: Recommendation Engine & Adaptive Planning** - Feed scoring back into pack selection, routing, and planning

### Phase 20: Hunt Telemetry & Metrics Store
**Goal**: Capture the raw historical data needed for learning
**Depends on**: Phase 19
**Hypotheses**: [HYP-05]
**Operations**: metrics model, outcome logging, pack/connector performance capture, telemetry storage strategy
**Receipts Required**: metrics schema, scoring inputs inventory, historical record examples
**Success Criteria**:
  1. THRUNT records hunt duration, connector usage, pack usage, evidence yield, and final outcome.
  2. Metrics are linked back to hypotheses, packs, and detections rather than stored as disconnected logs.
  3. The product can answer which hunts were high-yield, noisy, or inconclusive over time.
**Plans**: 1/1 planned

Plans:
- [ ] 20-01: Build the hunt metrics and outcome recording layer

### Phase 21: Outcome Scoring & Analyst Feedback
**Goal**: Turn raw history into useful quality signals
**Depends on**: Phase 20
**Hypotheses**: [HYP-05]
**Operations**: scoring model, false-positive tracking, analyst feedback capture, confidence recalibration
**Receipts Required**: scoring rubric, feedback schema, scoring examples
**Success Criteria**:
  1. THRUNT can score packs, hypotheses, or connectors using objective outcome data plus analyst feedback.
  2. False positives and low-yield hunts are captured explicitly and affect future scoring.
  3. Analysts can correct or annotate scores instead of living with opaque automation.
**Plans**: 1/1 planned

Plans:
- [ ] 21-01: Implement scoring logic and analyst feedback capture

### Phase 22: Recommendation Engine & Adaptive Planning
**Goal**: Use learning outputs to change what THRUNT recommends and how it plans
**Depends on**: Phase 21
**Hypotheses**: [HYP-05]
**Operations**: recommendation logic, adaptive pack ranking, planning hints, operator-facing learning UX
**Receipts Required**: recommendation examples, adaptive planning rules, ranking outputs
**Success Criteria**:
  1. THRUNT can recommend packs, hypotheses, or connectors based on prior outcomes.
  2. Planning and routing surfaces can use learned rankings without hiding the reasoning.
  3. Recommendation quality can be audited and tuned over time.
**Plans**: 1/1 planned

Plans:
- [ ] 22-01: Build adaptive recommendations into pack selection and planning
