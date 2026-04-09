# Example: Brute Force to Persistence

A completed threat hunt demonstrating THRUNT v1.0 features against a real-world credential attack chain.

## Scenario

Okta detected a password spray attack against Meridian Financial Services. 1,200+ failed logins across 15 accounts in 8 minutes from residential proxy IPs. One account (david.park@meridian.io) was compromised, MFA was bypassed via push fatigue, and the attacker accessed sensitive financial documents on SharePoint before the account was contained.

## v1.0 Features Demonstrated

- **Template clustering** -- Drain parser groups 1,247 raw Okta events into 3 structural templates, reducing analyst review surface by 99.7%. See QRY-20260329-001 for the clustered output.
- **Dataset-aware defaults** -- `dataset.kind = 'identity'` automatically applies `limit=200, max_pages=10, timeout=30s`. `dataset.kind = 'cloud'` applies `limit=500, max_pages=10, timeout=45s`. No manual tuning required.
- **Event deduplication** -- Pagination overlap between Okta API pages produced 87 duplicate events. The `by_id` dedup strategy removed them automatically. See QRY-20260329-001 notes.
- **Anomaly framing** -- Sequential prediction pattern applied to david.park's entity timeline. Predictions documented before observations, baselines established, deviation scores computed with explicit factors. See RCT-20260329-002 for the full predict-observe-score cycle.

## Hunt Pack

Uses `domain.identity-abuse` with two progressions:

- `brute-force-to-access` -- spray detection through successful auth
- `credential-to-persistence` -- post-compromise MFA change and data access

## Files

```
.hunt/
  MISSION.md              -- Signal, scope, constraints
  HYPOTHESES.md           -- 4 hypotheses (3 supported, 1 disproved)
  SUCCESS_CRITERIA.md     -- Quality gates and exit conditions
  HUNTMAP.md              -- 4 phases, all complete
  STATE.md                -- Final state, 100% progress
  environment/
    ENVIRONMENT.md        -- Okta + M365 telemetry surfaces
  QUERIES/
    QRY-20260329-001.md   -- Password spray query (template clustering + dedup)
    QRY-20260329-002.md   -- david.park post-compromise identity query
    QRY-20260329-003.md   -- SharePoint access cloud query
  RECEIPTS/
    RCT-20260329-001.md   -- HYP-01: Spray confirmed
    RCT-20260329-002.md   -- HYP-02: MFA fatigue compromise
    RCT-20260329-003.md   -- HYP-03: Financial data access
    RCT-20260329-004.md   -- HYP-04: No other accounts compromised
  FINDINGS.md             -- Executive summary and recommendations
  EVIDENCE_REVIEW.md      -- Publishability verdict
```
