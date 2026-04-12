# Baseline Promotion

## Fixture-Backed Behavior

- Fixture promotion remains optional and separate from live baseline promotion.
- Fixture-candidate and regression-input targets still exist, but phase six focuses on reviewer-controlled live baseline inventory.

## Live-Capable Behavior

- Approved live baseline promotions are written under `.planning/certification/baselines/<vendor>/<campaign-id>/`.
- The ledger also writes `.planning/certification/baselines/inventory.json`.
- Promotion states are now explicit:
  - `none`
  - `pending`
  - `approved`
  - `rejected`
  - `superseded`
- A newly approved baseline for a vendor supersedes the prior active baseline instead of silently overwriting it.

## Truly Live-Certified Behavior

- A durable live baseline requires:
  - an approved live campaign
  - explicit baseline promotion approval
  - an active inventory record with reviewer and timestamp
- That active record becomes the preferred comparison point for future replay drift.

## Blocked Behavior

- The current example workspace has no approved baselines, so `baselines/inventory.json` is empty.
- That empty inventory is truthful and is what downstream comparison logic uses until a reviewer approves the first baseline.
