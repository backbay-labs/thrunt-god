# THRUNT Architecture

> System architecture for contributors and advanced users. For user-facing documentation, see [Feature Reference](FEATURES.md) or [User Guide](USER-GUIDE.md).

---

## Table of Contents

- [System Overview](#system-overview)
- [Design Principles](#design-principles)
- [Component Architecture](#component-architecture)
- [Agent Model](#agent-model)
- [Data Flow](#data-flow)
- [File System Layout](#file-system-layout)
- [Installer Architecture](#installer-architecture)
- [Hook System](#hook-system)
- [CLI Tools Layer](#cli-tools-layer)
- [Runtime Abstraction](#runtime-abstraction)

---

## System Overview

THRUNT is a **meta-prompting framework** that sits between the user and AI coding agents (Claude Code, Gemini CLI, OpenCode, Codex, Copilot, Antigravity). It provides:

1. **Context engineering** — Structured artifacts that give the AI everything it needs per task
2. **Multi-agent orchestration** — Thin orchestrators that spawn specialized agents with fresh context windows
3. **Spec-driven development** — Hypotheses → research → plans → execution → validation pipeline
4. **State management** — Persistent mission memory across sessions and context resets

```
┌──────────────────────────────────────────────────────┐
│                      USER                            │
│            /thrunt:command [args]                        │
└─────────────────────┬────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────┐
│              COMMAND LAYER                            │
│   commands/thrunt/*.md — Prompt-based command files      │
│   (Claude Code custom commands / Codex skills)        │
└─────────────────────┬────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────┐
│              WORKFLOW LAYER                           │
│   thrunt-god/workflows/*.md — Orchestration logic  │
│   (Reads references, spawns agents, manages state)    │
└──────┬──────────────┬─────────────────┬──────────────┘
       │              │                 │
┌──────▼──────┐ ┌─────▼─────┐ ┌────────▼───────┐
│  AGENT      │ │  AGENT    │ │  AGENT         │
│  (fresh     │ │  (fresh   │ │  (fresh        │
│   context)  │ │   context)│ │   context)     │
└──────┬──────┘ └─────┬─────┘ └────────┬───────┘
       │              │                 │
┌──────▼──────────────▼─────────────────▼──────────────┐
│              CLI TOOLS LAYER                          │
│   thrunt-god/bin/thrunt-tools.cjs                     │
│   (State, config, phase, huntmap, validate, templates) │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│              FILE SYSTEM (.planning/)                 │
│   MISSION.md | HYPOTHESES.md | HUNTMAP.md          │
│   STATE.md | config.json | phases/ | research/       │
└──────────────────────────────────────────────────────┘
```

---

## Design Principles

### 1. Fresh Context Per Agent

Every agent spawned by an orchestrator gets a clean context window (up to 200K tokens). This eliminates context rot — the quality degradation that happens as an AI fills its context window with accumulated conversation.

### 2. Thin Orchestrators

Workflow files (`thrunt-god/workflows/*.md`) never do heavy lifting. They:
- Load context via `thrunt-tools.cjs init <workflow>`
- Spawn specialized agents with focused prompts
- Collect results and route to the next step
- Update state between steps

### 3. File-Based State

All state lives in `.planning/` as human-readable Markdown and JSON. No database, no server, no external dependencies. This means:
- State survives context resets (`/clear`)
- State is inspectable by both humans and agents
- State can be committed to git for team visibility

### 4. Absent = Enabled

Workflow feature flags follow the **absent = enabled** pattern. If a key is missing from `config.json`, it defaults to `true`. Users explicitly disable features; they don't need to enable defaults.

### 5. Defense in Depth

Multiple layers prevent common failure modes:
- Plans are validated before execution (plan-checker agent)
- Execution produces atomic commits per task
- Post-execution findings validation checks against phase goals
- Evidence Review provides human validation as final gate

---

## Component Architecture

### Commands (`commands/thrunt/*.md`)

User-facing entry points. Each file contains YAML frontmatter (name, description, allowed-tools) and a prompt body that bootstraps the workflow. Commands are installed as:
- **Claude Code:** Custom slash commands (`/thrunt:command-name`)
- **OpenCode:** Slash commands (`/thrunt-command-name`)
- **Codex:** Skills (`$thrunt-command-name`)
- **Copilot:** Slash commands (`/thrunt:command-name`)
- **Antigravity:** Skills

**Total commands:** 44

### Workflows (`thrunt-god/workflows/*.md`)

Orchestration logic that commands reference. Contains the step-by-step process including:
- Context loading via `thrunt-tools.cjs init`
- Agent spawn instructions with model resolution
- Gate/checkpoint definitions
- State update patterns
- Error handling and recovery

**Total workflows:** 46

### Agents (`agents/*.md`)

Specialized agent definitions with frontmatter specifying:
- `name` — Agent identifier
- `description` — Role and purpose
- `tools` — Allowed tool access (Read, Write, Edit, Bash, Grep, Glob, WebSearch, etc.)
- `color` — Terminal output color for visual distinction

**Total agents:** 16

### References (`thrunt-god/references/*.md`)

Shared knowledge documents that workflows and agents `@-reference`:
- `checkpoints.md` — Checkpoint type definitions and interaction patterns
- `model-profiles.md` — Per-agent model tier assignments
- `validation-patterns.md` — How to validate different artifact types
- `planning-config.md` — Full config schema and behavior
- `git-integration.md` — Git commit, branching, and history patterns
- `questioning.md` — Dream extraction philosophy for mission initialization
- `tdd.md` — Test-driven development integration patterns
- `ui-brand.md` — Visual output formatting patterns

### Templates (`thrunt-god/templates/`)

Markdown templates for all planning artifacts. Used by `thrunt-tools.cjs template fill` and `scaffold` commands to create pre-structured files:
- `mission.md`, `hypotheses.md`, `huntmap.md`, `state.md` — Core hunt workspace files
- `phase-prompt.md` — Phase execution prompt template
- `summary.md` (+ `summary-minimal.md`, `summary-standard.md`, `summary-complex.md`) — Granularity-aware summary templates
- `DEBUG.md` — Debug session tracking template
- `UI-SPEC.md`, `EVIDENCE_REVIEW.md`, `VALIDATION.md` — Specialized validation templates
- `discussion-log.md` — Discussion audit trail template
- `codebase/` — Brownfield mapping templates (stack, architecture, conventions, concerns, structure, testing, integrations)
- `research-program/` — Research output templates (SUMMARY, STACK, FEATURES, ARCHITECTURE, PITFALLS)

### Hooks (`hooks/`)

Runtime hooks that integrate with the host AI agent:

| Hook | Event | Purpose |
|------|-------|---------|
| `thrunt-statusline.js` | `statusLine` | Displays model, task, directory, and context usage bar |
| `thrunt-context-monitor.js` | `PostToolUse` / `AfterTool` | Injects agent-facing context warnings at 35%/25% remaining |
| `thrunt-check-update.js` | `SessionStart` | Background check for new THRUNT versions |
| `thrunt-prompt-guard.js` | `PreToolUse` | Scans `.planning/` writes for prompt injection patterns (advisory) |
| `thrunt-workflow-guard.js` | `PreToolUse` | Detects file edits outside THRUNT workflow context (advisory, opt-in via `hooks.workflow_guard`) |

### CLI Tools (`thrunt-god/bin/`)

Node.js CLI utility (`thrunt-tools.cjs`) with 17 domain modules:

| Module | Responsibility |
|--------|---------------|
| `core.cjs` | Error handling, output formatting, shared utilities |
| `state.cjs` | STATE.md parsing, updating, progression, metrics |
| `phase.cjs` | Phase directory operations, decimal numbering, plan indexing |
| `huntmap.cjs` | HUNTMAP.md parsing, phase extraction, plan progress |
| `config.cjs` | config.json read/write, section initialization |
| `validate.cjs` | Plan structure, phase completeness, reference, commit validation |
| `template.cjs` | Template selection and filling with variable substitution |
| `frontmatter.cjs` | YAML frontmatter CRUD operations |
| `init.cjs` | Compound context loading for each workflow type |
| `milestone.cjs` | Milestone archival, requirements marking |
| `commands.cjs` | Misc commands (slug, timestamp, todos, scaffolding, stats) |
| `model-profiles.cjs` | Model profile resolution table |
| `security.cjs` | Path traversal prevention, prompt injection detection, safe JSON parsing, shell argument validation |
| `uat.cjs` | Evidence Review file parsing, validation debt tracking, audit-evidence support |

---

## Agent Model

### Orchestrator → Agent Pattern

```
Orchestrator (workflow .md)
    │
    ├── Load context: thrunt-tools.cjs init <workflow> <phase>
    │   Returns JSON with: mission/workspace info, config, state, phase details
    │
    ├── Resolve model: thrunt-tools.cjs resolve-model <agent-name>
    │   Returns: opus | sonnet | haiku | inherit
    │
    ├── Spawn Agent (Task/SubAgent call)
    │   ├── Agent prompt (agents/*.md)
    │   ├── Context payload (init JSON)
    │   ├── Model assignment
    │   └── Tool permissions
    │
    ├── Collect result
    │
    └── Update state: thrunt-tools.cjs state update/patch/advance-plan
```

### Agent Spawn Categories

| Category | Agents | Parallelism |
|----------|--------|-------------|
| **Researchers** | thrunt-signal-triager, thrunt-query-writer, thrunt-ui-researcher, thrunt-intel-advisor | 4 parallel (stack, features, architecture, pitfalls); advisor spawns during shape-hypothesis |
| **Synthesizers** | thrunt-intel-synthesizer | Sequential (after researchers complete) |
| **Planners** | thrunt-hunt-planner, thrunt-huntmap-builder | Sequential |
| **Checkers** | thrunt-hunt-checker, thrunt-evidence-correlator, thrunt-ui-checker, thrunt-false-positive-auditor | Sequential (validation loop, max 3 iterations) |
| **Executors** | thrunt-telemetry-executor | Parallel within waves, sequential across waves |
| **Validators** | thrunt-findings-validator | Sequential (after all executors complete) |
| **Mappers** | thrunt-environment-mapper | 4 parallel (tech, arch, quality, concerns) |
| **Debuggers** | thrunt-incident-debugger | Sequential (interactive) |
| **Auditors** | thrunt-ui-auditor | Sequential |

### Wave Execution Model

During `hunt-run`, plans are grouped into dependency waves:

```
Wave Analysis:
  Plan 01 (no deps)      ─┐
  Plan 02 (no deps)      ─┤── Wave 1 (parallel)
  Plan 03 (depends: 01)  ─┤── Wave 2 (waits for Wave 1)
  Plan 04 (depends: 02)  ─┘
  Plan 05 (depends: 03,04) ── Wave 3 (waits for Wave 2)
```

Each executor gets:
- Fresh 200K context window
- The specific PLAN.md to execute
- Project context (MISSION.md, STATE.md)
- Phase context (CONTEXT.md, RESEARCH.md if available)

#### Parallel Commit Safety

When multiple executors run within the same wave, two mechanisms prevent conflicts:

1. **`--no-verify` commits** — Parallel agents skip pre-commit hooks (which can cause build lock contention, e.g., cargo lock fights in Rust projects). The orchestrator runs `git hook run pre-commit` once after each wave completes.

2. **STATE.md file locking** — All `writeStateMd()` calls use lockfile-based mutual exclusion (`STATE.md.lock` with `O_EXCL` atomic creation). This prevents the read-modify-write race condition where two agents read STATE.md, modify different fields, and the last writer overwrites the other's changes. Includes stale lock detection (10s timeout) and spin-wait with jitter.

---

## Data Flow

### New Project Flow

```
User input (idea description)
    │
    ▼
Questions (questioning.md philosophy)
    │
    ▼
4x Project Researchers (parallel)
    ├── Stack → STACK.md
    ├── Features → FEATURES.md
    ├── Architecture → ARCHITECTURE.md
    └── Pitfalls → PITFALLS.md
    │
    ▼
Research Synthesizer → SUMMARY.md
    │
    ▼
Hypotheses extraction → HYPOTHESES.md
    │
    ▼
Huntmap Builder → HUNTMAP.md
    │
    ▼
User approval → STATE.md initialized
```

### Phase Execution Flow

```
shape-hypothesis → CONTEXT.md (user preferences)
    │
    ▼
ui-phase → UI-SPEC.md (design contract, optional)
    │
    ▼
hunt-plan
    ├── Phase Researcher → RESEARCH.md
    ├── Planner → PLAN.md files
    └── Plan Checker → Verify loop (max 3x)
    │
    ▼
hunt-run
    ├── Wave analysis (dependency grouping)
    ├── Executor per plan → code + atomic commits
    ├── SUMMARY.md per plan
    └── Verifier → FINDINGS.md
    │
    ▼
validate-findings → EVIDENCE_REVIEW.md (user acceptance testing)
    │
    ▼
ui-review → UI-REVIEW.md (visual audit, optional)
```

### Context Propagation

Each workflow stage produces artifacts that feed into subsequent stages:

```
MISSION.md ────────────────────────────────────────────► All agents
HYPOTHESES.md ───────────────────────────────────────► Planner, Verifier, Auditor
HUNTMAP.md ────────────────────────────────────────────► Orchestrators
STATE.md ──────────────────────────────────────────────► All agents (decisions, blockers)
CONTEXT.md (per phase) ────────────────────────────────► Researcher, Planner, Executor
RESEARCH.md (per phase) ───────────────────────────────► Planner, Plan Checker
PLAN.md (per plan) ────────────────────────────────────► Executor, Plan Checker
SUMMARY.md (per plan) ─────────────────────────────────► Verifier, State tracking
UI-SPEC.md (per phase) ────────────────────────────────► Executor, UI Auditor
```

---

## File System Layout

### Installation Files

```
~/.claude/                          # Claude Code (global install)
├── commands/thrunt/*.md               # 37 slash commands
├── thrunt-god/
│   ├── bin/thrunt-tools.cjs           # CLI utility
│   ├── bin/lib/*.cjs               # 15 domain modules
│   ├── workflows/*.md              # 42 workflow definitions
│   ├── references/*.md             # 13 shared reference docs
│   └── templates/                  # Planning artifact templates
├── agents/*.md                     # 15 agent definitions
├── hooks/
│   ├── thrunt-statusline.js           # Statusline hook
│   ├── thrunt-context-monitor.js      # Context warning hook
│   └── thrunt-check-update.js         # Update check hook
├── settings.json                   # Hook registrations
└── VERSION                         # Installed version number
```

Equivalent paths for other runtimes:
- **OpenCode:** `~/.config/opencode/` or `~/.opencode/`
- **Gemini CLI:** `~/.gemini/`
- **Codex:** `~/.codex/` (uses skills instead of commands)
- **Copilot:** `~/.github/`
- **Antigravity:** `~/.gemini/antigravity/` (global) or `./.agent/` (local)

### Planning Files (`.planning/`)

```
.planning/
├── MISSION.md              # Mission context, constraints, decisions, evolution rules
├── HYPOTHESES.md         # Scoped requirements (v1/v2/out-of-scope)
├── HUNTMAP.md              # Phase breakdown with status tracking
├── STATE.md                # Living memory: position, decisions, blockers, metrics
├── config.json             # Workflow configuration
├── MILESTONES.md           # Completed milestone archive
├── research/               # Domain research from /hunt:new-program
│   ├── SUMMARY.md
│   ├── STACK.md
│   ├── FEATURES.md
│   ├── ARCHITECTURE.md
│   └── PITFALLS.md
├── codebase/               # Brownfield mapping (from /hunt:map-environment)
│   ├── STACK.md
│   ├── ARCHITECTURE.md
│   ├── CONVENTIONS.md
│   ├── CONCERNS.md
│   ├── STRUCTURE.md
│   ├── TESTING.md
│   └── INTEGRATIONS.md
├── phases/
│   └── XX-phase-name/
│       ├── XX-CONTEXT.md       # User preferences (from shape-hypothesis)
│       ├── XX-RESEARCH.md      # Ecosystem research (from hunt-plan)
│       ├── XX-YY-PLAN.md       # Execution plans
│       ├── XX-YY-SUMMARY.md    # Execution outcomes
│       ├── XX-FINDINGS.md  # Post-execution findings validation
│       ├── XX-VALIDATION.md    # Nyquist test coverage mapping
│       ├── XX-UI-SPEC.md       # UI design contract (from ui-phase)
│       ├── XX-UI-REVIEW.md     # Visual audit scores (from ui-review)
│       └── XX-EVIDENCE_REVIEW.md           # User acceptance test results
├── quick/                  # Quick task tracking
│   └── YYMMDD-xxx-slug/
│       ├── PLAN.md
│       └── SUMMARY.md
├── todos/
│   ├── pending/            # Captured ideas
│   └── done/               # Completed todos
├── threads/               # Persistent context threads (from /thrunt:thread)
├── seeds/                 # Forward-looking ideas (from /thrunt:plant-seed)
├── debug/                  # Active debug sessions
│   ├── *.md                # Active sessions
│   ├── resolved/           # Archived sessions
│   └── knowledge-base.md   # Persistent debug learnings
├── ui-reviews/             # Screenshots from /thrunt:ui-review (gitignored)
└── continue-here.md        # Context handoff (from pause-work)
```

---

## Installer Architecture

The installer (`bin/install.js`, ~3,000 lines) handles:

1. **Runtime detection** — Interactive prompt or CLI flags (`--claude`, `--opencode`, `--gemini`, `--codex`, `--copilot`, `--antigravity`, `--all`)
2. **Location selection** — Global (`--global`) or local (`--local`)
3. **File deployment** — Copies commands, workflows, references, templates, agents, hooks
4. **Runtime adaptation** — Transforms file content per runtime:
   - Claude Code: Uses as-is
   - OpenCode: Converts agent frontmatter to `name:`, `model: inherit`, `mode: subagent`
   - Codex: Generates TOML config + skills from commands
   - Copilot: Maps tool names (Read→read, Bash→execute, etc.)
   - Gemini: Adjusts hook event names (`AfterTool` instead of `PostToolUse`)
   - Antigravity: Skills-first with Google model equivalents
5. **Path normalization** — Replaces `~/.claude/` paths with runtime-specific paths
6. **Settings integration** — Registers hooks in runtime's `settings.json`
7. **Patch backup** — Since v1.17, backs up locally modified files to `thrunt-local-patches/` for `/thrunt:reapply-patches`
8. **Manifest tracking** — Writes `thrunt-file-manifest.json` for clean uninstall
9. **Uninstall mode** — `--uninstall` removes all THRUNT files, hooks, and settings

### Platform Handling

- **Windows:** `windowsHide` on child processes, EPERM/EACCES protection on protected directories, path separator normalization
- **WSL:** Detects Windows Node.js running on WSL and warns about path mismatches
- **Docker/CI:** Supports `CLAUDE_CONFIG_DIR` env var for custom config directory locations

---

## Hook System

### Architecture

```
Runtime Engine (Claude Code / Gemini CLI)
    │
    ├── statusLine event ──► thrunt-statusline.js
    │   Reads: stdin (session JSON)
    │   Writes: stdout (formatted status), /tmp/claude-ctx-{session}.json (bridge)
    │
    ├── PostToolUse/AfterTool event ──► thrunt-context-monitor.js
    │   Reads: stdin (tool event JSON), /tmp/claude-ctx-{session}.json (bridge)
    │   Writes: stdout (hookSpecificOutput with additionalContext warning)
    │
    └── SessionStart event ──► thrunt-check-update.js
        Reads: VERSION file
        Writes: ~/.claude/cache/thrunt-update-check.json (spawns background process)
```

### Context Monitor Thresholds

| Remaining Context | Level | Agent Behavior |
|-------------------|-------|----------------|
| > 35% | Normal | No warning injected |
| ≤ 35% | WARNING | "Avoid starting new complex work" |
| ≤ 25% | CRITICAL | "Context nearly exhausted, inform user" |

Debounce: 5 tool uses between repeated warnings. Severity escalation (WARNING→CRITICAL) bypasses debounce.

### Safety Properties

- All hooks wrap in try/catch, exit silently on error
- stdin timeout guard (3s) prevents hanging on pipe issues
- Stale metrics (>60s old) are ignored
- Missing bridge files handled gracefully (subagents, fresh sessions)
- Context monitor is advisory — never issues imperative commands that override user preferences

### Security Hooks (v1.27)

**Prompt Guard** (`thrunt-prompt-guard.js`):
- Triggers on Write/Edit to `.planning/` files
- Scans content for prompt injection patterns (role override, instruction bypass, system tag injection)
- Advisory-only — logs detection, does not block
- Patterns are inlined (subset of `security.cjs`) for hook independence

**Workflow Guard** (`thrunt-workflow-guard.js`):
- Triggers on Write/Edit to non-`.planning/` files
- Detects edits outside THRUNT workflow context (no active `/thrunt:` command or Task subagent)
- Advises using `/thrunt:quick` or `/thrunt:fast` for state-tracked changes
- Opt-in via `hooks.workflow_guard: true` (default: false)

---

## Runtime Abstraction

THRUNT supports 6 AI coding runtimes through a unified command/workflow architecture:

| Runtime | Command Format | Agent System | Config Location |
|---------|---------------|--------------|-----------------|
| Claude Code | `/thrunt:command` | Task spawning | `~/.claude/` |
| OpenCode | `/thrunt-command` | Subagent mode | `~/.config/opencode/` |
| Gemini CLI | `/thrunt:command` | Task spawning | `~/.gemini/` |
| Codex | `$thrunt-command` | Skills | `~/.codex/` |
| Copilot | `/thrunt:command` | Agent delegation | `~/.github/` |
| Antigravity | Skills | Skills | `~/.gemini/antigravity/` |

### Abstraction Points

1. **Tool name mapping** — Each runtime has its own tool names (e.g., Claude's `Bash` → Copilot's `execute`)
2. **Hook event names** — Claude uses `PostToolUse`, Gemini uses `AfterTool`
3. **Agent frontmatter** — Each runtime has its own agent definition format
4. **Path conventions** — Each runtime stores config in different directories
5. **Model references** — `inherit` profile lets THRUNT defer to runtime's model selection

The installer handles all translation at install time. Workflows and agents are written in Claude Code's native format and transformed during deployment.
