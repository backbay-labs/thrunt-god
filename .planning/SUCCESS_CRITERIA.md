# Success Criteria: THRUNT GOD Platform Expansion

## Hunt Quality Gates

- Every execution-capable workflow emits query logs and receipts through one canonical artifact model
- Every material product claim in the roadmap maps to at least one milestone and phase in HUNTMAP.md
- Connectors share one normalized execution contract for auth, pagination, time windows, retries, and result normalization
- Packs are parameterized, testable, and portable across supported telemetry backends
- Findings, evidence review, and detection promotion stay linked to receipts and hypotheses

## Exit Conditions

### Foundational Hunt Runtime

- `/hunt:run` can execute real hunts through the shared runtime across SIEM, identity, endpoint, and cloud connectors
- Query results normalize into a shared result envelope with connector-specific raw metadata preserved
- Query logs and receipts are emitted automatically for each material execution step
- Configured connectors can be scored for readiness and optionally live-verified before hunts depend on them

### Operator Acceleration via Packs

- `/hunt:new-case --pack <id>` can bootstrap hypotheses, scope defaults, and execution plans from a reusable pack
- THRUNT ships technique packs, domain packs, and threat-family packs with clear parameter requirements
- Pack authors have validation tooling that catches unsupported connectors, missing parameters, and unsafe defaults

### Defensible Evidence and Operationalization

- Material findings can be exported as evidence bundles with provenance, hashing, and chain-of-custody data
- Findings can be converted into detection candidates with explicit evidence links and promotion gates
- Evidence review can block publication or promotion when receipt quality is insufficient

### Adaptive Improvement Loop

- THRUNT records hunt yield, outcome quality, noise, and analyst feedback
- Packs, hypotheses, or connectors can be ranked using observed performance data
- Future planning and routing can recommend high-yield hunt paths based on prior outcomes

## Publish Gates

- Runtime contract and connector SDK are documented and exercised by tests
- Connector certification (`runtime doctor`, `runtime smoke`, and profile `smoke_test`) is documented and exercised by tests
- Pack schema, pack registry behavior, and pack QA rules are documented and exercised by tests
- Evidence exports include receipt manifests, provenance metadata, and integrity checks
- Detection promotion includes mapping rules, backtesting expectations, and output templates
- Learning and scoring outputs are visible in artifacts or UX, not buried in raw logs

### Live Connector Ecosystem

- Connectors ship as standalone npm packages (`@thrunt/connector-*`) installable independently from THRUNT core
- A shared test harness and certification CLI validate connector compliance before publication
- A community registry enables discovery, installation, and contribution of third-party connectors
- Core SIEM (Splunk, Elastic, Sentinel) and extended (CrowdStrike, Okta, AWS, GCP) connectors are published and certified

### Interactive Hunt Replay & Case Gallery

- Completed hunts can be serialized into self-contained timeline exports with evidence linkage and redaction support
- A static web viewer renders hunt timelines as interactive, navigable investigations in any browser
- A public case gallery hosts curated hunts tagged by technique, difficulty, and outcome
- Training mode enables annotated walkthroughs with decision-point assessments

### Hunt-as-Code & Continuous Hunting

- `.thrunt` files encode complete hunt playbooks (hypothesis, environment, queries, outcomes) in a declarative, validated format
- Playbooks support versioning, composition, and team sharing through git repositories
- A CI/CD runner and GitHub Action execute playbooks non-interactively with structured output and alerting
- Continuous hunting pipelines run on schedule with drift detection and baseline comparison

### Collaborative Hunting (Multi-Analyst)

- Multiple analysts can investigate the same hunt case through namespaced, parallel workstreams
- Findings merge preserves provenance and surfaces contradictions and overlaps automatically
- Structured handoff bundles transfer investigation context cleanly between analysts
- Shared state and presence signals prevent duplicate work without external coordination tools

### Metrics Dashboard & Hunt Program Analytics

- Every hunt execution emits structured metrics (duration, yield, noise, outcome) attributable to packs, connectors, and analysts
- ATT&CK coverage matrix computes which techniques have been hunted and surfaces gaps as actionable recommendations
- A web dashboard presents program analytics with executive summary generation and export
- ROI metrics quantify program value (true positives, detections promoted, coverage gained) with a composite health score

### Threat Intelligence Integration

- STIX 2.1/TAXII 2.1 ingestion extracts IOCs and TTPs with ATT&CK mapping and confidence levels
- Intel auto-generates hunt cases with hypotheses, pack selection, and environment-matched queries
- MISP integration supports feed management with filtering, aging, deduplication, and quality scoring
- Intel-driven prioritization ranks pending hunts by recency, relevance, and technique severity

## Non-Goals

- THRUNT will not replace the full UI or search ergonomics of every supported backend
- THRUNT will not become a full SOAR or ticketing platform in this roadmap
- THRUNT will not implement autonomous remediation in this program
