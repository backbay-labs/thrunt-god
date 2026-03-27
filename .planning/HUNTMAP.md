# Huntmap: THRUNT GOD Platform Expansion

## Overview

Turn THRUNT from a strong hunt-orchestration substrate into a full threat hunting platform. The dependency path is deliberate: establish a normalized query runtime first, layer reusable hunt packs on top, make evidence defensible, turn findings into durable detections, and finally use historical outcomes to improve future hunts automatically.

## Milestones

- ✅ **v1.0 Query Runtime & Connector SDK** — Archived 2026-03-25
- ✅ **v1.1 Hunt Packs & Technique Packs** — Archived 2026-03-25
- ✅ **v1.2 Evidence Integrity & Provenance** — Archived 2026-03-27
- 🚧 **v1.3 Detection Promotion Pipeline** — Phases 17-19 (in progress)
- 📋 **v1.4 Hunt Learning & Recommendation Engine** — Phases 20-22 (planned)
- 📋 **v1.5 Live Connector Ecosystem** — Phases 23-26 (planned)
- 📋 **v1.6 Interactive Hunt Replay & Case Gallery** — Phases 27-30 (planned)
- 📋 **v1.7 Hunt-as-Code & Continuous Hunting** — Phases 31-34 (planned)
- 📋 **v1.8 Collaborative Hunting (Multi-Analyst)** — Phases 35-38 (planned)
- 📋 **v1.9 Metrics Dashboard & Hunt Program Analytics** — Phases 39-42 (planned)
- 📋 **v2.0 Threat Intelligence Integration** — Phases 43-46 (planned)

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

## ✅ v1.2 Evidence Integrity & Provenance (Archived)

**Status:** Shipped 2026-03-27
**Archive:** `.planning/milestones/v1.2-HUNTMAP.md`
**Audit:** `.planning/milestones/v1.2-MILESTONE-AUDIT.md`

Delivered:
- canonical EvidenceManifest format with deterministic serialization and SHA-256 content hashing
- manifest-level integrity hashing, agent-based provenance, and signature hooks
- zero-dependency ZIP export bundles with chain-of-custody and redaction
- evidence quality scoring with configurable publish gates, contradiction/blind-spot detection
- connector certification with readiness scoring and live smoke testing

See the archived huntmap and phase summaries for full phase detail.

## 📋 v1.3 Detection Promotion Pipeline (Planned)

### Milestone Outcome

THRUNT can turn validated findings into tested detection candidates instead of stopping at narrative output.

### Phases

- [x] **Phase 17: Detection Mapping Model** - Define how findings, evidence, and hypotheses map to detection candidates (completed 2026-03-27)
- [x] **Phase 18: Detection Generation & Backtesting** - Generate detection content and validate it against historical data (completed 2026-03-27)
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
- [x] 17-01: Define the findings-to-detection mapping and candidate model

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
- [x] 18-01: Rule generation pipeline, structural validation, noise scoring, and backtest framework with CLI

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
- [ ] 19-01: Three-gate promotion engine, rejection workflow, status CLI, hooks, config, and evidence quality feedback

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

## 📋 v1.5 Live Connector Ecosystem (Planned)

### Milestone Outcome

THRUNT connectors ship as standalone npm packages (`@thrunt/connector-*`) with a community registry, enabling anyone to install, configure, and hunt against real telemetry backends without modifying THRUNT core.

### Phases

- [ ] **Phase 23: Connector Package Architecture & npm Scaffolding** - Extract connector logic into standalone publishable packages with shared testing harness
- [ ] **Phase 24: Core SIEM Connector Packages (Splunk, Elastic, Sentinel)** - Ship the three highest-demand SIEM connectors as independent npm packages
- [ ] **Phase 25: Extended Connector Packages (CrowdStrike, Okta, AWS, GCP)** - Ship endpoint, identity, and cloud connectors as npm packages
- [ ] **Phase 26: Community Connector Registry & Discovery** - Build connector discovery, validation, and community contribution pipeline

### Phase 23: Connector Package Architecture & npm Scaffolding
**Goal**: Define the package boundary, shared test harness, and publishing pipeline for standalone connector packages
**Depends on**: Phase 22
**Hypotheses**: [HYP-06]
**Operations**: monorepo scaffolding, package template, shared test fixtures, CI/CD for multi-package publishing, connector interface extraction
**Receipts Required**: package template, interface contract, test harness docs, publishing pipeline config
**Success Criteria**:
  1. A connector author can scaffold a new `@thrunt/connector-*` package from a template and have tests, linting, and publishing work out of the box.
  2. The shared interface contract enforces QuerySpec compliance, auth patterns, and result envelope normalization.
  3. Connector packages can be installed independently without pulling THRUNT core as a dependency.
**Plans**: 1/1 planned

Plans:
- [ ] 23-01: Design connector package architecture, shared interface, test harness, and npm publishing pipeline

### Phase 24: Core SIEM Connector Packages (Splunk, Elastic, Sentinel)
**Goal**: Ship the three highest-demand SIEM connectors as production-grade npm packages
**Depends on**: Phase 23
**Hypotheses**: [HYP-06]
**Operations**: Splunk connector extraction, Elastic connector extraction, Sentinel connector extraction, integration tests, README and auth docs per package
**Receipts Required**: published packages, integration test results, auth configuration guides
**Success Criteria**:
  1. `npm install @thrunt/connector-splunk` (and elastic, sentinel) works and connects to a real backend with minimal configuration.
  2. Each connector passes the shared certification test suite (doctor, smoke, live query).
  3. Each package includes auth documentation, example queries, and known limitations.
**Plans**: 1/1 planned

Plans:
- [ ] 24-01: Extract, test, and publish Splunk, Elastic, and Sentinel connector packages

### Phase 25: Extended Connector Packages (CrowdStrike, Okta, AWS, GCP)
**Goal**: Expand the ecosystem to cover endpoint, identity, and cloud investigation surfaces
**Depends on**: Phase 24
**Hypotheses**: [HYP-06]
**Operations**: CrowdStrike connector package, Okta connector package, AWS CloudTrail/GuardDuty package, GCP Chronicle/Audit package, integration tests
**Receipts Required**: published packages, certification results, cross-connector query examples
**Success Criteria**:
  1. Hunters can run cross-surface investigations (SIEM + identity + endpoint + cloud) using only npm-installed connector packages.
  2. All extended connectors pass the shared certification suite.
  3. Pack queries that reference these connectors resolve correctly at runtime.
**Plans**: 1/1 planned

Plans:
- [ ] 25-01: Extract, test, and publish CrowdStrike, Okta, AWS, and GCP connector packages

### Phase 26: Community Connector Registry & Discovery
**Goal**: Enable the community to build, share, and discover connectors without gatekeeping
**Depends on**: Phase 25
**Hypotheses**: [HYP-06]
**Operations**: registry index format, connector validation CLI, discovery command, contribution guide, connector quality scoring
**Receipts Required**: registry spec, validation CLI, `/hunt:connectors` command, contribution docs
**Success Criteria**:
  1. Third-party connectors can be registered, discovered, and installed through a standard discovery flow.
  2. A validation CLI can certify that a community connector meets the interface contract before publication.
  3. THRUNT can list available connectors (installed + registry) and show readiness status for each.
**Plans**: 1/1 planned

Plans:
- [ ] 26-01: Build connector registry, validation CLI, discovery command, and community contribution pipeline

## 📋 v1.6 Interactive Hunt Replay & Case Gallery (Planned)

### Milestone Outcome

Completed hunts can be replayed as interactive, navigable timelines in a web viewer — serving as training tools, compliance artifacts, and public showcases of THRUNT's capabilities.

### Phases

- [ ] **Phase 27: Hunt Artifact Serialization & Timeline Model** - Define the data model that transforms hunt artifacts into a replayable timeline
- [ ] **Phase 28: Web-Based Hunt Replay Viewer** - Build a standalone web viewer that renders hunt timelines with full evidence navigation
- [ ] **Phase 29: Case Gallery & Public Hunt Showcase** - Create a gallery of curated hunt cases for training, marketing, and community
- [ ] **Phase 30: Training Mode & Guided Walkthroughs** - Add guided walkthrough annotations and quiz-style training overlays

### Phase 27: Hunt Artifact Serialization & Timeline Model
**Goal**: Transform hunt artifacts (mission, hypotheses, queries, receipts, findings) into a structured, replayable timeline format
**Depends on**: Phase 26
**Hypotheses**: [HYP-07]
**Operations**: timeline event schema, artifact-to-event mapping, evidence linkage in timeline, export format (JSON), redaction support
**Receipts Required**: timeline schema spec, example timeline export, redaction rules
**Success Criteria**:
  1. Any completed hunt can be serialized into a timeline JSON that preserves event ordering, evidence links, and hypothesis evolution.
  2. Sensitive data can be redacted at export time without breaking timeline navigability.
  3. The timeline format is self-contained — a viewer can render it without access to the original `.planning/` directory.
**Plans**: 1/1 planned

Plans:
- [ ] 27-01: Design and implement the hunt timeline serialization model and export format

### Phase 28: Web-Based Hunt Replay Viewer
**Goal**: Build a standalone web application that renders hunt timelines as interactive, navigable investigations
**Depends on**: Phase 27
**Hypotheses**: [HYP-07]
**Operations**: React/Vite web app, timeline visualization, evidence drill-down, query replay view, hypothesis tree, findings summary
**Receipts Required**: deployed viewer, screenshot walkthrough, timeline import/export
**Success Criteria**:
  1. A user can load a timeline JSON and navigate the full investigation — from signal to findings — in a web browser.
  2. Evidence drill-down shows the exact query, result, and receipt for each finding.
  3. The viewer works as a static site (no backend required) and can be hosted anywhere.
**Plans**: 1/1 planned

Plans:
- [ ] 28-01: Build the interactive web-based hunt replay viewer

### Phase 29: Case Gallery & Public Hunt Showcase
**Goal**: Create a curated gallery of example hunts that demonstrates THRUNT's capabilities and trains new analysts
**Depends on**: Phase 28
**Hypotheses**: [HYP-07]
**Operations**: gallery site, case curation pipeline, case metadata (difficulty, techniques, outcomes), search and filter UX, community submission flow
**Receipts Required**: gallery site, curated case set, submission guidelines
**Success Criteria**:
  1. A public gallery hosts at least 5 curated hunt cases spanning different techniques and domains.
  2. Each case is tagged with difficulty level, MITRE techniques, and outcome type for discoverability.
  3. Community members can submit redacted cases for inclusion through a structured process.
**Plans**: 1/1 planned

Plans:
- [ ] 29-01: Build the case gallery site with curation pipeline and community submission flow

### Phase 30: Training Mode & Guided Walkthroughs
**Goal**: Transform hunt replays into structured learning experiences with annotations, decision points, and assessment
**Depends on**: Phase 29
**Hypotheses**: [HYP-07]
**Operations**: annotation layer, decision-point markers, quiz overlay, progress tracking, instructor authoring tools
**Receipts Required**: training mode spec, annotated example case, quiz framework
**Success Criteria**:
  1. Instructors can annotate a hunt replay with decision-point explanations, alternative paths, and assessment questions.
  2. Trainees can step through an annotated hunt and test their understanding at key decision points.
  3. Training progress is tracked locally without requiring a backend account system.
**Plans**: 1/1 planned

Plans:
- [ ] 30-01: Build training mode with annotations, decision-point markers, and assessment overlays

## 📋 v1.7 Hunt-as-Code & Continuous Hunting (Planned)

### Milestone Outcome

Teams can version-control full hunt playbooks as `.thrunt` files, run them in CI/CD pipelines, and operate continuous hunting programs that execute on schedule — making THRUNT the first "CI/CD for threat hunting" platform.

### Phases

- [ ] **Phase 31: .thrunt File Format & Playbook Schema** - Define the declarative hunt playbook format that captures hypothesis, environment, queries, and expected outcomes
- [ ] **Phase 32: Playbook Versioning & Repository Model** - Enable teams to version, share, and compose hunt playbooks in git repositories
- [ ] **Phase 33: CI/CD Integration & Scheduled Hunts** - Run hunt playbooks as CI/CD pipeline steps with structured output and alerting
- [ ] **Phase 34: Continuous Hunting Pipeline & Drift Detection** - Operate standing hunt programs that execute on schedule and detect environment drift

### Phase 31: .thrunt File Format & Playbook Schema
**Goal**: Define a declarative file format that captures everything needed to execute a hunt without interactive input
**Depends on**: Phase 26
**Hypotheses**: [HYP-08]
**Operations**: file format spec, schema validation, hypothesis encoding, environment assumptions, query templates, expected outcomes, parameter system
**Receipts Required**: format spec, JSON schema, example playbooks, validation CLI
**Success Criteria**:
  1. A `.thrunt` file can encode hypothesis, environment requirements, query templates, expected outcomes, and success criteria in one declarative document.
  2. The schema is validated at parse time — invalid playbooks fail fast with clear error messages.
  3. Playbooks support parameterization for environment-specific values (tenants, time windows, connector configs).
**Plans**: 1/1 planned

Plans:
- [ ] 31-01: Design and implement the .thrunt file format, schema, and validation

### Phase 32: Playbook Versioning & Repository Model
**Goal**: Enable teams to manage hunt playbooks as versioned, composable artifacts in git repositories
**Depends on**: Phase 31
**Hypotheses**: [HYP-08]
**Operations**: playbook repository structure, version tracking, dependency resolution, composition (import/extend), team sharing workflow
**Receipts Required**: repo template, versioning spec, composition examples, team sharing guide
**Success Criteria**:
  1. Hunt playbooks can be stored in a git repository with semantic versioning and changelogs.
  2. Playbooks can import and extend other playbooks (composition) without copy-paste.
  3. Teams can share playbook repositories and override environment-specific parameters locally.
**Plans**: 1/1 planned

Plans:
- [ ] 32-01: Build playbook versioning, composition, and repository model

### Phase 33: CI/CD Integration & Scheduled Hunts
**Goal**: Run hunt playbooks as automated pipeline steps with structured output, pass/fail gates, and alerting
**Depends on**: Phase 32
**Hypotheses**: [HYP-08]
**Operations**: CLI runner mode, GitHub Actions integration, GitLab CI integration, structured output (SARIF, JSON), alerting hooks, schedule triggers
**Receipts Required**: CI runner, GitHub Action, output format spec, alerting docs
**Success Criteria**:
  1. `thrunt run --playbook <file>` can execute a hunt non-interactively and produce structured output with exit codes.
  2. A GitHub Action (or equivalent) can run hunt playbooks on schedule or on trigger with findings reported as PR annotations or issues.
  3. Alerting hooks notify teams when a scheduled hunt produces findings above a configured severity threshold.
**Plans**: 1/1 planned

Plans:
- [ ] 33-01: Build CI/CD runner, GitHub Action, structured output, and alerting hooks

### Phase 34: Continuous Hunting Pipeline & Drift Detection
**Goal**: Operate standing hunt programs that run on schedule and detect when environment assumptions drift
**Depends on**: Phase 33
**Hypotheses**: [HYP-08]
**Operations**: pipeline definition format, scheduling engine, environment drift detection, baseline comparison, hunt program dashboard, alert fatigue management
**Receipts Required**: pipeline spec, drift detection rules, baseline comparison examples, dashboard mockup
**Success Criteria**:
  1. Teams can define continuous hunting pipelines that run specific playbooks on recurring schedules.
  2. The system detects when environment assumptions in playbooks no longer hold (telemetry gaps, retention changes, schema drift) and alerts the hunt program owner.
  3. Findings from recurring hunts are compared against baselines to surface net-new results and suppress known-good patterns.
**Plans**: 1/1 planned

Plans:
- [ ] 34-01: Build continuous hunting pipeline engine with drift detection and baseline comparison

## 📋 v1.8 Collaborative Hunting (Multi-Analyst) (Planned)

### Milestone Outcome

Multiple analysts can work the same hunt simultaneously — splitting investigation workstreams, merging findings with conflict detection, and handing off work cleanly — turning THRUNT from a solo tool into a team platform.

### Phases

- [ ] **Phase 35: Multi-Analyst Workstream Architecture** - Define how parallel investigation branches coexist within one hunt case
- [ ] **Phase 36: Findings Merge & Conflict Detection** - Merge evidence and findings from parallel workstreams with automated conflict surfacing
- [ ] **Phase 37: Hunt Assignment & Handoff Protocol** - Enable structured assignment of investigation pivots and clean analyst-to-analyst handoffs
- [ ] **Phase 38: Shared Investigation State & Presence** - Give analysts real-time visibility into who is investigating what

### Phase 35: Multi-Analyst Workstream Architecture
**Goal**: Define the branching model that lets multiple analysts investigate different pivots of the same hunt without stepping on each other
**Depends on**: Phase 34
**Hypotheses**: [HYP-09]
**Operations**: workstream branching model, namespace isolation, shared vs. private artifacts, lock-free concurrent evidence collection, analyst identity model
**Receipts Required**: architecture ADR, branching spec, namespace examples, concurrency rules
**Success Criteria**:
  1. Two analysts can open independent workstreams on the same hunt case without merge conflicts on shared artifacts.
  2. Each workstream has a clear namespace for its queries, receipts, and intermediate findings.
  3. The architecture supports both git-branch-based and directory-based isolation strategies.
**Plans**: 1/1 planned

Plans:
- [ ] 35-01: Design multi-analyst workstream branching, namespacing, and concurrency model

### Phase 36: Findings Merge & Conflict Detection
**Goal**: Merge evidence and findings from parallel workstreams with automated detection of contradictions and overlaps
**Depends on**: Phase 35
**Hypotheses**: [HYP-09]
**Operations**: findings merge engine, contradiction detection, overlap scoring, merge conflict resolution UX, evidence deduplication, provenance preservation across merge
**Receipts Required**: merge algorithm spec, contradiction examples, merge UX mockup
**Success Criteria**:
  1. Findings from parallel workstreams can be merged into a unified case view with provenance preserved.
  2. Contradictory findings (same entity, different conclusions) are surfaced explicitly rather than silently merged.
  3. Overlapping evidence is deduplicated while preserving each analyst's independent receipt chain.
**Plans**: 1/1 planned

Plans:
- [ ] 36-01: Build findings merge engine with contradiction detection and evidence deduplication

### Phase 37: Hunt Assignment & Handoff Protocol
**Goal**: Enable structured assignment of investigation pivots and clean analyst-to-analyst handoffs with full context transfer
**Depends on**: Phase 36
**Hypotheses**: [HYP-09]
**Operations**: assignment model, pivot splitting, handoff bundle (context + state + open questions), handoff acceptance, investigation pickup UX
**Receipts Required**: assignment spec, handoff bundle format, pickup workflow example
**Success Criteria**:
  1. A lead analyst can split a hunt into named pivots and assign each to a specific analyst or workstream.
  2. Handoff bundles include current state, open questions, evidence collected so far, and suggested next steps.
  3. An analyst picking up a handoff can resume investigation without re-reading the entire case history.
**Plans**: 1/1 planned

Plans:
- [ ] 37-01: Build hunt assignment, pivot splitting, and handoff protocol

### Phase 38: Shared Investigation State & Presence
**Goal**: Give analysts real-time visibility into who is investigating what, preventing duplicate work and enabling coordination
**Depends on**: Phase 37
**Hypotheses**: [HYP-09]
**Operations**: investigation state broadcast, analyst presence model, activity feed, duplicate work detection, coordination signals (claim, release, block)
**Receipts Required**: state broadcast spec, presence model, activity feed format, coordination signal examples
**Success Criteria**:
  1. Analysts can see which workstreams are active, who owns them, and what phase each is in.
  2. The system warns when two analysts are investigating the same pivot or querying the same data source simultaneously.
  3. Coordination signals (claim, release, block) prevent wasted effort without requiring a chat channel.
**Plans**: 1/1 planned

Plans:
- [ ] 38-01: Build shared investigation state, presence model, and coordination signals

## 📋 v1.9 Metrics Dashboard & Hunt Program Analytics (Planned)

### Milestone Outcome

Security leaders can measure hunt program effectiveness with quantitative metrics — ATT&CK coverage, yield rates, time-to-hypothesis, false positive rates — proving ROI and identifying coverage gaps.

### Phases

- [ ] **Phase 39: Hunt Metrics Collection & Aggregation Model** - Build the metrics pipeline that captures structured data from every hunt execution
- [ ] **Phase 40: ATT&CK Coverage Matrix & Gap Analysis** - Map hunt program coverage to the MITRE ATT&CK framework and surface gaps
- [ ] **Phase 41: Analytics Dashboard & Executive Reporting** - Build a web dashboard for program-level analytics and executive summaries
- [ ] **Phase 42: ROI Metrics & Program Health Scoring** - Compute and present quantitative ROI metrics that justify hunt program investment

### Phase 39: Hunt Metrics Collection & Aggregation Model
**Goal**: Build a structured metrics pipeline that automatically captures yield, duration, noise, and outcome data from every hunt execution
**Depends on**: Phase 38
**Hypotheses**: [HYP-10]
**Operations**: metrics schema, event collection hooks, aggregation pipeline, time-series storage model, connector-level metrics, pack-level metrics
**Receipts Required**: metrics schema, collection hook spec, aggregation rules, storage format
**Success Criteria**:
  1. Every hunt execution automatically emits structured metrics (duration, queries executed, evidence yield, outcome classification).
  2. Metrics are attributable to specific packs, connectors, hypotheses, and analysts.
  3. Historical metrics can be queried and aggregated across hunts, time ranges, and dimensions.
**Plans**: 1/1 planned

Plans:
- [ ] 39-01: Build the hunt metrics collection pipeline, schema, and aggregation model

### Phase 40: ATT&CK Coverage Matrix & Gap Analysis
**Goal**: Map hunt program activity to the MITRE ATT&CK framework and surface technique coverage gaps
**Depends on**: Phase 39
**Hypotheses**: [HYP-10]
**Operations**: ATT&CK technique mapping, coverage matrix computation, gap identification, coverage trend tracking, Navigator layer export
**Receipts Required**: coverage matrix spec, gap analysis output, Navigator layer example
**Success Criteria**:
  1. THRUNT can compute which ATT&CK techniques have been hunted, how recently, and with what yield.
  2. Coverage gaps (techniques never hunted or not hunted recently) are surfaced as actionable recommendations.
  3. Coverage data can be exported as a MITRE ATT&CK Navigator layer for visualization and sharing.
**Plans**: 1/1 planned

Plans:
- [ ] 40-01: Build ATT&CK coverage matrix computation, gap analysis, and Navigator export

### Phase 41: Analytics Dashboard & Executive Reporting
**Goal**: Build a web-based dashboard that presents hunt program analytics in a format suitable for both analysts and executives
**Depends on**: Phase 40
**Hypotheses**: [HYP-10]
**Operations**: dashboard web app, chart components, metric cards, trend visualizations, executive summary generation, export (PDF, Slack, email)
**Receipts Required**: dashboard deployment, metric card specs, executive summary template, export examples
**Success Criteria**:
  1. A web dashboard shows program-level metrics (total hunts, yield rate, coverage %, active analysts) with drill-down capability.
  2. Executive summaries can be generated on-demand with key metrics, trends, and notable findings.
  3. Dashboard data can be exported or shared without requiring dashboard access.
**Plans**: 1/1 planned

Plans:
- [ ] 41-01: Build the analytics dashboard web application with executive reporting

### Phase 42: ROI Metrics & Program Health Scoring
**Goal**: Compute quantitative ROI metrics that justify hunt program investment and track program health over time
**Depends on**: Phase 41
**Hypotheses**: [HYP-10]
**Operations**: ROI model, cost attribution, value scoring (detections promoted, incidents prevented, coverage gained), program health score, benchmarking
**Receipts Required**: ROI model spec, health score algorithm, benchmark framework
**Success Criteria**:
  1. THRUNT can report "your program found N true positives, promoted M detections, covering X% of ATT&CK techniques" with supporting evidence.
  2. A composite program health score tracks improvement or degradation over time.
  3. ROI metrics include both direct value (findings, detections) and indirect value (coverage, analyst skill growth, mean time-to-hypothesis improvement).
**Plans**: 1/1 planned

Plans:
- [ ] 42-01: Build ROI computation model, program health scoring, and benchmarking framework

## 📋 v2.0 Threat Intelligence Integration (Planned)

### Milestone Outcome

THRUNT can ingest threat intelligence feeds (STIX/TAXII, MISP, campaign reports) and auto-generate hunt cases seeded with IOCs, TTPs, and hypotheses — closing the intel-to-action gap that every SOC struggles with.

### Phases

- [ ] **Phase 43: STIX/TAXII Ingestion & IOC Parsing** - Ingest structured threat intelligence and extract actionable indicators and TTPs
- [ ] **Phase 44: TTP-to-Hunt Case Auto-Generation** - Automatically generate hunt cases from ingested intelligence, mapping TTPs to hypotheses and queries
- [ ] **Phase 45: MISP Integration & Feed Management** - Connect to MISP instances and manage intelligence feeds with filtering, aging, and deduplication
- [ ] **Phase 46: Intel-Driven Hunt Prioritization & Routing** - Use intelligence context to prioritize which hunts to run, when, and with what urgency

### Phase 43: STIX/TAXII Ingestion & IOC Parsing
**Goal**: Ingest structured threat intelligence from STIX/TAXII sources and extract actionable indicators, TTPs, and campaign context
**Depends on**: Phase 42
**Hypotheses**: [HYP-11]
**Operations**: STIX 2.1 parser, TAXII 2.1 client, IOC extraction (IPs, domains, hashes, URLs), TTP extraction (ATT&CK mapping), campaign relationship mapping, feed configuration
**Receipts Required**: parser spec, TAXII client docs, IOC extraction examples, TTP mapping examples
**Success Criteria**:
  1. THRUNT can connect to a TAXII 2.1 server and ingest STIX bundles with structured parsing.
  2. IOCs are extracted and normalized into a format usable by connector queries.
  3. TTPs are mapped to ATT&CK techniques with confidence levels and source attribution.
**Plans**: 1/1 planned

Plans:
- [ ] 43-01: Build STIX 2.1 parser, TAXII 2.1 client, and IOC/TTP extraction pipeline

### Phase 44: TTP-to-Hunt Case Auto-Generation
**Goal**: Automatically generate hunt cases from ingested intelligence, mapping TTPs to hypotheses, environment-specific queries, and expected outcomes
**Depends on**: Phase 43
**Hypotheses**: [HYP-11]
**Operations**: TTP-to-hypothesis mapping, pack selection from TTPs, query template instantiation, environment coverage check, case pre-population, analyst review gate
**Receipts Required**: auto-generation pipeline spec, case examples, pack selection logic, review gate docs
**Success Criteria**:
  1. When a new intel report is ingested, THRUNT can auto-generate one or more hunt cases with hypotheses seeded from the report's TTPs.
  2. Auto-generated cases select appropriate packs and instantiate queries based on the environment's available telemetry.
  3. Auto-generated cases are flagged for analyst review before execution — no fully autonomous hunting from raw intel.
**Plans**: 1/1 planned

Plans:
- [ ] 44-01: Build TTP-to-hunt-case auto-generation pipeline with pack selection and review gates

### Phase 45: MISP Integration & Feed Management
**Goal**: Connect to MISP instances and manage intelligence feeds with filtering, aging, deduplication, and quality scoring
**Depends on**: Phase 44
**Hypotheses**: [HYP-11]
**Operations**: MISP API client, event/attribute ingestion, feed management UX, deduplication engine, aging and expiry rules, quality scoring per feed, tag-based filtering
**Receipts Required**: MISP client spec, feed management docs, deduplication rules, quality scoring model
**Success Criteria**:
  1. THRUNT can connect to a MISP instance and ingest events, attributes, and galaxy clusters.
  2. Feeds can be filtered by tags, types, and quality scores to reduce noise.
  3. Indicators age out based on configurable expiry rules and are deduplicated across feeds.
**Plans**: 1/1 planned

Plans:
- [ ] 45-01: Build MISP API client, feed management, deduplication, and quality scoring

### Phase 46: Intel-Driven Hunt Prioritization & Routing
**Goal**: Use intelligence context (recency, relevance, severity, environmental coverage) to prioritize which hunts to run, when, and with what urgency
**Depends on**: Phase 45
**Hypotheses**: [HYP-11]
**Operations**: prioritization model, relevance scoring (intel vs. environment match), urgency classification, hunt queue management, routing rules, analyst notification
**Receipts Required**: prioritization model spec, scoring examples, routing rules, notification docs
**Success Criteria**:
  1. THRUNT can rank pending hunt cases by priority using intelligence recency, environmental relevance, and technique severity.
  2. High-priority intel (active campaigns targeting the org's industry/stack) triggers expedited hunt creation with analyst notification.
  3. Prioritization is transparent — analysts can see why a hunt was ranked high or low and override the ranking.
**Plans**: 1/1 planned

Plans:
- [ ] 46-01: Build intel-driven hunt prioritization, routing, and analyst notification system
