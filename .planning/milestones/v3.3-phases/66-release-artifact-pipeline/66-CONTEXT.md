# Phase 66: Release Artifact Pipeline - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend the existing release workflow so Obsidian plugin assets ship as first-class release artifacts with strict version alignment. This phase owns local bundle/release contract wiring, workflow validation, and GitHub release uploads. It does not own community-directory submission collateral or plugin UX changes.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.github/workflows/release.yml` already resolves tags, verifies root/MCP/VS Code version alignment, runs tests, builds artifacts, publishes npm packages, and creates GitHub releases.
- `tests/release-workflow.test.cjs` already enforces the current release workflow contract and is the natural place to extend release coverage.
- Root `package.json` already exposes `build:obsidian`, and `apps/obsidian/package.json` already owns the production plugin build plus `version-bump.mjs`.
- `apps/obsidian/manifest.json` and `apps/obsidian/versions.json` already define the Obsidian release/version contract.

### Established Patterns
- Release workflow validates metadata before packaging or publishing and fails fast on version drift.
- Publish artifacts are built once in CI and then attached to the GitHub release in the final step.
- Release contract tests in `tests/` assert workflow structure by reading the YAML file directly.

### Integration Points
- `.github/workflows/release.yml` is the primary integration point for Obsidian asset build, validation, and upload.
- `tests/release-workflow.test.cjs` is the primary regression guard for the release contract.
- Root `package.json` plus `apps/obsidian/package.json`/`manifest.json`/`versions.json` are the metadata sources that must stay version-aligned.
- Phase 65's `bin/install.js` staging contract is the canonical asset set Phase 66 should reuse conceptually, but no installer behavior changes belong in this phase.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
