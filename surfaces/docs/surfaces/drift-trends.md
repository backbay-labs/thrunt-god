# Drift Trends

## Fixture-Backed Behavior

- Fixture regressions still catch adapter breakage immediately, but they do not describe longitudinal live drift.
- Phase six keeps fixture replay and drift-trend reporting separate on purpose.

## Live-Capable Behavior

- The certification ledger now writes `.planning/certification/drift-trends.json`.
- Per vendor it aggregates:
  - total campaigns
  - live-blocked and live-certified counts
  - unresolved campaign count
  - drift frequency by class
  - recurring blockers
  - last stable baseline/campaign
  - suspicion flags such as `adapter_instability`, `auth_session_churn`, `visibility_inconsistency`, `baseline_staleness`, and `repeated_blocker_pattern`

Query it directly:

```bash
cd surfaces
bun run dogfood:campaign:trends -- --project-root ../thrunt-god/examples/oauth-session-hijack
```

## Truly Live-Certified Behavior

- When repeated live campaigns exist, drift trends become the longitudinal certification posture for each vendor.
- A stable vendor should show an active baseline, a recent stable campaign, and low unresolved drift.

## Blocked Behavior

- In the current example workspace, drift trend output is dominated by recurring blocker patterns rather than parser drift because no real sessions have been captured yet.
- That is expected and correct; the trend data still surfaces repeated missing-profile and missing-session failures instead of pretending they are one-off issues.
