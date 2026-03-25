# Workstream Flag (`--ws`)

## Overview

The `--ws <name>` flag scopes THRUNT operations to a specific workstream, enabling
parallel milestone work by multiple Claude Code instances on the same codebase.

## Resolution Priority

1. `--ws <name>` flag (explicit, highest priority)
2. `THRUNT_WORKSTREAM` environment variable (per-instance)
3. `.planning/active-workstream` file (shared, last-writer-wins)
4. `null` — flat mode (no workstreams)

## Routing Propagation

All workflow routing commands include `${THRUNT_WS}` which:
- Expands to `--ws <name>` when a workstream is active
- Expands to empty string in flat mode (compatible)

This ensures workstream scope chains automatically through the workflow:
`new-milestone → shape-hypothesis → hunt-plan → hunt-run → transition`

## Directory Structure

```
.planning/
├── MISSION.md          # Shared
├── config.json         # Shared
├── milestones/         # Shared
├── codebase/           # Shared
├── active-workstream   # Points to current ws
└── workstreams/
    ├── feature-a/      # Workstream A
    │   ├── STATE.md
    │   ├── HUNTMAP.md
    │   ├── HYPOTHESES.md
    │   └── phases/
    └── feature-b/      # Workstream B
        ├── STATE.md
        ├── HUNTMAP.md
        ├── HYPOTHESES.md
        └── phases/
```

## CLI Usage

```bash
# All thrunt-tools commands accept --ws
node thrunt-tools.cjs state json --ws feature-a
node thrunt-tools.cjs find-phase 3 --ws feature-b

# Workstream CRUD
node thrunt-tools.cjs workstream create <name>
node thrunt-tools.cjs workstream list
node thrunt-tools.cjs workstream status <name>
node thrunt-tools.cjs workstream complete <name>
```
