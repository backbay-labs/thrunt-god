---
phase: 65-obsidian-cli-install-channel
plan: 03
subsystem: testing
tags: [obsidian, cli, installer, node-test, symlink]
requires:
  - phase: 65-01
    provides: "Standalone --obsidian mode plus canonical bundle staging contract"
  - phase: 65-02
    provides: "Vault discovery, per-vault reporting, and symlink-based install/update behavior"
provides:
  - "Injectable Obsidian installer helpers with CLI-safe THRUNT_* overrides"
  - "Helper-level regression coverage for vault discovery, symlink creation, repair, and no-vault fallback"
  - "Real CLI smoke coverage for help, invalid flags, install, reinstall, and no-vault fallback"
affects: [Phase 66, Phase 67, obsidian-installer]
tech-stack:
  added: []
  patterns:
    - "Dependency-injected installer helpers with env override fallbacks"
    - "Combined helper and child-process smoke coverage in node:test"
key-files:
  created:
    - .planning/phases/65-obsidian-cli-install-channel/65-03-SUMMARY.md
  modified:
    - bin/install.js
    - tests/hunt-install.test.cjs
key-decisions:
  - "THRUNT_HOME, THRUNT_OBSIDIAN_CONFIG, THRUNT_OBSIDIAN_PLUGIN_SOURCE, and THRUNT_OBSIDIAN_SKIP_BUILD are the disposable-fixture override surface for CLI smoke tests while production defaults remain unchanged."
  - "Installer repair now unlinks existing files and symlinks explicitly, reserving recursive removal for real directories."
  - "CLI smoke tests clear THRUNT_TEST_MODE and execute bin/install.js in child processes so the operator path is exercised directly."
patterns-established:
  - "Obsidian installer helpers accept options-object injection first, with environment overrides only as optional CLI defaults."
  - "Installer regression coverage keeps bundle-contract assertions explicit by naming main.js, manifest.json, and styles.css in both helper and CLI tests."
requirements-completed: [INST-01, INST-02, INST-03, INST-04, INST-05, INST-06]
duration: 8 min
completed: 2026-04-11
---

# Phase 65 Plan 03: Obsidian CLI Install Channel Summary

**Node:test regression and real CLI smoke coverage for the Obsidian installer, including staged asset contract, vault discovery, link repair, and no-vault fallback**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-11T19:53:40Z
- **Completed:** 2026-04-11T20:01:47Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Added injectable Obsidian installer inputs plus CLI-safe `THRUNT_*` overrides so tests can redirect home, config, plugin source, and build behavior into disposable fixtures.
- Added helper-level regression coverage for vault discovery, bundle linking, reinstall repair, happy-path install, and no-vault fallback in `tests/hunt-install.test.cjs`.
- Added child-process smoke coverage for the real `node bin/install.js --obsidian` flow across help, invalid flag rejection, clean install, reinstall, and no-vault fallback.

## Task Commits

Each task was committed atomically:

1. **Task 1: Make the Obsidian installer helpers directly testable with temp directories and mocked build behavior** - `abe2ab0f` (feat)
2. **Task 2: Add installer regression tests for staging, vault discovery, symlink repair, and no-vault fallback** - `0f3b6ebb` (test)
3. **Task 3: Add real CLI smoke verification for help, invalid flags, install, reinstall, and no-vault fallback** - `6a90c829` (test)

**Plan metadata:** recorded in the final docs/state commit after summary and planning updates

## Files Created/Modified

- `.planning/phases/65-obsidian-cli-install-channel/65-03-SUMMARY.md` - Phase execution record with deviations, decisions, and verification outcomes
- `bin/install.js` - Obsidian installer injection/env overrides plus robust stale-target replacement for repair flows
- `tests/hunt-install.test.cjs` - Helper-level and real-CLI regression coverage for the Obsidian install channel

## Decisions Made

- Used four explicit `THRUNT_*` environment variables as the CLI-safe fixture surface instead of introducing test-only flags into the public installer interface.
- Kept helper testability centered on `installObsidian(options)` and existing `THRUNT_TEST_MODE` exports rather than creating a separate installer entrypoint.
- Treated existing symlinks and regular files as unlink targets during repair so reinstall coverage can prove broken-link recovery deterministically.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed broken-symlink repair during reinstall flows**
- **Found during:** Task 2 (Add installer regression tests for staging, vault discovery, symlink repair, and no-vault fallback)
- **Issue:** Reinstalling over a broken symlink could leave the target path in place and cause `EEXIST` when recreating the staged asset link.
- **Fix:** Switched stale-target removal to unlink files and symlinks directly, using recursive deletion only for real directories.
- **Files modified:** `bin/install.js`
- **Verification:** `node --test tests/hunt-install.test.cjs`
- **Committed in:** `0f3b6ebb` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The auto-fix was required for the reinstall/repair contract the plan explicitly targeted. No scope creep.

## Issues Encountered

- Shared worktree git commits briefly hit `index.lock` contention when `git add` and `git commit` were triggered concurrently; resolved by clearing the stale lock and retrying commits sequentially.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 65 now has executable coverage around the installer contract, which gives Phase 66 a stable asset/staging target for release automation.
- Real CLI smoke tests prove the bundle contract remains `main.js`, `manifest.json`, and `styles.css`, reducing channel-drift risk for release and community-directory work.

## Self-Check: PASSED

- Verified `.planning/phases/65-obsidian-cli-install-channel/65-03-SUMMARY.md` exists.
- Verified task commits `abe2ab0f`, `0f3b6ebb`, and `6a90c829` exist in git history.

---
*Phase: 65-obsidian-cli-install-channel*
*Completed: 2026-04-11*
