# Certification Freshness

## Fixture-Backed Behavior

- Fixture certification does not satisfy freshness.
- Fixture results still matter for adapter regression confidence, but freshness is only derived from reviewer-approved live campaigns.

## Live-Capable Behavior

- The certification ledger now emits `.planning/certification/freshness.json`.
- Freshness is computed per vendor from the most recent `live-certified` campaign timestamp.
- Thresholds are explicit and configurable through environment variables:
  - `THRUNT_CERT_FRESH_HOURS` default `168` hours (7 days)
  - `THRUNT_CERT_AGING_HOURS` default `336` hours (14 days)
- Freshness buckets:
  - `fresh`
  - `aging`
  - `stale`
  - `uncertified`
- Freshness state adds an operational overlay:
  - `fresh`
  - `aging`
  - `stale`
  - `uncertified`
  - `blocked`

## Actually Live-Certified Behavior

- Once a vendor has a real approved live campaign, freshness artifacts show:
  - `lastLiveCertifiedCampaignId`
  - `lastLiveCertifiedAt`
  - `ageHours`
  - `ageDays`
  - `nextRecommendedRecertificationAt`
  - overdue status
- The bridge projection and side-panel diagnostics surface freshness for the active vendor.

## Blocked Behavior

- If a vendor has no approved live campaign, freshness remains `uncertified`.
- If the latest live attempt is blocked, freshness state becomes `blocked` even though the bucket stays `uncertified`.
- On April 11, 2026 the example workspace has no approved live campaigns, so all vendors remain `uncertified`, with blocked vendors explicitly marked as `blocked`.
