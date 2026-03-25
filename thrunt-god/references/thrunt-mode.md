# THRUNT Mode Reference

THRUNT is the primary workflow for this repo.

Use these artifacts as the source of truth:

- `MISSION.md` for mission, scope, and operating constraints
- `HYPOTHESES.md` for hunt hypotheses and expected signals
- `SUCCESS_CRITERIA.md` for validation conditions and confidence gates
- `HUNTMAP.md` for phase flow, dependencies, and plan targets
- `FINDINGS.md` for verified findings and assertion status
- `EVIDENCE_REVIEW.md` for evidence gaps, analyst review notes, and false-positive pressure
- `QUERIES/` and `RECEIPTS/` for exact telemetry actions and chain-of-custody artifacts
- `environment/ENVIRONMENT.md` for tenant, platform, and data-source mapping

Routing rules:

- In hunt mode, prefer `/hunt:*` commands in recommendations and examples.
- Use `/thrunt:*` for orchestration utilities, diagnostics, settings, and repo mechanics.
- When a document says "huntmap", it means `HUNTMAP.md`.
- When a document says "mission", it means `MISSION.md`.
- When a document says "hypotheses", it means `HYPOTHESES.md` plus `SUCCESS_CRITERIA.md` when validation gates matter.

Authoring rules:

- Favor signal, hypothesis, telemetry scope, evidence, receipts, findings, confidence, and publication language.
- Unsupported narrative is not a finding. Exact queries and evidence lineage matter.
