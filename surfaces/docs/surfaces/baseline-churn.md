# Baseline Churn

## Fixture-Backed Behavior

- Fixture candidates can still be promoted as regression inputs, but baseline churn only tracks approved live baseline promotions.
- Fixture replay helps explain churn, but it does not itself count as baseline replacement history.

## Live-Capable Behavior

- The certification ledger now emits `.planning/certification/baseline-churn.json`.
- Churn is derived from promoted baseline history and supersession metadata, not from transient review logs.
- Per-vendor churn summaries include:
  - active baseline age
  - promoted baseline count
  - superseded baseline count
  - replacement count
  - average replacement interval
  - shortest replacement interval
  - drift classes observed around replacement windows
  - stability posture
  - suspicion flags
- Stability postures:
  - `stable`
  - `watch`
  - `unstable`
  - `no_baseline`

## Actually Live-Certified Behavior

- When live-approved baselines exist, churn shows whether a vendor is stable enough to trust for recurring certification cadence.
- Rapid short-window replacement and repeated parser/auth drift now produce explicit suspicion flags instead of being buried in campaign-by-campaign notes.

## Blocked Behavior

- Vendors with no promoted live baseline stay in `no_baseline`.
- On April 11, 2026 the example workspace still has no approved live baselines, so churn posture remains `no_baseline` rather than pretending the adapters are stable.
