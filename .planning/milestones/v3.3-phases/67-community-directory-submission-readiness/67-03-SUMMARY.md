---
phase: 67-community-directory-submission-readiness
plan: 03
subsystem: infra
tags: [obsidian, submission, metadata, release, checklist]
requires:
  - phase: 67-community-directory-submission-readiness
    provides: "Community-review-safe plugin package and public plugin-facing docs"
provides:
  - "Scripted root-level submission metadata sync for manifest and versions"
  - "Community-plugin PR checklist and ready-to-paste entry snippet"
  - "Regression coverage for root/app metadata parity and submission handoff rules"
affects: [phase-verification, milestone-completion, future-plugin-releases]
tech-stack:
  added: []
  patterns:
    - "Repository-root submission metadata is synchronized from apps/obsidian through an explicit script"
    - "Community submission docs point back to the release bundle flow so release and directory maintenance stay unified"
key-files:
  created:
    - ".planning/phases/67-community-directory-submission-readiness/67-03-SUMMARY.md"
    - "manifest.json"
    - "versions.json"
    - "scripts/sync-obsidian-submission-files.cjs"
    - "docs/obsidian-community-submission.md"
    - "docs/obsidian-community-plugin-entry.json"
    - "tests/obsidian-community-submission.test.cjs"
  modified:
    - ".gitignore"
    - "package.json"
key-decisions:
  - "Root submission metadata is treated as committed source derived from the real app metadata, not handwritten duplicates"
  - "The PR handoff doc explicitly references the release bundle command and sync command so maintainers follow one flow"
patterns-established:
  - "Community-directory maintenance gets a dedicated JSON snippet file instead of burying the PR object inside prose"
  - "Root build-output directories stay gitignored to keep release artifacts out of commit noise"
requirements-completed: [COMM-03, COMM-04]
duration: 2min
completed: 2026-04-11
---

# Phase 67 Plan 03: Community Directory Submission Readiness Summary

**The repo now has synchronized root submission metadata, a documented release-to-directory handoff, and automated safeguards against community-entry drift**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-11T20:40:40Z
- **Completed:** 2026-04-11T20:42:36Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added a sync script and package command for keeping repository-root `manifest.json` and `versions.json` aligned with `apps/obsidian/`.
- Added the community-submission runbook and a ready-to-paste `community-plugins.json` entry snippet.
- Added a submission regression test that enforces root/app metadata parity, package-script presence, `dist/` ignore rules, and snippet freshness.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add root-level submission metadata and a scripted sync path for Obsidian community-plugin files** - `9c5513fe` (`feat`)
2. **Task 2: Write the submission checklist and ready-to-paste community-plugin entry metadata** - `2cf02bd3` (`docs`)
3. **Task 3: Add a submission-metadata regression test that proves root metadata stays synchronized** - `2db704fe` (`test`)

## Files Created/Modified

- `scripts/sync-obsidian-submission-files.cjs` - Copies app metadata into the repository root and emits a sync payload.
- `manifest.json`, `versions.json` - Provide the repo-root metadata surface expected by community-plugin ingestion.
- `package.json` - Adds `sync:obsidian-submission`.
- `.gitignore` - Ignores `dist/` release output.
- `docs/obsidian-community-submission.md` - Documents the release-to-directory handoff checklist.
- `docs/obsidian-community-plugin-entry.json` - Provides the PR snippet for `community-plugins.json`.
- `tests/obsidian-community-submission.test.cjs` - Verifies the sync contract and snippet freshness.

## Decisions Made

- The sync script writes the root metadata directly from `apps/obsidian/` so the submission-facing files can never become an independent source of truth.
- The submission runbook stays separate from the release runbook because the community-directory PR step is manual even after the release pipeline is automated.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 67 now has all three plan deliverables in place and is ready for final verification.
- Future Obsidian releases have a concrete repo-local path for keeping root metadata, release assets, and community-directory updates aligned.

## Self-Check: PASSED

- `node scripts/sync-obsidian-submission-files.cjs` exited successfully and kept root metadata aligned.
- `node --test tests/obsidian-community-submission.test.cjs` passed with 3 tests and 0 failures.
- The submission runbook references both `npm run sync:obsidian-submission` and `npm run bundle:obsidian-release`.

---
*Phase: 67-community-directory-submission-readiness*
*Completed: 2026-04-11*
