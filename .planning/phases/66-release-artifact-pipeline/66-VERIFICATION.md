---
phase: 66-release-artifact-pipeline
verified: 2026-04-11T20:28:43Z
status: passed
score: 11/11 must-haves verified
---

# Phase 66: Release Artifact Pipeline Verification Report

**Phase Goal:** Extend the existing release workflow so Obsidian assets ship as first-class release artifacts with strict version alignment
**Verified:** 2026-04-11T20:28:43Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

Verification used the three Phase 66 plan files as the contract and checked the implemented release path across scripts, workflow wiring, tests, and maintainer docs. I verified the shared asset/version contract in `scripts/lib/obsidian-artifacts.cjs`, the local bundle command in `scripts/build-obsidian-release.cjs`, the GitHub workflow updates in `.github/workflows/release.yml`, and the targeted automated checks `node --test tests/release-workflow.test.cjs tests/obsidian-release.test.cjs` plus `node scripts/build-obsidian-release.cjs`, all of which passed.

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | The repo has one shared Obsidian asset contract for installer and release channels | ✓ VERIFIED | `scripts/lib/obsidian-artifacts.cjs:6-15` defines `OBSIDIAN_INSTALL_ASSETS` and `OBSIDIAN_RELEASE_ASSETS`; `bin/install.js:9,325-326,5178-5180` imports and exports the installer contract instead of maintaining an independent list. |
| 2 | The shared contract fails fast on root/package/manifest/versions drift | ✓ VERIFIED | `scripts/lib/obsidian-artifacts.cjs:28-77` throws on root package mismatch, Obsidian package mismatch, missing versions entry, and versions-map/minAppVersion mismatch; direct regression coverage exists in `tests/obsidian-release.test.cjs:60-70`. |
| 3 | Maintainers can generate the release-ready Obsidian bundle locally through a repo-level command path | ✓ VERIFIED | `package.json:57-60` adds `bundle:obsidian-release`; `scripts/build-obsidian-release.cjs:18-60` validates versions, shells through `npm run build:obsidian`, and writes `dist/obsidian-release/`; direct probe `node scripts/build-obsidian-release.cjs` exited `0` and emitted the expected JSON payload with the four asset filenames. |
| 4 | The bundle script uses the root `build:obsidian` path and clears stale managed release files before copying new assets | ✓ VERIFIED | `scripts/build-obsidian-release.cjs:35-45` runs `npm run build:obsidian` and removes existing managed files in `dist/obsidian-release/` before rewriting them. |
| 5 | The Obsidian app metadata needed by release automation is now tracked and version-aligned | ✓ VERIFIED | `apps/obsidian/package.json:1-26`, `apps/obsidian/manifest.json:1-10`, and `apps/obsidian/versions.json:1-3` are present and aligned at `0.3.6` / `1.6.0`; `apps/obsidian/package-lock.json` now exists and is wired for CI install. |
| 6 | The GitHub release workflow installs Obsidian dependencies from a tracked lockfile | ✓ VERIFIED | `.github/workflows/release.yml:52-67` includes `apps/obsidian/package-lock.json` in the cache inputs and runs `npm --prefix apps/obsidian ci`; `apps/obsidian/package-lock.json` exists in the repo. |
| 7 | The GitHub release workflow enforces Obsidian version alignment against the release source before publishing | ✓ VERIFIED | `.github/workflows/release.yml:138-157` invokes `assertObsidianVersionSync` using `package.json`, `apps/obsidian/package.json`, `apps/obsidian/manifest.json`, and `apps/obsidian/versions.json`. |
| 8 | The GitHub release workflow builds the shared Obsidian bundle through the same repo-level entrypoint used locally | ✓ VERIFIED | `.github/workflows/release.yml:168-178` runs `npm run bundle:obsidian-release` in the publish-artifact stage rather than duplicating build/copy logic inline. |
| 9 | GitHub releases upload `main.js`, `manifest.json`, `styles.css`, and `versions.json` and no longer use a VS Code-specific title | ✓ VERIFIED | `.github/workflows/release.yml:222-235` attaches all four `dist/obsidian-release/*` assets and sets `TITLE=\"${TAG} - THRUNT God Release\"`. |
| 10 | Release regression coverage exercises both the workflow contract and the real bundle command | ✓ VERIFIED | `tests/release-workflow.test.cjs:12-43` asserts the Obsidian workflow steps; `tests/obsidian-release.test.cjs:24-58` runs the real bundle command and checks the four output assets; `node --test tests/release-workflow.test.cjs tests/obsidian-release.test.cjs` passed with `3` tests, `0` failures. |
| 11 | Maintainers have a concise runbook for the local and CI Obsidian release flow | ✓ VERIFIED | `docs/obsidian-release.md:1-32` documents `npm run bundle:obsidian-release`, the version-sync contract, the four release assets, and the `.github/workflows/release.yml` CI path. |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `scripts/lib/obsidian-artifacts.cjs` | Shared installer/release asset lists and version guard helper | ✓ VERIFIED | Exists and exports the required contract at `scripts/lib/obsidian-artifacts.cjs:6-84`. |
| `scripts/build-obsidian-release.cjs` | Local release bundle command | ✓ VERIFIED | Exists and is substantive at `scripts/build-obsidian-release.cjs:1-63`; direct execution succeeded. |
| `.github/workflows/release.yml` | Obsidian-aware release install, validation, build, and upload flow | ✓ VERIFIED | Exists and includes the full Obsidian release path at `.github/workflows/release.yml:52-67,138-178,222-235`. |
| `apps/obsidian/package-lock.json` | Stable CI dependency input for `npm --prefix apps/obsidian ci` | ✓ VERIFIED | Exists and is referenced from the workflow cache/install path. |
| `tests/release-workflow.test.cjs` | Workflow-level release contract test coverage | ✓ VERIFIED | Exists and asserts the Obsidian workflow contract at `tests/release-workflow.test.cjs:12-43`. |
| `tests/obsidian-release.test.cjs` | Bundle-script output and drift coverage | ✓ VERIFIED | Exists and exercises the bundle command plus drift guard at `tests/obsidian-release.test.cjs:24-70`. |
| `docs/obsidian-release.md` | Maintainer runbook | ✓ VERIFIED | Exists and documents the exact command, contract, and CI path at `docs/obsidian-release.md:1-32`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `bin/install.js` | `scripts/lib/obsidian-artifacts.cjs` | Shared installer asset contract | ✓ WIRED | `bin/install.js:9,325-326` imports `OBSIDIAN_INSTALL_ASSETS`; `bin/install.js:5178-5180` re-exports it for tests. |
| `scripts/build-obsidian-release.cjs` | `package.json` | Root `build:obsidian` entrypoint | ✓ WIRED | `package.json:58-60` defines the root scripts; `scripts/build-obsidian-release.cjs:35-39` runs `npm run build:obsidian`. |
| `.github/workflows/release.yml` | `scripts/lib/obsidian-artifacts.cjs` | Shared version guard in CI | ✓ WIRED | `.github/workflows/release.yml:142-156` imports and executes `assertObsidianVersionSync`. |
| `.github/workflows/release.yml` | `scripts/build-obsidian-release.cjs` | Shared release bundle entrypoint | ✓ WIRED | `.github/workflows/release.yml:168-173` runs `npm run bundle:obsidian-release`, which resolves to `scripts/build-obsidian-release.cjs`. |
| `tests/obsidian-release.test.cjs` | `scripts/build-obsidian-release.cjs` | Runtime bundle verification | ✓ WIRED | `tests/obsidian-release.test.cjs:27-53` executes the real bundle script and validates the output bundle contents. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `RELEASE-01` | `66-01`, `66-03` | Maintainer can produce the same production Obsidian bundle locally via repo scripts without hand-copying files | ✓ SATISFIED | `package.json:58-60` adds the repo-level command; `scripts/build-obsidian-release.cjs:18-60` builds and assembles the release bundle; bundle coverage in `tests/obsidian-release.test.cjs:25-58`. |
| `RELEASE-02` | `66-01`, `66-02`, `66-03` | Tag-based GitHub releases build the Obsidian plugin and fail if package or manifest versions drift from the root release version | ✓ SATISFIED | Drift guard implemented in `scripts/lib/obsidian-artifacts.cjs:28-77`; CI invokes it in `.github/workflows/release.yml:138-157`; direct drift test in `tests/obsidian-release.test.cjs:60-70`. |
| `RELEASE-03` | `66-02`, `66-03` | GitHub releases upload `main.js`, `manifest.json`, `styles.css`, and `versions.json` alongside existing artifacts | ✓ SATISFIED | `.github/workflows/release.yml:222-235` uploads all four `dist/obsidian-release/*` assets; workflow contract test asserts the same strings in `tests/release-workflow.test.cjs:35-42`. |
| `RELEASE-04` | `66-01`, `66-02`, `66-03` | CLI installer and GitHub release automation use the same canonical asset contract | ✓ SATISFIED | Shared asset constants are defined in `scripts/lib/obsidian-artifacts.cjs:6-15`; installer uses them in `bin/install.js:9,325-326`; local/CI release paths reuse the same helper and bundle entrypoint in `scripts/build-obsidian-release.cjs:8-12,28-33` and `.github/workflows/release.yml:142-173`. |

All Phase 66 requirement IDs declared in the plan frontmatter are accounted for in `.planning/REQUIREMENTS.md:21-24,70-73`. No orphaned Phase 66 requirements were found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | No `TODO`/`FIXME` placeholders or dead-end release stubs were found in the Phase 66 files | ℹ️ Info | No blocker or warning anti-patterns detected in the implemented release path. |

### Human Verification Required

None. The phase goal is script/workflow/test infrastructure, and the operator-facing contract was verified through code inspection plus passing targeted automated checks.

### Gaps Summary

No gaps found. The codebase now has a local Obsidian release bundle command, a shared version/asset contract used by both installer and release automation, CI workflow support for Obsidian dependency installation and artifact upload, passing regression coverage, and maintainer documentation for the release flow.

---

_Verified: 2026-04-11T20:28:43Z_
_Verifier: Codex (local verification due agent-slot exhaustion)_
