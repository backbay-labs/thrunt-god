# Live Operations

## Fixture-Backed Behavior

- Use `bun test` in `surfaces/packages/surfaces-site-adapters` to validate extraction against local fixtures.
- Use `bun run dogfood:certify -- --project-root <root>` to replay campaign bundles and refresh `status.json`, `history.json`, and `drift-trends.json`.

## Live-Capable Behavior

1. Check or start a campaign:

```bash
cd surfaces
bun run dogfood:campaign:prereqs -- --project-root ../thrunt-god/examples/oauth-session-hijack --vendor okta --operator analyst-1
```

```bash
cd surfaces
bun run dogfood:campaign:start -- --project-root ../thrunt-god/examples/oauth-session-hijack --vendor okta --operator analyst-1 --tenant-label acme-prod
```

2. Capture a live session from the extension dev path or CLI `capture`.
3. Replay:

```bash
bun run dogfood:campaign -- replay --project-root ../thrunt-god/examples/oauth-session-hijack --campaign-id CERT-OKTA-...
```

4. Attach runtime evidence:

```bash
bun run dogfood:campaign -- preview --project-root ../thrunt-god/examples/oauth-session-hijack --campaign-id CERT-AWS-... --pack-id domain.cloud-abuse --target "AWS CloudTrail principal abuse sweep"
```

```bash
bun run dogfood:campaign -- execute --project-root ../thrunt-god/examples/oauth-session-hijack --campaign-id CERT-AWS-... --pack-id domain.cloud-abuse --target "AWS CloudTrail principal abuse sweep"
```

5. Inspect current ledger state:

```bash
bun run dogfood:campaign:history -- --project-root ../thrunt-god/examples/oauth-session-hijack
bun run dogfood:campaign:trends -- --project-root ../thrunt-god/examples/oauth-session-hijack
bun run dogfood:campaign:baselines -- --project-root ../thrunt-god/examples/oauth-session-hijack
```

## Truly Live-Certified Behavior

- A live-certified campaign bundle contains:
  - `campaign.json`
  - `review.md`
  - `prerequisites.json`
  - `replay.json`
  - `runtime-preview.json`
  - optionally `runtime-execute.json`
- Certification is real only after reviewer approval changes the campaign status to `live-certified`.

## Blocked Behavior

- `dogfood:campaign:start` persists a `live-blocked` campaign when prerequisites fail.
- The current example workspace is blocked by missing browser-session context and missing connector profiles; Sentinel also lacks a smoke spec.
- These blocked bundles are the correct operational output until a human supplies real sessions and connector material.
