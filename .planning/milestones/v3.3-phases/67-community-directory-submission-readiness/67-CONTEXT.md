# Phase 67: Community Directory Submission Readiness - Context

**Gathered:** 2026-04-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden the Obsidian plugin package and public-facing repository materials so THRUNT God can be submitted to the Obsidian community plugin directory with minimal reviewer friction.

This phase owns:
- community-review compliance fixes inside the Obsidian plugin package
- public plugin-facing documentation and media
- submission metadata/checklists and the release-to-directory handoff flow

This phase does not own:
- new plugin product features
- cross-platform installer expansion beyond the shipped Phase 65 macOS path
- GitHub release artifact plumbing already completed in Phase 66

</domain>

<decisions>
## Implementation Decisions

### Official-source constraints to honor

- Obsidian's current submission docs say the repository root must contain `README.md`, `LICENSE`, and `manifest.json` before submission, and that release tags must match the version in `manifest.json`.
- The `obsidianmd/obsidian-releases` repo states that plugin detail pages pull the repository-root `README.md` and `manifest.json`, while installs fetch `manifest.json`, `main.js`, and `styles.css` from GitHub releases and use `versions.json` for compatibility fallback.
- The current Obsidian plugin self-critique checklist flags several quality requirements relevant here:
  - don't include the plugin name in command names
  - don't use `<h1>`/`<h2>` for settings headers
  - commit and use a lock file
  - avoid hardcoded `.obsidian` paths inside the plugin package
  - keep mobile-safe metadata and avoid desktop-only assumptions when `isDesktopOnly` is `false`

### Claude's default approach

- Treat repository-root submission metadata as a first-class deliverable, not an afterthought, because the plugin directory reads from the repo root rather than `apps/obsidian/`.
- Prefer small compliance fixes over broad UX redesign. Phase 67 is about review readiness and clear public presentation, not feature expansion.
- Reuse the Phase 66 release contract as the single source of truth and add a documented handoff flow rather than inventing a second release process.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- Phase 66 already ships a shared contract in `scripts/lib/obsidian-artifacts.cjs` and a local bundle command in `scripts/build-obsidian-release.cjs`.
- `apps/obsidian/package-lock.json` now exists, which satisfies the current checklist item requiring a committed lock file.
- `apps/obsidian/styles.css` already uses Obsidian CSS variables and scoped class names, which is a strong base for theme-safe review.

### Concrete Gaps Observed

- The repository root `README.md` is product-wide and not yet sufficient as the plugin-directory detail page for first-time Obsidian users.
- The repository root does not currently contain submission-facing `manifest.json` or `versions.json` mirrors, even though the official docs expect at least `manifest.json` at the repo root and the directory flow consults `versions.json` for compatibility.
- `apps/obsidian/src/settings.ts` currently creates an `h2` heading for a single settings section, which conflicts with the current Obsidian plugin checklist guidance.
- `apps/obsidian/src/main.ts` command names include `THRUNT`, which is likely redundant because Obsidian prefixes commands with the plugin name in the UI.

### Established Patterns

- Release-facing metadata should stay synchronized through shared helpers/scripts instead of manual copying.
- Documentation and submission collateral belong in repo-visible locations because the community directory reads from GitHub directly.

</code_context>

<specifics>
## Specific Ideas

- Plan 67-01 should audit the Obsidian package against the current checklist and close concrete compliance gaps:
  - settings header usage
  - command naming
  - root-level submission metadata mirrors if needed
  - any remaining mobile-safety or review blockers found during code inspection
- Plan 67-02 should upgrade public docs for community-plugin users:
  - clear value proposition
  - community-plugin install path first
  - manual/CLI install alternatives second
  - configuration explanation
  - screenshots or GIFs
- Plan 67-03 should add the maintainer-facing submission checklist and release-to-directory handoff flow:
  - what to update
  - what release assets must exist
  - how to prepare the `obsidianmd/obsidian-releases` PR entry
  - how root metadata stays in sync with `apps/obsidian/`

</specifics>

<deferred>
## Deferred Ideas

- Separate standalone repository for the Obsidian plugin.
- Broader plugin UX polish beyond submission-readiness blockers.
- Automated live validation against the upstream `obsidian-releases` PR checklist bot.

</deferred>
