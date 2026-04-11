---
phase: 65-obsidian-cli-install-channel
verified: 2026-04-11T20:09:31Z
status: passed
score: 14/14 must-haves verified
---

# Phase 65: Obsidian CLI Install Channel Verification Report

**Phase Goal:** Add a first-class `--obsidian` installer path that stages canonical plugin assets and links them into detected macOS vaults without manual symlink work
**Verified:** 2026-04-11T20:09:31Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

Verification used the three phase-plan `must_haves` as the contract, with the roadmap success criteria as the phase-level outcome check. I verified code paths in `bin/install.js`, supporting package/docs links, and the targeted automated suite `node --test tests/hunt-install.test.cjs` which passed with 14/14 tests.

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `bin/install.js` recognizes `--obsidian` as a top-level installer mode and documents it in `--help` output | ✓ VERIFIED | `bin/install.js:72,5194-5200` adds top-level dispatch; `bin/install.js:671` includes help text and example; direct probe `node bin/install.js --obsidian --help` exited `0` and printed `Usage` plus `--obsidian`. |
| 2 | Obsidian install mode is explicitly incompatible with runtime/location/uninstall flags instead of silently mixing behaviors | ✓ VERIFIED | `bin/install.js:327-360` collects incompatible flags including runtime, location, uninstall, and config-dir; `bin/install.js:5194-5198` exits non-zero with a standalone-mode error; CLI smoke test covers `--obsidian --claude` in `tests/hunt-install.test.cjs:330-335`. |
| 3 | A production Obsidian bundle is built from `apps/obsidian/` and staged under `~/.thrunt/obsidian/` before any vault linking work begins | ✓ VERIFIED | `package.json:59` defines `build:obsidian`; `bin/install.js:442-453` runs `npm run build:obsidian`; `bin/install.js:367-368,458-485` stages to `~/.thrunt/obsidian`; `bin/install.js:606-621` builds and stages before vault discovery/linking. |
| 4 | The staged asset contract is exactly `main.js`, `manifest.json`, and `styles.css` copied from `apps/obsidian/` after a production build | ✓ VERIFIED | `bin/install.js:324-325` defines the exact asset set; `bin/install.js:466-480` copies and verifies only those files; `apps/obsidian/README.md:32-44` documents the same contract. |
| 5 | The installer reads macOS Obsidian metadata from `~/Library/Application Support/obsidian/obsidian.json` and extracts vault paths from the `.vaults[*].path` structure | ✓ VERIFIED | `bin/install.js:371-375` resolves the canonical macOS config path; `bin/install.js:389-435` parses JSON, reads `.vaults`, extracts `entry.path`, resolves paths, filters missing dirs, and de-duplicates; helper test covers config-order extraction in `tests/hunt-install.test.cjs:208-220`. |
| 6 | Each detected vault gets a `.obsidian/plugins/thrunt-god/` directory whose `main.js`, `manifest.json`, and `styles.css` entries are symlinks back to the staged bundle | ✓ VERIFIED | `bin/install.js:488-489` targets `.obsidian/plugins/thrunt-god`; `bin/install.js:492-588` creates per-file symlinks to the staged bundle; helper and CLI tests assert symlink realpaths in `tests/hunt-install.test.cjs:82-93,222-234,338-352`. |
| 7 | Re-running `--obsidian` refreshes broken or stale symlinks without duplicating managed plugin assets inside vaults | ✓ VERIFIED | `bin/install.js:526-549,552-586` skips already-correct symlinks, replaces stale targets, and never copies bundle files into vaults; helper repair test covers stale file and broken-link repair in `tests/hunt-install.test.cjs:236-256`; CLI reinstall coverage is in `tests/hunt-install.test.cjs:355-373`. |
| 8 | If no usable vault metadata exists, the installer exits cleanly with manual-install fallback guidance and does not mutate any vault | ✓ VERIFIED | `bin/install.js:623-631` returns `status: 'no_vaults'` with explicit manual-install guidance; no-vault helper test asserts no vault plugin dir is created in `tests/hunt-install.test.cjs:258-287`; CLI fallback coverage is in `tests/hunt-install.test.cjs:375-392`. |
| 9 | Installer output reports per-vault success/skip/failure and always ends successful runs with the restart-and-enable handoff message | ✓ VERIFIED | `bin/install.js:636-652` logs `installed`, `skipped`, or `failed` per vault and prints the exact restart message on successful runs; helper and CLI tests assert the final message in `tests/hunt-install.test.cjs:289-317,338-352`. |
| 10 | Installer test coverage exercises vault discovery, staged bundle linking, reinstall repair, and no-vault fallback without relying on a real Obsidian install | ✓ VERIFIED | `tests/hunt-install.test.cjs:208-317` uses temp directories and fixture config/assets to cover discovery, link creation, repair, fallback, and successful install without touching a real Obsidian setup. |
| 11 | Obsidian installer helpers are injectable/exported enough to let `node:test` use temp directories and mocked build behavior | ✓ VERIFIED | `bin/install.js:363-386,591-620` supports injectable `homeDir`, `configPath`, `repoRoot`, `pluginDir`, `runBuild`, `logger`, and skip-build env overrides; `bin/install.js:5177-5186` exports the helper surface under `THRUNT_TEST_MODE`; tests use mocked build behavior in `tests/hunt-install.test.cjs:271-279,303-311`. |
| 12 | `tests/hunt-install.test.cjs` proves the staged asset contract remains `main.js`, `manifest.json`, `styles.css` | ✓ VERIFIED | Fixture creation, staging assertions, and symlink assertions explicitly name the three files in `tests/hunt-install.test.cjs:43-50,85-90,283,315,349-350,370`. |
| 13 | Disposable CLI smoke coverage exercises the real `node bin/install.js --obsidian` operator path for help, invalid-flag rejection, install, reinstall, and no-vault fallback | ✓ VERIFIED | `tests/hunt-install.test.cjs:321-392` executes child-process smoke coverage for help, invalid flags, install, reinstall, and no-vault fallback using `spawnSync(process.execPath, ['bin/install.js', ...args])`. |
| 14 | Targeted installer tests run green with `node --test tests/hunt-install.test.cjs` | ✓ VERIFIED | Executed during verification: `node --test tests/hunt-install.test.cjs` passed with `14` tests, `0` failures, `0` skips, `0` todos. |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `bin/install.js` | CLI flag parsing, help text, build/stage helpers, vault discovery, symlink management, test exports | ✓ VERIFIED | Exists and is substantive (`5237` lines). Wired to the published CLI via `package.json:5-7`; contains the full Obsidian installer path at `bin/install.js:72,324-652,5177-5200`. |
| `tests/hunt-install.test.cjs` | Regression coverage for helper flows and real CLI smoke paths | ✓ VERIFIED | Exists and is substantive (`393` lines). Wired into the repo test runner via `scripts/run-tests.cjs:11-25`, and directly exercises the Obsidian installer flow at `tests/hunt-install.test.cjs:208-392`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `bin/install.js` | `package.json` | `npm run build:obsidian` production build invocation | ✓ WIRED | `package.json:59` defines `build:obsidian`; `bin/install.js:449-453` invokes it with `execFileSync`. |
| `bin/install.js` | `apps/obsidian/README.md` | Manual-install asset contract reused for staged bundle | ✓ WIRED | `apps/obsidian/README.md:32-44` defines `VaultFolder/.obsidian/plugins/thrunt-god/` plus the three assets; `bin/install.js:324-325,466-480,624-625` reuses the same contract for staging and fallback guidance. |
| `bin/install.js` | `$HOME/Library/Application Support/obsidian/obsidian.json` | Vault discovery source | ✓ WIRED | `bin/install.js:371-375` builds the canonical config path; `bin/install.js:389-435` reads and normalizes registered vaults from that file. |
| `bin/install.js` | `apps/obsidian/README.md` | Manual-install fallback references the same vault plugin target | ✓ WIRED | Fallback text in `bin/install.js:624-625` matches README destination `apps/obsidian/README.md:37`. |
| `tests/hunt-install.test.cjs` | `bin/install.js` | `THRUNT_TEST_MODE` helper exports | ✓ WIRED | `tests/hunt-install.test.cjs:1,10-19` enables `THRUNT_TEST_MODE` and imports Obsidian helpers; `bin/install.js:5177-5186` exports the same helper surface. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| `INST-01` | `65-01`, `65-03` | User can run `npx thrunt-god@latest --obsidian` on macOS to install or update the Obsidian plugin without manual symlink steps | ✓ SATISFIED | `package.json:2,5-7,8-12` publishes `thrunt-god` with `bin/install.js` and packaged `apps`; `bin/install.js:72,5194-5200` provides the CLI path; CLI smoke install/reinstall passes in `tests/hunt-install.test.cjs:338-373`. |
| `INST-02` | `65-01`, `65-03` | Installer stages a production plugin bundle under `~/.thrunt/obsidian/` before touching any vault | ✓ SATISFIED | `bin/install.js:367-368,442-485,606-621` builds then stages `main.js`, `manifest.json`, and `styles.css` before vault discovery. |
| `INST-03` | `65-02`, `65-03` | Installer detects vaults from `obsidian.json` and installs THRUNT God into each detected vault plugin directory | ✓ SATISFIED | `bin/install.js:371-375,389-435,488-588,634-647` implements discovery and linking; verified by helper and CLI tests in `tests/hunt-install.test.cjs:208-234,289-317,338-352`. |
| `INST-04` | `65-02`, `65-03` | Re-running `--obsidian` refreshes the staged build and repairs broken or stale symlinks without duplicating plugin directories | ✓ SATISFIED | `bin/install.js:526-549,552-586` repairs stale targets and preserves correct links as skips; verified by `tests/hunt-install.test.cjs:236-256,355-373`. |
| `INST-05` | `65-02`, `65-03` | Installer reports per-vault success or failure and prints explicit restart/enable guidance | ✓ SATISFIED | `bin/install.js:636-652` emits per-vault status lines and the exact restart message; verified in `tests/hunt-install.test.cjs:289-317,338-352`. |
| `INST-06` | `65-02`, `65-03` | If no vaults or metadata are found, installer exits without partial writes and explains the manual install fallback | ✓ SATISFIED | `bin/install.js:623-631` returns cleanly with fallback text; tests assert no vault plugin dir is created in `tests/hunt-install.test.cjs:258-287,375-392`. |

All requirement IDs declared in the phase plans are accounted for in `.planning/REQUIREMENTS.md:12-17,64-69`. No orphaned Phase 65 requirements were found.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| None | - | No `TODO`/`FIXME`/placeholder markers or stub implementations found in the modified phase files | ℹ️ Info | No blocker or warning anti-patterns detected in `bin/install.js` or `tests/hunt-install.test.cjs`. |

### Human Verification Required

None. The phase goal is CLI/file-system behavior, and the key paths were verified through code inspection plus passing helper and child-process smoke tests.

### Gaps Summary

No gaps found. The codebase contains a first-class `--obsidian` installer path, stages the canonical Obsidian bundle under `~/.thrunt/obsidian`, links the staged assets into detected macOS vaults as symlinks, repairs stale targets on reinstall, and has passing regression coverage for the operator-facing CLI flow.

---

_Verified: 2026-04-11T20:09:31Z_
_Verifier: Claude (gsd-verifier)_
