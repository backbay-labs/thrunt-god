# THRUNT CLI Tools Reference

> Programmatic API reference for `thrunt-tools.cjs`. Used by workflows and agents internally. For user-facing commands, see [Command Reference](COMMANDS.md).

---

## Overview

`thrunt-tools.cjs` is a Node.js CLI utility that replaces repetitive inline bash patterns across THRUNT's command, workflow, and agent files. It centralizes: config parsing, model resolution, phase lookup, git commits, summary validation, state management, and template operations.

**Location:** `thrunt-god/bin/thrunt-tools.cjs`
**Modules:** 15 domain modules in `thrunt-god/bin/lib/`

**Usage:**
```bash
node thrunt-tools.cjs <command> [args] [--raw] [--cwd <path>]
```

**Global Flags:**
| Flag | Description |
|------|-------------|
| `--raw` | Machine-readable output (JSON or plain text, no formatting) |
| `--cwd <path>` | Override working directory (for sandboxed subagents) |

---

## State Commands

Manage `.planning/STATE.md` — the hunt workspace's living memory.

```bash
# Load full workspace config + state as JSON
node thrunt-tools.cjs state load

# Output STATE.md frontmatter as JSON
node thrunt-tools.cjs state json

# Update a single field
node thrunt-tools.cjs state update <field> <value>

# Get STATE.md content or a specific section
node thrunt-tools.cjs state get [section]

# Batch update multiple fields
node thrunt-tools.cjs state patch --field1 val1 --field2 val2

# Increment plan counter
node thrunt-tools.cjs state advance-plan

# Record execution metrics
node thrunt-tools.cjs state record-metric --phase N --plan M --duration Xmin [--tasks N] [--files N]

# Recalculate progress bar
node thrunt-tools.cjs state update-progress

# Add a decision
node thrunt-tools.cjs state add-decision --summary "..." [--phase N] [--rationale "..."]
# Or from files:
node thrunt-tools.cjs state add-decision --summary-file path [--rationale-file path]

# Add/resolve blockers
node thrunt-tools.cjs state add-blocker --text "..."
node thrunt-tools.cjs state resolve-blocker --text "..."

# Record session continuity
node thrunt-tools.cjs state record-session --stopped-at "..." [--resume-file path]
```

### State Snapshot

Structured parse of the full STATE.md:

```bash
node thrunt-tools.cjs state-snapshot
```

Returns JSON with: current position, phase, plan, status, decisions, blockers, metrics, last activity.

---

## Phase Commands

Manage phases — directories, numbering, and huntmap sync.

```bash
# Find phase directory by number
node thrunt-tools.cjs find-phase <phase>

# Calculate next decimal phase number for insertions
node thrunt-tools.cjs phase next-decimal <phase>

# Append new phase to huntmap + create directory
node thrunt-tools.cjs phase add <description>

# Insert decimal phase after existing
node thrunt-tools.cjs phase insert <after> <description>

# Remove phase, renumber subsequent
node thrunt-tools.cjs phase remove <phase> [--force]

# Mark phase complete, update state + huntmap
node thrunt-tools.cjs phase complete <phase>

# Index plans with waves and status
node thrunt-tools.cjs phase-plan-index <phase>

# List phases with filtering
node thrunt-tools.cjs phases list [--type planned|executed|all] [--phase N] [--include-archived]
```

---

## Huntmap Commands

Parse and update `HUNTMAP.md`.

```bash
# Extract phase section from HUNTMAP.md
node thrunt-tools.cjs huntmap get-phase <phase>

# Full huntmap parse with disk status
node thrunt-tools.cjs huntmap analyze

# Update progress table row from disk
node thrunt-tools.cjs huntmap update-plan-progress <N>
```

---

## Config Commands

Read and write `.planning/config.json`.

```bash
# Initialize config.json with defaults
node thrunt-tools.cjs config-ensure-section

# Set a config value (dot notation)
node thrunt-tools.cjs config-set <key> <value>

# Get a config value
node thrunt-tools.cjs config-get <key>

# Set model profile
node thrunt-tools.cjs config-set-model-profile <profile>
```

---

## Model Resolution

```bash
# Get model for agent based on current profile
node thrunt-tools.cjs resolve-model <agent-name>
# Returns: opus | sonnet | haiku | inherit
```

Agent names: `thrunt-hunt-planner`, `thrunt-telemetry-executor`, `thrunt-query-writer`, `thrunt-signal-triager`, `thrunt-intel-synthesizer`, `thrunt-findings-validator`, `thrunt-hunt-checker`, `thrunt-evidence-correlator`, `thrunt-huntmap-builder`, `thrunt-incident-debugger`, `thrunt-environment-mapper`, `thrunt-false-positive-auditor`

---

## Verification Commands

Validate plans, phases, references, and commits.

```bash
# Verify SUMMARY.md file
node thrunt-tools.cjs validate-summary <path> [--check-count N]

# Check PLAN.md structure + tasks
node thrunt-tools.cjs validate plan-structure <file>

# Check all plans have summaries
node thrunt-tools.cjs validate phase-completeness <phase>

# Check @-refs + paths resolve
node thrunt-tools.cjs validate references <file>

# Batch validate commit hashes
node thrunt-tools.cjs validate commits <hash1> [hash2] ...

# Check must_haves.artifacts
node thrunt-tools.cjs validate artifacts <plan-file>

# Check must_haves.key_links
node thrunt-tools.cjs validate key-links <plan-file>
```

---

## Validation Commands

Check hunt workspace integrity.

```bash
# Check phase numbering, disk/huntmap sync
node thrunt-tools.cjs validate consistency

# Check .planning/ integrity, optionally repair
node thrunt-tools.cjs validate health [--repair]
```

---

## Template Commands

Template selection and filling.

```bash
# Select summary template based on granularity
node thrunt-tools.cjs template select <type>

# Fill template with variables
node thrunt-tools.cjs template fill <type> --phase N [--plan M] [--name "..."] [--type execute|tdd] [--wave N] [--fields '{json}']
```

Template types for `fill`: `summary`, `plan`, `evidence-review`, `findings`

---

## Frontmatter Commands

YAML frontmatter CRUD operations on any Markdown file.

```bash
# Extract frontmatter as JSON
node thrunt-tools.cjs frontmatter get <file> [--field key]

# Update single field
node thrunt-tools.cjs frontmatter set <file> --field key --value jsonVal

# Merge JSON into frontmatter
node thrunt-tools.cjs frontmatter merge <file> --data '{json}'

# Validate required fields
node thrunt-tools.cjs frontmatter validate <file> --schema plan|summary|findings
```

---

## Scaffold Commands

Create pre-structured files and directories.

```bash
# Create CONTEXT.md template
node thrunt-tools.cjs scaffold context --phase N

# Create EVIDENCE_REVIEW.md template
node thrunt-tools.cjs scaffold evidence-review --phase N

# Create FINDINGS.md template
node thrunt-tools.cjs scaffold findings --phase N

# Create phase directory
node thrunt-tools.cjs scaffold phase-dir --phase N --name "phase name"
```

---

## Init Commands (Compound Context Loading)

Load all context needed for a specific workflow in one call. Returns JSON with mission/workspace info, config, state, and workflow-specific data.

```bash
node thrunt-tools.cjs init run <phase>
node thrunt-tools.cjs init plan <phase>
node thrunt-tools.cjs init new-program
node thrunt-tools.cjs init new-milestone
node thrunt-tools.cjs init quick <description>
node thrunt-tools.cjs init resume
node thrunt-tools.cjs init validate-findings <phase>
node thrunt-tools.cjs init phase-op <phase>
node thrunt-tools.cjs init todos [area]
node thrunt-tools.cjs init milestone-op
node thrunt-tools.cjs init map-environment
node thrunt-tools.cjs init progress
```

**Large payload handling:** When output exceeds ~50KB, the CLI writes to a temp file and returns `@file:/tmp/thrunt-init-XXXXX.json`. Workflows check for the `@file:` prefix and read from disk:

```bash
INIT=$(node thrunt-tools.cjs init run "1")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

---

## Milestone Commands

```bash
# Archive milestone
node thrunt-tools.cjs milestone complete <version> [--name <name>] [--archive-phases]

# Mark hypotheses as complete
node thrunt-tools.cjs hypotheses mark-complete <ids>
# Accepts: HYP-01,HYP-02 or HYP-01 HYP-02 or [HYP-01, HYP-02]
```

---

## Utility Commands

```bash
# Convert text to URL-safe slug
node thrunt-tools.cjs generate-slug "Some Text Here"
# → some-text-here

# Get timestamp
node thrunt-tools.cjs current-timestamp [full|date|filename]

# Count and list pending todos
node thrunt-tools.cjs list-todos [area]

# Check file/directory existence
node thrunt-tools.cjs check-path-exists <path>

# Aggregate all SUMMARY.md data
node thrunt-tools.cjs history-digest

# Extract structured data from SUMMARY.md
node thrunt-tools.cjs summary-extract <path> [--fields field1,field2]

# Hunt statistics
node thrunt-tools.cjs stats [json|table]

# Progress rendering
node thrunt-tools.cjs progress [json|table|bar]

# Complete a todo
node thrunt-tools.cjs todo complete <filename>

# Evidence Review audit — scan all phases for unresolved items
node thrunt-tools.cjs audit-evidence

# Git commit with config checks
node thrunt-tools.cjs commit <message> [--files f1 f2] [--amend] [--no-verify]
```

> **`--no-verify`**: Skips pre-commit hooks. Used by parallel executor agents during wave-based execution to avoid build lock contention (e.g., cargo lock fights in Rust projects). The orchestrator runs hooks once after each wave completes. Do not use `--no-verify` during sequential execution — let hooks run normally.

# Web search (requires Brave API key)
node thrunt-tools.cjs websearch <query> [--limit N] [--freshness day|week|month]
```

---

## Module Architecture

| Module | File | Exports |
|--------|------|---------|
| Core | `lib/core.cjs` | `error()`, `output()`, `parseArgs()`, shared utilities |
| State | `lib/state.cjs` | All `state` subcommands, `state-snapshot` |
| Phase | `lib/phase.cjs` | Phase CRUD, `find-phase`, `phase-plan-index`, `phases list` |
| Huntmap | `lib/huntmap.cjs` | Huntmap parsing, phase extraction, progress updates |
| Config | `lib/config.cjs` | Config read/write, section initialization |
| Validate | `lib/validate.cjs` | Artifact validation and workspace health commands |
| Template | `lib/template.cjs` | Template selection and variable filling |
| Frontmatter | `lib/frontmatter.cjs` | YAML frontmatter CRUD |
| Init | `lib/init.cjs` | Compound context loading for all workflows |
| Milestone | `lib/milestone.cjs` | Milestone archival, requirements marking |
| Commands | `lib/commands.cjs` | Misc: slug, timestamp, todos, scaffold, stats, websearch |
| Model Profiles | `lib/model-profiles.cjs` | Profile resolution table |
| Evidence Review | `lib/evidence.cjs` | Cross-phase Evidence Review/findings audit |
| Profile Output | `lib/profile-output.cjs` | Developer profile formatting |
| Profile Pipeline | `lib/profile-pipeline.cjs` | Session analysis pipeline |
