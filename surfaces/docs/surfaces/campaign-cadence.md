# Campaign Cadence

## Fixture-Backed Behavior

- Before any live campaign, run the fixture suite and certification harness to catch obvious adapter regressions.
- Fixture replay remains the cheapest preflight for weekly or on-demand certification work.

## Live-Capable Behavior

- Phase seven adds a cadence-oriented script set:
  - `dogfood:campaign:start`
  - `dogfood:campaign:prereqs`
  - `dogfood:campaign:submit`
  - `dogfood:campaign:history`
  - `dogfood:campaign:trends`
  - `dogfood:campaign:baselines`
  - `dogfood:campaign:freshness`
  - `dogfood:campaign:churn`
- A normal cadence loop is:
  1. check prerequisites
  2. capture / sanitize
  3. replay
  4. preview / execute
  5. submit for review
  6. review decision
  7. optional baseline promotion
  8. inspect freshness and churn

## Actually Live-Certified Behavior

- Once live-approved campaigns exist, cadence reporting makes it obvious which vendor should be recertified next.
- Freshness identifies staleness.
- Churn identifies instability.
- History and drift trends explain whether the next run is likely to be routine or triage-heavy.

## Blocked Behavior

- If the environment lacks live sessions or connector material, the cadence loop still produces useful blocked outputs.
- On April 11, 2026 the checked-in example workspace demonstrates the blocked cadence path, not a reviewer-approved live cadence.
