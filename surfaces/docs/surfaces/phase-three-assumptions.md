# Phase Three Assumptions

## Scope And Source Of Truth

1. **The active hunt surface is the active case when `.planning/.active-case` points to a valid child case.** The bridge and artifact loader should prefer `.planning/cases/<slug>/` for hunt artifacts while still reading shared root artifacts like `.planning/config.json`.

2. **THRUNT CLI semantics are the mutation contract.** If `thrunt-tools.cjs` can perform a state change, the bridge should shell out to it instead of rewriting hunt state directly.

3. **Phase three stays inside the Okta, Sentinel, and AWS loop.** Other surfaces may keep their current scaffold depth and should not be deepened unless required by shared plumbing.

## Fixture Strategy

4. **Browser validation uses local fixtures served under realistic vendor URLs.** The automated suite should route Okta, Sentinel, and AWS URLs to checked-in HTML snapshots instead of depending on live sessions.

5. **Fixtures are behavior-realistic, not byte-for-byte DOM mirrors.** They should preserve the structural anchors the adapters rely on, include noisy and partial states, and document expected extraction outcomes in adjacent metadata.

6. **Unsupported or partial pages are first-class test cases.** Extraction failures should return structured low-confidence context and explicit failure reasons, not silent null-only behavior.

## Adapter Shape

7. **`surfaces-site-adapters` owns the vendor extraction logic for phase-three vendors.** The browser extension content scripts should become thin bootstrap wrappers over package adapters instead of carrying divergent vendor logic.

8. **Adapter outputs need explicit extraction quality signals.** For Okta, Sentinel, and AWS, page context should surface confidence, completeness, and failure reasons so the side panel and tests can distinguish supported, partial, and unsupported pages.

## Bridge Mutation Path

9. **Tool-path resolution must be deterministic and diagnosable.** An explicit configured path takes precedence, then installed/repo-local THRUNT layouts, and failures should report every attempted candidate.

10. **`execute-next` only counts as real when it mutates THRUNT state.** Read-only recommendation fallbacks remain acceptable only when CLI mutation is truly unavailable, and the response must say that clearly.

11. **Open-case-from-signal should reuse THRUNT case creation primitives.** If a full `/hunt:new-case` bootstrap is not practical in one bridge call, the acceptable fallback is a thin THRUNT-owned scaffold that creates valid `.planning/` state and then delegates case creation through the CLI.

## Evidence Ingest

12. **Captured browser evidence belongs in the scoped `EVIDENCE/` directory next to the active case artifacts.** It should not land only at the program root when an active case exists.

13. **THRUNT evidence audit is the ingest path to extend.** `.planning/EVIDENCE/` should be scanned by existing audit/review logic so captured evidence affects blockers or follow-up state without inventing a new evidence subsystem.

14. **Uncorrelated captured evidence should be visible as a follow-up signal.** Evidence with no hypothesis linkage is still useful, but it should show up as work that needs analyst correlation rather than disappearing into an attachment folder.

## Resilience And Dogfooding

15. **The local-first token model remains intact.** Handshake-issued bridge tokens stay local, WebSocket auth should use the same session model, and token refresh should recover cleanly after bridge restarts.

16. **Repeated dogfooding assumes SPA-like page churn and bridge restarts.** Background capture routing, reconnect behavior, and heartbeat/liveness checks should tolerate the operator moving across fixture pages or restarting the bridge without reloading the whole extension.

## Still Out Of Scope

17. **Fixture-backed validation is the truth claim for Okta, Sentinel, and AWS in this phase.** No part of the docs or tests should imply live vendor certification where only local fixtures were exercised.

18. **Chrome Web Store submission, cloud relay work, and new surfaces remain out of scope.** This phase should spend effort on one repeatable operator loop, not packaging or expansion.
