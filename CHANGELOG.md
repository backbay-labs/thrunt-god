# Changelog

All notable changes to THRUNT will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.3.3] - 2026-04-10

### Fixed
- MCP npm publishing now includes repository metadata required for npm provenance verification, so `@thrunt/mcp` can be released from GitHub Actions without a sigstore repository mismatch
- The release workflow now validates `apps/mcp/package.json` repository metadata before it reaches the publish step

## [0.3.2] - 2026-04-10

### Fixed
- Release verification no longer depends on a developer-local `.planning/runbooks/example-domain-hunt.yaml` file that is absent from clean CI and release checkouts
- VS Code runbook unit tests now use committed fixtures under `apps/vscode/test/fixtures/`, making `lint:vscode`, `test:vscode:unit`, and tag-driven release runs deterministic

## [0.3.1] - 2026-04-10

### Added
- **v3.0 Hunt Program Intelligence release candidate** covering the full PR #5 scope: MCP-backed hunt intel, detection coverage analysis, knowledge persistence, agent workflow integration, and final VS Code release hardening
- **New `@thrunt/mcp` package** under `apps/mcp/` with a stdio MCP server, ATT&CK/group lookup tools, detection comparison and suggestion flows, knowledge querying, and decision or learning capture prompts for hunts
- **Detection rule ingestion and coverage analysis** for Sigma YAML, Splunk ESCU, Elastic TOML, and KQL content, including bundled ATT&CK intelligence plus Sigma core rules for local-first coverage and gap analysis
- **Knowledge graph persistence for hunt programs** with entity and relation storage in `program.db`, decision logging, learning capture, and built-in threat-profile support wired into hunt workflows
- **Managed MCP setup flow in the VS Code extension** with an install action in the Automation sidebar and a configurable `thruntGod.mcp.installPackage` setting for pre-release or internal package sources

### Changed
- Core hunt workflows and agents now consume MCP intel surfaces directly, including automatic detection-coverage lookups during case creation and richer ATT&CK-aware investigation support in planner and query flows
- The VS Code extension no longer bundles the MCP runtime into the VSIX; MCP is now resolved from the workspace, an explicit server path, or a managed install under extension storage
- MCP start/restart commands now wait for the server readiness signal and immediately verify health before showing success to the user
- CI and release validation now exercise the updated VS Code package, pack validation, security checks, and cross-platform test matrix against the release-candidate build

### Fixed
- Command Deck and Runbook items in the Automation sidebar now execute when clicked, and tree labels use plain text instead of codicon syntax
- MCP startup no longer reports a false-positive "started" state when the server path is missing or the child exits before becoming ready
- MCP control-panel tests, runbook MCP execution, and sidebar status rendering now handle missing runtime paths cleanly and surface setup-required states instead of disconnected dead ends
- Program and case intelligence flows are hardened for repeated use, including published-findings surfacing, artifact navigation, case-search normalization, and activity rollups across nested hunt artifacts

## [0.3.0] - 2026-04-03

### Added
- **VS Code extension alpha** under `apps/vscode/` with the THRUNT investigation sidebar, status bar, CodeLens actions, diagnostics, runtime doctor, and bundled CLI execution hooks
- **Investigative webviews** for Hunt Overview, Evidence Board, Query Analysis, Receipt Inspector, and Drain Template Viewer, including shared design tokens, keyboard navigation, serializer restore, and cross-surface selection sync
- **Program and case awareness** in the extension with nested case discovery, case summaries, published findings surfacing, session continuity, IOC tracking, SLA timers, and war-room export helpers
- **Drain reduction and template mining pipeline** in runtime code, including `reduceEvents`, template metadata in query/receipt artifacts, aggregation helpers, and clustering/heatmap support
- **Sequential evidence integrity guidance** with anomaly-framing reference material, evidence-review template updates, and expected progression support in hunt packs
- **New example hunts and fixtures** for brute-force-to-persistence and OAuth session hijack, plus a large VS Code fixture corpus for smoke, dogfood, and unit coverage

### Changed
- Moved the VS Code package from `thrunt-god-vscode/` to `apps/vscode/` and aligned repository scripts, build tooling, packaging, and tests around the new package path
- Expanded the release pipeline so `v0.3.0` validates the VS Code extension, packages the VSIX, and uploads it alongside the root release artifact
- Extended runtime and SDK export surfaces for dataset defaults, drain helpers, connector SDK coverage, and extension-facing runtime packaging
- Updated hunt templates, pack templates, and pack metadata to better support anomaly framing, expected progressions, and hunt-native examples

### Fixed
- Published findings detection now recognizes `.planning/published/FINDINGS.md` and maps them into the publish phase correctly
- Query-to-phase mapping, query-analysis sorting, artifact resolution, and cross-surface navigation now behave correctly under repeated investigative runs
- CLI parsing, cancellation cleanup, Windows path handling, and extension packaging are hardened for repeated local and CI execution
- Prompt-injection scanning, entity deduplication, and release packaging safeguards are tightened to reduce false positives and stale-artifact leakage
- Program-mode UI copy, nested case labeling, and hunt overview/sidebar wording now use consistent release-ready terminology

## [1.28.0] - 2026-03-22

### Added
- **Workstream namespacing** — Parallel milestone work via `/thrunt:workstreams`
- **Multi-project workspace commands** — Manage multiple THRUNT projects from a single root
- **`/thrunt:forensics` command** — Post-mortem workflow investigation
- **`/thrunt:milestone-summary` command** — Post-build onboarding for completed milestones
- **`workflow.skip_discuss` setting** — Bypass shape-hypothesis in autonomous mode
- **`workflow.discuss_mode` assumptions config** — Control shape-hypothesis behavior
- **UI-phase recommendation** — Automatically surfaced for UI-heavy phases
- **CLAUDE.md compliance** — Added as plan-checker Dimension 10
- **Data-flow tracing, environment audit, and behavioral spot-checks** in verification
- **Multi-runtime selection** in interactive installer
- **Text mode support** for hunt-plan workflow
- **"Follow the Indirection" debugging technique** in thrunt-incident-debugger
- **`--reviews` flag** for `hunt:plan`
- **Temp file reaper** — Prevents unbounded /tmp accumulation

### Changed
- Test matrix optimized from 9 containers down to 4
- Copilot skill/agent counts computed dynamically from source dirs
- Wave-specific execution support in hunt-run

### Fixed
- Windows 8.3 short path failures in worktree tests
- Worktree isolation enforced for code-writing agents
- Linked worktrees respect `.planning/` before resolving to main repo
- Path traversal prevention via workstream name sanitization
- Strategy branch created before first commit (not at hunt-run)
- `ProviderModelNotFoundError` on non-Claude runtimes
- `$HOME` used instead of `~` in installed shell command paths
- Subdirectory CWD preserved in monorepo worktrees
- Stale hook detection checking wrong directory path
- STATE.md frontmatter status preserved when body Status field missing
- Pipe truncation fix using `fs.writeSync` for stdout
- Verification gate before writing MISSION.md in new-milestone
- Removed `jq` as undocumented hard dependency
- Discuss-phase no longer ignores workflow instructions
- Gemini CLI uses `BeforeTool` hook event instead of `PreToolUse`

## [1.27.0] - 2026-03-20

### Added
- **Advisor mode** — Research-backed discussion with parallel agents evaluating gray areas before you decide
- **Multi-repo workspace support** — Auto-detection and project root resolution for monorepos and multi-repo setups
- **Cursor CLI runtime support** — Full installation and command conversion for Cursor
- **`/thrunt:fast` command** — Trivial inline tasks that skip planning entirely
- **`/thrunt:review` command** — Cross-AI peer review of current phase or branch
- **`/thrunt:plant-seed` command** — Backlog parking lot for ideas and persistent context threads
- **`/thrunt:pr-branch` command** — Clean PR branches filtering `.planning/` commits
- **`/thrunt:audit-evidence` command** — Verification debt tracking across phases
- **`--analyze` flag for shape-hypothesis** — Trade-off analysis during discussion
- **`research_before_questions` config option** — Run research before discussion questions instead of after
- **Ticket-based phase identifiers** — Support for team workflows using ticket IDs
- **Worktree-aware `.planning/` resolution** — File locking for safe parallel access
- **Discussion audit trail** — Auto-generated `DISCUSSION-LOG.md` during shape-hypothesis
- **Context window size awareness** — Optimized behavior for 1M+ context models
- **Exa and Firecrawl MCP support** — Additional research tools for research agents
- **Runtime State Inventory** — Researcher capability for rename/refactor phases
- **Quick-task branch support** — Isolated branches for quick-mode tasks
- **Decision IDs** — Discuss-to-plan traceability via decision identifiers
- **Stub detection** — Verifier and executor detect incomplete implementations
- **Security hardening** — Centralized `security.cjs` module with path traversal prevention, prompt injection detection/sanitization, safe JSON parsing, field name validation, and shell argument validation. PreToolUse `thrunt-prompt-guard` hook scans writes to `.planning/` for injection patterns

### Changed
- CI matrix updated to Node 20, 22, 24 — dropped EOL Node 18
- GitHub Actions upgraded for Node 24 compatibility
- Consolidated `planningPaths()` helper across 4 modules — eliminated 34 inline path constructions
- Deduplicated code, annotated empty catches, consolidated STATE.md field helpers
- Materialize full config on new-program initialization
- Workflow enforcement guidance embedded in generated CLAUDE.md

### Fixed
- Path traversal in `readTextArgOrFile` — arguments validate paths resolve within project directory
- Codex config.toml corruption from non-boolean `[features]` keys
- Stale hooks check filtered to thrunt-prefixed files only
- Universal agent name replacement for non-Claude runtimes
- `--no-verify` support for parallel executor commits
- HUNTMAP fallback for hunt-plan, hunt-run, and validate-findings
- Copilot sequential fallback and spot-check completion detection
- `text_mode` config for Claude Code remote session compatibility
- Cursor: preserve slash-prefixed commands and unquoted skill names
- Semver 3+ segment parsing and CRLF frontmatter corruption recovery
- STATE.md parsing fixes (compound Plan field, progress tables, lifecycle extraction)
- Windows HOME sandboxing for tests
- Hook manifest tracking for local patch detection
- Cross-platform code detection and STATE.md file locking
- Auto-detect `commit_docs` from gitignore in `loadConfig`
- Context monitor hook matcher and timeout
- Codex EOL preservation when enabling hooks
- macOS `/var` symlink resolution in path validation

## [1.26.0] - 2026-03-18

### Added
- **Developer profiling pipeline** — `/thrunt:profile-user` analyzes Claude Code session history to build behavioral profiles across 8 dimensions (communication, decisions, debugging, UX, vendor choices, frustrations, learning style, explanation depth). Generates `USER-PROFILE.md`, `/thrunt:dev-preferences`, and `CLAUDE.md` profile section. Includes `--questionnaire` fallback and `--refresh` for re-analysis (#1084)
- **`/hunt:publish` command** — PR creation from verified phase work. Auto-generates rich PR body from planning artifacts, pushes branch, creates PR via `gh`, and updates STATE.md (#829)
- **`/thrunt:next` command** — Automatic workflow advancement to the next logical step (#927)
- **Cross-phase regression gate** — Execute-phase runs prior phases' test suites after execution, catching regressions before they compound (#945)
- **Hypothesis coverage gate** — Hunt planning verifies all phase hypotheses are covered by at least one plan before proceeding (#984)
- **Structured session handoff artifact** — `/thrunt:pause-work` writes `.planning/HANDOFF.json` for machine-readable cross-session continuity (#940)
- **WAITING.json signal file** — Machine-readable signal for decision points requiring user input (#1034)
- **Interactive executor mode** — Pair-programming style execution with step-by-step user involvement (#963)
- **MCP tool awareness** — THRUNT subagents can discover and use MCP server tools (#973)
- **Codex hooks support** — SessionStart hook support for Codex runtime (#1020)
- **Model alias-to-full-ID resolution** — Task API compatibility for model alias strings (#991)
- **Execution hardening** — Pre-wave dependency checks, cross-plan data contracts, and export-level spot checks (#1082)
- **Markdown normalization** — Generated markdown conforms to markdownlint standards (#1112)
- **`/thrunt:audit-evidence` command** — Cross-phase audit of all outstanding Evidence Review and verification items. Scans every phase for pending, skipped, blocked, and human_needed items. Cross-references against codebase to detect stale documentation. Produces prioritized human test plan grouped by testability
- **Verification debt tracking** — Five structural improvements to prevent silent loss of Evidence Review/verification items when projects advance:
  - Cross-phase health check in `/thrunt:progress` (Step 1.6) surfaces outstanding items from ALL prior phases
  - `status: partial` in Evidence Review files distinguishes incomplete testing from completed sessions
  - `result: blocked` with `blocked_by` tag for tests blocked by external dependencies (server, device, build, third-party)
  - `human_needed` verification items now persist as HUMAN-EVIDENCE_REVIEW.md files (trackable across sessions)
  - Phase completion and transition warnings surface verification debt non-blockingly
- **Advisor mode for shape-hypothesis** — Spawns parallel research agents during `/hunt:shape-hypothesis` to evaluate gray areas before user decides. Returns structured comparison tables calibrated to user's vendor philosophy. Activates only when `USER-PROFILE.md` exists (#1211)

### Changed
- Test suite consolidated: runtime converters deduplicated, helpers standardized (#1169)
- Added test coverage for model-profiles, templates, profile-pipeline, profile-output (#1170)
- Documented `inherit` profile for non-Anthropic providers (#1036)

### Fixed
- Agent suggests non-existent `/thrunt:transition` — replaced with real commands (#1081, #1100)
- MISSION.md drift and phase completion counter accuracy (#956)
- Copilot executor stuck issue — runtime compatibility fallback added (#1128)
- Explicit agent type listings prevent fallback after `/clear` (#949)
- Nested Skill calls breaking AskUserQuestion (#1009)
- Negative-heuristic `stripShippedMilestones` replaced with positive milestone lookup (#1145)
- Hook version tracking, stale hook detection, stdin timeout, session-report command (#1153, #1157, #1161, #1162)
- Hook build script syntax validation (#1165)
- Verification examples use `fetch()` instead of `curl` for Windows compatibility (#899)
- Sequential fallback for `map-environment` on runtimes without Task tool (#1174)
- Zsh word-splitting fix for RUNTIME_DIRS arrays (#1173)
- CRLF frontmatter parsing, duplicate cwd crash, STATE.md phase transitions (#1105)
- Hypotheses `mark-complete` made idempotent (#948)
- Profile template paths, field names, and evidence key corrections (#1095)
- Duplicate variable declaration removed (#1101)

## [1.25.0] - 2026-03-16

### Added
- **Antigravity runtime support** — Full installation support for the Antigravity AI agent runtime (`--antigravity`), alongside Claude Code, OpenCode, Gemini, Codex, and Copilot
- **`/thrunt:do` command** — Freeform text router that dispatches natural language to the right THRUNT command
- **`/thrunt:note` command** — Zero-friction idea capture with append, list, and promote-to-todo subcommands
- **Context window warning toggle** — Config option to disable context monitor warnings (`hooks.context_monitor: false`)
- **Comprehensive documentation** — New `docs/` directory with feature, architecture, agent, command, CLI, and configuration guides

### Changed
- `/hunt:shape-hypothesis` shows remaining discussion areas when asking to continue or move on
- `/hunt:plan` asks user about research instead of silently deciding
- Improved GitHub issue and PR templates with industry best practices
- Settings clarify balanced profile uses Sonnet for research

### Fixed
- Executor checks for untracked files after task commits
- Researcher verifies package versions against npm registry before recommending
- Health check adds CWD guard and strips archived milestones
- `core.cjs` returns `opus` directly instead of mapping to `inherit`
- Stats command corrects git and roadmap reporting
- Init prefers current milestone phase-op targets
- **Antigravity skills** — `processAttribution` was missing from `copyCommandsAsAntigravitySkills`, causing SKILL.md files to be written without commit attribution metadata
- Copilot install tests updated for UI agent count changes

## [1.24.0] - 2026-03-15

### Added
- **`/thrunt:quick --research` flag** — Spawns focused research agent before planning, composable with `--discuss` and `--full` (#317)
- **`inherit` model profile** for OpenCode — agents inherit the user's selected runtime model via `/model`
- **Persistent debug knowledge base** — resolved debug sessions append to `.planning/debug/knowledge-base.md`, eliminating cold-start investigation on recurring issues
- **Programmatic `/thrunt:set-profile`** — runs as a script instead of LLM-driven workflow, executes in seconds instead of 30-40s

### Fixed
- HUNTMAP.md searches scoped to current milestone — multi-milestone projects no longer match phases from archived milestones
- OpenCode agent frontmatter conversion — agents get correct `name:`, `model: inherit`, `mode: subagent`
- `opencode.jsonc` config files respected during install (previously only `.json` was detected) (#1053)
- Windows installer crash on EPERM/EACCES when scanning protected directories (#964)
- `thrunt-tools.cjs` uses absolute paths in all install types (#820)
- Invalid `skills:` frontmatter removed from UI agent files

## [1.23.0] - 2026-03-15

### Added
- `/thrunt:ui-phase` + `/thrunt:ui-review` — UI design contract generation and retroactive 6-pillar visual audit for frontend phases (closes #986)
- `/thrunt:stats` — project statistics dashboard: phases, plans, requirements, git metrics, and timeline
- **Copilot CLI** runtime support — install with `--copilot`, maps Claude Code tools to GitHub Copilot tools
- **`thrunt-autonomous` skill** for Codex runtime — enables autonomous THRUNT execution
- **Node repair operator** — autonomous recovery when task verification fails: RETRY, DECOMPOSE, or PRUNE before escalating to user. Configurable via `workflow.node_repair_budget` (default: 2 attempts). Disable with `workflow.node_repair: false`
- Mandatory `read_first` and `acceptance_criteria` sections in plans to prevent shallow execution
- Mandatory `canonical_refs` section in CONTEXT.md for traceable decisions
- Quick mode uses `YYMMDD-xxx` timestamp IDs instead of auto-increment numbers

### Changed
- `/hunt:shape-hypothesis` supports explicit `--batch` mode for grouped question intake

### Fixed
- `/hunt:new-program` no longer resets `workflow.research` config during milestone transitions
- `/thrunt:update` is runtime-aware and targets the correct runtime directory
- Phase-complete properly updates HYPOTHESES.md traceability (closes #848)
- Auto-advance no longer triggers without `--auto` flag (closes #1026, #932)
- `--auto` flag correctly skips interactive discussion questions (closes #1025)
- Decimal phase numbers correctly padded in init.cjs (closes #915)
- Empty-answer validation guards added to shape-hypothesis (closes #912)
- Tilde paths in templates prevent PII leak in `.planning/` files (closes #987)
- Invalid `commit-docs` command replaced with `commit` in workflows (closes #968)
- Uninstall mode indicator shown in banner output (closes #1024)
- WSL + Windows Node.js mismatch detected with user warning (closes #1021)
- Deprecated Codex config keys removed to fix UI instability
- Unsupported Gemini agent `skills` frontmatter stripped for compatibility
- Roadmap `complete` checkbox overrides `disk_status` for phase detection
- Plan-phase Nyquist validation works when research is disabled (closes #1002)
- Valid Codex agent TOML emitted by installer
- Escape characters corrected in grep commands

## [1.22.4] - 2026-03-03

### Added
- `--discuss` flag for `/thrunt:quick` — lightweight pre-planning discussion to gather context before quick tasks

### Fixed
- Windows: `@file:` protocol resolution for large init payloads (>50KB) — all 32 workflow/agent files now resolve temp file paths instead of letting agents hallucinate `/tmp` paths (#841)
- Missing `skills` frontmatter on thrunt-false-positive-auditor agent

## [1.22.3] - 2026-03-03

### Added
- Verify-work auto-injects a cold-start smoke test for phases that modify server, database, seed, or startup files — catches warm-state blind spots

### Changed
- Renamed `depth` setting to `granularity` with values `coarse`/`standard`/`fine` to accurately reflect what it controls (phase count, not investigation depth). Backward-compatible migration auto-renames existing config.

### Fixed
- Installer now replaces `$HOME/.claude/` paths (not just `~/.claude/`) for non-Claude runtimes — fixes broken commands on local installs and Gemini/OpenCode/Codex installs (#905, #909)

## [1.22.2] - 2026-03-03

### Fixed
- Codex installer no longer creates duplicate `[features]` and `[agents]` sections on re-install (#902, #882)
- Context monitor hook is advisory instead of blocking non-THRUNT workflows
- Hooks respect `CLAUDE_CONFIG_DIR` for custom config directories
- Hooks include stdin timeout guard to prevent hanging on pipe errors
- Statusline context scaling matches autocompact buffer thresholds
- Gap closure plans compute wave numbers instead of hardcoding wave 1
- `auto_advance` config flag no longer persists across sessions
- Phase-complete scans HUNTMAP.md as fallback for next-phase detection
- `getMilestoneInfo()` prefers in-progress milestone marker instead of always returning first
- State parsing supports both bold and plain field formats
- Phase counting scoped to current milestone
- Total phases derived from HUNTMAP when phase directories don't exist yet
- OpenCode detects runtime config directory instead of hardcoding `.claude`
- Gemini hooks use `AfterTool` event instead of `PostToolUse`
- Multi-word commit messages preserved in CLI router
- Regex patterns in milestone/state helpers properly escaped
- `isGitIgnored` uses `--no-index` for tracked file detection
- AskUserQuestion freeform answer loop properly breaks on valid input
- Agent spawn types standardized across all workflows

### Changed
- Anti-heredoc instruction extended to all file-writing agents
- Agent definitions include skills frontmatter and hooks examples

### Chores
- Removed leftover `hunt-bootstrap.md.bak` file
- Deduplicated `extractField` and phase filter helpers into shared modules
- Added 47 agent frontmatter and spawn consistency tests

## [1.22.1] - 2026-03-02

### Added
- Discuss phase now loads prior context (MISSION.md, HYPOTHESES.md, STATE.md, and all prior CONTEXT.md files) before identifying gray areas — prevents re-asking questions you've already answered in earlier phases

### Fixed
- Shell snippets in workflows use `printf` instead of `echo` to prevent jq parse errors with special characters

## [1.22.0] - 2026-02-27

### Added
- Codex multi-agent support: `request_user_input` mapping, multi-agent config, and agent role generation for Codex runtime
- Analysis paralysis guard in agents to prevent over-deliberation during planning
- Exhaustive cross-check and task-level TDD patterns in agent workflows
- Code-aware discuss phase with codebase scouting — `/hunt:shape-hypothesis` now analyzes relevant source files before asking questions

### Fixed
- Update checker clears both cache paths to prevent stale version notifications
- Statusline migration regex no longer clobbers third-party statuslines
- Subagent paths use `$HOME` instead of `~` to prevent `MODULE_NOT_FOUND` errors
- Skill discovery supports both `.claude/skills/` and `.agents/skills/` paths
- `resolve-model` variable names aligned with template placeholders
- Regex metacharacters properly escaped in `stateExtractField`
- `model_overrides` and `nyquist_validation` correctly loaded from config
- `phase-plan-index` no longer returns null/empty for `files_modified`, `objective`, and `task_count`

## [1.21.1] - 2026-02-27

### Added
- Comprehensive test suite: 428 tests across 13 test files covering core, commands, config, dispatcher, frontmatter, init, milestone, phase, roadmap, state, and verify modules
- CI pipeline with GitHub Actions: 9-matrix (3 OS × 3 Node versions), c8 coverage enforcement at 70% line threshold
- Cross-platform test runner (`scripts/run-tests.cjs`) for Windows compatibility

### Fixed
- `getMilestoneInfo()` returns wrong version when published milestones are collapsed in `<details>` blocks
- Milestone completion stats and archive now scoped to current milestone phases only (previously counted all phases on disk including prior milestones)
- MILESTONES.md entries now insert in reverse chronological order (newest first)
- Cross-platform path separators: all user-facing file paths use forward slashes on Windows
- JSON quoting and dollar sign handling in CLI arguments on Windows
- `model_overrides` loaded from config and `resolveModelInternal` used in CLI

## [1.21.0] - 2026-02-25

### Added
- YAML frontmatter sync to STATE.md for machine-readable status tracking
- `/thrunt:add-tests` command for post-phase test generation
- Codex runtime support with skills-first installation
- Standard `project_context` block in thrunt-findings-validator output
- Codex changelog and usage documentation

### Changed
- Improved onboarding UX: installer now suggests `/hunt:new-program` instead of `/thrunt:help`
- Updated Discord invite to vanity URL (community link)
- Compressed Nyquist validation layer to align with THRUNT meta-prompt conventions
- Hypothesis propagation now includes `phase_hypothesis_ids` from HUNTMAP to workflow agents
- Debug sessions require human verification before resolution

### Fixed
- Multi-level decimal phase handling (e.g., 72.1.1) with proper regex escaping
- `/thrunt:update` always installs latest package version
- STATE.md decision corruption and dollar sign handling
- STATE.md frontmatter mapping for hypotheses-completed status
- Progress bar percent clamping to prevent RangeError crashes
- `--cwd` override support in state-snapshot command

## [1.20.6] - 2025-02-23

### Added
- Context window monitor hook with WARNING/CRITICAL alerts when agent context usage exceeds thresholds
- Nyquist validation layer in hunt-plan pipeline to catch quality issues before execution
- Option highlighting and gray area looping in shape-hypothesis for clearer preference capture

### Changed
- Refactored installer tools into 11 domain modules for maintainability

### Fixed
- Auto-advance chain no longer breaks when skills fail to resolve inside Task subagents
- Gemini CLI workflows and templates no longer incorrectly convert to TOML format
- Universal phase number parsing handles all formats consistently (decimal phases, plain numbers)

## [1.20.5] - 2026-02-19

### Fixed
- `/thrunt:health --repair` now creates timestamped backup before regenerating STATE.md (#657)

### Changed
- Subagents now discover and load project CLAUDE.md and skills at spawn time for better project context (#671, #672)
- Improved context loading reliability in spawned agents

## [1.20.4] - 2026-02-17

### Fixed
- Executor agents now update HUNTMAP.md and HYPOTHESES.md after each plan completes — previously both documents stayed unchecked throughout milestone execution
- New `hypotheses mark-complete` CLI command enables per-plan requirement tracking instead of waiting for phase completion
- Executor final commit includes HUNTMAP.md and HYPOTHESES.md

## [1.20.3] - 2026-02-16

### Fixed
- Milestone audit now cross-references three independent sources (FINDINGS.md + SUMMARY frontmatter + HYPOTHESES.md traceability) instead of single-source phase status checks
- Orphaned requirements (in traceability table but absent from all phase FINDINGSs) detected and forced to `unsatisfied`
- Integration checker receives milestone requirement IDs and maps findings to affected requirements
- `complete-milestone` gates on requirements completion before archival — surfaces unchecked requirements with proceed/audit/abort options
- `plan-milestone-gaps` updates HYPOTHESES.md traceability table (phase assignments, checkbox resets, coverage count) and includes it in commit
- Gemini CLI: escape `${VAR}` shell variables in agent bodies to prevent template validation failures

## [1.20.2] - 2026-02-16

### Fixed
- Hypothesis tracking chain now strips bracket syntax (`[HYP-01, HYP-02]` → `HYP-01, HYP-02`) across all agents
- Verifier cross-references requirement IDs from PLAN frontmatter instead of only grepping HYPOTHESES.md by phase number
- Orphaned requirements (mapped to phase in HYPOTHESES.md but unclaimed by any plan) are detected and flagged

### Changed
- All `requirements` references across planner, templates, and workflows enforce MUST/REQUIRED/CRITICAL language — no more passive suggestions
- Plan checker now **fails** (blocking, not warning) when any roadmap requirement is absent from all plans
- Researcher receives phase-specific requirement IDs and must output a `<phase_requirements>` mapping table
- Phase requirement IDs extracted from HUNTMAP and passed through full chain: researcher → planner → checker → executor → verifier
- Verification report requirements table expanded with Source Plan, Description, and Evidence columns

## [1.20.1] - 2026-02-16

### Fixed
- Auto-mode (`--auto`) now survives context compaction by persisting `workflow.auto_advance` to config.json on disk
- Checkpoints no longer block auto-mode: human-verify auto-approves, decision auto-selects first option (human-action still stops for auth gates)
- Plan-phase now passes `--auto` flag when spawning hunt-run
- Auto-advance clears on milestone complete to prevent runaway chains

## [1.20.0] - 2026-02-15

### Added
- `/thrunt:health` command — validates `.planning/` directory integrity with `--repair` flag for auto-fixing config.json and STATE.md
- `--full` flag for `/thrunt:quick` — enables plan-checking (max 2 iterations) and post-execution verification on quick tasks
- `--auto` flag wired from `/hunt:new-program` through the full phase chain (discuss → plan → execute)
- Auto-advance chains phase execution across full milestones when `workflow.auto_advance` is enabled

### Fixed
- Plans created without user context — `/hunt:plan` warns when no CONTEXT.md exists, `/hunt:shape-hypothesis` warns when plans already exist (#253)
- OpenCode installer converts `general-purpose` subagent type to OpenCode's `general`
- `/thrunt:complete-milestone` respects `commit_docs` setting when merging branches
- Phase directories tracked in git via `.gitkeep` files

## [1.19.2] - 2026-02-15

### Added
- User-level default settings via `~/.thrunt/defaults.json` — set THRUNT defaults across all projects
- Per-agent model overrides — customize which Claude model each agent uses

### Changed
- Completed milestone phase directories are now archived for cleaner project structure
- Wave execution diagram added to README for clearer parallelization visualization

### Fixed
- OpenCode local installs now write config to `./.opencode/` instead of overwriting global `~/.config/opencode/`
- Large JSON payloads write to temp files to prevent truncation in tool calls
- Phase heading matching now supports `####` depth
- Phase padding normalized in insert command
- ESM conflicts prevented by renaming thrunt-tools.js to .cjs
- Config directory paths quoted in hook templates for local installs
- Settings file corruption prevented by using Write tool for file creation
- Plan-phase autocomplete fixed by removing "execution" from description
- Executor now has scope boundary and attempt limit to prevent runaway loops

## [1.19.1] - 2026-02-15

### Added
- Auto-advance pipeline: `--auto` flag on `shape-hypothesis` and `hunt-plan` chains discuss → plan → execute without stopping. Also available as `workflow.auto_advance` config setting

### Fixed
- Phase transition routing now routes to `shape-hypothesis` (not `hunt-plan`) when no CONTEXT.md exists — consistent across all workflows (#530)
- HUNTMAP progress table plan counts are now computed from disk instead of LLM-edited — deterministic "X/Y Complete" values (#537)
- Verifier uses HUNTMAP Success Criteria directly instead of deriving verification truths from the Goal field (#538)
- HYPOTHESES.md traceability updates when a phase completes
- STATE.md updates after shape-hypothesis completes (#556)
- AskUserQuestion headers enforced to 12-char max to prevent UI truncation (#559)
- Agent model resolution returns `inherit` instead of hardcoded `opus` (#558)

## [1.19.0] - 2026-02-15

### Added
- Brave Search integration for researchers (requires BRAVE_API_KEY environment variable)
- GitHub issue templates for bug reports and feature requests
- Security policy for responsible disclosure
- Auto-labeling workflow for new issues

### Fixed
- Evidence Review gaps and debug sessions now auto-resolve after gap-closure phase execution (#580)
- Fall back to HUNTMAP.md when phase directory missing (#521)
- Template hook paths for OpenCode/Gemini runtimes (#585)
- Accept both `##` and `###` phase headers, detect malformed HUNTMAPs (#598, #599)
- Use `{phase_num}` instead of ambiguous `{phase}` for filenames (#601)
- Add package.json to prevent ESM inheritance issues (#602)

## [1.18.0] - 2026-02-08

### Added
- `--auto` flag for `/hunt:new-program` — runs research → requirements → roadmap automatically after config questions. Expects idea document via @ reference (e.g., `/hunt:new-program --auto @prd.md`)

### Fixed
- Windows: SessionStart hook now spawns detached process correctly
- Windows: Replaced HEREDOC with literal newlines for git commit compatibility
- Research decision from `/hunt:new-program` now persists to config.json

## [1.17.0] - 2026-02-08

### Added
- **thrunt-tools verification suite**: `validate plan-structure`, `validate phase-completeness`, `validate references`, `validate commits`, `validate artifacts`, `validate key-links` — deterministic structural checks
- **thrunt-tools frontmatter CRUD**: `frontmatter get/set/merge/validate` — safe YAML frontmatter operations with schema validation
- **thrunt-tools template fill**: `template fill summary/plan/findings` — pre-filled document skeletons
- **thrunt-tools state progression**: `state advance-plan`, `state update-progress`, `state record-metric`, `state add-decision`, `state add-blocker`, `state resolve-blocker`, `state record-session` — automates STATE.md updates
- **Local patch preservation**: Installer now detects locally modified THRUNT files, backs them up to `thrunt-local-patches/`, and creates a manifest for restoration
- `/thrunt:reapply-patches` command to merge local modifications back after THRUNT updates

### Changed
- Agents (executor, planner, plan-checker, verifier) now use thrunt-tools for state updates and verification instead of manual markdown parsing
- `/thrunt:update` workflow now notifies about backed-up local patches and suggests `/thrunt:reapply-patches`

### Fixed
- Added workaround for Claude Code `classifyHandoffIfNeeded` bug that causes false agent failures — hunt-run and quick workflows now spot-check actual output before reporting failure

## [1.16.0] - 2026-02-08

### Added
- 10 new thrunt-tools CLI commands that replace manual AI orchestration of mechanical operations:
  - `phase add <desc>` — append phase to roadmap + create directory
  - `phase insert <after> <desc>` — insert decimal phase
  - `phase remove <N> [--force]` — remove phase with full renumbering
  - `phase complete <N>` — mark done, update state + roadmap, detect milestone end
  - `huntmap analyze` — unified roadmap parser with disk status
  - `milestone complete <ver> [--name]` — archive roadmap/requirements/audit
  - `validate consistency` — check phase numbering and disk/roadmap sync
  - `progress [json|table|bar]` — render progress in various formats
  - `todo complete <file>` — move todo from pending to completed
  - `scaffold [context|uat|verification|phase-dir]` — template generation

### Changed
- Workflows now delegate deterministic operations to thrunt-tools CLI, reducing token usage and errors:
  - `remove-phase.md`: 13 manual steps → 1 CLI call + confirm + commit
  - `add-phase.md`: 6 manual steps → 1 CLI call + state update
  - `insert-phase.md`: 7 manual steps → 1 CLI call + state update
  - `complete-milestone.md`: archival delegated to `milestone complete`
  - `progress.md`: roadmap parsing delegated to `huntmap analyze`

### Fixed
- Execute-phase now correctly spawns `thrunt-telemetry-executor` subagents instead of generic task agents
- `commit_docs=false` setting now respected in all `.planning/` commit paths (execute-plan, debugger, reference docs all route through thrunt-tools CLI)
- Execute-phase orchestrator no longer bloats context by embedding file content — passes paths instead, letting subagents read in their fresh context
- Windows: Normalized backslash paths in thrunt-tools invocations (contributed by @rmindel)

## [1.15.0] - 2026-02-08

### Changed
- Optimized workflow context loading to eliminate redundant file reads, reducing token usage by ~5,000-10,000 tokens per workflow execution

## [1.14.0] - 2026-02-08

### Added
- Context-optimizing parsing commands in thrunt-tools (`phase-plan-index`, `state-snapshot`, `summary-extract`) — reduces agent context usage by returning structured JSON instead of raw file content

### Fixed
- Installer no longer deletes opencode.json on JSONC parse errors — now handles comments, trailing commas, and BOM correctly (#474)

## [1.13.0] - 2026-02-08

### Added
- `thrunt-tools history-digest` — Compiles phase summaries into structured JSON for faster context loading
- `thrunt-tools phases list` — Lists phase directories with filtering (replaces fragile `ls | sort -V` patterns)
- `thrunt-tools huntmap get-phase` — Extracts phase sections from HUNTMAP.md
- `thrunt-tools phase next-decimal` — Calculates next decimal phase number for insert operations
- `thrunt-tools state get/patch` — Atomic STATE.md field operations
- `thrunt-tools template select` — Chooses summary template based on plan complexity
- Summary template variants: minimal (~30 lines), standard (~60 lines), complex (~100 lines)
- Test infrastructure with 22 tests covering new commands

### Changed
- Planner uses two-step context assembly: digest for selection, full SUMMARY for understanding
- Agents migrated from bash patterns to structured thrunt-tools commands
- Nested YAML frontmatter parsing now handles `dependency-graph.provides`, `tech-stack.added` correctly

## [1.12.1] - 2026-02-08

### Changed
- Consolidated workflow initialization into compound `init` commands, reducing token usage and improving startup performance
- Updated 24 workflow and agent files to use single-call context gathering instead of multiple atomic calls

## [1.12.0] - 2026-02-07

### Changed
- **Architecture: Thin orchestrator pattern** — Commands now delegate to workflows, reducing command file size by ~75% and improving maintainability
- **Centralized utilities** — New `thrunt-tools.cjs` (11 functions) replaces repetitive bash patterns across 50+ files
- **Token reduction** — ~22k characters removed from affected command/workflow/agent files
- **Condensed agent prompts** — Same behavior with fewer words (executor, planner, verifier, researcher agents)

### Added
- `thrunt-tools.cjs` CLI utility with functions: state load/update, resolve-model, find-phase, commit, validate-summary, generate-slug, current-timestamp, list-todos, check-path-exists, config-ensure-section

## [1.11.2] - 2026-02-05

### Added
- Security section in README with Claude Code deny rules for sensitive files

### Changed
- Install respects `attribution.commit` setting for OpenCode compatibility (#286)

### Fixed
- **CRITICAL:** Prevent API keys from being committed via `/hunt:map-environment` (#429)
- Enforce context fidelity in planning pipeline - agents now honor CONTEXT.md decisions (#326, #216, #206)
- Executor verifies task completion to prevent hallucinated success (#315)
- Auto-create `config.json` when missing during `/thrunt:settings` (#264)
- `/thrunt:update` respects local vs global install location
- Researcher writes RESEARCH.md regardless of `commit_docs` setting
- Statusline crash handling, color validation, git staging rules
- Statusline.js reference updated during install (#330)
- Parallelization config setting now respected (#379)
- ASCII box-drawing vs text content with diacritics (#289)
- Removed broken thrunt-gemini link (404)

## [1.11.1] - 2026-01-31

### Added
- Git branching strategy configuration with three options:
  - `none` (default): commit to current branch
  - `phase`: create branch per phase (`thrunt/phase-{N}-{slug}`)
  - `milestone`: create branch per milestone (`thrunt/{version}-{slug}`)
- Squash merge option at milestone completion (recommended) with merge-with-history alternative
- Context compliance verification dimension in plan checker — flags if plans contradict user decisions

### Fixed
- CONTEXT.md from `/hunt:shape-hypothesis` now properly flows to all downstream agents (researcher, planner, checker, revision loop)

## [1.10.1] - 2025-01-30

### Fixed
- Gemini CLI agent loading errors that prevented commands from executing

## [1.10.0] - 2026-01-29

### Added
- Native Gemini CLI support — install with `--gemini` flag or select from interactive menu
- New `--all` flag to install for Claude Code, OpenCode, and Gemini simultaneously

### Fixed
- Context bar now shows 100% at actual 80% limit (was scaling incorrectly)

## [1.9.12] - 2025-01-23

### Removed
- `/thrunt:whats-new` command — use `/thrunt:update` instead (shows changelog with cancel option)

### Fixed
- Restored auto-release GitHub Actions workflow

## [1.9.11] - 2026-01-23

### Changed
- Switched to manual npm publish workflow (removed GitHub Actions CI/CD)

### Fixed
- Discord badge now uses static format for reliable rendering

## [1.9.10] - 2026-01-23

### Added
- Discord community link shown in installer completion message

## [1.9.9] - 2026-01-23

### Added
- `/thrunt:join-discord` command to quickly access the THRUNT Discord community invite link

## [1.9.8] - 2025-01-22

### Added
- Uninstall flag (`--uninstall`) to cleanly remove THRUNT from global or local installations

### Fixed
- Context file detection now matches filename variants (handles both `CONTEXT.md` and `{phase}-CONTEXT.md` patterns)

## [1.9.7] - 2026-01-22

### Fixed
- OpenCode installer now uses correct XDG-compliant config path (`~/.config/opencode/`) instead of `~/.opencode/`
- OpenCode commands use flat structure (`command/thrunt-help.md`) matching OpenCode's expected format
- OpenCode permissions written to `~/.config/opencode/opencode.json`

## [1.9.6] - 2026-01-22

### Added
- Interactive runtime selection: installer now prompts to choose Claude Code, OpenCode, or both
- Native OpenCode support: `--opencode` flag converts THRUNT to OpenCode format automatically
- `--both` flag to install for both Claude Code and OpenCode in one command
- Auto-configures `~/.opencode.json` permissions for seamless THRUNT doc access

### Changed
- Installation flow now asks for runtime first, then location
- Updated README with new installation options

## [1.9.5] - 2025-01-22

### Fixed
- Subagents can now access MCP tools (Context7, etc.) - workaround for Claude Code bug #13898
- Installer: Escape/Ctrl+C now cancels instead of installing globally
- Installer: Fixed hook paths on Windows
- Removed stray backticks in `/hunt:new-program` output

### Changed
- Condensed verbose documentation in templates and workflows (-170 lines)
- Added CI/CD automation for releases

## [1.9.4] - 2026-01-21

### Changed
- Checkpoint automation now enforces automation-first principle: Claude starts servers, handles CLI installs, and fixes setup failures before presenting checkpoints to users
- Added server lifecycle protocol (port conflict handling, background process management)
- Added CLI auto-installation handling with safe-to-install matrix
- Added pre-checkpoint failure recovery (fix broken environment before asking user to verify)
- DRY refactor: checkpoints.md is now single source of truth for automation patterns

## [1.9.2] - 2025-01-21

### Removed
- **Codebase Intelligence System** — Removed due to overengineering concerns
  - Deleted `/thrunt:analyze-codebase` command
  - Deleted `/thrunt:query-intel` command
  - Removed SQLite graph database and sql.js dependency (21MB)
  - Removed intel hooks (thrunt-intel-index.js, thrunt-intel-session.js, thrunt-intel-prune.js)
  - Removed entity file generation and templates

### Fixed
- new-program now properly includes model_profile in config

## [1.9.0] - 2025-01-20

### Added
- **Model Profiles** — `/thrunt:set-profile` for quality/balanced/budget agent configurations
- **Workflow Settings** — `/thrunt:settings` command for toggling workflow behaviors interactively

### Fixed
- Orchestrators now inline file contents in Task prompts (fixes context issues with @ references)
- Tech debt from milestone audit addressed
- All hooks now use `thrunt-` prefix for consistency (statusline.js → thrunt-statusline.js)

## [1.8.0] - 2026-01-19

### Added
- Uncommitted planning mode: Keep `.planning/` local-only (not committed to git) via `planning.commit_docs: false` in config.json. Useful for OSS contributions, client work, or privacy preferences.
- `/hunt:new-program` now asks about git tracking during initial setup, letting you opt out of committing planning docs from the start

## [1.7.1] - 2026-01-19

### Fixed
- Quick task PLAN and SUMMARY files now use numbered prefix (`001-PLAN.md`, `001-SUMMARY.md`) matching regular phase naming convention

## [1.7.0] - 2026-01-19

### Added
- **Quick Mode** (`/thrunt:quick`) — Execute small, ad-hoc tasks with THRUNT guarantees but skip optional agents (researcher, checker, verifier). Quick tasks live in `.planning/quick/` with their own tracking in STATE.md.

### Changed
- Improved progress bar calculation to clamp values within 0-100 range
- Updated documentation with comprehensive Quick Mode sections in help.md, README.md, and THRUNT-STYLE.md

### Fixed
- Console window flash on Windows when running hooks
- Empty `--config-dir` value validation
- Consistent `allowed-tools` YAML format across agents
- Corrected agent name in research-phase heading
- Removed hardcoded 2025 year from search query examples
- Removed dead thrunt-researcher agent references
- Integrated unused reference files into documentation

### Housekeeping
- Added homepage and bugs fields to package.json

## [1.6.4] - 2026-01-17

### Fixed
- Installation on WSL2/non-TTY terminals now works correctly - detects non-interactive stdin and falls back to global install automatically
- Installation now verifies files were actually copied before showing success checkmarks
- Orphaned `thrunt-notify.sh` hook from previous versions is now automatically removed during install (both file and settings.json registration)

## [1.6.3] - 2025-01-17

### Added
- `--gaps-only` flag for `/hunt:run` — executes only gap closure plans after validate-findings finds issues, eliminating redundant state discovery

## [1.6.2] - 2025-01-17

### Changed
- README restructured with clearer 6-step workflow: init → discuss → plan → execute → verify → complete
- Discuss-phase and validate-findings now emphasized as critical steps in core workflow documentation
- "Subagent Execution" section replaced with "Multi-Agent Orchestration" explaining thin orchestrator pattern and 30-40% context efficiency
- Brownfield instructions consolidated into callout at top of "How It Works" instead of separate section
- Phase directories now created at discuss/hunt-plan instead of during roadmap creation

## [1.6.1] - 2025-01-17

### Changed
- Installer performs clean install of THRUNT folders, removing orphaned files from previous versions
- `/thrunt:update` shows changelog and asks for confirmation before updating, with clear warning about what gets replaced

## [1.6.0] - 2026-01-17

### Changed
- **BREAKING:** Unified `/hunt:new-program` flow — now mirrors `/hunt:new-program` with questioning → research → requirements → roadmap in a single command
- Roadmapper agent now references templates instead of inline structures for easier maintenance

### Removed
- **BREAKING:** `/thrunt:discuss-milestone` — consolidated into `/hunt:new-program`
- **BREAKING:** `/thrunt:create-roadmap` — integrated into project/milestone flows
- **BREAKING:** `/thrunt:define-requirements` — integrated into project/milestone flows
- **BREAKING:** `/thrunt:research-program` — integrated into project/milestone flows

### Added
- `/hunt:validate-findings` now includes next-step routing after verification completes

## [1.5.30] - 2026-01-17

### Fixed
- Output templates in `hunt-plan`, `hunt-run`, and `audit-milestone` now render markdown correctly instead of showing literal backticks
- Next-step suggestions now consistently recommend `/hunt:shape-hypothesis` before `/hunt:plan` across all routing paths

## [1.5.29] - 2025-01-16

### Changed
- Discuss-phase now uses domain-aware questioning with deeper probing for gray areas

### Fixed
- Windows hooks now work via Node.js conversion (statusline, update-check)
- Phase input normalization at command entry points
- Removed blocking notification popups (thrunt-notify) on all platforms

## [1.5.28] - 2026-01-16

### Changed
- Consolidated milestone workflow into single command
- Merged domain expertise skills into agent configurations
- **BREAKING:** Removed `/thrunt:execute-plan` command (use `/hunt:run` instead)

### Fixed
- Phase directory matching now handles both zero-padded (05-*) and unpadded (5-*) folder names
- Map-codebase agent output collection

## [1.5.27] - 2026-01-16

### Fixed
- Orchestrator corrections between executor completions are now committed (previously left uncommitted when orchestrator made small fixes between waves)

## [1.5.26] - 2026-01-16

### Fixed
- Revised plans now get committed after checker feedback (previously only initial plans were committed, leaving revisions uncommitted)

## [1.5.25] - 2026-01-16

### Fixed
- Stop notification hook no longer shows stale project state (now uses session-scoped todos only)
- Researcher agent now reliably loads CONTEXT.md from shape-hypothesis

## [1.5.24] - 2026-01-16

### Fixed
- Stop notification hook now correctly parses STATE.md fields (was always showing "Ready for input")
- Planner agent now reliably loads CONTEXT.md and RESEARCH.md files

## [1.5.23] - 2025-01-16

### Added
- Cross-platform completion notification hook (Mac/Linux/Windows alerts when Claude stops)
- Phase researcher now loads CONTEXT.md from shape-hypothesis to focus research on user decisions

### Fixed
- Consistent zero-padding for phase directories (01-name, not 1-name)
- Plan file naming: `{phase}-{plan}-PLAN.md` pattern restored across all agents
- Double-path bug in researcher git add command
- Removed `/thrunt:research-phase` from next-step suggestions (use `/hunt:plan` instead)

## [1.5.22] - 2025-01-16

### Added
- Statusline update indicator — shows `⬆ /thrunt:update` when a new version is available

### Fixed
- Planner now updates HUNTMAP.md placeholders after planning completes

## [1.5.21] - 2026-01-16

### Added
- THRUNT brand system for consistent UI (checkpoint boxes, stage banners, status symbols)
- Research synthesizer agent that consolidates parallel research into SUMMARY.md

### Changed
- **Unified `/hunt:new-program` flow** — Single command now handles questions → research → requirements → roadmap (~10 min)
- Simplified README to reflect streamlined workflow: new-program → hunt-plan → hunt-run
- Added optional `/hunt:shape-hypothesis` documentation for UI/UX/behavior decisions before planning

### Fixed
- validate-findings now shows clear checkpoint box with action prompt ("Type 'pass' or describe what's wrong")
- Planner uses correct `{phase}-{plan}-PLAN.md` naming convention
- Planner no longer surfaces internal `user_setup` in output
- Research synthesizer commits all research files together (not individually)
- Project researcher agent can no longer commit (orchestrator handles commits)
- Roadmap requires explicit user approval before committing

## [1.5.20] - 2026-01-16

### Fixed
- Research no longer skipped based on premature "Research: Unlikely" predictions made during roadmap creation. The `--skip-research` flag provides explicit control when needed.

### Removed
- `Research: Likely/Unlikely` fields from roadmap phase template
- `detect_research_needs` step from roadmap creation workflow
- Roadmap-based research skip logic from planner agent

## [1.5.19] - 2026-01-16

### Changed
- `/hunt:shape-hypothesis` redesigned with intelligent gray area analysis — analyzes phase to identify discussable areas (UI, UX, Behavior, etc.), presents multi-select for user control, deep-dives each area with focused questioning
- Explicit scope guardrail prevents scope creep during discussion — captures deferred ideas without acting on them
- CONTEXT.md template restructured for decisions (domain boundary, decisions by category, Claude's discretion, deferred ideas)
- Downstream awareness: shape-hypothesis now explicitly documents that CONTEXT.md feeds researcher and planner agents
- `/hunt:plan` now integrates research — spawns `thrunt-query-writer` before planning unless research exists or `--skip-research` flag used

## [1.5.18] - 2026-01-16

### Added
- **Plan verification loop** — Plans are now verified before execution with a planner → checker → revise cycle
  - New `thrunt-hunt-checker` agent (744 lines) validates plans will achieve phase goals
  - Six verification dimensions: requirement coverage, task completeness, dependency correctness, key links, scope sanity, must_haves derivation
  - Max 3 revision iterations before user escalation
  - `--skip-verify` flag for experienced users who want to bypass verification
- **Dedicated planner agent** — `thrunt-hunt-planner` (1,319 lines) consolidates all planning expertise
  - Complete methodology: discovery levels, task breakdown, dependency graphs, scope estimation, goal-backward analysis
  - Revision mode for handling checker feedback
  - TDD integration and checkpoint patterns
- **Statusline integration** — Context usage, model, and current task display

### Changed
- `/hunt:plan` refactored to thin orchestrator pattern (310 lines)
  - Spawns `thrunt-hunt-planner` for planning, `thrunt-hunt-checker` for verification
  - User sees status between agent spawns (not a black box)
- Planning references deprecated with redirects to `thrunt-hunt-planner` agent sections
  - `plan-format.md`, `scope-estimation.md`, `goal-backward.md`, `principles.md`
  - `workflows/hunt-plan.md`

### Fixed
- Removed zombie `thrunt-milestone-auditor` agent (was accidentally re-added after correct deletion)

### Removed
- Phase 99 throwaway test files

## [1.5.17] - 2026-01-15

### Added
- New `/thrunt:update` command — check for updates, install, and display changelog of what changed (better UX than raw `npx thrunt-god`)

## [1.5.16] - 2026-01-15

### Added
- New `thrunt-researcher` agent (915 lines) with comprehensive research methodology, 4 research modes (ecosystem, feasibility, implementation, comparison), source hierarchy, and verification protocols
- New `thrunt-incident-debugger` agent (990 lines) with scientific debugging methodology, hypothesis testing, and 7+ investigation techniques
- New `thrunt-environment-mapper` agent for brownfield codebase analysis
- Research subagent prompt template for context-only spawning

### Changed
- `/thrunt:research-phase` refactored to thin orchestrator — now injects rich context (key insight framing, downstream consumer info, quality gates) to thrunt-researcher agent
- `/thrunt:research-program` refactored to spawn 4 parallel thrunt-researcher agents with milestone-aware context (greenfield vs v1.1+) and roadmap implications guidance
- `/thrunt:debug` refactored to thin orchestrator (149 lines) — spawns thrunt-incident-debugger agent with full debugging expertise
- `/hunt:new-program` now explicitly references MILESTONE-CONTEXT.md

### Deprecated
- `workflows/hunt-plan.md` — consolidated into thrunt-researcher agent
- `workflows/research-program.md` — consolidated into thrunt-researcher agent
- `workflows/debug.md` — consolidated into thrunt-incident-debugger agent
- `references/research-pitfalls.md` — consolidated into thrunt-researcher agent
- `references/debugging.md` — consolidated into thrunt-incident-debugger agent
- `references/debug-investigation.md` — consolidated into thrunt-incident-debugger agent

## [1.5.15] - 2025-01-15

### Fixed
- **Agents now install correctly** — The `agents/` folder (thrunt-telemetry-executor, thrunt-findings-validator, thrunt-evidence-correlator, thrunt-milestone-auditor) was missing from npm package, now included

### Changed
- Consolidated `/thrunt:plan-fix` into `/hunt:plan --gaps` for simpler workflow
- Evidence Review file writes now batched instead of per-response for better performance

## [1.5.14] - 2025-01-15

### Fixed
- Plan-phase now always routes to `/hunt:run` after planning, even for single-plan phases

## [1.5.13] - 2026-01-15

### Fixed
- `/hunt:new-program` now presents research and requirements paths as equal options, matching `/hunt:new-program` format

## [1.5.12] - 2025-01-15

### Changed
- **Milestone cycle reworked for proper requirements flow:**
  - `complete-milestone` now archives AND deletes HUNTMAP.md and HYPOTHESES.md (fresh for next milestone)
  - `new-milestone` is now a "brownfield new-program" — updates MISSION.md with new goals, routes to define-requirements
  - `discuss-milestone` is now required before `new-milestone` (creates context file)
  - `research-program` is milestone-aware — focuses on new features, ignores already-validated requirements
  - `create-roadmap` continues phase numbering from previous milestone
  - Flow: complete → discuss → new-milestone → research → requirements → roadmap

### Fixed
- `MILESTONE-AUDIT.md` now versioned as `v{version}-MILESTONE-AUDIT.md` and archived on completion
- `progress` now correctly routes to `/thrunt:discuss-milestone` when between milestones (Route F)

## [1.5.11] - 2025-01-15

### Changed
- Verifier reuses previous must-haves on re-verification instead of re-deriving, focuses deep verification on failed items with quick regression checks on passed items

## [1.5.10] - 2025-01-15

### Changed
- Milestone audit now reads existing phase FINDINGS.md files instead of re-verifying each phase, aggregates tech debt and deferred gaps, adds `tech_debt` status for non-blocking accumulated debt

### Fixed
- FINDINGS.md now included in phase completion commit alongside HUNTMAP.md, STATE.md, and HYPOTHESES.md

## [1.5.9] - 2025-01-15

### Added
- Milestone audit system (`/thrunt:audit-milestone`) for verifying milestone completion with parallel verification agents

### Changed
- Checkpoint display format improved with box headers and unmissable "→ YOUR ACTION:" prompts
- Subagent colors updated (executor: yellow, integration-checker: blue)
- Execute-phase now recommends `/thrunt:audit-milestone` when milestone completes

### Fixed
- Research-phase no longer gatekeeps by domain type

### Removed
- Domain expertise feature (`~/.claude/skills/expertise/`) - was personal tooling not available to other users

## [1.5.8] - 2025-01-15

### Added
- Verification loop: When gaps are found, verifier generates fix plans that execute automatically before re-verifying

### Changed
- `thrunt-telemetry-executor` subagent color changed from red to blue

## [1.5.7] - 2025-01-15

### Added
- `thrunt-telemetry-executor` subagent: Dedicated agent for plan execution with full workflow logic built-in
- `thrunt-findings-validator` subagent: Goal-backward verification that checks if phase goals are actually achieved (not just tasks completed)
- Phase verification: Automatic verification runs when a phase completes to catch stubs and incomplete implementations
- Goal-backward planning reference: Documentation for deriving must-haves from goals

### Changed
- execute-plan and hunt-run now spawn `thrunt-telemetry-executor` subagent instead of using inline workflow
- Roadmap and planning workflows enhanced with goal-backward analysis

### Removed
- Obsolete templates (`checkpoint-resume.md`, `subagent-task-prompt.md`) — logic now lives in subagents

### Fixed
- Updated remaining `general-purpose` subagent references to use `thrunt-telemetry-executor`

## [1.5.6] - 2025-01-15

### Changed
- README: Separated flow into distinct steps (1 → 1.5 → 2 → 3 → 4 → 5) making `research-program` clearly optional and `define-requirements` required
- README: Research recommended for quality; skip only for speed

### Fixed
- hunt-run: Phase metadata (timing, wave info) now bundled into single commit instead of separate commits

## [1.5.5] - 2025-01-15

### Changed
- README now documents the `research-program` → `define-requirements` flow (optional but recommended before `create-roadmap`)
- Commands section reorganized into 7 grouped tables (Setup, Execution, Verification, Milestones, Phase Management, Session, Utilities) for easier scanning
- Context Engineering table now includes `research/` and `HYPOTHESES.md`

## [1.5.4] - 2025-01-15

### Changed
- Research phase now loads HYPOTHESES.md to focus research on concrete requirements (e.g., "email verification") rather than just high-level roadmap descriptions

## [1.5.3] - 2025-01-15

### Changed
- **hunt-run narration**: Orchestrator now describes what each wave builds before spawning agents, and summarizes what was built after completion. No more staring at opaque status updates.
- **new-program flow**: Now offers two paths — research first (recommended) or define requirements directly (fast path for familiar domains)
- **define-requirements**: Works without prior research. Gathers requirements through conversation when FEATURES.md doesn't exist.

### Removed
- Dead `/thrunt:status` command (referenced abandoned background agent model)
- Unused `agent-history.md` template
- `_archive/` directory with old hunt-run version

## [1.5.2] - 2026-01-15

### Added
- Hypothesis traceability: huntmap phases now include `Hypotheses:` fields listing which HYP-IDs they cover
- hunt-plan loads HYPOTHESES.md and shows phase-specific requirements before planning
- Hypotheses automatically marked Supported when a phase finishes

### Changed
- Workflow preferences (mode, depth, parallelization) now asked in single prompt instead of 3 separate questions
- define-requirements shows full requirements list inline before commit (not just counts)
- Research-project and workflow aligned to both point to define-requirements as next step

### Fixed
- Hypothesis status now updates in the orchestrator (commands) instead of the subagent workflow, which could not determine phase completion

## [1.5.1] - 2026-01-14

### Changed
- Research agents write their own files directly (STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md) instead of returning results to orchestrator
- Slimmed principles.md and load it dynamically in core commands

## [1.5.0] - 2026-01-14

### Added
- New `/thrunt:research-program` command for pre-roadmap ecosystem research — spawns parallel agents to investigate stack, features, architecture, and pitfalls before you commit to a roadmap
- New `/thrunt:define-requirements` command for scoping v1 requirements from research findings — transforms "what exists in this domain" into "what we're building"
- Hypothesis traceability: phases now map to specific hypothesis IDs with 100% coverage validation

### Changed
- **BREAKING:** New project flow is now: `new-program → research-program → define-requirements → create-roadmap`
- Roadmap creation now requires HYPOTHESES.md and validates all v1 requirements are mapped to phases
- Simplified questioning in new-program to four essentials (vision, core priority, boundaries, constraints)

## [1.4.29] - 2026-01-14

### Removed
- Deleted obsolete `_archive/hunt-run.md` and `status.md` commands

## [1.4.28] - 2026-01-14

### Fixed
- Restored comprehensive checkpoint documentation with full examples for verification, decisions, and auth gates
- Fixed execute-plan command to use fresh continuation agents instead of broken resume pattern
- Rich checkpoint presentation formats now documented for all three checkpoint types

### Changed
- Slimmed hunt-run command to properly delegate checkpoint handling to workflow

## [1.4.27] - 2025-01-14

### Fixed
- Restored "what to do next" commands after plan/phase execution completes — orchestrator pattern conversion had inadvertently removed the copy/paste-ready next-step routing

## [1.4.26] - 2026-01-14

### Added
- Full changelog history backfilled from git (66 historical versions from 1.0.0 to 1.4.23)

## [1.4.25] - 2026-01-14

### Added
- New `/thrunt:whats-new` command shows changes since your installed version
- VERSION file written during installation for version tracking
- CHANGELOG.md now included in package installation

## [1.4.24] - 2026-01-14

### Added
- USER-SETUP.md template for external service configuration

### Removed
- **BREAKING:** ISSUES.md system (replaced by phase-scoped Evidence Review issues and TODOs)

## [1.4.23] - 2026-01-14

### Changed
- Removed dead ISSUES.md system code

## [1.4.22] - 2026-01-14

### Added
- Subagent isolation for debug investigations with checkpoint support

### Fixed
- DEBUG_DIR path constant to prevent typos in debug workflow

## [1.4.21] - 2026-01-14

### Fixed
- SlashCommand tool added to plan-fix allowed-tools

## [1.4.20] - 2026-01-14

### Fixed
- Standardized debug file naming convention
- Debug workflow now invokes execute-plan correctly

## [1.4.19] - 2026-01-14

### Fixed
- Auto-diagnose issues instead of offering choice in plan-fix

## [1.4.18] - 2026-01-14

### Added
- Parallel diagnosis before plan-fix execution

## [1.4.17] - 2026-01-14

### Changed
- Redesigned validate-findings as conversational Evidence Review with persistent state

## [1.4.16] - 2026-01-13

### Added
- Pre-execution summary for interactive mode in execute-plan
- Pre-computed wave numbers at plan time

## [1.4.15] - 2026-01-13

### Added
- Context rot explanation to README header

## [1.4.14] - 2026-01-13

### Changed
- YOLO mode is now recommended default in new-program

## [1.4.13] - 2026-01-13

### Fixed
- Brownfield flow documentation
- Removed deprecated resume-task references

## [1.4.12] - 2026-01-13

### Changed
- hunt-run is now recommended as primary execution command

## [1.4.11] - 2026-01-13

### Fixed
- Checkpoints now use fresh continuation agents instead of resume

## [1.4.10] - 2026-01-13

### Changed
- execute-plan converted to orchestrator pattern for performance

## [1.4.9] - 2026-01-13

### Changed
- Removed subagent-only context from hunt-run orchestrator

### Fixed
- Removed "what's out of scope" question from shape-hypothesis

## [1.4.8] - 2026-01-13

### Added
- TDD reasoning explanation restored to hunt-plan docs

## [1.4.7] - 2026-01-13

### Added
- Project state loading before execution in hunt-run

### Fixed
- Parallel execution marked as recommended, not experimental

## [1.4.6] - 2026-01-13

### Added
- Checkpoint pause/resume for spawned agents
- Deviation rules, commit rules, and workflow references to hunt-run

## [1.4.5] - 2026-01-13

### Added
- Parallel-first planning with dependency graphs
- Checkpoint-resume capability for long-running phases
- `.claude/rules/` directory for auto-loaded contribution rules

### Changed
- hunt-run uses wave-based blocking execution

## [1.4.4] - 2026-01-13

### Fixed
- Inline listing for multiple active debug sessions

## [1.4.3] - 2026-01-13

### Added
- `/thrunt:debug` command for systematic debugging with persistent state

## [1.4.2] - 2026-01-13

### Fixed
- Installation verification step clarification

## [1.4.1] - 2026-01-13

### Added
- Parallel phase execution via `/hunt:run`
- Parallel-aware planning in `/hunt:plan`
- `/thrunt:status` command for parallel agent monitoring
- Parallelization configuration in config.json
- Wave-based parallel execution with dependency graphs

### Changed
- Renamed `hunt-run.md` workflow to `execute-plan.md` for clarity
- Plan frontmatter now includes `wave`, `depends_on`, `files_modified`, `autonomous`

## [1.4.0] - 2026-01-12

### Added
- Full parallel phase execution system
- Parallelization frontmatter in plan templates
- Dependency analysis for parallel task scheduling
- Agent history schema v1.2 with parallel execution support

### Changed
- Plans can now specify wave numbers and dependencies
- hunt-run orchestrates multiple subagents in waves

## [1.3.34] - 2026-01-11

### Added
- `/thrunt:add-todo` and `/thrunt:check-todos` for mid-session idea capture

## [1.3.33] - 2026-01-11

### Fixed
- Consistent zero-padding for decimal phase numbers (e.g., 01.1)

### Changed
- Removed obsolete .claude-plugin directory

## [1.3.32] - 2026-01-10

### Added
- `/thrunt:resume-task` for resuming interrupted subagent executions

## [1.3.31] - 2026-01-08

### Added
- Planning principles for security, performance, and observability
- Pro patterns section in README

## [1.3.30] - 2026-01-08

### Added
- validate-findings option surfaces after plan execution

## [1.3.29] - 2026-01-08

### Added
- `/hunt:validate-findings` for conversational Evidence Review validation
- `/thrunt:plan-fix` for fixing Evidence Review issues
- Evidence Review issues template

## [1.3.28] - 2026-01-07

### Added
- `--config-dir` CLI argument for multi-account setups
- `/thrunt:remove-phase` command

### Fixed
- Validation for --config-dir edge cases

## [1.3.27] - 2026-01-07

### Added
- Recommended permissions mode documentation

### Fixed
- Mandatory verification enforced before phase/milestone completion routing

## [1.3.26] - 2026-01-06

### Added
- Claude Code marketplace plugin support

### Fixed
- Phase artifacts now committed when created

## [1.3.25] - 2026-01-06

### Fixed
- Milestone discussion context persists across /clear

## [1.3.24] - 2026-01-06

### Added
- `CLAUDE_CONFIG_DIR` environment variable support

## [1.3.23] - 2026-01-06

### Added
- Non-interactive install flags (`--global`, `--local`) for Docker/CI

## [1.3.22] - 2026-01-05

### Changed
- Removed unused auto.md command

## [1.3.21] - 2026-01-05

### Changed
- TDD features use dedicated plans for full context quality

## [1.3.20] - 2026-01-05

### Added
- Per-task atomic commits for better AI observability

## [1.3.19] - 2026-01-05

### Fixed
- Clarified create-milestone.md file locations with explicit instructions

## [1.3.18] - 2026-01-05

### Added
- YAML frontmatter schema with dependency graph metadata
- Intelligent context assembly via frontmatter dependency graph

## [1.3.17] - 2026-01-04

### Fixed
- Clarified depth controls compression, not inflation in planning

## [1.3.16] - 2026-01-04

### Added
- Depth parameter for planning thoroughness (`--depth=1-5`)

## [1.3.15] - 2026-01-01

### Fixed
- TDD reference loaded directly in commands

## [1.3.14] - 2025-12-31

### Added
- TDD integration with detection, annotation, and execution flow

## [1.3.13] - 2025-12-29

### Fixed
- Restored deterministic bash commands
- Removed redundant decision_gate

## [1.3.12] - 2025-12-29

### Fixed
- Restored plan-format.md as output template

## [1.3.11] - 2025-12-29

### Changed
- 70% context reduction for hunt-plan workflow
- Merged CLI automation into checkpoints
- Compressed scope-estimation (74% reduction) and hunt-plan.md (66% reduction)

## [1.3.10] - 2025-12-29

### Fixed
- Explicit plan count check in offer_next step

## [1.3.9] - 2025-12-27

### Added
- Evolutionary MISSION.md system with incremental updates

## [1.3.8] - 2025-12-18

### Added
- Brownfield/existing projects section in README

## [1.3.7] - 2025-12-18

### Fixed
- Improved incremental codebase map updates

## [1.3.6] - 2025-12-18

### Added
- File paths included in codebase mapping output

## [1.3.5] - 2025-12-17

### Fixed
- Removed arbitrary 100-line limit from codebase mapping

## [1.3.4] - 2025-12-17

### Fixed
- Inline code for Next Up commands (avoids nesting ambiguity)

## [1.3.3] - 2025-12-17

### Fixed
- Check MISSION.md not .planning/ directory for existing project detection

## [1.3.2] - 2025-12-17

### Added
- Git commit step to map-environment workflow

## [1.3.1] - 2025-12-17

### Added
- `/hunt:map-environment` documentation in help and README

## [1.3.0] - 2025-12-17

### Added
- `/hunt:map-environment` command for brownfield project analysis
- Codebase map templates (stack, architecture, structure, conventions, testing, integrations, concerns)
- Parallel Explore agent orchestration for codebase analysis
- Brownfield integration into THRUNT workflows

### Changed
- Improved continuation UI with context and visual hierarchy

### Fixed
- Permission errors for non-DSP users (removed shell context)
- First question is now freeform, not AskUserQuestion

## [1.2.13] - 2025-12-17

### Added
- Improved continuation UI with context and visual hierarchy

## [1.2.12] - 2025-12-17

### Fixed
- First question should be freeform, not AskUserQuestion

## [1.2.11] - 2025-12-17

### Fixed
- Permission errors for non-DSP users (removed shell context)

## [1.2.10] - 2025-12-16

### Fixed
- Inline command invocation replaced with clear-then-paste pattern

## [1.2.9] - 2025-12-16

### Fixed
- Git init runs in current directory

## [1.2.8] - 2025-12-16

### Changed
- Phase count derived from work scope, not arbitrary limits

## [1.2.7] - 2025-12-16

### Fixed
- AskUserQuestion mandated for all exploration questions

## [1.2.6] - 2025-12-16

### Changed
- Internal refactoring

## [1.2.5] - 2025-12-16

### Changed
- `<if mode>` tags for yolo/interactive branching

## [1.2.4] - 2025-12-16

### Fixed
- Stale CONTEXT.md references updated to new vision structure

## [1.2.3] - 2025-12-16

### Fixed
- Enterprise language removed from help and discuss-milestone

## [1.2.2] - 2025-12-16

### Fixed
- new-program completion presented inline instead of as question

## [1.2.1] - 2025-12-16

### Fixed
- AskUserQuestion restored for decision gate in questioning flow

## [1.2.0] - 2025-12-15

### Changed
- Research workflow implemented as Claude Code context injection

## [1.1.2] - 2025-12-15

### Fixed
- YOLO mode now skips confirmation gates in hunt-plan

## [1.1.1] - 2025-12-15

### Added
- README documentation for new research workflow

## [1.1.0] - 2025-12-15

### Added
- Pre-roadmap research workflow
- `/thrunt:research-phase` for niche domain ecosystem discovery
- `/thrunt:research-program` command with workflow and templates
- `/thrunt:create-roadmap` command with research-aware workflow
- Research subagent prompt templates

### Changed
- new-program split to only create MISSION.md + config.json
- Questioning rewritten as thinking partner, not interviewer

## [1.0.11] - 2025-12-15

### Added
- `/thrunt:research-phase` for niche domain ecosystem discovery

## [1.0.10] - 2025-12-15

### Fixed
- Scope creep prevention in shape-hypothesis command

## [1.0.9] - 2025-12-15

### Added
- Phase CONTEXT.md loaded in hunt-plan command

## [1.0.8] - 2025-12-15

### Changed
- PLAN.md included in phase completion commits

## [1.0.7] - 2025-12-15

### Added
- Path replacement for local installs

## [1.0.6] - 2025-12-15

### Changed
- Internal improvements

## [1.0.5] - 2025-12-15

### Added
- Global/local install prompt during setup

### Fixed
- Bin path fixed (removed ./)
- .DS_Store ignored

## [1.0.4] - 2025-12-15

### Fixed
- Bin name and circular dependency removed

## [1.0.3] - 2025-12-15

### Added
- TDD guidance in planning workflow

## [1.0.2] - 2025-12-15

### Added
- Issue triage system to prevent deferred issue pile-up

## [1.0.1] - 2025-12-15

### Added
- Initial npm package release

## [1.0.0] - 2025-12-14

### Added
- Initial release of THRUNT (THRUNT GOD) meta-prompting system
- Core slash commands: `/hunt:new-program`, `/hunt:shape-hypothesis`, `/hunt:plan`, `/hunt:run`
- MISSION.md and STATE.md templates
- Phase-based development workflow
- YOLO mode for autonomous execution
- Interactive mode with checkpoints

[Unreleased]: https://github.com/backbay-labs/thrunt-god/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/backbay-labs/thrunt-god/releases/tag/v0.3.1
[0.3.0]: https://github.com/backbay-labs/thrunt-god/releases/tag/v0.3.0
[1.28.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.28.0
[1.27.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.27.0
[1.26.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.26.0
[1.25.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.25.0
[1.24.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.24.0
[1.23.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.23.0
[1.22.4]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.22.4
[1.22.3]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.22.3
[1.22.2]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.22.2
[1.22.1]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.22.1
[1.22.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.22.0
[1.21.1]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.21.1
[1.21.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.21.0
[1.20.6]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.20.6
[1.20.5]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.20.5
[1.20.4]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.20.4
[1.20.3]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.20.3
[1.20.2]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.20.2
[1.20.1]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.20.1
[1.20.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.20.0
[1.19.2]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.19.2
[1.19.1]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.19.1
[1.19.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.19.0
[1.18.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.18.0
[1.17.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.17.0
[1.16.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.16.0
[1.15.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.15.0
[1.14.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.14.0
[1.13.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.13.0
[1.12.1]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.12.1
[1.12.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.12.0
[1.11.2]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.11.2
[1.11.1]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.11.0
[1.10.1]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.10.1
[1.10.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.10.0
[1.9.12]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.9.12
[1.9.11]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.9.11
[1.9.10]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.9.10
[1.9.9]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.9.9
[1.9.8]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.9.8
[1.9.7]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.9.7
[1.9.6]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.9.6
[1.9.5]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.9.5
[1.9.4]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.9.4
[1.9.2]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.9.2
[1.9.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.9.0
[1.8.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.8.0
[1.7.1]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.7.1
[1.7.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.7.0
[1.6.4]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.6.4
[1.6.3]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.6.3
[1.6.2]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.6.2
[1.6.1]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.6.1
[1.6.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.6.0
[1.5.30]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.30
[1.5.29]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.29
[1.5.28]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.28
[1.5.27]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.27
[1.5.26]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.26
[1.5.25]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.25
[1.5.24]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.24
[1.5.23]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.23
[1.5.22]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.22
[1.5.21]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.21
[1.5.20]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.20
[1.5.19]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.19
[1.5.18]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.18
[1.5.17]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.17
[1.5.16]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.16
[1.5.15]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.15
[1.5.14]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.14
[1.5.13]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.13
[1.5.12]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.12
[1.5.11]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.11
[1.5.10]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.10
[1.5.9]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.9
[1.5.8]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.8
[1.5.7]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.7
[1.5.6]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.6
[1.5.5]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.5
[1.5.4]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.4
[1.5.3]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.3
[1.5.2]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.2
[1.5.1]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.1
[1.5.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.5.0
[1.4.29]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.29
[1.4.28]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.28
[1.4.27]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.27
[1.4.26]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.26
[1.4.25]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.25
[1.4.24]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.24
[1.4.23]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.23
[1.4.22]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.22
[1.4.21]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.21
[1.4.20]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.20
[1.4.19]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.19
[1.4.18]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.18
[1.4.17]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.17
[1.4.16]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.16
[1.4.15]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.15
[1.4.14]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.14
[1.4.13]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.13
[1.4.12]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.12
[1.4.11]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.11
[1.4.10]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.10
[1.4.9]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.9
[1.4.8]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.8
[1.4.7]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.7
[1.4.6]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.6
[1.4.5]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.5
[1.4.4]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.4
[1.4.3]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.3
[1.4.2]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.2
[1.4.1]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.1
[1.4.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.4.0
[1.3.34]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.34
[1.3.33]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.33
[1.3.32]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.32
[1.3.31]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.31
[1.3.30]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.30
[1.3.29]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.29
[1.3.28]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.28
[1.3.27]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.27
[1.3.26]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.26
[1.3.25]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.25
[1.3.24]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.24
[1.3.23]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.23
[1.3.22]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.22
[1.3.21]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.21
[1.3.20]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.20
[1.3.19]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.19
[1.3.18]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.18
[1.3.17]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.17
[1.3.16]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.16
[1.3.15]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.15
[1.3.14]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.14
[1.3.13]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.13
[1.3.12]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.12
[1.3.11]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.11
[1.3.10]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.10
[1.3.9]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.9
[1.3.8]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.8
[1.3.7]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.7
[1.3.6]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.6
[1.3.5]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.5
[1.3.4]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.4
[1.3.3]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.3
[1.3.2]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.2
[1.3.1]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.1
[1.3.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.3.0
[1.2.13]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.2.13
[1.2.12]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.2.12
[1.2.11]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.2.11
[1.2.10]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.2.10
[1.2.9]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.2.9
[1.2.8]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.2.8
[1.2.7]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.2.7
[1.2.6]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.2.6
[1.2.5]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.2.5
[1.2.4]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.2.4
[1.2.3]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.2.3
[1.2.2]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.2.2
[1.2.1]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.2.1
[1.2.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.2.0
[1.1.2]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.1.2
[1.1.1]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.1.1
[1.1.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.1.0
[1.0.11]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.0.11
[1.0.10]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.0.10
[1.0.9]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.0.9
[1.0.8]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.0.8
[1.0.7]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.0.7
[1.0.6]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.0.6
[1.0.5]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.0.5
[1.0.4]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.0.4
[1.0.3]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.0.3
[1.0.2]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.0.2
[1.0.1]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.0.1
[1.0.0]: https://github.com/glittercowboy/thrunt-god/releases/tag/v1.0.0
