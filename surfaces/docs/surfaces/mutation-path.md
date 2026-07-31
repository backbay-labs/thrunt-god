# Mutation Path

Phase three makes the bridge mutate real THRUNT state through `thrunt-tools.cjs` instead of presenting read-only fallbacks as success.

## Real Working Behavior

- Deterministic tools resolution lives in `surfaces/apps/surface-bridge/src/thrunt-tools.ts`.
- Resolution order is:
  - explicit `BridgeConfig.toolsPath`
  - `THRUNT_TOOLS_PATH`
  - repo-local and installed THRUNT layouts
- Resolution tests live in `surfaces/apps/surface-bridge/test/thrunt-tools.test.ts`.
- `POST /api/case/open` now delegates to:
  - `case new <title> --signal <signal> --bootstrap-program --raw`
- `case new --bootstrap-program` creates the thinnest valid THRUNT program root when one does not exist, then creates the case and sets `.planning/.active-case`.
- `POST /api/execute/next` now performs a real subprocess mutation when the case is actionable:
  - `state advance-plan --raw` when the current case is not on its last plan
  - `phase complete <phase> --raw` when phase completion is the next THRUNT-owned step
- Bridge responses now return structured mutation metadata:
  - executed command
  - exit code
  - stdout/stderr
  - whether a real mutation occurred
  - refreshed case view after success

## Fixture-Backed Behavior

- Mutation path tests use fresh temp workspaces in:
  - `surfaces/apps/surface-bridge/test/bridge.test.ts`
  - `surfaces/apps/browser-extension/test/extension.test.ts`
- These tests open a real case, attach evidence, run `execute-next`, and verify the refreshed case projection.

## Remaining Mocked Or Blocked

- `executePack()` still does pack resolution only. It does not run arbitrary pack execution through the bridge.
- Open-case bootstrapping is intentionally thin. It creates valid THRUNT program/case artifacts for bridge-driven operator flow, but it does not replace the richer `/hunt:new-program` workflow.
- Direct bridge-side state rewrites remain out of scope. THRUNT CLI remains the mutation contract.

## Dogfood Path

1. Start the bridge with a resolvable `thrunt-tools.cjs`.
2. Open a case from detected vendor context.
3. Attach evidence from the browser extension.
4. Run `Execute Next`.
5. Confirm the side panel refreshes with updated plan progress from THRUNT state.
