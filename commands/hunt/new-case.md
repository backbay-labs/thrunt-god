---
name: hunt:new-case
description: Initialize a threat hunting case from a signal, detection, intel lead, or analyst suspicion
argument-hint: "[--auto] [--pack <id>]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Task
  - AskUserQuestion
---
<context>
**Flags:**
- `--auto` - Use the supplied signal brief as the starting point and ask only for missing critical facts.
- `--pack <id>` - Bootstrap the case from a built-in or local hunt pack. Use `thrunt-tools pack bootstrap <id>` to inspect the generated mission, hypothesis, and phase seed content.
</context>

<objective>
Initialize a threat hunting case.

These hunt-native artifacts are the source of truth for the case.

**Creates:**
- `.planning/MISSION.md`
- `.planning/HYPOTHESES.md`
- `.planning/SUCCESS_CRITERIA.md`
- `.planning/HUNTMAP.md`
- `.planning/STATE.md`
- `.planning/QUERIES/`
- `.planning/RECEIPTS/`

**After this command:** Run `/hunt:shape-hypothesis` or `/hunt:plan 1`.
</objective>

<execution_context>
@~/.claude/thrunt-god/workflows/hunt-bootstrap.md
@~/.claude/thrunt-god/templates/mission.md
@~/.claude/thrunt-god/templates/hypotheses.md
@~/.claude/thrunt-god/templates/success-criteria.md
@~/.claude/thrunt-god/templates/huntmap.md
@~/.claude/thrunt-god/templates/hunt-state.md
@~/.claude/thrunt-god/templates/query-log.md
@~/.claude/thrunt-god/templates/receipt.md
</execution_context>

<process>
Execute the bootstrap workflow from @~/.claude/thrunt-god/workflows/hunt-bootstrap.md in case mode.
Focus on turning the input signal into a scoped case with explicit hypotheses, data sources, and evidence requirements.
When `--pack <id>` is present, use the pack bootstrap output as the default case skeleton and ask only for the missing pack parameters or signal-specific overrides.
Write the hunt artifacts directly.
</process>
