# Runtime Depth

## Real Working Behavior

- The bridge now has a real runtime preview path. `POST /api/execute/pack` with `dryRun: true` delegates to `thrunt-tools.cjs pack render-targets` and then `runtime doctor` for each rendered target.
- Preview responses surface:
  - resolved pack and target
  - connector, dataset, query language, query summary, and time window
  - readiness blockers from THRUNT runtime checks
  - case-projection state under `runtimePreview`
- The bridge now has a real runtime execute path beyond pack resolution. `POST /api/execute/pack` without `dryRun` delegates to `thrunt-tools.cjs runtime execute --pack ...`.
- Direct runtime targets are also real. `POST /api/execute/target` runs `runtime doctor` and then `runtime execute --connector ... --query ...`.
- Successful executions refresh the case projection and surface:
  - `lastExecution`
  - created query artifact ids
  - created receipt artifact ids
  - artifact paths when THRUNT runtime emitted them
- Runtime preview and runtime execution stay local-first and reuse THRUNT’s existing runtime, not a second bridge-specific engine.

## Fixture-Backed Behavior

- Bridge runtime tests use local fake Okta, Sentinel, and AWS HTTP backends plus real THRUNT runtime commands.
- The fixture-backed runtime path proves:
  - preview success
  - preview blocker reporting when profiles are missing
  - pack execution producing canonical `QUERIES/` and `RECEIPTS/`
  - direct connector execution producing canonical query artifacts

## Live-Certified Behavior

- None yet in this repository.
- Runtime depth is real against THRUNT runtime and local fake connectors, but the current repo does not contain a checked-in live connector certification run proving repeated execution against live Okta, Sentinel, or AWS tenants.

## Blocked / Not Yet Complete

- The bridge still does not introduce any write-capable remote mutation path beyond what THRUNT runtime already defines as safe. Phase four keeps runtime execution read-only from the vendor perspective.
- Runtime execution does not attempt to infer every possible missing pack parameter. It fills the minimum operator-safe defaults needed for the supported phase-four loop.
- Remote connector auth and tenant material are still environment-specific. If the operator does not have valid connector profiles, preview will surface the exact THRUNT readiness blockers instead of simulating success.
