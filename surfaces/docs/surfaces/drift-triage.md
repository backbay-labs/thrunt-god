# Drift Triage

## Fixture-Backed Behavior

- Fixture replay failures still surface as normal adapter test failures.
- The same field-level comparison logic is now reused for live campaign replay, so fixture and live drift share one diff vocabulary.

## Live-Campaign-Capable Behavior

- Each replayed campaign now stores a structured diff in `replay.json`.
- Field-level diffs record:
  - artifact path
  - expected value
  - actual value
  - change type
- Drift is classified into one of:
  - `benign_ui_drift`
  - `selector_parser_break`
  - `semantic_extraction_drift`
  - `auth_session_degradation`
  - `privilege_visibility_difference`
  - `unknown`
- The replay bundle also records likely adapter suspects such as:
  - `surfaces/packages/surfaces-site-adapters/src/adapters/okta.ts`
  - `surfaces/packages/surfaces-site-adapters/src/adapters/sentinel.ts`
  - `surfaces/packages/surfaces-site-adapters/src/adapters/aws.ts`

## Actually Live-Certified Outcomes

- A campaign can only move from replay output to `live-certified` after a reviewer sees the diff state and explicitly approves the campaign.
- A clean replay with no blocking drift becomes `review-required`, not `live-certified`.

## Blocked Outcomes

- Drift that blocks certification leaves the campaign in `drift-detected`.
- Missing auth or missing runtime material is recorded as `live-blocked`, not folded into generic replay failure.

## Review Commands

Inspect a campaign bundle:

```bash
cd surfaces
bun run dogfood:campaign -- inspect \
  --project-root ../thrunt-god/examples/oauth-session-hijack \
  --campaign-id CERT-OKTA-...
```

Replay and classify drift:

```bash
cd surfaces
bun run dogfood:campaign -- replay \
  --project-root ../thrunt-god/examples/oauth-session-hijack \
  --campaign-id CERT-OKTA-...
```
