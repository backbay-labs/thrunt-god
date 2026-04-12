# Phase Seven Assumptions

## Fixture-Backed Behavior

- Okta, Sentinel, and AWS fixture replay remains the fast regression gate for adapter changes.
- Fixture replay continues to prove extractor behavior and campaign-ledger logic, but not tenant truth.
- Freshness and churn reporting may include fixture-backed vendors, but fixture status alone never counts as live freshness.

## Live-Capable Behavior

- Live certification continues to use local-first campaign bundles under `.planning/certification/`.
- Reviewer actions remain script-driven plus bridge diagnostics; phase seven does not add a second review product.
- Freshness and churn are derived from campaign history and promoted baselines, not from transient runtime state.
- Phase seven uses explicit, documented freshness thresholds instead of implicit heuristics:
  - `fresh`: last live-certified campaign is 7 days old or newer
  - `aging`: older than 7 days and up to 14 days
  - `stale`: older than 14 days
  - `uncertified`: no reviewer-approved live-certified campaign exists
- Churn posture is likewise derived from promoted baseline history and short-window supersessions, not guessed ad hoc.

## Truly Live-Certified Behavior

- A vendor is only truly live-certified when there is:
  - a real tenant capture
  - a sanitized replayable bundle
  - recorded runtime preview evidence
  - recorded safe read-only runtime execute evidence where supported
  - an explicit reviewer approval persisted in the campaign ledger
  - a campaign status of `live-certified`
- Baseline promotion is separate from certification approval. A campaign can be reviewer-approved without becoming the active baseline.
- Freshness is only meaningful after at least one truly live-certified campaign exists.

## Blocked Behavior

- If browser session context is missing, the campaign remains capture-blocked and freshness stays `uncertified`.
- If connector profile, auth material, permissions, or smoke spec is missing, runtime evidence stays blocked and certification cannot be approved honestly.
- If reviewer approval is absent, the campaign may be review-ready but is not live-certified.
- On April 11, 2026 this workspace still does not contain checked-in real tenant captures or configured live connector profiles for the example case, so example outputs must remain explicitly blocked unless a human supplies those prerequisites.
