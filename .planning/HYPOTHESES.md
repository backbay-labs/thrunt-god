# Hypotheses: THRUNT GOD Platform Expansion

## Active Hypotheses

### HYP-01: A normalized query runtime is the critical substrate for every other platform feature

- **Signal:** THRUNT can orchestrate hunts, but `/hunt:run` does not yet execute against real backends through a shared contract
- **Assertion:** A common query spec, auth model, pagination contract, time-window model, and normalized result envelope will let connectors, packs, receipts, and detections compose cleanly
- **Priority:** Critical
- **Scope:** Runtime core, connector SDK, `/hunt:run`, query logs, receipt hooks
- **Data sources:** Runtime contracts, connector adapter design, command surface, template model, architecture docs
- **Evidence needed:** One contract that can support Splunk, Sentinel, Elastic, Okta, M365, CrowdStrike, AWS, and GCP without per-backend orchestration logic
- **Disproof condition:** Connectors require materially different execution semantics that cannot be normalized without destroying operator usefulness
- **Confidence:** Medium
- **Status:** Supported

### HYP-02: Hunt packs will materially reduce time-to-first-hunt and encode reusable analyst expertise

- **Signal:** THRUNT already has strong orchestration ergonomics, but hunters still need to shape every case from scratch
- **Assertion:** A pack registry with technique packs, threat-family packs, and domain packs will make `/hunt:new-case --pack ...` a practical accelerator
- **Priority:** High
- **Scope:** Pack schema, pack loader, registry UX, parameterization, authoring and QA tooling
- **Data sources:** MITRE ATT&CK mappings, existing hunt runbook patterns, future runtime contract from HYP-01
- **Evidence needed:** Pack definitions can generate hypotheses, scope defaults, query plans, and publish expectations without hardcoding one environment
- **Disproof condition:** Packs become too environment-specific to reuse or create more noise than acceleration
- **Confidence:** Medium
- **Status:** Open

### HYP-03: Cryptographically defensible receipts will increase trust in THRUNT findings and publish workflows

- **Signal:** Receipts exist as a concept, but chain of custody and integrity guarantees are not yet first-class product behaviors
- **Assertion:** Hashing, provenance metadata, manifests, and export bundles will make THRUNT outputs credible for escalations, IR handoff, and audit-heavy environments
- **Priority:** High
- **Scope:** Query logs, receipt manifests, evidence review, publish bundles, provenance UX
- **Data sources:** Receipt templates, findings flow, evidence review flow, export requirements
- **Evidence needed:** Every material claim can be linked to a query or receipt with verifiable provenance and tamper-evident packaging
- **Disproof condition:** The integrity layer adds substantial complexity without improving operator trust or downstream usability
- **Confidence:** Medium
- **Status:** Supported

### HYP-04: Detection promotion will turn THRUNT from a hunt tool into a hunt-to-detection platform

- **Signal:** Findings currently stop near publication, which leaves durable operational value on the table
- **Assertion:** A structured mapping from findings to detection candidates, plus backtesting and promotion gates, will close the hunt-to-detection loop
- **Priority:** High
- **Scope:** Findings model, detection generation, backtesting, promotion workflow, content export targets
- **Data sources:** Findings artifacts, future receipt model, target detection formats, backtesting requirements
- **Evidence needed:** THRUNT can generate detection candidates from findings and score them before promotion
- **Disproof condition:** Findings are too narrative or backend-specific to produce reliable detections without bespoke analyst work each time
- **Confidence:** Medium
- **Status:** Open

### HYP-05: Hunt memory and scoring will improve prioritization, pack quality, and analyst confidence over time

- **Signal:** THRUNT currently treats hunts mostly as isolated workflows rather than a compounding knowledge system
- **Assertion:** Persisting outcomes, yield, noise, false positives, and analyst feedback will let THRUNT recommend better packs, hypotheses, and execution order
- **Priority:** Medium
- **Scope:** Hunt telemetry, scoring models, analyst feedback capture, recommendation UX, adaptive planning
- **Data sources:** Receipts, findings, evidence review, detection promotion outcomes, analyst annotations
- **Evidence needed:** The system can rank packs, connectors, or hypotheses using real historical performance rather than static defaults
- **Disproof condition:** Hunt outcomes are too sparse or inconsistent to produce useful recommendations
- **Confidence:** Medium
- **Status:** Open

### HYP-06: A standalone connector ecosystem will drive adoption and community network effects

- **Signal:** THRUNT has a connector SDK and built-in connectors, but they are bundled in core — users cannot install, update, or contribute connectors independently
- **Assertion:** Extracting connectors into standalone npm packages (`@thrunt/connector-*`) with a community registry will lower the barrier to adoption and create ecosystem gravity
- **Priority:** Critical
- **Scope:** Package architecture, npm publishing, shared test harness, community registry, connector discovery
- **Data sources:** Connector SDK, runtime contract, existing built-in connectors, npm ecosystem patterns
- **Evidence needed:** A user can `npm install @thrunt/connector-splunk` and run hunts against Splunk with zero modifications to THRUNT core
- **Disproof condition:** The connector interface is too tightly coupled to THRUNT internals to extract cleanly, or community adoption requires too much hand-holding to be self-sustaining
- **Confidence:** High
- **Status:** Open

### HYP-07: Interactive hunt replay will unlock training, compliance, and marketing value simultaneously

- **Signal:** Completed hunts produce rich artifact trails, but they are only navigable as flat files — there is no visual, temporal, or interactive representation
- **Assertion:** A web-based hunt replay viewer that renders investigations as navigable timelines will serve as a training tool, compliance artifact, and marketing showcase
- **Priority:** High
- **Scope:** Timeline serialization, web viewer, case gallery, training mode, redaction support
- **Data sources:** Hunt artifacts (mission, hypotheses, queries, receipts, findings), evidence review chains, existing template structures
- **Evidence needed:** A completed hunt can be exported, loaded in a browser, and navigated from signal to findings without access to the original repo
- **Disproof condition:** Hunt artifacts are too inconsistent or incomplete to render a coherent timeline without heavy manual curation
- **Confidence:** Medium
- **Status:** Open

### HYP-08: Hunt-as-code will create the "CI/CD for threat hunting" category

- **Signal:** Hunt packs encode reusable templates, but full hunt playbooks (hypothesis + environment + queries + outcomes) cannot be version-controlled, shared, or automated as a unit
- **Assertion:** A declarative `.thrunt` file format plus CI/CD integration will enable continuous hunting — scheduled, automated, baseline-compared investigations that run like tests
- **Priority:** High
- **Scope:** .thrunt file format, playbook versioning, CI/CD runner, GitHub Actions, scheduled hunts, drift detection, continuous hunting pipelines
- **Data sources:** Pack schema, hunt execution flow, CI/CD ecosystem patterns, DevSecOps workflows
- **Evidence needed:** A team can commit a `.thrunt` playbook to git, run it on a schedule via GitHub Actions, and get alerted when findings exceed baseline
- **Disproof condition:** Hunts are too interactive and context-dependent to express declaratively without losing investigative value
- **Confidence:** Medium
- **Status:** Open

### HYP-09: Multi-analyst collaboration will transform THRUNT from a solo tool into a team platform

- **Signal:** THRUNT is single-analyst — workstreams exist but there is no mechanism for parallel investigation, findings merge, or structured handoff between analysts
- **Assertion:** Adding workstream branching, findings merge with conflict detection, and structured handoff protocols will enable team-scale hunting without the chaos of shared documents
- **Priority:** High
- **Scope:** Workstream architecture, findings merge engine, contradiction detection, assignment protocol, handoff bundles, shared state, analyst presence
- **Data sources:** Existing workstream model, git branching infrastructure, evidence model, findings artifacts
- **Evidence needed:** Two analysts can independently investigate different pivots of the same hunt and merge findings with contradictions surfaced automatically
- **Disproof condition:** The artifact model creates too many merge conflicts, or coordination overhead exceeds the value of parallel investigation
- **Confidence:** Medium
- **Status:** Open

### HYP-10: Quantitative program analytics will prove hunt ROI and drive investment

- **Signal:** Hunt programs produce valuable findings but cannot quantify their effectiveness — no coverage metrics, yield rates, or ROI calculations exist
- **Assertion:** Automated metrics collection, ATT&CK coverage mapping, and executive dashboards will give security leaders the data they need to justify and expand hunt programs
- **Priority:** High
- **Scope:** Metrics pipeline, ATT&CK coverage matrix, gap analysis, analytics dashboard, executive reporting, ROI model, program health scoring
- **Data sources:** Hunt execution metrics, pack/connector usage, evidence yield, detection promotion outcomes, ATT&CK framework
- **Evidence needed:** A security leader can see "your program found N true positives across M hunts, covering X% of ATT&CK techniques" with drill-down to supporting evidence
- **Disproof condition:** Hunt volumes are too low or outcomes too inconsistent to produce statistically meaningful program-level metrics
- **Confidence:** Medium
- **Status:** Open

### HYP-11: Threat intelligence integration will close the intel-to-action gap

- **Signal:** Security teams receive threat intelligence (STIX/TAXII, MISP, campaign reports) but manually translating TTPs into hunt cases is slow and error-prone
- **Assertion:** Auto-ingesting intel, extracting IOCs and TTPs, mapping them to hunt packs, and generating prioritized hunt cases will dramatically reduce time-from-intel-to-hunt
- **Priority:** High
- **Scope:** STIX/TAXII ingestion, MISP integration, IOC parsing, TTP mapping, auto-case generation, feed management, intel-driven prioritization
- **Data sources:** STIX 2.1, TAXII 2.1, MISP API, ATT&CK mappings, pack registry, environment telemetry map
- **Evidence needed:** A new APT report ingested via TAXII auto-generates a hunt case with hypotheses, environment-matched queries, and recommended packs — ready for analyst review
- **Disproof condition:** Intelligence quality is too inconsistent, or auto-generated hunts produce too many false starts to be worth the automation
- **Confidence:** Medium
- **Status:** Open

## Parked Hypotheses

- Hosted multi-tenant control plane can wait until the local-first runtime and connector model are proven.
- Autonomous remediation should stay parked until receipts, findings, and promotion quality are strong.

## Disproved Hypotheses

- None yet.

## Notes

- HYP-01 is the dependency root for the rest of the roadmap.
- HYP-02 depends on HYP-01 because packs need a stable execution target.
- HYP-03 feeds HYP-04 and HYP-05 because promotion and learning both depend on trustworthy evidence.
- HYP-06 (connector ecosystem) builds on HYP-01 by extracting the built-in connectors into standalone packages.
- HYP-07 (hunt replay) depends on HYP-03 because timeline replay needs defensible evidence and receipts.
- HYP-08 (hunt-as-code) depends on HYP-02 and HYP-06 because playbooks compose packs and connectors.
- HYP-09 (collaboration) depends on HYP-08 because multi-analyst work needs stable playbook and artifact formats.
- HYP-10 (analytics) depends on HYP-05 because program metrics build on the hunt telemetry and scoring layer.
- HYP-11 (threat intel) depends on HYP-10 because intel-driven prioritization uses program analytics to rank hunts.
