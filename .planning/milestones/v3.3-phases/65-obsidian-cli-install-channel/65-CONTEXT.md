# Phase 65: Obsidian CLI Install Channel - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a first-class Obsidian install mode to the existing THRUNT CLI. This phase owns local bundle staging, macOS vault discovery, symlink-based installation/update behavior, and installer verification. It does not own GitHub release automation or community-directory submission collateral.

</domain>

<decisions>
## Implementation Decisions

### Installer Surface
- Extend the existing `bin/install.js` entrypoint instead of creating a separate Obsidian installer script.
- Treat `--obsidian` as a top-level install mode alongside the runtime install flows, with explicit non-interactive behavior.
- Use one canonical staged bundle under `~/.thrunt/obsidian/` as the installer-managed source of truth.
- Stage the exact production plugin asset set: `main.js`, `manifest.json`, and `styles.css`.

### Bundle Build Contract
- Build the plugin from `apps/obsidian/` using the existing production build path rather than copying dev outputs.
- Reuse the Obsidian package metadata already in `apps/obsidian/package.json`, `manifest.json`, and `versions.json`.
- Keep the staged asset contract identical to the manual install instructions in `apps/obsidian/README.md`.
- Prefer deterministic file replacement in the staged directory over incremental patching of individual artifacts.

### Vault Discovery And Installation
- macOS is the supported autodiscovery path for this phase; detect vaults from `~/Library/Application Support/obsidian/obsidian.json`.
- Install into each detected vault at `.obsidian/plugins/thrunt-god/`.
- Use symlinks from each vault plugin directory back to the staged canonical bundle instead of copying bundle files into every vault.
- Re-running `--obsidian` must repair stale or broken links and remain idempotent for already-installed vaults.

### Operator Feedback And Failure Modes
- Emit per-vault install results with clear success, skip, and failure reporting.
- If Obsidian metadata or vaults are missing, exit cleanly without mutating vault directories and print manual-install fallback guidance.
- End every successful run with the explicit operator handoff: restart Obsidian and enable THRUNT God in Community Plugins.
- Prefer conservative behavior over best-effort mutation when path resolution or filesystem safety is ambiguous.

### Claude's Discretion
- Concrete helper/function names inside `bin/install.js` are at Claude's discretion.
- Whether staging uses npm-prefixed commands, direct node invocation, or extracted helper utilities is at Claude's discretion as long as the bundle contract stays deterministic.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bin/install.js` already owns argument parsing, interactive/non-interactive install modes, runtime-specific install branches, manifest writing, and post-install reporting.
- `package.json` already exposes `build:obsidian`, `dev:obsidian`, and `typecheck:obsidian` scripts at the repo root.
- `apps/obsidian/esbuild.config.mjs` already builds a production `main.js` bundle from `src/main.ts`.
- `apps/obsidian/version-bump.mjs`, `manifest.json`, and `versions.json` already define the plugin version contract.

### Established Patterns
- The installer uses explicit booleans derived from `process.argv`, centralized target-directory resolution, and console-first progress reporting.
- Runtime installs favor clean managed outputs plus verification rather than partially mutating unknown files in place.
- THRUNT install flows preserve a canonical managed source tree under a single config-controlled directory, then expose it into user environments.
- Existing docs and scripts treat `manifest.json`, `styles.css`, and `main.js` as the canonical Obsidian artifact set.

### Integration Points
- `bin/install.js` argument parsing, help text, and main dispatch block are the integration points for `--obsidian`.
- Root `package.json` and `apps/obsidian/package.json` are the integration points for invoking a production Obsidian build from the installer.
- `apps/obsidian/README.md` is the source of truth for manual-install asset expectations and fallback instructions.
- Future release automation in `.github/workflows/release.yml` should consume the same staged/bundle contract defined here, but release wiring is Phase 66.

</code_context>

<specifics>
## Specific Ideas

- Detect Obsidian vaults by parsing the JSON structure in `~/Library/Application Support/obsidian/obsidian.json` rather than scanning the filesystem heuristically.
- Keep staged assets under `~/.thrunt/obsidian/` so local CLI installs and future release packaging point at the same conceptual bundle.
- Installer help output should show a concrete example such as `npx thrunt-god@latest --obsidian`.
- Tests should cover first install, reinstall/repair, and the no-vault fallback path.

</specifics>

<deferred>
## Deferred Ideas

- Windows and Linux vault autodiscovery
- Vault-selection flags for targeting a subset of detected vaults
- GitHub release uploads of Obsidian assets
- Community-plugin submission docs, screenshots, and checklist material

</deferred>
