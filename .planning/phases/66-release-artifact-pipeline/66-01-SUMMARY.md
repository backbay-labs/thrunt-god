---
phase: 66-release-artifact-pipeline
plan: 01
subsystem: infra
tags: [obsidian, release, installer, npm, github-actions]
requires:
  - phase: 65-obsidian-cli-install-channel
    provides: "Standalone Obsidian install flow and canonical staged installer bundle"
provides:
  - "Shared Obsidian installer/release asset contract under scripts/lib"
  - "Local Obsidian release bundle command that builds via the root build:obsidian entrypoint"
  - "Tracked Obsidian build metadata files required by the release bundle path"
affects: [66-02, 66-03, release-pipeline, obsidian-install]
tech-stack:
  added: []
  patterns:
    - "Installer and release automation share one Obsidian asset contract"
    - "Local release bundles build through root package scripts instead of app-local one-offs"
key-files:
  created:
    - ".planning/phases/66-release-artifact-pipeline/66-01-SUMMARY.md"
    - "scripts/lib/obsidian-artifacts.cjs"
    - "scripts/build-obsidian-release.cjs"
    - "apps/obsidian/manifest.json"
    - "apps/obsidian/versions.json"
  modified:
    - "bin/install.js"
    - "package.json"
key-decisions:
  - "The release bundle script validates root/package/manifest/versions sync before building or copying assets"
  - "The release bundle script shells through root build:obsidian so local and CI bundle generation share the same build path"
patterns-established:
  - "Obsidian distribution metadata is treated as release infrastructure and tracked alongside the build entrypoint"
  - "Installer-facing asset lists are imported from scripts/lib instead of duplicated in bin/install.js"
requirements-completed: [RELEASE-01, RELEASE-04]
duration: 10min
completed: 2026-04-11
---

# Phase 66 Plan 01: Release Artifact Pipeline Summary

**Shared Obsidian release contract plus a repo-level bundle command that produces release-ready plugin assets from the same build path used by the installer**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-11T20:13:00Z
- **Completed:** 2026-04-11T20:23:39Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added a shared Obsidian asset/version contract module for installer and release automation.
- Added `scripts/build-obsidian-release.cjs` to validate version sync, build the plugin, and assemble `dist/obsidian-release/`.
- Wired `bin/install.js` and root `package.json` to reuse the shared contract and exposed `npm run bundle:obsidian-release`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create a shared Obsidian artifact/version contract module plus a release bundle script** - `ba47328d` (`feat`)
2. **Task 2: Wire the shared artifact contract into the installer and root package scripts** - `a5277b3e` (`feat`)

## Files Created/Modified

- `scripts/lib/obsidian-artifacts.cjs` - Defines shared install/release asset lists and version-sync assertions.
- `scripts/build-obsidian-release.cjs` - Builds the Obsidian app through the root script and assembles the release bundle.
- `bin/install.js` - Imports the shared installer asset contract instead of maintaining a local hardcoded list.
- `package.json` - Adds `bundle:obsidian-release`.
- `apps/obsidian/manifest.json`, `apps/obsidian/versions.json`, `apps/obsidian/esbuild.config.mjs`, `apps/obsidian/tsconfig.json`, `apps/obsidian/version-bump.mjs`, `apps/obsidian/src/settings.ts` - Tracks the build and metadata files the release bundle path depends on.

## Decisions Made

- The shared version guard lives in `scripts/lib/obsidian-artifacts.cjs` so both the local release bundle script and later CI checks can reuse the same rule set.
- The release bundle command writes only the managed bundle files into `dist/obsidian-release/` and clears stale managed files before copying new artifacts.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The Obsidian release path depended on build and metadata files that existed locally but were not yet tracked on this branch. They were added in the same plan so the new bundle path works from a clean checkout instead of only in the current worktree.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 66-02 can now call `npm run bundle:obsidian-release` directly from CI.
- The shared version contract is ready to be reused in workflow validation tests and runtime checks.

## Self-Check: PASSED

- `node scripts/build-obsidian-release.cjs` produced `dist/obsidian-release/main.js`, `manifest.json`, `styles.css`, and `versions.json`.
- `npm run bundle:obsidian-release` exited successfully through the root maintainer entrypoint.
- `bin/install.js` imports `OBSIDIAN_INSTALL_ASSETS` from the shared contract module.

---
*Phase: 66-release-artifact-pipeline*
*Completed: 2026-04-11*
