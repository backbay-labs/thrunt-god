# Fixture Testing

Phase three validates Okta, Sentinel, and AWS extraction against local browser fixtures instead of live vendor sessions.

## Real Working Behavior

- `surfaces-site-adapters` contains real vendor-specific extraction logic for Okta, Sentinel, and AWS.
- The browser validation suite runs the adapters in Chromium against routed fixture pages, not against mocked function calls.
- Fixture metadata declares expected detection, page classification, query extraction, entity extraction, table summaries, and extraction quality signals.
- The automated suite covers rich, empty, partial-context, and unsupported variants for each vendor.

## Fixture-Backed Behavior

- Fixture corpus lives under `surfaces/packages/surfaces-site-adapters/test/fixtures/`.
- Current variants:
  - Okta: `system-log-rich.html`, `system-log-empty.html`, `settings-unsupported.html`
  - Sentinel: `logs-rich.html`, `incident-partial.html`, `portal-home-unsupported.html`
  - AWS: `cloudtrail-rich.html`, `cloudwatch-empty.html`, `support-center-unsupported.html`
- Browser harness: `surfaces/packages/surfaces-site-adapters/test/browser-harness.ts`
- Browser suite: `surfaces/packages/surfaces-site-adapters/test/adapters.playwright.test.ts`
- Fixtures are routed under realistic vendor URLs so adapter URL heuristics and DOM extraction both execute in browser context.

## Remaining Mocked Or Blocked

- No claim is made that these fixtures certify live vendor DOM compatibility.
- SPA churn, tenant-specific customizations, and vendor A/B variants still require manual dogfooding in real consoles.
- Splunk, Kibana, and other surfaces remain out of scope for this phase.

## Runbook

1. Install workspace dependencies from `surfaces/` with `bun install`.
2. Install Chromium once with `npx playwright install chromium`.
3. Run `bun test` in `surfaces/packages/surfaces-site-adapters`.

## Dogfood Notes

- The fixture suite is the regression gate for extraction behavior.
- Live browser sessions are still useful for selector drift discovery, but fixture failures are the phase-three truth source for automated validation.
