# Live Campaigns

## Fixture-Backed Behavior

- Okta, Sentinel, and AWS still have fixture manifests and replayable HTML snapshots under `surfaces/packages/surfaces-site-adapters/test/fixtures/`.
- The replay harness continues to prove adapter extraction against those fixtures before live capture is involved.
- Fixture counts are folded into `.planning/certification/status.json` so vendor summaries still report regression depth even when there are no live campaigns.

## Live-Campaign-Capable Behavior

- Phase five adds a canonical campaign bundle layout under `.planning/certification/campaigns/<campaign-id>/`.
- Each campaign bundle now carries:
  - `campaign.json`
  - `snapshot.html`
  - `capture.json`
  - `replay.json` when replay has run
  - `runtime-preview.json` and `runtime-execute.json` when attached
  - `review.md`
- Capture can come from the extension dev action or from the CLI script:

```bash
cd surfaces
bun run dogfood:campaign -- capture \
  --project-root ../thrunt-god/examples/oauth-session-hijack \
  --vendor okta \
  --snapshot-file /path/to/snapshot.html \
  --expected-file /path/to/extraction.json \
  --page-url https://redacted-okta-tenant.okta.com/admin/reports/system-log
```

- Campaign statuses are now explicit and inspectable:
  - `live-certified`
  - `drift-detected`
  - `live-blocked`
  - `review-required`
  - `failed-capture`

## Actually Live-Certified Outcomes

- On **April 11, 2026**, there are no checked-in real-tenant campaigns marked `live-certified` in this workspace.
- The tooling is capable of producing `live-certified` once a human operator captures a real session, replays it cleanly, attaches runtime evidence, and approves the campaign.
- Approval is explicit. Replay pass alone only moves a campaign to `review-required`.

## Blocked Outcomes

- If live sessions, connector profiles, secrets, or permissions are missing, phase five writes `live-blocked` campaign bundles instead of silently skipping the run.
- Those bundles are the right artifact for this environment until a human runs the real tenant campaign flow.
