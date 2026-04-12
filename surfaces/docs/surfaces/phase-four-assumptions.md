# Phase Four Assumptions

## Runtime Depth

1. **The bridge should reuse THRUNT runtime commands instead of embedding its own execution engine.** Runtime preview and execution must delegate through `thrunt-tools.cjs` and the existing `pack` / `runtime` command surface.

2. **A real preview is still a read-only path.** Preview can resolve the next action, rendered targets, connector, dataset, time window, and guardrail diagnostics without performing connector execution.

3. **The first acceptable runtime-deep execute path is read-only query execution.** If THRUNT runtime semantics for a target already produce canonical artifacts without mutating remote vendor state, the bridge should run that path directly and report the exact command that executed.

4. **Runtime success only counts if THRUNT artifacts changed on disk.** A bridge response is not “executed” unless the delegated runtime path actually produced canonical query/receipt state under the active case.

## Canonical Clip Conversion

5. **Browser captures should prefer existing THRUNT artifact types.** A structured clip becomes `QUERIES/`, `RECEIPTS/`, or `EVIDENCE/` under the active case; it should not introduce a second browser-only schema.

6. **Classification can be heuristic, but it must be explicit.** Each capture should record whether it was treated as a query candidate, receipt candidate, evidence note, or ambiguous clip, plus why.

7. **Ambiguous clips stay in `EVIDENCE/`.** If a clip lacks enough structure to safely form a canonical query or receipt, the bridge should preserve it as evidence and record the missing fields that blocked canonicalization.

8. **Canonicalized clips must preserve provenance back to the browser context.** Generated query and receipt artifacts should carry vendor, source URL, capture time, related hypotheses when available, and cross-links to any evidence fallback or source query.

## Projection And Operator Shell

9. **The side panel should expose upgraded truth without becoming a second case dashboard.** Recent canonical queries, receipts, non-canonical evidence, readiness blockers, and last runtime result should be visible in a compact hunt-oriented view.

10. **Execution state belongs in the case projection.** Preview summaries, last execution outcome, and readiness/auth blockers should be modeled in the shared projection instead of kept only in transient extension state.

## Live Certification

11. **Fixtures remain the regression baseline; live certification is a separate evidence tier.** Live-certified status requires captured, sanitized snapshots plus recorded expected extraction output for a real session.

12. **Live capture artifacts must be safe to commit or share internally.** Snapshot tooling needs deterministic redaction for tenant IDs, emails, usernames, account IDs, and similar console-specific identifiers before replay artifacts are saved.

13. **Certification claims must be machine-readable.** For Okta, Sentinel, and AWS, the repo should be able to distinguish `fixture-certified`, `live-certified`, `live-blocked`, and `drift-detected` without relying on prose alone.

14. **Adapter diagnostics may be dev-only.** Raw selector/heuristic traces and extraction completeness details can live behind extension dev mode or harness output rather than the normal operator UI.

## Dogfooding

15. **Repeated use matters more than single-pass demos.** Startup scripts, reconnect handling, stale-token recovery, repeated capture, and repeated execute flows should be optimized for internal operator use on the same machine.

16. **Bridge restart and token churn are normal operating conditions.** The extension should recover automatically when possible and surface specific remediation when local connector config or auth material is missing.

17. **Real dogfood reporting must stay honest.** If live vendor sessions are unavailable in this environment, phase four should ship the capture/certification/runbook tooling and leave explicit blocked notes rather than implying live certification happened.

## Still Out Of Scope

18. **Phase four stays within Okta, Sentinel, and AWS.** No new surfaces, no new vendors, no Splunk/Kibana deepening, and no alternate runtime should be introduced here.

19. **Chrome Web Store work is still downstream of product truth.** Packaging or store submission should not consume implementation time unless runtime depth, canonicalization, certification, and dogfood ergonomics are already complete.
