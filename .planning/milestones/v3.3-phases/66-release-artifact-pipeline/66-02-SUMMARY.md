---
phase: 66-release-artifact-pipeline
plan: 02
subsystem: infra
tags: [github-actions, release, obsidian, npm, ci]
requires:
  - phase: 66-release-artifact-pipeline
    provides: "Shared Obsidian release bundle command and version contract helpers"
provides:
  - "Release workflow installs Obsidian dependencies from a tracked lockfile"
  - "Release workflow validates Obsidian metadata/version alignment before publishing"
  - "GitHub releases attach the four Obsidian bundle assets"
affects: [66-03, release-workflow-tests, github-release]
tech-stack:
  added: []
  patterns:
    - "CI reuses repo-local release bundle entrypoints instead of duplicating build logic in YAML"
    - "Release workflows validate per-surface package metadata before artifact upload"
key-files:
  created:
    - ".planning/phases/66-release-artifact-pipeline/66-02-SUMMARY.md"
    - "apps/obsidian/package-lock.json"
  modified:
    - ".github/workflows/release.yml"
key-decisions:
  - "The release workflow calls assertObsidianVersionSync via node so CI enforces the same rules as the local bundle script"
  - "The GitHub release title is now channel-neutral because a release now ships npm, MCP, VSIX, and Obsidian artifacts together"
patterns-established:
  - "Obsidian release assets are uploaded as first-class release artifacts beside the existing packages"
  - "apps/obsidian/package-lock.json is treated as a CI cache and install input, not just local tooling output"
requirements-completed: [RELEASE-02, RELEASE-03, RELEASE-04]
duration: 2min
completed: 2026-04-11
---

# Phase 66 Plan 02: Release Artifact Pipeline Summary

**GitHub release automation now installs the Obsidian app, enforces metadata sync, builds the shared release bundle, and uploads all four plugin assets**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-11T20:24:00Z
- **Completed:** 2026-04-11T20:25:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Refreshed and tracked `apps/obsidian/package-lock.json` so CI can use `npm --prefix apps/obsidian ci`.
- Updated `release.yml` to install Obsidian dependencies and validate root/package/manifest/versions alignment with the shared helper.
- Wired `release.yml` to run `npm run bundle:obsidian-release` and upload `main.js`, `manifest.json`, `styles.css`, and `versions.json` to GitHub releases.

## Task Commits

Each task was committed atomically:

1. **Task 1-2: Make the release workflow Obsidian-aware end-to-end** - `8f2e8e54` (`feat`)

## Files Created/Modified

- `apps/obsidian/package-lock.json` - Locks Obsidian app dependencies for CI cache and `npm ci`.
- `.github/workflows/release.yml` - Adds Obsidian dependency install, version validation, shared bundle build, release uploads, and a neutral release title.

## Decisions Made

- CI uses the shared Node helper instead of re-encoding version comparison logic in shell so the local and remote release paths fail on the same drift rules.
- The release upload step explicitly names each Obsidian artifact file to keep the GitHub release surface deterministic.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 66-03 can now enforce the release contract directly in tests instead of relying on manual workflow inspection.
- The repo has a complete CI release path for Obsidian assets, so the remaining work is regression coverage and maintainer documentation.

## Self-Check: PASSED

- `apps/obsidian/package-lock.json` exists and is ready for `npm --prefix apps/obsidian ci`.
- `.github/workflows/release.yml` now includes `npm --prefix apps/obsidian ci`, `npm run bundle:obsidian-release`, and the four `dist/obsidian-release/*` uploads.
- The release title no longer says `VS Code Extension Alpha`.

---
*Phase: 66-release-artifact-pipeline*
*Completed: 2026-04-11*
