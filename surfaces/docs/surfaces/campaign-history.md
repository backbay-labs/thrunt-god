# Campaign History

## Fixture-Backed Behavior

- Fixture runs still drive `status.json`, but campaign history is derived only from live-campaign bundles.
- Fixture counts remain visible as context in vendor status summaries.

## Live-Capable Behavior

- The bridge and CLI now emit `.planning/certification/history.json`.
- Each vendor history summary contains:
  - total campaign count
  - last campaign id and capture time
  - last reviewed time
  - live-certified / live-blocked / drift-detected counts
  - blocker count
  - promotion count
  - current active baseline reference
- Query it directly:

```bash
cd surfaces
bun run dogfood:campaign:history -- --project-root ../thrunt-god/examples/oauth-session-hijack
```

## Truly Live-Certified Behavior

- Once a vendor has approved live campaigns, history will show non-zero `liveCertifiedCount`, a reviewed timestamp, and an active baseline reference.
- History is the reviewer-grade longitudinal view of certification, not a transient run log.

## Blocked Behavior

- In the current example workspace, `history.json` shows only `live-blocked` campaigns for Okta, Sentinel, and AWS.
- That blocked history is still useful because it makes repeated prerequisite failures visible over time instead of hiding them in one-off console output.
