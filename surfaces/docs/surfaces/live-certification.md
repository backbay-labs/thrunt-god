# Live Certification

## Fixture-Backed Behavior

- Okta, Sentinel, and AWS remain regression-tested against checked-in browser fixtures.
- Fixture counts still contribute to vendor summaries in `.planning/certification/status.json`.

## Live-Campaign-Capable Behavior

- Live certification now runs through campaign bundles under `.planning/certification/campaigns/`.
- A campaign can carry:
  - sanitized capture
  - replay output
  - runtime preview
  - runtime execute
  - reviewer decisions
  - promotion decisions
- The report path remains:
  - `.planning/certification/status.json`
  - `.planning/certification/report.json`

## Actually Live-Certified Outcomes

- A campaign only becomes `live-certified` after:
  1. a real capture exists
  2. replay is acceptable
  3. runtime evidence is attached or blocked honestly
  4. a reviewer approves certification
- On **April 11, 2026**, this repo contains no checked-in real-tenant campaigns already in that state.

## Blocked Outcomes

- The correct output for missing sessions, missing connector profiles, or missing secrets is `live-blocked`.
- Phase five now writes those blocked outcomes as campaign bundles instead of leaving them implicit.
