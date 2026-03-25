# THRUNT Command Reference

> Complete command syntax, flags, options, and examples. For feature details, see [Feature Reference](FEATURES.md). For workflow walkthroughs, see [User Guide](USER-GUIDE.md).

---

## Command Syntax

- **Claude Code / Gemini / Copilot:** `/thrunt:command-name [args]`
- **OpenCode:** `/thrunt-command-name [args]`
- **Codex:** `$thrunt-command-name [args]`

---

## Core Workflow Commands

### `/hunt:new-program`

Initialize a new project with deep context gathering.

| Flag | Description |
|------|-------------|
| `--auto @file.md` | Auto-extract from document, skip interactive questions |

**Prerequisites:** No existing `.planning/MISSION.md`
**Produces:** `MISSION.md`, `HYPOTHESES.md`, `HUNTMAP.md`, `STATE.md`, `config.json`, `research/`, `CLAUDE.md`

```bash
/hunt:new-program                    # Interactive mode
/hunt:new-program --auto @prd.md     # Auto-extract from PRD
```

---

### `/thrunt:new-workspace`

Create an isolated workspace with repo copies and independent `.planning/` directory.

| Flag | Description |
|------|-------------|
| `--name <name>` | Workspace name (required) |
| `--repos repo1,repo2` | Comma-separated repo paths or names |
| `--path /target` | Target directory (default: `~/thrunt-workspaces/<name>`) |
| `--strategy worktree\|clone` | Copy strategy (default: `worktree`) |
| `--branch <name>` | Branch to checkout (default: `workspace/<name>`) |
| `--auto` | Skip interactive questions |

**Use cases:**
- Multi-repo: work on a subset of repos with isolated THRUNT state
- Feature isolation: `--repos .` creates a worktree of the current repo

**Produces:** `WORKSPACE.md`, `.planning/`, repo copies (worktrees or clones)

```bash
/thrunt:new-workspace --name feature-b --repos hr-ui,ZeymoAPI
/thrunt:new-workspace --name feature-b --repos . --strategy worktree  # Same-repo isolation
/thrunt:new-workspace --name spike --repos api,web --strategy clone   # Full clones
```

---

### `/thrunt:list-workspaces`

List active THRUNT workspaces and their status.

**Scans:** `~/thrunt-workspaces/` for `WORKSPACE.md` manifests
**Shows:** Name, repo count, strategy, THRUNT project status

```bash
/thrunt:list-workspaces
```

---

### `/thrunt:remove-workspace`

Remove a workspace and clean up git worktrees.

| Argument | Required | Description |
|----------|----------|-------------|
| `<name>` | Yes | Workspace name to remove |

**Safety:** Refuses removal if any repo has uncommitted changes. Requires name confirmation.

```bash
/thrunt:remove-workspace feature-b
```

---

### `/hunt:shape-hypothesis`

Capture implementation decisions before planning.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to current phase) |

| Flag | Description |
|------|-------------|
| `--auto` | Auto-select recommended defaults for all questions |
| `--batch` | Group questions for batch intake instead of one-by-one |
| `--analyze` | Add trade-off analysis during discussion |

**Prerequisites:** `.planning/HUNTMAP.md` exists
**Produces:** `{phase}-CONTEXT.md`, `{phase}-DISCUSSION-LOG.md` (audit trail)

```bash
/hunt:shape-hypothesis 1                # Interactive discussion for phase 1
/hunt:shape-hypothesis 3 --auto         # Auto-select defaults for phase 3
/hunt:shape-hypothesis --batch          # Batch mode for current phase
/hunt:shape-hypothesis 2 --analyze      # Discussion with trade-off analysis
```

---

### `/thrunt:ui-phase`

Generate UI design contract for frontend phases.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to current phase) |

**Prerequisites:** `.planning/HUNTMAP.md` exists, phase has frontend/UI work
**Produces:** `{phase}-UI-SPEC.md`

```bash
/thrunt:ui-phase 2                     # Design contract for phase 2
```

---

### `/hunt:plan`

Research, plan, and verify a phase.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to next unplanned phase) |

| Flag | Description |
|------|-------------|
| `--auto` | Skip interactive confirmations |
| `--research` | Force re-research even if RESEARCH.md exists |
| `--skip-research` | Skip domain research step |
| `--gaps` | Gap closure mode (reads FINDINGS.md, skips research) |
| `--skip-verify` | Skip plan checker verification loop |
| `--prd <file>` | Use a PRD file instead of shape-hypothesis for context |
| `--reviews` | Replan with cross-AI review feedback from REVIEWS.md |

**Prerequisites:** `.planning/HUNTMAP.md` exists
**Produces:** `{phase}-RESEARCH.md`, `{phase}-{N}-PLAN.md`, `{phase}-VALIDATION.md`

```bash
/hunt:plan 1                   # Research + plan + verify phase 1
/hunt:plan 3 --skip-research   # Plan without research (familiar domain)
/hunt:plan --auto              # Non-interactive planning
```

---

### `/hunt:run`

Execute all plans in a phase with wave-based parallelization, or run a specific wave.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | **Yes** | Phase number to execute |
| `--wave N` | No | Execute only Wave `N` in the phase |

**Prerequisites:** Phase has PLAN.md files
**Produces:** per-plan `{phase}-{N}-SUMMARY.md`, git commits, and `{phase}-FINDINGS.md` when the phase is fully complete

For connector-backed local execution and diagnostics, THRUNT also exposes:
- `node thrunt-tools.cjs runtime list-connectors`
- `node thrunt-tools.cjs runtime doctor [<connector-id>] [--profile <name>] [--live]`
- `node thrunt-tools.cjs runtime smoke [<connector-id>] [--profile <name>]`
- `node thrunt-tools.cjs runtime execute --connector <id> --query "..." --profile <name>`
- `node thrunt-tools.cjs runtime execute --pack <pack-id> --target "<target-name>" --param key=value`

`runtime doctor` scores readiness from the real connector profile, secret references, preflight requirements, and optional live smoke execution.

`runtime smoke` runs a live read-only smoke query without emitting hunt query-log or receipt artifacts. For connectors that do not ship a built-in safe smoke query, provide `connector_profiles.<connector>.<profile>.smoke_test` or pass `--query`, `--dataset`, and `--language`.

For pack-registry inspection and dry validation, THRUNT also exposes:
- `node thrunt-tools.cjs pack list`
- `node thrunt-tools.cjs pack show <pack-id>` for the fully resolved pack, including composed content
- `node thrunt-tools.cjs pack bootstrap <pack-id> --param key=value`
- `node thrunt-tools.cjs pack validate <pack-id> --param key=value`
- `node thrunt-tools.cjs pack render-targets <pack-id> --param key=value`
- `node thrunt-tools.cjs pack lint [<pack-id>]`
- `node thrunt-tools.cjs pack test [<pack-id>]`
- `node thrunt-tools.cjs pack init <pack-id> --kind <kind>`

```bash
/hunt:run 1                # Execute phase 1
/hunt:run 1 --wave 2       # Execute only Wave 2
```

---

### `/hunt:validate-findings`

User acceptance testing with auto-diagnosis.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to last executed phase) |

**Prerequisites:** Phase has been executed
**Produces:** `{phase}-EVIDENCE_REVIEW.md`, fix plans if issues found

```bash
/hunt:validate-findings 1                  # Evidence Review for phase 1
```

---

### `/thrunt:next`

Automatically advance to the next logical workflow step. Reads project state and runs the appropriate command.

**Prerequisites:** `.planning/` directory exists
**Behavior:**
- No project → suggests `/hunt:new-program`
- Phase needs discussion → runs `/hunt:shape-hypothesis`
- Phase needs planning → runs `/hunt:plan`
- Phase needs execution → runs `/hunt:run`
- Phase needs findings validation → runs `/hunt:validate-findings`
- All phases complete → suggests `/thrunt:complete-milestone`

```bash
/thrunt:next                           # Auto-detect and run next step
```

---

### `/thrunt:session-report`

Generate a session report with work summary, outcomes, and estimated resource usage.

**Prerequisites:** Active project with recent work
**Produces:** `.planning/reports/SESSION_REPORT.md`

```bash
/thrunt:session-report                 # Generate post-session summary
```

**Report includes:**
- Work performed (commits, plans executed, phases progressed)
- Outcomes and deliverables
- Blockers and decisions made
- Estimated token/cost usage
- Next steps recommendation

---

### `/hunt:publish`

Create PR from completed phase work with auto-generated body.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number or milestone version (e.g., `4` or `v1.0`) |
| `--draft` | No | Create as draft PR |

**Prerequisites:** Phase verified (`/hunt:validate-findings` passed), `gh` CLI installed and authenticated
**Produces:** GitHub PR with rich body from planning artifacts, STATE.md updated

```bash
/hunt:publish 4                         # Ship phase 4
/hunt:publish 4 --draft                 # Ship as draft PR
```

**PR body includes:**
- Phase goal from HUNTMAP.md
- Changes summary from SUMMARY.md files
- Hypotheses addressed (HYP-IDs)
- Verification status
- Key decisions

---

### `/thrunt:ui-review`

Retroactive 6-pillar visual audit of implemented frontend.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number (defaults to last executed phase) |

**Prerequisites:** Project has frontend code (works standalone, no THRUNT project needed)
**Produces:** `{phase}-UI-REVIEW.md`, screenshots in `.planning/ui-reviews/`

```bash
/thrunt:ui-review                      # Audit current phase
/thrunt:ui-review 3                    # Audit phase 3
```

---

### `/thrunt:audit-evidence`

Cross-phase audit of all outstanding Evidence Review and findings validation items.

**Prerequisites:** At least one phase has been executed with Evidence Review or findings validation
**Produces:** Categorized audit report with human test plan

```bash
/thrunt:audit-evidence
```

---

### `/thrunt:audit-milestone`

Verify milestone met its definition of done.

**Prerequisites:** All phases executed
**Produces:** Audit report with gap analysis

```bash
/thrunt:audit-milestone
```

---

### `/thrunt:complete-milestone`

Archive milestone, tag release.

**Prerequisites:** Milestone audit complete (recommended)
**Produces:** `MILESTONES.md` entry, git tag

```bash
/thrunt:complete-milestone
```

---

### `/thrunt:milestone-summary`

Generate comprehensive project summary from milestone artifacts for team onboarding and review.

| Argument | Required | Description |
|----------|----------|-------------|
| `version` | No | Milestone version (defaults to current/latest milestone) |

**Prerequisites:** At least one completed or in-progress milestone
**Produces:** `.planning/reports/MILESTONE_SUMMARY-v{version}.md`

**Summary includes:**
- Overview, architecture decisions, phase-by-phase breakdown
- Key decisions and trade-offs
- Hypotheses coverage
- Tech debt and deferred items
- Getting started guide for new team members
- Interactive Q&A offered after generation

```bash
/thrunt:milestone-summary                # Summarize current milestone
/thrunt:milestone-summary v1.0           # Summarize specific milestone
```

---

### `/hunt:new-program`

Start next version cycle.

| Argument | Required | Description |
|----------|----------|-------------|
| `name` | No | Milestone name |
| `--reset-phase-numbers` | No | Restart the new milestone at Phase 1 and archive old phase dirs before huntmapping |

**Prerequisites:** Previous milestone completed
**Produces:** Updated `MISSION.md`, new `HYPOTHESES.md`, new `HUNTMAP.md`

```bash
/hunt:new-program                  # Interactive
/hunt:new-program "v2.0 Mobile"    # Named milestone
/hunt:new-program --reset-phase-numbers "v2.0 Mobile"  # Restart milestone numbering at 1
```

---

## Phase Management Commands

### `/thrunt:add-phase`

Append new phase to huntmap.

```bash
/thrunt:add-phase                      # Interactive — describe the phase
```

### `/thrunt:insert-phase`

Insert urgent work between phases using decimal numbering.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Insert after this phase number |

```bash
/thrunt:insert-phase 3                 # Insert between phase 3 and 4 → creates 3.1
```

### `/thrunt:remove-phase`

Remove future phase and renumber subsequent phases.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number to remove |

```bash
/thrunt:remove-phase 7                 # Remove phase 7, renumber 8→7, 9→8, etc.
```

### `/thrunt:list-phase-assumptions`

Preview Claude's intended approach before planning.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/thrunt:list-phase-assumptions 2       # See assumptions for phase 2
```

### `/thrunt:plan-milestone-gaps`

Create phases to close gaps from milestone audit.

```bash
/thrunt:plan-milestone-gaps             # Creates phases for each audit gap
```

### `/hunt:shape-hypothesis`

Deep ecosystem research only (standalone — usually use `/hunt:plan` instead).

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/hunt:shape-hypothesis 4               # Research phase 4 domain
```

### `/thrunt:validate-phase`

Retroactively audit and fill Nyquist validation gaps.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/thrunt:validate-phase 2               # Audit test coverage for phase 2
```

---

## Navigation Commands

### `/thrunt:progress`

Show status and next steps.

```bash
/thrunt:progress                       # "Where am I? What's next?"
```

### `/thrunt:resume-work`

Restore full context from last session.

```bash
/thrunt:resume-work                    # After context reset or new session
```

### `/thrunt:pause-work`

Save context handoff when stopping mid-phase.

```bash
/thrunt:pause-work                     # Creates continue-here.md
```

### `/thrunt:manager`

Interactive command center for managing multiple phases from one terminal.

**Prerequisites:** `.planning/HUNTMAP.md` exists
**Behavior:**
- Dashboard of all phases with visual status indicators
- Recommends optimal next actions based on dependencies and progress
- Dispatches work: discuss runs inline, plan/execute run as background agents
- Designed for power users parallelizing work across phases from one terminal

```bash
/thrunt:manager                        # Open command center dashboard
```

---

### `/thrunt:help`

Show all commands and usage guide.

```bash
/thrunt:help                           # Quick reference
```

---

## Utility Commands

### `/thrunt:quick`

Execute ad-hoc task with THRUNT guarantees.

| Flag | Description |
|------|-------------|
| `--full` | Enable plan checking (2 iterations) + post-execution findings validation |
| `--discuss` | Lightweight pre-planning discussion |
| `--research` | Spawn focused researcher before planning |

Flags are composable.

```bash
/thrunt:quick                          # Basic quick task
/thrunt:quick --discuss --research     # Discussion + research + planning
/thrunt:quick --full                   # With plan checking and findings validation
/thrunt:quick --discuss --research --full  # All optional stages
```

### `/thrunt:autonomous`

Run all remaining phases autonomously.

| Flag | Description |
|------|-------------|
| `--from N` | Start from a specific phase number |

```bash
/thrunt:autonomous                     # Run all remaining phases
/thrunt:autonomous --from 3            # Start from phase 3
```

### `/thrunt:do`

Route freeform text to the right THRUNT command.

```bash
/thrunt:do                             # Then describe what you want
```

### `/thrunt:note`

Zero-friction idea capture — append, list, or promote notes to todos.

| Argument | Required | Description |
|----------|----------|-------------|
| `text` | No | Note text to capture (default: append mode) |
| `list` | No | List all notes from project and global scopes |
| `promote N` | No | Convert note N into a structured todo |

| Flag | Description |
|------|-------------|
| `--global` | Use global scope for note operations |

```bash
/thrunt:note "Consider caching strategy for API responses"
/thrunt:note list
/thrunt:note promote 3
```

### `/thrunt:debug`

Systematic debugging with persistent state.

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | No | Description of the bug |

```bash
/thrunt:debug "Login button not responding on mobile Safari"
```

### `/thrunt:add-todo`

Capture idea or task for later.

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | No | Todo description |

```bash
/thrunt:add-todo "Consider adding dark mode support"
```

### `/thrunt:check-todos`

List pending todos and select one to work on.

```bash
/thrunt:check-todos
```

### `/thrunt:add-tests`

Generate tests for a completed phase.

| Argument | Required | Description |
|----------|----------|-------------|
| `N` | No | Phase number |

```bash
/thrunt:add-tests 2                    # Generate tests for phase 2
```

### `/thrunt:stats`

Display project statistics.

```bash
/thrunt:stats                          # Hunt metrics dashboard
```

### `/thrunt:profile-user`

Generate a developer behavioral profile from Claude Code session analysis across 8 dimensions (communication style, decision patterns, debugging approach, UX preferences, vendor choices, frustration triggers, learning style, explanation depth). Produces artifacts that personalize Claude's responses.

| Flag | Description |
|------|-------------|
| `--questionnaire` | Use interactive questionnaire instead of session analysis |
| `--refresh` | Re-analyze sessions and regenerate profile |

**Generated artifacts:**
- `USER-PROFILE.md` — Full behavioral profile
- `/thrunt:dev-preferences` command — Load preferences in any session
- `CLAUDE.md` profile section — Auto-discovered by Claude Code

```bash
/thrunt:profile-user                   # Analyze sessions and build profile
/thrunt:profile-user --questionnaire   # Interactive questionnaire fallback
/thrunt:profile-user --refresh         # Re-generate from fresh analysis
```

### `/thrunt:health`

Validate `.planning/` directory integrity.

| Flag | Description |
|------|-------------|
| `--repair` | Auto-fix recoverable issues |

```bash
/thrunt:health                         # Check integrity
/thrunt:health --repair                # Check and fix
```

### `/thrunt:cleanup`

Archive accumulated phase directories from completed milestones.

```bash
/thrunt:cleanup
```

---

## Diagnostics Commands

### `/thrunt:forensics`

Post-mortem investigation of failed or stuck THRUNT workflows.

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | No | Problem description (prompted if omitted) |

**Prerequisites:** `.planning/` directory exists
**Produces:** `.planning/forensics/report-{timestamp}.md`

**Investigation covers:**
- Git history analysis (recent commits, stuck patterns, time gaps)
- Artifact integrity (expected files for completed phases)
- STATE.md anomalies and session history
- Uncommitted work, conflicts, abandoned changes
- At least 4 anomaly types checked (stuck loop, missing artifacts, abandoned work, crash/interruption)
- GitHub issue creation offered if actionable findings exist

```bash
/thrunt:forensics                              # Interactive — prompted for problem
/thrunt:forensics "Phase 3 execution stalled"  # With problem description
```

---

## Workstream Management

### `/thrunt:workstreams`

Manage parallel workstreams for concurrent work on different milestone areas.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `list` | List all workstreams with status (default if no subcommand) |
| `create <name>` | Create a new workstream |
| `status <name>` | Detailed status for one workstream |
| `switch <name>` | Set active workstream |
| `progress` | Progress summary across all workstreams |
| `complete <name>` | Archive a completed workstream |
| `resume <name>` | Resume work in a workstream |

**Prerequisites:** Active THRUNT project
**Produces:** Workstream directories under `.planning/`, state tracking per workstream

```bash
/thrunt:workstreams                    # List all workstreams
/thrunt:workstreams create backend-api # Create new workstream
/thrunt:workstreams switch backend-api # Set active workstream
/thrunt:workstreams status backend-api # Detailed status
/thrunt:workstreams progress           # Cross-workstream progress overview
/thrunt:workstreams complete backend-api  # Archive completed workstream
/thrunt:workstreams resume backend-api    # Resume work in workstream
```

---

## Configuration Commands

### `/thrunt:settings`

Interactive configuration of workflow toggles and model profile.

```bash
/thrunt:settings                       # Interactive config
```

### `/thrunt:set-profile`

Quick profile switch.

| Argument | Required | Description |
|----------|----------|-------------|
| `profile` | **Yes** | `quality`, `balanced`, `budget`, or `inherit` |

```bash
/thrunt:set-profile budget             # Switch to budget profile
/thrunt:set-profile quality            # Switch to quality profile
```

---

## Brownfield Commands

### `/hunt:map-environment`

Analyze existing codebase with parallel mapper agents.

| Argument | Required | Description |
|----------|----------|-------------|
| `area` | No | Scope mapping to a specific area |

```bash
/hunt:map-environment                   # Full codebase analysis
/hunt:map-environment auth              # Focus on auth area
```

---

## Update Commands

### `/thrunt:update`

Update THRUNT with changelog preview.

```bash
/thrunt:update                         # Check for updates and install
```

### `/thrunt:reapply-patches`

Restore local modifications after a THRUNT update.

```bash
/thrunt:reapply-patches                # Merge back local changes
```

---

## Fast & Inline Commands

### `/thrunt:fast`

Execute a trivial task inline — no subagents, no planning overhead. For typo fixes, config changes, small refactors, forgotten commits.

| Argument | Required | Description |
|----------|----------|-------------|
| `task description` | No | What to do (prompted if omitted) |

**Not a replacement for `/thrunt:quick`** — use `/thrunt:quick` for anything needing research, multi-step planning, or findings validation.

```bash
/thrunt:fast "fix typo in README"
/thrunt:fast "add .env to gitignore"
```

---

## Code Quality Commands

### `/thrunt:review`

Cross-AI peer review of phase plans from external AI CLIs.

| Argument | Required | Description |
|----------|----------|-------------|
| `--phase N` | **Yes** | Phase number to review |

| Flag | Description |
|------|-------------|
| `--gemini` | Include Gemini CLI review |
| `--claude` | Include Claude CLI review (separate session) |
| `--codex` | Include Codex CLI review |
| `--all` | Include all available CLIs |

**Produces:** `{phase}-REVIEWS.md` — consumable by `/hunt:plan --reviews`

```bash
/thrunt:review --phase 3 --all
/thrunt:review --phase 2 --gemini
```

---

### `/thrunt:pr-branch`

Create a clean PR branch by filtering out `.planning/` commits.

| Argument | Required | Description |
|----------|----------|-------------|
| `target branch` | No | Base branch (default: `main`) |

**Purpose:** Reviewers see only code changes, not THRUNT planning artifacts.

```bash
/thrunt:pr-branch                     # Filter against main
/thrunt:pr-branch develop             # Filter against develop
```

---

### `/thrunt:audit-evidence`

Cross-phase audit of all outstanding Evidence Review and findings validation items.

**Prerequisites:** At least one phase has been executed with Evidence Review or findings validation
**Produces:** Categorized audit report with human test plan

```bash
/thrunt:audit-evidence
```

---

## Backlog & Thread Commands

### `/thrunt:add-backlog`

Add an idea to the backlog parking lot using 999.x numbering.

| Argument | Required | Description |
|----------|----------|-------------|
| `description` | **Yes** | Backlog item description |

**999.x numbering** keeps backlog items outside the active phase sequence. Phase directories are created immediately so `/hunt:shape-hypothesis` and `/hunt:plan` work on them.

```bash
/thrunt:add-backlog "GraphQL API layer"
/thrunt:add-backlog "Mobile responsive redesign"
```

---

### `/thrunt:review-backlog`

Review and promote backlog items to active milestone.

**Actions per item:** Promote (move to active sequence), Keep (leave in backlog), Remove (delete).

```bash
/thrunt:review-backlog
```

---

### `/thrunt:plant-seed`

Capture a forward-looking idea with trigger conditions — surfaces automatically at the right milestone.

| Argument | Required | Description |
|----------|----------|-------------|
| `idea summary` | No | Seed description (prompted if omitted) |

Seeds solve context rot: instead of a one-liner in Deferred that nobody reads, a seed preserves the full WHY, WHEN to surface, and breadcrumbs to details.

**Produces:** `.planning/seeds/SEED-NNN-slug.md`
**Consumed by:** `/hunt:new-program` (scans seeds and presents matches)

```bash
/thrunt:plant-seed "Add real-time collaboration when WebSocket infra is in place"
```

---

### `/thrunt:thread`

Manage persistent context threads for cross-session work.

| Argument | Required | Description |
|----------|----------|-------------|
| (none) | — | List all threads |
| `name` | — | Resume existing thread by name |
| `description` | — | Create new thread |

Threads are lightweight cross-session knowledge stores for work that spans multiple sessions but doesn't belong to any specific phase. Lighter weight than `/thrunt:pause-work`.

```bash
/thrunt:thread                         # List all threads
/thrunt:thread fix-deploy-key-auth     # Resume thread
/thrunt:thread "Investigate TCP timeout in pasta service"  # Create new
```

---

## Community Commands

### `/thrunt:join-discord`

Open Discord community invite.

```bash
/thrunt:join-discord
```
