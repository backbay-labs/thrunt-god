---
name: hunt:map-environment
description: Map available telemetry, query surfaces, tenants, retention windows, and investigation blind spots
argument-hint: "[--skeleton]"
allowed-tools:
  - Read
  - Bash
  - Write
  - AskUserQuestion
  - Task
---
<context>
**Flags:**
- `--skeleton` - Scaffold `ENVIRONMENT.md` with `TBD` markers only. Do not infer or simulate environment details.
</context>

<objective>
Create or refresh the environment map for this hunt program or case.

**Creates or updates:**
- `.planning/environment/ENVIRONMENT.md`
- `.planning/MISSION.md`
- `.planning/HYPOTHESES.md`
- `.planning/STATE.md`

Unknown tenants, tools, retention windows, access paths, and blind spots must remain `TBD` until the operator confirms them.

**After this command:** Run `/hunt:shape-hypothesis` or `/hunt:plan 1`.
</objective>

<execution_context>
@~/.claude/thrunt-god/workflows/hunt-map-environment.md
@~/.claude/thrunt-god/templates/environment-map.md
</execution_context>

<process>
Execute the environment-mapping workflow from @~/.claude/thrunt-god/workflows/hunt-map-environment.md.
Prefer concrete environment facts over generic best practices. Preserve existing analyst notes.
If `--skeleton` is present, scaffold the environment map for manual completion and do not populate simulated values.
</process>
