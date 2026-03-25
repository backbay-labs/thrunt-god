---
name: hunt:shape-hypothesis
description: Turn a signal into testable hunt hypotheses, scope, datasets, and success criteria
argument-hint: "[signal-or-phase]"
allowed-tools:
  - Read
  - Bash
  - Write
  - AskUserQuestion
  - Task
---
<objective>
Refine the active signal into testable hunt hypotheses.

`HYPOTHESES.md`, `SUCCESS_CRITERIA.md`, and `HUNTMAP.md` remain the source of truth.

**Updates:**
- `.planning/HYPOTHESES.md`
- `.planning/SUCCESS_CRITERIA.md`
- `.planning/HUNTMAP.md`
- `.planning/STATE.md`

**After this command:** Run `/hunt:plan 1` or `/hunt:run 1` if plans already exist.
</objective>

<execution_context>
@~/.claude/thrunt-god/workflows/hunt-shape-hypothesis.md
@~/.claude/thrunt-god/templates/hypotheses.md
@~/.claude/thrunt-god/templates/success-criteria.md
@~/.claude/thrunt-god/templates/huntmap.md
</execution_context>

<process>
Execute the hypothesis-shaping workflow from @~/.claude/thrunt-god/workflows/hunt-shape-hypothesis.md.
Drive toward hypotheses that can be proven, disproven, or left explicitly inconclusive.
</process>
