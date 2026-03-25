---
name: hunt:new-program
description: Initialize a threat hunting program with mission, hypotheses, huntmap, receipts, and query logs
argument-hint: "[--auto]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Task
  - AskUserQuestion
---
<context>
**Flags:**
- `--auto` - Use the provided brief as the primary source of truth and ask only for missing critical facts.
</context>

<objective>
Initialize a threat hunting program.

These hunt-native artifacts are the source of truth for the program.

**Creates:**
- `.planning/MISSION.md`
- `.planning/HYPOTHESES.md`
- `.planning/SUCCESS_CRITERIA.md`
- `.planning/HUNTMAP.md`
- `.planning/STATE.md`
- `.planning/environment/ENVIRONMENT.md`
- `.planning/QUERIES/`
- `.planning/RECEIPTS/`

**After this command:** Run `/hunt:map-environment` or `/hunt:new-case`.
</objective>

<execution_context>
@~/.claude/thrunt-god/workflows/hunt-bootstrap.md
@~/.claude/thrunt-god/templates/mission.md
@~/.claude/thrunt-god/templates/hypotheses.md
@~/.claude/thrunt-god/templates/success-criteria.md
@~/.claude/thrunt-god/templates/huntmap.md
@~/.claude/thrunt-god/templates/hunt-state.md
@~/.claude/thrunt-god/templates/environment-map.md
@~/.claude/thrunt-god/templates/query-log.md
@~/.claude/thrunt-god/templates/receipt.md
</execution_context>

<process>
Execute the bootstrap workflow from @~/.claude/thrunt-god/workflows/hunt-bootstrap.md in program mode.
Write the hunt artifacts directly.
Preserve any existing user-authored content unless the user explicitly wants a reset.
</process>
