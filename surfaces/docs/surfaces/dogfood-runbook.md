# Dogfood Runbook

## Fixture-Backed Behavior

- Run adapter fixtures and certification replay first:

```bash
cd surfaces/packages/surfaces-site-adapters
bun test
```

```bash
cd surfaces
bun run dogfood:certify -- --project-root ../thrunt-god/examples/oauth-session-hijack
```

- This is the safe baseline when live sessions or connector material are unavailable.

## Live-Capable Behavior

### 1. Bootstrap a case

```bash
cd surfaces
bun run dogfood:test-case -- --signal "Okta, Sentinel, or AWS shows suspicious operator activity"
```

### 2. Start the bridge

```bash
cd surfaces
bun run dogfood:bridge -- --project-root ../thrunt-god/examples/oauth-session-hijack
```

### 3. Load the extension

- Load `surfaces/apps/browser-extension/` as unpacked in Chrome.
- Open the side panel.
- Enable dev diagnostics when needed:

```js
localStorage.thrunt_surfaces_dev_mode = "1"
```

### 4. Check prerequisites or start a blocked campaign

```bash
cd surfaces
bun run dogfood:campaign:prereqs -- --project-root ../thrunt-god/examples/oauth-session-hijack --vendor okta --operator analyst-1 --reviewer reviewer-1 --page-url https://tenant.okta.com/admin/reports/system-log --page-title "System Log"
```

```bash
cd surfaces
bun run dogfood:campaign:start -- --project-root ../thrunt-god/examples/oauth-session-hijack --vendor okta --operator analyst-1 --tenant-label tenant-prod
```

- `start` writes a `live-blocked` campaign bundle immediately when prerequisites fail.

### 5. Capture a real session

- Preferred: use `Capture Live Snapshot` from the extension dev path.
- CLI fallback:

```bash
cd surfaces
bun run dogfood:campaign -- capture --project-root ../thrunt-god/examples/oauth-session-hijack --vendor okta --snapshot-file /path/to/snapshot.html --expected-file /path/to/extraction.json --page-url https://tenant.okta.com/admin/reports/system-log --tenant-label tenant-prod --operator analyst-1
```

### 6. Replay the sanitized capture

```bash
cd surfaces
bun run dogfood:campaign -- replay --project-root ../thrunt-god/examples/oauth-session-hijack --campaign-id CERT-OKTA-...
```

### 7. Attach runtime preview and safe read-only execute

```bash
cd surfaces
bun run dogfood:campaign -- preview --project-root ../thrunt-god/examples/oauth-session-hijack --campaign-id CERT-AWS-... --pack-id domain.cloud-abuse --target "AWS CloudTrail principal abuse sweep"
```

```bash
cd surfaces
bun run dogfood:campaign -- execute --project-root ../thrunt-god/examples/oauth-session-hijack --campaign-id CERT-AWS-... --pack-id domain.cloud-abuse --target "AWS CloudTrail principal abuse sweep"
```

### 8. Inspect history, trends, and baselines

```bash
cd surfaces
bun run dogfood:campaign:history -- --project-root ../thrunt-god/examples/oauth-session-hijack
bun run dogfood:campaign:trends -- --project-root ../thrunt-god/examples/oauth-session-hijack
bun run dogfood:campaign:baselines -- --project-root ../thrunt-god/examples/oauth-session-hijack
bun run dogfood:campaign:freshness -- --project-root ../thrunt-god/examples/oauth-session-hijack
bun run dogfood:campaign:churn -- --project-root ../thrunt-god/examples/oauth-session-hijack
```

### 9. Submit for review

```bash
cd surfaces
bun run dogfood:campaign:submit -- --project-root ../thrunt-god/examples/oauth-session-hijack --campaign-id CERT-OKTA-... --submitted-by analyst-1 --notes "Replay and runtime evidence are assembled"
```

### 10. Review and promote

```bash
cd surfaces
bun run dogfood:campaign -- review --project-root ../thrunt-god/examples/oauth-session-hijack --campaign-id CERT-OKTA-... --reviewer reviewer-1 --decision approve --notes "Replay and runtime path look healthy"
```

```bash
cd surfaces
bun run dogfood:campaign -- review --project-root ../thrunt-god/examples/oauth-session-hijack --campaign-id CERT-OKTA-... --reviewer reviewer-1 --decision request_follow_up --follow-up "Capture a fully loaded results pane" --notes "Need one more tenant capture before approval"
```

```bash
cd surfaces
bun run dogfood:campaign -- promote --project-root ../thrunt-god/examples/oauth-session-hijack --campaign-id CERT-OKTA-... --reviewer reviewer-1 --decision approve --target baseline --notes "Promote as active baseline"
```

### 11. Refresh the certification ledger

```bash
cd surfaces
bun run dogfood:certify -- --project-root ../thrunt-god/examples/oauth-session-hijack
```

## Truly Live-Certified Behavior

- A real live-certified loop ends with:
  - a captured live bundle
  - replay output
  - runtime preview/execute evidence where supported
  - explicit review submission
  - reviewer approval
  - optional baseline promotion
  - updated `history.json`, `drift-trends.json`, `freshness.json`, `baseline-churn.json`, `review-ledger.json`, and `status.json`

## Blocked Behavior

- On April 11, 2026 the checked-in example workspace remains blocked.
- Exact current blockers:
  - Okta: missing live browser session context, missing `okta.default` connector profile, auth profile not validated
  - Sentinel: missing live browser session context, missing `sentinel.default` connector profile, auth profile not validated, no smoke spec
  - AWS: missing live browser session context, missing `aws.default` connector profile, auth profile not validated
- Those blocked campaign bundles are committed under `.planning/certification/campaigns/` and are the correct dogfood output for this environment.
- Freshness stays `uncertified`, and churn stays `no_baseline`, until a reviewer-approved live campaign and baseline promotion actually exist.
