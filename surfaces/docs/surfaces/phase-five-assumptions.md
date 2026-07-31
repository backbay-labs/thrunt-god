# Phase Five Assumptions

## Live Campaigns

1. **Live certification is a campaign, not a single status bit.** Each Okta, Sentinel, or AWS run needs a durable bundle that preserves capture provenance, replay output, runtime checks, review decisions, and promotion history under `.planning/certification/`.

2. **Campaign artifacts must stay local-first and inspectable.** JSON and markdown files under `.planning/` are the source of truth for campaign state; there is no separate service, database, or browser-only cache.

3. **A clean replay is still not enough to claim live certification.** Replay pass should advance a campaign to `review-required`, not `live-certified`, until a human reviewer approves it.

4. **Blocked campaigns are a first-class output.** If a live session, connector profile, secret ref, or required permission is missing, the campaign should be written as `live-blocked` with explicit prerequisites instead of omitting the run.

## Capture And Sanitization

5. **Raw tenant material should not be persisted by default.** The capture flow should sanitize immediately and store sanitized HTML plus redacted structured extraction state unless the operator explicitly chooses a different local workflow outside this phase.

6. **Redaction should prefer preserving structure over perfect semantic cleanup.** Emails, usernames, tenant ids, account ids, hostnames, query literals, and obvious identifiers should be replaced consistently so replay remains meaningful even if the text becomes synthetic.

7. **Sanitization needs stable invariants.** A future run over the same capture should not produce materially different redaction markers; otherwise drift review becomes noisy.

## Drift Review

8. **Drift needs field-level evidence, not just a failing boolean.** Replays should record structured diffs, likely adapter suspects, and a classification that tells the operator whether the issue looks cosmetic, parser-related, semantic, auth-related, privilege-related, or unknown.

9. **Promotion must be explicit.** Passing replay output can become an approved baseline or fixture candidate only through an explicit review action, never automatically.

10. **Approved live captures should be reusable.** A reviewed campaign should be promotable into a replay baseline and optionally a sanitized regression input without hand-copying files.

## Runtime Certification

11. **The bridge remains the only control plane for runtime certification.** Preview and execute evidence attached to campaigns must come from the existing bridge/runtime path, not a side runner with separate semantics.

12. **Runtime certification is read-only unless THRUNT already defines a safe path.** Phase five should use `runtime doctor`, preview, and safe `runtime execute` flows that emit canonical artifacts without claiming write-capable remote mutation beyond what THRUNT already supports.

13. **Connector readiness must be recorded even when execution cannot proceed.** Missing profiles, secrets, auth material, or permission gaps are certification evidence and belong in the campaign bundle.

## Operator Workflow

14. **Review can stay script-driven, but it must be coherent.** The operator review loop may use bridge endpoints, repo scripts, and the extension diagnostics mode rather than a new standalone UI, as long as the steps are repeatable and documented.

15. **Repeated dogfooding matters more than one successful run.** Capture, replay, preview, execute, review, and promotion should work in repeated cycles against the same case without manual cleanup or mystery state.

## Out Of Scope

16. **Phase five stays within Okta, Sentinel, and AWS.** No new surfaces, no new vendors, no OCR, no alternate runtime, and no state store outside `.planning/`.

17. **Honest blocked output beats simulated proof.** If this environment lacks real tenant sessions or connector material, the correct result is a ready-to-run campaign system that emits `live-blocked` bundles with exact missing prerequisites.
