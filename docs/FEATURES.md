# THRUNT Feature Reference

> Complete feature and function documentation with requirements. For architecture details, see [Architecture](ARCHITECTURE.md). For command syntax, see [Command Reference](COMMANDS.md).

---

## Table of Contents

- [Core Features](#core-features)
  - [Mission Initialization](#1-mission-initialization)
  - [Phase Discussion](#2-phase-discussion)
  - [UI Design Contract](#3-ui-design-contract)
  - [Phase Planning](#4-phase-planning)
  - [Phase Execution](#5-phase-execution)
  - [Work Validation](#6-work-validation)
  - [UI Review](#7-ui-review)
  - [Milestone Management](#8-milestone-management)
- [Planning Features](#planning-features)
  - [Phase Management](#9-phase-management)
  - [Quick Mode](#10-quick-mode)
  - [Autonomous Mode](#11-autonomous-mode)
  - [Freeform Routing](#12-freeform-routing)
  - [Note Capture](#13-note-capture)
  - [Auto-Advance (Next)](#14-auto-advance-next)
- [Quality Assurance Features](#quality-assurance-features)
  - [Nyquist Validation](#15-nyquist-validation)
  - [Plan Checking](#16-plan-checking)
  - [Post-Execution Findings Validation](#17-post-execution-findings-validation)
  - [Node Repair](#18-node-repair)
  - [Health Validation](#19-health-validation)
  - [Cross-Phase Regression Gate](#20-cross-phase-regression-gate)
  - [Hypotheses Coverage Gate](#21-requirements-coverage-gate)
- [Context Engineering Features](#context-engineering-features)
  - [Context Window Monitoring](#22-context-window-monitoring)
  - [Session Management](#23-session-management)
  - [Session Reporting](#24-session-reporting)
  - [Multi-Agent Orchestration](#25-multi-agent-orchestration)
  - [Model Profiles](#26-model-profiles)
- [Brownfield Features](#brownfield-features)
  - [Codebase Mapping](#27-codebase-mapping)
- [Utility Features](#utility-features)
  - [Debug System](#28-debug-system)
  - [Todo Management](#29-todo-management)
  - [Statistics Dashboard](#30-statistics-dashboard)
  - [Update System](#31-update-system)
  - [Settings Management](#32-settings-management)
  - [Test Generation](#33-test-generation)
- [Infrastructure Features](#infrastructure-features)
  - [Git Integration](#34-git-integration)
  - [CLI Tools](#35-cli-tools)
  - [Multi-Runtime Support](#36-multi-runtime-support)
  - [Hook System](#37-hook-system)
  - [Developer Profiling](#38-developer-profiling)
  - [Execution Hardening](#39-execution-hardening)
  - [Validation Debt Tracking](#40-validation-debt-tracking)
- [v1.27 Features](#v127-features)
  - [Fast Mode](#41-fast-mode)
  - [Cross-AI Peer Review](#42-cross-ai-peer-review)
  - [Backlog Parking Lot](#43-backlog-parking-lot)
  - [Persistent Context Threads](#44-persistent-context-threads)
  - [PR Branch Filtering](#45-pr-branch-filtering)
  - [Security Hardening](#46-security-hardening)
  - [Multi-Repo Workspace Support](#47-multi-repo-workspace-support)
  - [Discussion Audit Trail](#48-discussion-audit-trail)
- [v1.28 Features](#v128-features)
  - [Forensics](#49-forensics)
  - [Milestone Summary](#50-milestone-summary)
  - [Workstream Namespacing](#51-workstream-namespacing)
  - [Manager Dashboard](#52-manager-dashboard)
  - [Assumptions Discussion Mode](#53-assumptions-discussion-mode)
  - [UI Phase Auto-Detection](#54-ui-phase-auto-detection)
  - [Multi-Runtime Installer Selection](#55-multi-runtime-installer-selection)

---

## Core Features

### 1. Mission Initialization

**Command:** `/hunt:new-program [--auto @file.md]`

**Purpose:** Transform a user's lead into a fully structured mission with research, scoped hypotheses, and a phased huntmap.

**Hypotheses:**
- HYP-INIT-01: System MUST conduct adaptive questioning until project scope is fully understood
- HYP-INIT-02: System MUST spawn parallel research agents to investigate the domain ecosystem
- HYP-INIT-03: System MUST extract requirements into v1 (must-have), v2 (future), and out-of-scope categories
- HYP-INIT-04: System MUST generate a phased huntmap with requirement traceability
- HYP-INIT-05: System MUST require user approval of the huntmap before proceeding
- HYP-INIT-06: System MUST prevent re-initialization when `.planning/MISSION.md` already exists
- HYP-INIT-07: System MUST support `--auto @file.md` flag to skip interactive questions and extract from a document

**Produces:**
| Artifact | Description |
|----------|-------------|
| `MISSION.md` | Mission context, constraints, technical decisions, evolution rules |
| `HYPOTHESES.md` | Scoped requirements with unique IDs (HYP-XX) |
| `HUNTMAP.md` | Phase breakdown with status tracking and requirement mapping |
| `STATE.md` | Initial project state with position, decisions, metrics |
| `config.json` | Workflow configuration |
| `research/SUMMARY.md` | Synthesized domain research |
| `research/STACK.md` | Technology stack investigation |
| `research/FEATURES.md` | Feature implementation patterns |
| `research/ARCHITECTURE.md` | Architecture patterns and trade-offs |
| `research/PITFALLS.md` | Common failure modes and mitigations |

**Process:**
1. **Questions** — Adaptive questioning guided by the "dream extraction" philosophy (not requirements gathering)
2. **Research** — 4 parallel researcher agents investigate stack, features, architecture, and pitfalls
3. **Synthesis** — Research synthesizer combines findings into SUMMARY.md
4. **Hypotheses** — Extracted from user responses + research, categorized by scope
5. **Huntmap** — Phase breakdown mapped to requirements, with granularity setting controlling phase count

**Functional Hypotheses:**
- Questions adapt based on detected project type (web app, CLI, mobile, API, etc.)
- Research agents have web search capability for current ecosystem information
- Granularity setting controls phase count: `coarse` (3-5), `standard` (5-8), `fine` (8-12)
- `--auto` mode extracts all information from the provided document without interactive questioning
- Existing codebase context (from `/hunt:map-environment`) is loaded if present

---

### 2. Phase Discussion

**Command:** `/hunt:shape-hypothesis [N] [--auto] [--batch]`

**Purpose:** Capture user's implementation preferences and decisions before research and planning begin. Eliminates the gray areas that cause AI to guess.

**Hypotheses:**
- HYP-DISC-01: System MUST analyze the phase scope and identify decision areas (gray areas)
- HYP-DISC-02: System MUST categorize gray areas by type (visual, API, content, organization, etc.)
- HYP-DISC-03: System MUST ask only questions not already answered in prior CONTEXT.md files
- HYP-DISC-04: System MUST persist decisions in `{phase}-CONTEXT.md` with canonical references
- HYP-DISC-05: System MUST support `--auto` flag to auto-select recommended defaults
- HYP-DISC-06: System MUST support `--batch` flag for grouped question intake
- HYP-DISC-07: System MUST scout relevant source files before identifying gray areas (code-aware discussion)

**Produces:** `{padded_phase}-CONTEXT.md` — User preferences that feed into research and planning

**Gray Area Categories:**
| Category | Example Decisions |
|----------|-------------------|
| Visual features | Layout, density, interactions, empty states |
| APIs/CLIs | Response format, flags, error handling, verbosity |
| Content systems | Structure, tone, depth, flow |
| Organization | Grouping criteria, naming, duplicates, exceptions |

---

### 3. UI Design Contract

**Command:** `/thrunt:ui-phase [N]`

**Purpose:** Lock design decisions before planning so that all components in a phase share consistent visual standards.

**Hypotheses:**
- HYP-UI-01: System MUST detect existing design system state (shadcn components.json, Tailwind config, tokens)
- HYP-UI-02: System MUST ask only unanswered design contract questions
- HYP-UI-03: System MUST validate against 6 dimensions (Copywriting, Visuals, Color, Typography, Spacing, Registry Safety)
- HYP-UI-04: System MUST enter revision loop if validation returns BLOCKED (max 2 iterations)
- HYP-UI-05: System MUST offer shadcn initialization for React/Next.js/Vite projects without `components.json`
- HYP-UI-06: System MUST enforce registry safety gate for third-party shadcn registries

**Produces:** `{padded_phase}-UI-SPEC.md` — Design contract consumed by executors

**6 Validation Dimensions:**
1. **Copywriting** — CTA labels, empty states, error messages
2. **Visuals** — Focal points, visual hierarchy, icon accessibility
3. **Color** — Accent usage discipline, 60/30/10 compliance
4. **Typography** — Font size/weight constraint adherence
5. **Spacing** — Grid alignment, token consistency
6. **Registry Safety** — Third-party component inspection requirements

**shadcn Integration:**
- Detects missing `components.json` in React/Next.js/Vite projects
- Guides user through `ui.shadcn.com/create` preset configuration
- Preset string becomes a planning artifact reproducible across phases
- Safety gate requires `npx shadcn view` and `npx shadcn diff` before third-party components

---

### 4. Phase Planning

**Command:** `/hunt:plan [N] [--auto] [--skip-research] [--skip-verify]`

**Purpose:** Research the implementation domain and produce verified, atomic execution plans.

**Hypotheses:**
- HYP-PLAN-01: System MUST spawn a phase researcher to investigate implementation approaches
- HYP-PLAN-02: System MUST produce plans with 2-3 tasks each, sized for a single context window
- HYP-PLAN-03: System MUST structure plans as XML with `<task>` elements containing `name`, `files`, `action`, `verify`, and `done` fields
- HYP-PLAN-04: System MUST include `read_first` and `acceptance_criteria` sections in every plan
- HYP-PLAN-05: System MUST run plan checker validation loop (up to 3 iterations) unless `--skip-verify` is set
- HYP-PLAN-06: System MUST support `--skip-research` flag to bypass research phase
- HYP-PLAN-07: System MUST prompt user to run `/thrunt:ui-phase` if frontend phase detected and no UI-SPEC.md exists (UI safety gate)
- HYP-PLAN-08: System MUST include Nyquist validation mapping when `workflow.nyquist_validation` is enabled
- HYP-PLAN-09: System MUST verify all phase requirements are covered by at least one plan before planning completes (requirements coverage gate)

**Produces:**
| Artifact | Description |
|----------|-------------|
| `{phase}-RESEARCH.md` | Ecosystem research findings |
| `{phase}-{N}-PLAN.md` | Atomic execution plans (2-3 tasks each) |
| `{phase}-VALIDATION.md` | Test coverage mapping (Nyquist layer) |

**Plan Structure (XML):**
```xml
<task type="auto">
  <name>Create login endpoint</name>
  <files>src/app/api/auth/login/route.ts</files>
  <action>
    Use jose for JWT. Validate credentials against users table.
    Return httpOnly cookie on success.
  </action>
  <verify>curl -X POST localhost:3000/api/auth/login returns 200 + Set-Cookie</verify>
  <done>Valid credentials return cookie, invalid return 401</done>
</task>
```

**Plan Checker Validation (8 Dimensions):**
1. Hypothesis coverage — Plans address all phase requirements
2. Task atomicity — Each task is independently committable
3. Dependency ordering — Tasks sequence correctly
4. File scope — No excessive file overlap between plans
5. Validation commands — Each task has testable done criteria
6. Context fit — Tasks fit within a single context window
7. Gap detection — No missing implementation steps
8. Nyquist compliance — Tasks have automated verify commands (when enabled)

---

### 5. Phase Execution

**Command:** `/hunt:run <N>`

**Purpose:** Execute all plans in a phase using wave-based parallelization with fresh context windows per executor.

**Hypotheses:**
- HYP-EXEC-01: System MUST analyze plan dependencies and group into execution waves
- HYP-EXEC-02: System MUST spawn independent plans in parallel within each wave
- HYP-EXEC-03: System MUST give each executor a fresh context window (200K tokens)
- HYP-EXEC-04: System MUST produce atomic git commits per task
- HYP-EXEC-05: System MUST produce a SUMMARY.md for each completed plan
- HYP-EXEC-06: System MUST run post-execution findings validator to check phase goals were met
- HYP-EXEC-07: System MUST support git branching strategies (`none`, `phase`, `milestone`)
- HYP-EXEC-08: System MUST invoke node repair operator on task validation failure (when enabled)
- HYP-EXEC-09: System MUST run prior phases' test suites before findings validation to catch cross-phase regressions

**Produces:**
| Artifact | Description |
|----------|-------------|
| `{phase}-{N}-SUMMARY.md` | Execution outcomes per plan |
| `{phase}-FINDINGS.md` | Post-execution findings validation report |
| Git commits | Atomic commits per task |

**Wave Execution:**
- Plans with no dependencies → Wave 1 (parallel)
- Plans depending on Wave 1 → Wave 2 (parallel, waits for Wave 1)
- Continues until all plans complete
- File conflicts force sequential execution within same wave

**Executor Capabilities:**
- Reads PLAN.md with full task instructions
- Has access to MISSION.md, STATE.md, CONTEXT.md, RESEARCH.md
- Commits each task atomically with structured commit messages
- Uses `--no-verify` on commits during parallel execution to avoid build lock contention
- Handles checkpoint types: `auto`, `checkpoint:human-verify`, `checkpoint:decision`, `checkpoint:human-action`
- Reports deviations from plan in SUMMARY.md

**Parallel Safety:**
- **Pre-commit hooks**: Skipped by parallel agents (`--no-verify`), run once by orchestrator after each wave
- **STATE.md locking**: File-level lockfile prevents concurrent write corruption across agents

**Connector-backed execution substrate:**
- `/hunt:run` now has a concrete runtime handoff through `thrunt-tools runtime execute`
- Built-in adapters cover Splunk, Elastic, Sentinel, Okta, M365, CrowdStrike, AWS, and GCP
- Query logs and receipts are emitted from the shared runtime regardless of connector family
- Connector capability and limitation reporting is available through `thrunt-tools runtime list-connectors`
- `thrunt-tools runtime doctor` scores per-connector readiness from config, secrets, preflight checks, and smoke coverage
- `thrunt-tools runtime smoke` runs live read-only smoke tests against configured connectors
- Connectors can declare a profile-level `smoke_test` query when THRUNT should not ship a generic built-in one
- Readiness scores distinguish static configuration readiness from live verification against real backends

---

### 6. Work Validation

**Command:** `/hunt:validate-findings [N]`

**Purpose:** User acceptance testing — walk the user through testing each deliverable and auto-diagnose failures.

**Hypotheses:**
- HYP-VERIFY-01: System MUST extract testable deliverables from the phase
- HYP-VERIFY-02: System MUST present deliverables one at a time for user confirmation
- HYP-VERIFY-03: System MUST spawn debug agents to diagnose failures automatically
- HYP-VERIFY-04: System MUST create fix plans for identified issues
- HYP-VERIFY-05: System MUST inject cold-start smoke test for phases modifying server/database/seed/startup files
- HYP-VERIFY-06: System MUST produce EVIDENCE_REVIEW.md with pass/fail results

**Produces:** `{phase}-EVIDENCE_REVIEW.md` — User acceptance test results, plus fix plans if issues found

---

### 6.5. Ship

**Command:** `/hunt:publish [N] [--draft]`

**Purpose:** Bridge local completion → merged PR. After findings validation passes, push branch, create PR with auto-generated body from planning artifacts, optionally trigger review, and track in STATE.md.

**Hypotheses:**
- HYP-SHIP-01: System MUST verify phase has passed findings validation before publishing
- HYP-SHIP-02: System MUST push branch and create PR via `gh` CLI
- HYP-SHIP-03: System MUST auto-generate PR body from SUMMARY.md, FINDINGS.md, and HYPOTHESES.md
- HYP-SHIP-04: System MUST update STATE.md with publishing status and PR number
- HYP-SHIP-05: System MUST support `--draft` flag for draft PRs

**Prerequisites:** Phase verified, `gh` CLI installed and authenticated, work on feature branch

**Produces:** GitHub PR with rich body, STATE.md updated

---

### 7. UI Review

**Command:** `/thrunt:ui-review [N]`

**Purpose:** Retroactive 6-pillar visual audit of implemented frontend code. Works standalone on any project.

**Hypotheses:**
- HYP-UIREVIEW-01: System MUST score each of the 6 pillars on a 1-4 scale
- HYP-UIREVIEW-02: System MUST capture screenshots via Playwright CLI to `.planning/ui-reviews/`
- HYP-UIREVIEW-03: System MUST create `.gitignore` for screenshot directory
- HYP-UIREVIEW-04: System MUST identify top 3 priority fixes
- HYP-UIREVIEW-05: System MUST work standalone (without UI-SPEC.md) using abstract quality standards

**6 Audit Pillars (scored 1-4):**
1. **Copywriting** — CTA labels, empty states, error states
2. **Visuals** — Focal points, visual hierarchy, icon accessibility
3. **Color** — Accent usage discipline, 60/30/10 compliance
4. **Typography** — Font size/weight constraint adherence
5. **Spacing** — Grid alignment, token consistency
6. **Experience Design** — Loading/error/empty state coverage

**Produces:** `{padded_phase}-UI-REVIEW.md` — Scores and prioritized fixes

---

### 8. Milestone Management

**Commands:** `/thrunt:audit-milestone`, `/thrunt:complete-milestone`, `/hunt:new-program [name]`

**Purpose:** Verify milestone completion, archive, tag release, and start the next development cycle.

**Hypotheses:**
- HYP-MILE-01: Audit MUST verify all milestone requirements are met
- HYP-MILE-02: Audit MUST detect stubs, placeholder implementations, and untested code
- HYP-MILE-03: Audit MUST check Nyquist validation compliance across phases
- HYP-MILE-04: Complete MUST archive milestone data to MILESTONES.md
- HYP-MILE-05: Complete MUST offer git tag creation for the release
- HYP-MILE-06: Complete MUST offer squash merge or merge with history for branching strategies
- HYP-MILE-07: Complete MUST clean up UI review screenshots
- HYP-MILE-08: New milestone MUST follow same flow as new-program (questions → research → requirements → huntmap)
- HYP-MILE-09: New milestone MUST NOT reset existing workflow configuration

**Gap Closure:** `/thrunt:plan-milestone-gaps` creates phases to close gaps identified by audit.

---

## Planning Features

### 9. Phase Management

**Commands:** `/thrunt:add-phase`, `/thrunt:insert-phase [N]`, `/thrunt:remove-phase [N]`

**Purpose:** Dynamic huntmap modification during development.

**Hypotheses:**
- HYP-PHASE-01: Add MUST append a new phase to the end of the current huntmap
- HYP-PHASE-02: Insert MUST use decimal numbering (e.g., 3.1) between existing phases
- HYP-PHASE-03: Remove MUST renumber all subsequent phases
- HYP-PHASE-04: Remove MUST prevent removing phases that have been executed
- HYP-PHASE-05: All operations MUST update HUNTMAP.md and create/remove phase directories

---

### 10. Quick Mode

**Command:** `/thrunt:quick [--full] [--discuss] [--research]`

**Purpose:** Ad-hoc task execution with THRUNT guarantees but a faster path.

**Hypotheses:**
- HYP-QUICK-01: System MUST accept freeform task description
- HYP-QUICK-02: System MUST use same planner + executor agents as full workflow
- HYP-QUICK-03: System MUST skip research, plan checker, and findings validator by default
- HYP-QUICK-04: `--full` flag MUST enable plan checking (max 2 iterations) and post-execution findings validation
- HYP-QUICK-05: `--discuss` flag MUST run lightweight pre-planning discussion
- HYP-QUICK-06: `--research` flag MUST spawn focused research agent before planning
- HYP-QUICK-07: Flags MUST be composable (`--discuss --research --full`)
- HYP-QUICK-08: System MUST track quick tasks in `.planning/quick/YYMMDD-xxx-slug/`
- HYP-QUICK-09: System MUST produce atomic commits for quick task execution

---

### 11. Autonomous Mode

**Command:** `/thrunt:autonomous [--from N]`

**Purpose:** Run all remaining phases autonomously — discuss → plan → execute per phase.

**Hypotheses:**
- HYP-AUTO-01: System MUST iterate through all incomplete phases in huntmap order
- HYP-AUTO-02: System MUST run discuss → plan → execute for each phase
- HYP-AUTO-03: System MUST pause for explicit user decisions (gray area acceptance, blockers, validation)
- HYP-AUTO-04: System MUST re-read HUNTMAP.md after each phase to catch dynamically inserted phases
- HYP-AUTO-05: `--from N` flag MUST start from a specific phase number

---

### 12. Freeform Routing

**Command:** `/thrunt:do`

**Purpose:** Analyze freeform text and route to the appropriate THRUNT command.

**Hypotheses:**
- HYP-DO-01: System MUST parse user intent from natural language input
- HYP-DO-02: System MUST map intent to the best matching THRUNT command
- HYP-DO-03: System MUST confirm the routing with the user before executing
- HYP-DO-04: System MUST handle project-exists vs no-project contexts differently

---

### 13. Note Capture

**Command:** `/thrunt:note`

**Purpose:** Zero-friction idea capture without interrupting workflow. Append timestamped notes, list all notes, or promote notes to structured todos.

**Hypotheses:**
- HYP-NOTE-01: System MUST save timestamped note files with a single Write call
- HYP-NOTE-02: System MUST support `list` subcommand to show all notes from project and global scopes
- HYP-NOTE-03: System MUST support `promote N` subcommand to convert a note into a structured todo
- HYP-NOTE-04: System MUST support `--global` flag for global scope operations
- HYP-NOTE-05: System MUST NOT use Task, AskUserQuestion, or Bash — runs inline only

---

### 14. Auto-Advance (Next)

**Command:** `/thrunt:next`

**Purpose:** Automatically detect current project state and advance to the next logical workflow step, eliminating the need to remember which phase/step you're on.

**Hypotheses:**
- HYP-NEXT-01: System MUST read STATE.md, HUNTMAP.md, and phase directories to determine current position
- HYP-NEXT-02: System MUST detect whether discuss, plan, execute, or verify is needed
- HYP-NEXT-03: System MUST invoke the correct command automatically
- HYP-NEXT-04: System MUST suggest `/hunt:new-program` if no project exists
- HYP-NEXT-05: System MUST suggest `/thrunt:complete-milestone` when all phases are complete

**State Detection Logic:**
| State | Action |
|-------|--------|
| No `.planning/` directory | Suggest `/hunt:new-program` |
| Phase has no CONTEXT.md | Run `/hunt:shape-hypothesis` |
| Phase has no PLAN.md files | Run `/hunt:plan` |
| Phase has plans but no SUMMARY.md | Run `/hunt:run` |
| Phase executed but no FINDINGS.md | Run `/hunt:validate-findings` |
| All phases complete | Suggest `/thrunt:complete-milestone` |

---

## Quality Assurance Features

### 15. Nyquist Validation

**Purpose:** Map automated test coverage to phase requirements before any code is written. Named after the Nyquist sampling theorem — ensures a feedback signal exists for every requirement.

**Hypotheses:**
- HYP-NYQ-01: System MUST detect existing test infrastructure during hunt-plan research
- HYP-NYQ-02: System MUST map each requirement to a specific test command
- HYP-NYQ-03: System MUST identify Wave 0 tasks (test scaffolding needed before implementation)
- HYP-NYQ-04: Plan checker MUST enforce Nyquist compliance as an 8th validation dimension
- HYP-NYQ-05: System MUST support retroactive validation via `/thrunt:validate-phase`
- HYP-NYQ-06: System MUST be disableable via `workflow.nyquist_validation: false`

**Produces:** `{phase}-VALIDATION.md` — Test coverage contract

**Retroactive Validation (`/thrunt:validate-phase [N]`):**
- Scans implementation and maps requirements to tests
- Identifies gaps where requirements lack automated validation
- Spawns auditor to generate tests (max 3 attempts)
- Never modifies implementation code — only test files and VALIDATION.md
- Flags implementation bugs as escalations for user to address

---

### 16. Plan Checking

**Purpose:** Goal-backward validation that plans will achieve phase objectives before execution.

**Hypotheses:**
- HYP-PLANCK-01: System MUST verify plans against 8 quality dimensions
- HYP-PLANCK-02: System MUST loop up to 3 iterations until plans pass
- HYP-PLANCK-03: System MUST produce specific, actionable feedback on failures
- HYP-PLANCK-04: System MUST be disableable via `workflow.plan_check: false`

---

### 17. Post-Execution Findings Validation

**Purpose:** Automated check that the codebase delivers what the phase promised.

**Hypotheses:**
- HYP-POSTVER-01: System MUST check against phase goals, not just task completion
- HYP-POSTVER-02: System MUST produce FINDINGS.md with pass/fail analysis
- HYP-POSTVER-03: System MUST log issues for `/hunt:validate-findings` to address
- HYP-POSTVER-04: System MUST be disableable via `workflow.validator: false`

---

### 18. Node Repair

**Purpose:** Autonomous recovery when task validation fails during execution.

**Hypotheses:**
- HYP-REPAIR-01: System MUST analyze failure and choose one strategy: RETRY, DECOMPOSE, or PRUNE
- HYP-REPAIR-02: RETRY MUST attempt with a concrete adjustment
- HYP-REPAIR-03: DECOMPOSE MUST break task into smaller verifiable sub-steps
- HYP-REPAIR-04: PRUNE MUST remove unachievable tasks and escalate to user
- HYP-REPAIR-05: System MUST respect repair budget (default: 2 attempts per task)
- HYP-REPAIR-06: System MUST be configurable via `workflow.node_repair_budget` and `workflow.node_repair`

---

### 19. Health Validation

**Command:** `/thrunt:health [--repair]`

**Purpose:** Validate `.planning/` directory integrity and auto-repair issues.

**Hypotheses:**
- HYP-HEALTH-01: System MUST check for missing required files
- HYP-HEALTH-02: System MUST validate configuration consistency
- HYP-HEALTH-03: System MUST detect orphaned plans without summaries
- HYP-HEALTH-04: System MUST check phase numbering and huntmap sync
- HYP-HEALTH-05: `--repair` flag MUST auto-fix recoverable issues

---

### 20. Cross-Phase Regression Gate

**Purpose:** Prevent regressions from compounding across phases by running prior phases' test suites after execution.

**Hypotheses:**
- HYP-REGR-01: System MUST run test suites from all completed prior phases after phase execution
- HYP-REGR-02: System MUST report any test failures as cross-phase regressions
- HYP-REGR-03: Regressions MUST be surfaced before post-execution findings validation
- HYP-REGR-04: System MUST identify which prior phase's tests were broken

**When:** Runs automatically during `/hunt:run` before the validator step.

---

### 21. Hypotheses Coverage Gate

**Purpose:** Ensure all phase requirements are covered by at least one plan before planning completes.

**Hypotheses:**
- HYP-COVGATE-01: System MUST extract all requirement IDs assigned to the phase from HUNTMAP.md
- HYP-COVGATE-02: System MUST verify each requirement appears in at least one PLAN.md
- HYP-COVGATE-03: Uncovered requirements MUST block planning completion
- HYP-COVGATE-04: System MUST report which specific requirements lack plan coverage

**When:** Runs automatically at the end of `/hunt:plan` after the plan checker loop.

---

## Context Engineering Features

### 22. Context Window Monitoring

**Purpose:** Prevent context rot by alerting both user and agent when context is running low.

**Hypotheses:**
- HYP-CTX-01: Statusline MUST display context usage percentage to user
- HYP-CTX-02: Context monitor MUST inject agent-facing warnings at ≤35% remaining (WARNING)
- HYP-CTX-03: Context monitor MUST inject agent-facing warnings at ≤25% remaining (CRITICAL)
- HYP-CTX-04: Warnings MUST debounce (5 tool uses between repeated warnings)
- HYP-CTX-05: Severity escalation (WARNING→CRITICAL) MUST bypass debounce
- HYP-CTX-06: Context monitor MUST differentiate THRUNT-active vs non-THRUNT-active projects
- HYP-CTX-07: Warnings MUST be advisory, never imperative commands that override user preferences
- HYP-CTX-08: All hooks MUST fail silently and never block tool execution

**Architecture:** Two-part bridge system:
1. Statusline writes metrics to `/tmp/claude-ctx-{session}.json`
2. Context monitor reads metrics and injects `additionalContext` warnings

---

### 23. Session Management

**Commands:** `/thrunt:pause-work`, `/thrunt:resume-work`, `/thrunt:progress`

**Purpose:** Maintain project continuity across context resets and sessions.

**Hypotheses:**
- HYP-SESSION-01: Pause MUST save current position and next steps to `continue-here.md` and structured `HANDOFF.json`
- HYP-SESSION-02: Resume MUST restore full project context from HANDOFF.json (preferred) or state files (fallback)
- HYP-SESSION-03: Progress MUST show current position, next action, and overall completion
- HYP-SESSION-04: Progress MUST read all state files (STATE.md, HUNTMAP.md, phase directories)
- HYP-SESSION-05: All session operations MUST work after `/clear` (context reset)
- HYP-SESSION-06: HANDOFF.json MUST include blockers, human actions pending, and in-progress task state
- HYP-SESSION-07: Resume MUST surface human actions and blockers immediately on session start

---

### 24. Session Reporting

**Command:** `/thrunt:session-report`

**Purpose:** Generate a structured post-session summary document capturing work performed, outcomes achieved, and estimated resource usage.

**Hypotheses:**
- HYP-REPORT-01: System MUST gather data from STATE.md, git log, and plan/summary files
- HYP-REPORT-02: System MUST include commits made, plans executed, and phases progressed
- HYP-REPORT-03: System MUST estimate token usage and cost based on session activity
- HYP-REPORT-04: System MUST include active blockers and decisions made
- HYP-REPORT-05: System MUST recommend next steps

**Produces:** `.planning/reports/SESSION_REPORT.md`

**Report Sections:**
- Session overview (duration, milestone, phase)
- Work performed (commits, plans, phases)
- Outcomes and deliverables
- Blockers and decisions
- Resource estimates (tokens, cost)
- Next steps recommendation

---

### 25. Multi-Agent Orchestration

**Purpose:** Coordinate specialized agents with fresh context windows for each task.

**Hypotheses:**
- HYP-ORCH-01: Each agent MUST receive a fresh context window
- HYP-ORCH-02: Orchestrators MUST be thin — spawn agents, collect results, route next
- HYP-ORCH-03: Context payload MUST include all relevant project artifacts
- HYP-ORCH-04: Parallel agents MUST be truly independent (no shared mutable state)
- HYP-ORCH-05: Agent results MUST be written to disk before orchestrator processes them
- HYP-ORCH-06: Failed agents MUST be detected (spot-check actual output vs reported failure)

---

### 26. Model Profiles

**Command:** `/thrunt:set-profile <quality|balanced|budget|inherit>`

**Purpose:** Control which AI model each agent uses, balancing quality vs cost.

**Hypotheses:**
- HYP-MODEL-01: System MUST support 4 profiles: `quality`, `balanced`, `budget`, `inherit`
- HYP-MODEL-02: Each profile MUST define model tier per agent (see profile table)
- HYP-MODEL-03: Per-agent overrides MUST take precedence over profile
- HYP-MODEL-04: `inherit` profile MUST defer to runtime's current model selection
- HYP-MODEL-04a: `inherit` profile MUST be used when running non-Anthropic providers (OpenRouter, local models) to avoid unexpected API costs
- HYP-MODEL-05: Profile switch MUST be programmatic (script, not LLM-driven)
- HYP-MODEL-06: Model resolution MUST happen once per orchestration, not per spawn

**Profile Assignments:**

| Agent | `quality` | `balanced` | `budget` | `inherit` |
|-------|-----------|------------|----------|-----------|
| thrunt-hunt-planner | Opus | Opus | Sonnet | Inherit |
| thrunt-huntmap-builder | Opus | Sonnet | Sonnet | Inherit |
| thrunt-telemetry-executor | Opus | Sonnet | Sonnet | Inherit |
| thrunt-query-writer | Opus | Sonnet | Haiku | Inherit |
| thrunt-signal-triager | Opus | Sonnet | Haiku | Inherit |
| thrunt-intel-synthesizer | Sonnet | Sonnet | Haiku | Inherit |
| thrunt-incident-debugger | Opus | Sonnet | Sonnet | Inherit |
| thrunt-environment-mapper | Sonnet | Haiku | Haiku | Inherit |
| thrunt-findings-validator | Sonnet | Sonnet | Haiku | Inherit |
| thrunt-hunt-checker | Sonnet | Sonnet | Haiku | Inherit |
| thrunt-evidence-correlator | Sonnet | Sonnet | Haiku | Inherit |
| thrunt-false-positive-auditor | Sonnet | Sonnet | Haiku | Inherit |

---

## Brownfield Features

### 27. Codebase Mapping

**Command:** `/hunt:map-environment [area]`

**Purpose:** Analyze an existing codebase before starting a new project, so THRUNT understands what exists.

**Hypotheses:**
- HYP-MAP-01: System MUST spawn parallel mapper agents for each analysis area
- HYP-MAP-02: System MUST produce structured documents in `.planning/codebase/`
- HYP-MAP-03: System MUST detect: tech stack, architecture patterns, coding conventions, concerns
- HYP-MAP-04: Subsequent `/hunt:new-program` MUST load codebase mapping and focus questions on what's being added
- HYP-MAP-05: Optional `[area]` argument MUST scope mapping to a specific area

**Produces:**
| Document | Content |
|----------|---------|
| `STACK.md` | Languages, frameworks, databases, infrastructure |
| `ARCHITECTURE.md` | Patterns, layers, data flow, boundaries |
| `CONVENTIONS.md` | Naming, file organization, code style, testing patterns |
| `CONCERNS.md` | Technical debt, security issues, performance bottlenecks |
| `STRUCTURE.md` | Directory layout and file organization |
| `TESTING.md` | Test infrastructure, coverage, patterns |
| `INTEGRATIONS.md` | External services, APIs, third-party dependencies |

---

## Utility Features

### 28. Debug System

**Command:** `/thrunt:debug [description]`

**Purpose:** Systematic debugging with persistent state across context resets.

**Hypotheses:**
- HYP-DEBUG-01: System MUST create debug session file in `.planning/debug/`
- HYP-DEBUG-02: System MUST track hypotheses, evidence, and eliminated theories
- HYP-DEBUG-03: System MUST persist state so debugging survives context resets
- HYP-DEBUG-04: System MUST require human validation before marking resolved
- HYP-DEBUG-05: Resolved sessions MUST append to `.planning/debug/knowledge-base.md`
- HYP-DEBUG-06: Knowledge base MUST be consulted on new debug sessions to prevent re-investigation

**Debug Session States:** `gathering` → `investigating` → `fixing` → `verifying` → `awaiting_human_verify` → `resolved`

---

### 29. Todo Management

**Commands:** `/thrunt:add-todo [desc]`, `/thrunt:check-todos`

**Purpose:** Capture ideas and tasks during sessions for later work.

**Hypotheses:**
- HYP-TODO-01: System MUST capture todo from current conversation context
- HYP-TODO-02: Todos MUST be stored in `.planning/todos/pending/`
- HYP-TODO-03: Completed todos MUST move to `.planning/todos/done/`
- HYP-TODO-04: Check-todos MUST list all pending items with selection to work on one

---

### 30. Statistics Dashboard

**Command:** `/thrunt:stats`

**Purpose:** Display project metrics — phases, plans, requirements, git history, and timeline.

**Hypotheses:**
- HYP-STATS-01: System MUST show phase/plan completion counts
- HYP-STATS-02: System MUST show requirement coverage
- HYP-STATS-03: System MUST show git commit metrics
- HYP-STATS-04: System MUST support multiple output formats (json, table, bar)

---

### 31. Update System

**Command:** `/thrunt:update`

**Purpose:** Update THRUNT to the latest version with changelog preview.

**Hypotheses:**
- HYP-UPDATE-01: System MUST check for new versions via npm
- HYP-UPDATE-02: System MUST display changelog for new version before updating
- HYP-UPDATE-03: System MUST be runtime-aware and target the correct directory
- HYP-UPDATE-04: System MUST back up locally modified files to `thrunt-local-patches/`
- HYP-UPDATE-05: `/thrunt:reapply-patches` MUST restore local modifications after update

---

### 32. Settings Management

**Command:** `/thrunt:settings`

**Purpose:** Interactive configuration of workflow toggles and model profile.

**Hypotheses:**
- HYP-SETTINGS-01: System MUST present current settings with toggle options
- HYP-SETTINGS-02: System MUST update `.planning/config.json`
- HYP-SETTINGS-03: System MUST support saving as global defaults (`~/.thrunt/defaults.json`)

**Configurable Settings:**
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `mode` | enum | `interactive` | `interactive` or `yolo` (auto-approve) |
| `granularity` | enum | `standard` | `coarse`, `standard`, or `fine` |
| `model_profile` | enum | `balanced` | `quality`, `balanced`, `budget`, or `inherit` |
| `workflow.research` | boolean | `true` | Domain research before planning |
| `workflow.plan_check` | boolean | `true` | Plan validation loop |
| `workflow.validator` | boolean | `true` | Post-execution findings validation |
| `workflow.auto_advance` | boolean | `false` | Auto-chain discuss→plan→execute |
| `workflow.nyquist_validation` | boolean | `true` | Nyquist test coverage mapping |
| `workflow.ui_phase` | boolean | `true` | UI design contract generation |
| `workflow.ui_safety_gate` | boolean | `true` | Prompt for ui-phase on frontend phases |
| `workflow.node_repair` | boolean | `true` | Autonomous task repair |
| `workflow.node_repair_budget` | number | `2` | Max repair attempts per task |
| `planning.commit_docs` | boolean | `true` | Commit `.planning/` files to git |
| `planning.search_gitignored` | boolean | `false` | Include gitignored files in searches |
| `parallelization.enabled` | boolean | `true` | Run independent plans simultaneously |
| `git.branching_strategy` | enum | `none` | `none`, `phase`, or `milestone` |

---

### 33. Test Generation

**Command:** `/thrunt:add-tests [N]`

**Purpose:** Generate tests for a completed phase based on Evidence Review criteria and implementation.

**Hypotheses:**
- HYP-TEST-01: System MUST analyze completed phase implementation
- HYP-TEST-02: System MUST generate tests based on Evidence Review criteria and acceptance criteria
- HYP-TEST-03: System MUST use existing test infrastructure patterns

---

## Infrastructure Features

### 34. Git Integration

**Purpose:** Atomic commits, branching strategies, and clean history management.

**Hypotheses:**
- HYP-GIT-01: Each task MUST get its own atomic commit
- HYP-GIT-02: Commit messages MUST follow structured format: `type(scope): description`
- HYP-GIT-03: System MUST support 3 branching strategies: `none`, `phase`, `milestone`
- HYP-GIT-04: Phase strategy MUST create one branch per phase
- HYP-GIT-05: Milestone strategy MUST create one branch per milestone
- HYP-GIT-06: Complete-milestone MUST offer squash merge (recommended) or merge with history
- HYP-GIT-07: System MUST respect `commit_docs` setting for `.planning/` files
- HYP-GIT-08: System MUST auto-detect `.planning/` in `.gitignore` and skip commits

**Commit Format:**
```
type(phase-plan): description

# Examples:
docs(08-02): complete user registration plan
feat(08-02): add email confirmation flow
fix(03-01): correct auth token expiry
```

---

### 35. CLI Tools

**Purpose:** Programmatic utilities for workflows and agents, replacing repetitive inline bash patterns.

**Hypotheses:**
- HYP-CLI-01: System MUST provide atomic commands for state, config, phase, huntmap operations
- HYP-CLI-02: System MUST provide compound `init` commands that load all context for each workflow
- HYP-CLI-03: System MUST support `--raw` flag for machine-readable output
- HYP-CLI-04: System MUST support `--cwd` flag for sandboxed subagent operation
- HYP-CLI-05: All operations MUST use forward-slash paths on Windows
- HYP-CLI-06: CLI tools MUST expose pack inspection and validation so ATT&CK-oriented hunt packs and composed domain packs can be reviewed before pack-driven workflow UX exists

**Command Categories:** State (11 subcommands), Phase (5), Huntmap (3), Verify (8), Template (2), Frontmatter (4), Scaffold (4), Init (12), Validate (2), Progress, Stats, Todo

**Pack Registry Support:**
- `node thrunt-tools.cjs pack list` lists built-in and local packs with source provenance
- `node thrunt-tools.cjs pack show <pack-id>` prints the resolved pack definition
- `node thrunt-tools.cjs pack bootstrap <pack-id> --param key=value` materializes case bootstrap content from a pack
- `node thrunt-tools.cjs pack validate <pack-id> --param key=value` dry-validates pack parameters before execution
- `node thrunt-tools.cjs pack render-targets <pack-id> --param key=value` turns pack execution targets into concrete `QuerySpec` objects
- `node thrunt-tools.cjs runtime execute --pack <pack-id> --target "<target-name>" --param key=value` executes pack-backed queries through the shared runtime
- `node thrunt-tools.cjs pack lint [<pack-id>]` audits pack authoring policy, including example parameters and template usage
- `node thrunt-tools.cjs pack test [<pack-id>]` smoke-tests pack bootstrap and target rendering using `examples.parameters`
- `node thrunt-tools.cjs pack init <pack-id> --kind <kind>` scaffolds a local pack under `.planning/packs/`

THRUNT now ships ATT&CK-oriented hunt packs for `T1059`, `T1078`, `T1098`, `T1110`, and `T1566`. Each starter technique pack declares hypothesis templates, telemetry requirements, blind spots, and execution targets on top of the shared runtime contract.

THRUNT also now ships composed domain packs for identity abuse, email intrusion, insider risk, cloud abuse, and ransomware precursors, plus a first family-level pack for OAuth phishing and session hijack. Pack composition lets those higher-order packs reuse shared foundations and lower-level technique playbooks without copy-paste drift.

---

### 36. Multi-Runtime Support

**Purpose:** Run THRUNT across 6 different AI coding agent runtimes.

**Hypotheses:**
- HYP-RUNTIME-01: System MUST support Claude Code, OpenCode, Gemini CLI, Codex, Copilot, Antigravity
- HYP-RUNTIME-02: Installer MUST transform content per runtime (tool names, paths, frontmatter)
- HYP-RUNTIME-03: Installer MUST support interactive and non-interactive (`--claude --global`) modes
- HYP-RUNTIME-04: Installer MUST support both global and local installation
- HYP-RUNTIME-05: Uninstall MUST cleanly remove all THRUNT files without affecting other configurations
- HYP-RUNTIME-06: Installer MUST handle platform differences (Windows, macOS, Linux, WSL, Docker)

**Runtime Transformations:**

| Aspect | Claude Code | OpenCode | Gemini | Codex | Copilot | Antigravity |
|--------|------------|----------|--------|-------|---------|-------------|
| Commands | Slash commands | Slash commands | Slash commands | Skills (TOML) | Slash commands | Skills |
| Agent format | Claude native | `mode: subagent` | Claude native | Skills | Tool mapping | Skills |
| Hook events | `PostToolUse` | N/A | `AfterTool` | N/A | N/A | N/A |
| Config | `settings.json` | `opencode.json(c)` | `settings.json` | TOML | Instructions | Config |

---

### 37. Hook System

**Purpose:** Runtime event hooks for context monitoring, status display, and update checking.

**Hypotheses:**
- HYP-HOOK-01: Statusline MUST display model, current task, directory, and context usage
- HYP-HOOK-02: Context monitor MUST inject agent-facing warnings at threshold levels
- HYP-HOOK-03: Update checker MUST run in background on session start
- HYP-HOOK-04: All hooks MUST respect `CLAUDE_CONFIG_DIR` env var
- HYP-HOOK-05: All hooks MUST include 3-second stdin timeout guard
- HYP-HOOK-06: All hooks MUST fail silently on any error
- HYP-HOOK-07: Context usage MUST normalize for autocompact buffer (16.5% reserved)

**Statusline Display:**
```
[⬆ /thrunt:update │] model │ [current task │] directory [█████░░░░░ 50%]
```

Color coding: <50% green, <65% yellow, <80% orange, ≥80% red with skull emoji

### 38. Developer Profiling

**Command:** `/thrunt:profile-user [--questionnaire] [--refresh]`

**Purpose:** Analyze Claude Code session history to build behavioral profiles across 8 dimensions, generating artifacts that personalize Claude's responses to the developer's style.

**Dimensions:**
1. Communication style (terse vs verbose, formal vs casual)
2. Decision patterns (rapid vs deliberate, risk tolerance)
3. Debugging approach (systematic vs intuitive, log preference)
4. UX preferences (design sensibility, accessibility awareness)
5. Vendor/technology choices (framework preferences, ecosystem familiarity)
6. Frustration triggers (what causes friction in workflows)
7. Learning style (documentation vs examples, depth preference)
8. Explanation depth (high-level vs implementation detail)

**Generated Artifacts:**
- `USER-PROFILE.md` — Full behavioral profile with evidence citations
- `/thrunt:dev-preferences` command — Load preferences in any session
- `CLAUDE.md` profile section — Auto-discovered by Claude Code

**Flags:**
- `--questionnaire` — Interactive questionnaire fallback when session history is unavailable
- `--refresh` — Re-analyze sessions and regenerate profile

**Pipeline Modules:**
- `profile-pipeline.cjs` — Session scanning, message extraction, sampling
- `profile-output.cjs` — Profile rendering, questionnaire, artifact generation
- `thrunt-analyst-profiler` agent — Behavioral analysis from session data

**Hypotheses:**
- HYP-PROF-01: Session analysis MUST cover at least 8 behavioral dimensions
- HYP-PROF-02: Profile MUST cite evidence from actual session messages
- HYP-PROF-03: Questionnaire MUST be available as fallback when no session history exists
- HYP-PROF-04: Generated artifacts MUST be discoverable by Claude Code (CLAUDE.md integration)

### 39. Execution Hardening

**Purpose:** Three additive quality improvements to the execution pipeline that catch cross-plan failures before they cascade.

**Components:**

**1. Pre-Wave Dependency Check** (hunt-run)
Before spawning wave N+1, verify key-links from prior wave artifacts exist and are wired correctly. Catches cross-plan dependency gaps before they cascade into downstream failures.

**2. Cross-Plan Data Contracts — Dimension 9** (plan-checker)
New analysis dimension that checks plans sharing data pipelines have compatible transformations. Flags when one plan strips data that another plan needs in its original form.

**3. Export-Level Spot Check** (verify-phase)
After Level 3 wiring validation passes, spot-check individual exports for actual usage. Catches dead stores that exist in wired files but are never called.

**Hypotheses:**
- HYP-HARD-01: Pre-wave check MUST verify key-links from all prior wave artifacts before spawning next wave
- HYP-HARD-02: Cross-plan contract check MUST detect incompatible data transformations between plans
- HYP-HARD-03: Export spot-check MUST identify dead stores in wired files

---

### 40. Validation Debt Tracking

**Command:** `/thrunt:audit-evidence`

**Purpose:** Prevent silent loss of Evidence Review/findings validation items when missions advance past phases with outstanding tests. Surfaces validation debt across all prior phases so items are never forgotten.

**Components:**

**1. Cross-Phase Health Check** (progress.md Step 1.6)
Every `/thrunt:progress` call scans ALL phases in the current milestone for outstanding items (pending, skipped, blocked, human_needed). Displays a non-blocking warning section with actionable links.

**2. `status: partial`** (hunt-validate-findings.md, EVIDENCE_REVIEW.md)
New Evidence Review status that distinguishes between "session ended" and "all tests resolved". Prevents `status: complete` when tests are still pending, blocked, or skipped without reason.

**3. `result: blocked` with `blocked_by` tag** (hunt-validate-findings.md, EVIDENCE_REVIEW.md)
New test result type for tests blocked by external dependencies (server, physical device, release build, third-party services). Categorized separately from skipped tests.

**4. HUMAN-EVIDENCE_REVIEW.md Persistence** (hunt-run.md)
When findings validation returns `human_needed`, items are persisted as a trackable HUMAN-EVIDENCE_REVIEW.md file with `status: partial`. Feeds into the cross-phase health check and audit systems.

**5. Phase Completion Warnings** (phase.cjs, transition.md)
`phase complete` CLI returns validation debt warnings in its JSON output. Transition workflow surfaces outstanding items before confirmation.

**Hypotheses:**
- HYP-DEBT-01: System MUST surface outstanding Evidence Review/findings validation items from ALL prior phases in `/thrunt:progress`
- HYP-DEBT-02: System MUST distinguish incomplete testing (partial) from completed testing (complete)
- HYP-DEBT-03: System MUST categorize blocked tests with `blocked_by` tags
- HYP-DEBT-04: System MUST persist human_needed validation items as trackable Evidence Review files
- HYP-DEBT-05: System MUST warn (non-blocking) during phase completion and transition when validation debt exists
- HYP-DEBT-06: `/thrunt:audit-evidence` MUST scan all phases, categorize items by testability, and produce a human test plan

---

## v1.27 Features

### 41. Fast Mode

**Command:** `/thrunt:fast [task description]`

**Purpose:** Execute trivial tasks inline without spawning subagents or generating PLAN.md files. For tasks too small to justify planning overhead: typo fixes, config changes, small refactors, forgotten commits, simple additions.

**Hypotheses:**
- HYP-FAST-01: System MUST execute the task directly in the current context without subagents
- HYP-FAST-02: System MUST produce an atomic git commit for the change
- HYP-FAST-03: System MUST track the task in `.planning/quick/` for state consistency
- HYP-FAST-04: System MUST NOT be used for tasks requiring research, multi-step planning, or findings validation

**When to use vs `/thrunt:quick`:**
- `/thrunt:fast` — One-sentence tasks executable in under 2 minutes (typo, config change, small addition)
- `/thrunt:quick` — Anything needing research, multi-step planning, or findings validation

---

### 42. Cross-AI Peer Review

**Command:** `/thrunt:review --phase N [--gemini] [--claude] [--codex] [--all]`

**Purpose:** Invoke external AI CLIs (Gemini, Claude, Codex) to independently review phase plans. Produces structured REVIEWS.md with per-reviewer feedback.

**Hypotheses:**
- HYP-REVIEW-01: System MUST detect available AI CLIs on the system
- HYP-REVIEW-02: System MUST build a structured review prompt from phase plans
- HYP-REVIEW-03: System MUST invoke each selected CLI independently
- HYP-REVIEW-04: System MUST collect responses and produce `REVIEWS.md`
- HYP-REVIEW-05: Reviews MUST be consumable by `/hunt:plan --reviews`

**Produces:** `{phase}-REVIEWS.md` — Per-reviewer structured feedback

---

### 43. Backlog Parking Lot

**Commands:** `/thrunt:add-backlog <description>`, `/thrunt:review-backlog`, `/thrunt:plant-seed <idea>`

**Purpose:** Capture ideas that aren't ready for active planning. Backlog items use 999.x numbering to stay outside the active phase sequence. Seeds are forward-looking ideas with trigger conditions that surface automatically at the right milestone.

**Hypotheses:**
- HYP-BACKLOG-01: Backlog items MUST use 999.x numbering to stay outside active phase sequence
- HYP-BACKLOG-02: Phase directories MUST be created immediately so `/hunt:shape-hypothesis` and `/hunt:plan` work on them
- HYP-BACKLOG-03: `/thrunt:review-backlog` MUST support promote, keep, and remove actions per item
- HYP-BACKLOG-04: Promoted items MUST be renumbered into the active milestone sequence
- HYP-SEED-01: Seeds MUST capture the full WHY and WHEN to surface conditions
- HYP-SEED-02: `/hunt:new-program` MUST scan seeds and present matches

**Produces:**
| Artifact | Description |
|----------|-------------|
| `.planning/phases/999.x-slug/` | Backlog item directory |
| `.planning/seeds/SEED-NNN-slug.md` | Seed with trigger conditions |

---

### 44. Persistent Context Threads

**Command:** `/thrunt:thread [name | description]`

**Purpose:** Lightweight cross-session knowledge stores for work that spans multiple sessions but doesn't belong to any specific phase. Lighter weight than `/thrunt:pause-work` — no phase state, no plan context.

**Hypotheses:**
- HYP-THREAD-01: System MUST support create, list, and resume modes
- HYP-THREAD-02: Threads MUST be stored in `.planning/threads/` as markdown files
- HYP-THREAD-03: Thread files MUST include Goal, Context, References, and Next Steps sections
- HYP-THREAD-04: Resuming a thread MUST load its full context into the current session
- HYP-THREAD-05: Threads MUST be promotable to phases or backlog items

**Produces:** `.planning/threads/{slug}.md` — Persistent context thread

---

### 45. PR Branch Filtering

**Command:** `/thrunt:pr-branch [target branch]`

**Purpose:** Create a clean branch suitable for pull requests by filtering out `.planning/` commits. Reviewers see only code changes, not THRUNT planning artifacts.

**Hypotheses:**
- HYP-PRBRANCH-01: System MUST identify commits that only modify `.planning/` files
- HYP-PRBRANCH-02: System MUST create a new branch with planning commits filtered out
- HYP-PRBRANCH-03: Code changes MUST be preserved exactly as committed

---

### 46. Security Hardening

**Purpose:** Defense-in-depth security for THRUNT's planning artifacts. Because THRUNT generates markdown files that become LLM system prompts, user-controlled text flowing into these files is a potential indirect prompt injection vector.

**Components:**

**1. Centralized Security Module** (`security.cjs`)
- Path traversal prevention — validates file paths resolve within the project directory
- Prompt injection detection — scans for known injection patterns in user-supplied text
- Safe JSON parsing — catches malformed input before state corruption
- Field name validation — prevents injection through config field names
- Shell argument validation — sanitizes user text before shell interpolation

**2. Prompt Injection Guard Hook** (`thrunt-prompt-guard.js`)
PreToolUse hook that scans Write/Edit calls targeting `.planning/` for injection patterns. Advisory-only — logs detection for awareness without blocking legitimate operations.

**3. Workflow Guard Hook** (`thrunt-workflow-guard.js`)
PreToolUse hook that detects when Claude attempts file edits outside a THRUNT workflow context. Advises using `/thrunt:quick` or `/thrunt:fast` instead of direct edits. Configurable via `hooks.workflow_guard` (default: false).

**4. CI-Ready Injection Scanner** (`prompt-injection-scan.test.cjs`)
Test suite that scans all agent, workflow, and command files for embedded injection vectors.

**Hypotheses:**
- HYP-SEC-01: All user-supplied file paths MUST be validated against the project directory
- HYP-SEC-02: Prompt injection patterns MUST be detected before text enters planning artifacts
- HYP-SEC-03: Security hooks MUST be advisory-only (never block legitimate operations)
- HYP-SEC-04: JSON parsing of user input MUST catch malformed data gracefully
- HYP-SEC-05: macOS `/var` → `/private/var` symlink resolution MUST be handled in path validation

---

### 47. Multi-Repo Workspace Support

**Purpose:** Auto-detection and project root resolution for monorepos and multi-repo setups. Supports workspaces where `.planning/` may need to resolve across repository boundaries.

**Hypotheses:**
- HYP-MULTIREPO-01: System MUST auto-detect multi-repo workspace configuration
- HYP-MULTIREPO-02: System MUST resolve project root across repository boundaries
- HYP-MULTIREPO-03: Executor MUST record per-repo commit hashes in multi-repo mode

---

### 48. Discussion Audit Trail

**Purpose:** Auto-generate `DISCUSSION-LOG.md` during `/hunt:shape-hypothesis` for full audit trail of decisions made during discussion.

**Hypotheses:**
- HYP-DISCLOG-01: System MUST auto-generate DISCUSSION-LOG.md during shape-hypothesis
- HYP-DISCLOG-02: Log MUST capture questions asked, options presented, and decisions made
- HYP-DISCLOG-03: Decision IDs MUST enable traceability from shape-hypothesis to hunt-plan

---

## v1.28 Features

### 49. Forensics

**Command:** `/thrunt:forensics [description]`

**Purpose:** Post-mortem investigation of failed or stuck THRUNT workflows.

**Hypotheses:**
- HYP-FORENSICS-01: System MUST analyze git history for anomalies (stuck loops, long gaps, repeated commits)
- HYP-FORENSICS-02: System MUST check artifact integrity (completed phases have expected files)
- HYP-FORENSICS-03: System MUST generate a markdown report saved to `.planning/forensics/`
- HYP-FORENSICS-04: System MUST offer to create a GitHub issue with findings
- HYP-FORENSICS-05: System MUST NOT modify project files (read-only investigation)

**Produces:**
| Artifact | Description |
|----------|-------------|
| `.planning/forensics/report-{timestamp}.md` | Post-mortem investigation report |

**Process:**
1. **Scan** — Analyze git history for anomalies: stuck loops, long gaps between commits, repeated identical commits
2. **Integrity Check** — Verify completed phases have expected artifact files
3. **Report** — Generate markdown report with findings, saved to `.planning/forensics/`
4. **Issue** — Offer to create a GitHub issue with findings for team visibility

---

### 50. Milestone Summary

**Command:** `/thrunt:milestone-summary [version]`

**Purpose:** Generate comprehensive project summary from milestone artifacts for team onboarding.

**Hypotheses:**
- HYP-SUMMARY-01: System MUST aggregate phase plans, summaries, and findings validation results
- HYP-SUMMARY-02: System MUST work for both current and archived milestones
- HYP-SUMMARY-03: System MUST produce a single navigable document

**Produces:**
| Artifact | Description |
|----------|-------------|
| `MILESTONE-SUMMARY.md` | Comprehensive navigable summary of milestone artifacts |

**Process:**
1. **Collect** — Aggregate phase plans, summaries, and findings validation results from the target milestone
2. **Synthesize** — Combine artifacts into a single navigable document with cross-references
3. **Output** — Write `MILESTONE-SUMMARY.md` suitable for team onboarding and stakeholder review

---

### 51. Workstream Namespacing

**Command:** `/thrunt:workstreams`

**Purpose:** Parallel workstreams for concurrent work on different milestone areas.

**Hypotheses:**
- HYP-WS-01: System MUST isolate workstream state in separate `.planning/workstreams/{name}/` directories
- HYP-WS-02: System MUST validate workstream names (alphanumeric + hyphens only, no path traversal)
- HYP-WS-03: System MUST support list, create, switch, status, progress, complete, resume subcommands

**Produces:**
| Artifact | Description |
|----------|-------------|
| `.planning/workstreams/{name}/` | Isolated workstream directory structure |

**Process:**
1. **Create** — Initialize a named workstream with isolated `.planning/workstreams/{name}/` directory
2. **Switch** — Change active workstream context for subsequent THRUNT commands
3. **Manage** — List, check status, track progress, complete, or resume workstreams

---

### 52. Manager Dashboard

**Command:** `/thrunt:manager`

**Purpose:** Interactive command center for managing multiple phases from one terminal.

**Hypotheses:**
- HYP-MGR-01: System MUST show overview of all phases with status
- HYP-MGR-02: System MUST filter to current milestone scope
- HYP-MGR-03: System MUST show phase dependencies and conflicts

**Produces:** Interactive terminal output

**Process:**
1. **Scan** — Load all phases in the current milestone with their statuses
2. **Display** — Render overview showing phase dependencies, conflicts, and progress
3. **Interact** — Accept commands to navigate, inspect, or act on individual phases

---

### 53. Assumptions Discussion Mode

**Command:** `/hunt:shape-hypothesis` with `workflow.discuss_mode: 'assumptions'`

**Purpose:** Replace interview-style questioning with codebase-first assumption analysis.

**Hypotheses:**
- HYP-ASSUME-01: System MUST analyze codebase to generate structured assumptions before asking questions
- HYP-ASSUME-02: System MUST classify assumptions by confidence level (Confident/Likely/Unclear)
- HYP-ASSUME-03: System MUST produce identical CONTEXT.md format as default discuss mode
- HYP-ASSUME-04: System MUST support confidence-based skip gate (all HIGH = no questions)

**Produces:**
| Artifact | Description |
|----------|-------------|
| `{phase}-CONTEXT.md` | Same format as default discuss mode |

**Process:**
1. **Analyze** — Scan codebase to generate structured assumptions about implementation approach
2. **Classify** — Categorize assumptions by confidence level: Confident, Likely, Unclear
3. **Gate** — If all assumptions are HIGH confidence, skip questioning entirely
4. **Confirm** — Present unclear assumptions as targeted questions to the user
5. **Output** — Produce `{phase}-CONTEXT.md` in identical format to default discuss mode

---

### 54. UI Phase Auto-Detection

**Part of:** `/hunt:new-program` and `/thrunt:progress`

**Purpose:** Automatically detect UI-heavy projects and surface `/thrunt:ui-phase` recommendation.

**Hypotheses:**
- HYP-UI-DETECT-01: System MUST detect UI signals in project description (keywords, framework references)
- HYP-UI-DETECT-02: System MUST annotate HUNTMAP.md phases with `ui_hint` when applicable
- HYP-UI-DETECT-03: System MUST suggest `/thrunt:ui-phase` in next steps for UI-heavy phases
- HYP-UI-DETECT-04: System MUST NOT make `/thrunt:ui-phase` mandatory

**Process:**
1. **Detect** — Scan project description and tech stack for UI signals (keywords, framework references)
2. **Annotate** — Add `ui_hint` markers to applicable phases in HUNTMAP.md
3. **Surface** — Include `/thrunt:ui-phase` recommendation in next steps for UI-heavy phases

---

### 55. Multi-Runtime Installer Selection

**Part of:** `npx thrunt-god`

**Purpose:** Select multiple runtimes in a single interactive install session.

**Hypotheses:**
- HYP-MULTI-RT-01: Interactive prompt MUST support multi-select (e.g., Claude Code + Gemini)
- HYP-MULTI-RT-02: CLI flags MUST continue to work for non-interactive installs

**Process:**
1. **Detect** — Identify available AI CLI runtimes on the system
2. **Prompt** — Present multi-select interface for runtime selection
3. **Install** — Configure THRUNT for all selected runtimes in a single session
