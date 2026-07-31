# Operator Review

## Fixture-Backed Behavior

- Fixture tests still prove baseline extraction quality in CI.
- They do not replace operator review for real tenant captures.

## Live-Campaign-Capable Behavior

- Operator review is now a repeatable workflow around campaign bundles, not an ad hoc read of test output.
- Review inputs can include:
  - captured vendor context
  - sanitized replay output
  - runtime preview summary
  - runtime execute summary
  - drift classification
  - promotion history
- Review can be performed through:
  - extension dev diagnostics
  - bridge endpoints under `/api/certification/campaigns/...`
  - `bun run dogfood:campaign -- inspect|review|promote`

Approve certification:

```bash
cd surfaces
bun run dogfood:campaign -- review \
  --project-root ../thrunt-god/examples/oauth-session-hijack \
  --campaign-id CERT-AWS-... \
  --reviewer analyst-1 \
  --decision approve \
  --notes "Replay clean and runtime path verified"
```

Promote baseline:

```bash
cd surfaces
bun run dogfood:campaign -- promote \
  --project-root ../thrunt-god/examples/oauth-session-hijack \
  --campaign-id CERT-AWS-... \
  --reviewer analyst-1 \
  --decision approve \
  --target baseline \
  --notes "Approved as current replay baseline"
```

## Actually Live-Certified Outcomes

- On **April 11, 2026**, there are no checked-in campaigns in this workspace that have completed the full operator review loop into `live-certified`.
- The review mechanism is real; the missing piece here is real tenant evidence, not review plumbing.

## Blocked Outcomes

- If a reviewer rejects a campaign, the bundle records that decision and retains the campaign for later replay or recapture.
- If runtime preview or execute is blocked by missing connector material, review should record the blocker and leave the campaign `live-blocked`.
