# Phase Six Assumptions

## Fixture-Backed Behavior

- Okta, Sentinel, and AWS fixture replay remains the automated extraction baseline.
- Fixture replay is still the fastest regression gate for adapter changes and canonicalization rules.
- Fixture success does not imply live certification.

## Live-Capable Behavior

- Live certification continues to use local campaign bundles under `.planning/certification/`.
- The bridge remains the prerequisite checker, projection layer, and runtime attachment path.
- Reviewer ergonomics are script-first plus extension diagnostics, not a new standalone review UI.
- Campaign history, drift trends, and baseline inventory are derived artifacts written as JSON and Markdown, not database state.

## Truly Live-Certified Behavior

- A campaign can only be treated as truly live-certified when it has:
  - a real captured tenant session
  - sanitized replayable artifacts
  - runtime preview/execute evidence where supported
  - an explicit reviewer approval persisted in the campaign bundle
  - an honest status transition to `live-certified`
- Phase six does not loosen that bar.

## Blocked Behavior

- If browser-session context is missing, the campaign is capture-blocked.
- If connector profile, auth material, preflight readiness, or smoke spec is missing, the campaign is runtime-blocked.
- If reviewer metadata is missing, capture may proceed but review remains incomplete.
- On April 11, 2026 this repository still has no checked-in real tenant sessions or configured live connector profiles for the example workspace, so example campaigns remain `live-blocked`.
