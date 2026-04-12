# Certification Status Model

## Fixture-Backed Behavior

- Fixture validation still exists independently of live campaigns.
- A vendor can remain effectively fixture-only even when no live campaign has started.

## Live-Campaign-Capable Behavior

### Vendor Summary Status

- `.planning/certification/status.json` remains the vendor-level summary file.
- It now reflects the latest campaign state per vendor plus fixture coverage counts.

### Campaign Status Lifecycle

1. `failed-capture`
   - capture bundle was incomplete or unusable
2. `live-blocked`
   - capture is missing or runtime prerequisites are missing
3. `drift-detected`
   - replay found blocking drift
4. `review-required`
   - replay is acceptable but human approval is still pending
5. `live-certified`
   - reviewer approved the campaign and there are no blocking replay/runtime conditions

### Promotion State

- Promotions are tracked separately from certification status.
- Supported promotion targets:
  - `baseline`
  - `fixture_candidate`
  - `regression_input`
- Promotion states:
  - `none`
  - `approved`
  - `rejected`

## Actually Live-Certified Outcomes

- This workspace can now express `live-certified` honestly, but on **April 11, 2026** there are no checked-in real-tenant campaigns in that state.

## Blocked Outcomes

- If no live session exists, a campaign should be created as `live-blocked` with concrete prerequisites.
- If replay fails due to auth/session problems, the drift classification should record `auth_session_degradation`.
- If runtime preview or execute is blocked by missing connector profiles or secret refs, that is also `live-blocked`.
