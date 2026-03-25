---
name: hunt:run
description: Execute a hunt phase with parallel telemetry work, query logging, receipt generation, and optional wave targeting
argument-hint: "<phase> [--wave N] [--gaps-only] [--interactive]"
allowed-tools:
  - Read
  - Bash
  - Write
  - Task
  - AskUserQuestion
  - WebSearch
---
<objective>
Execute a hunt phase.

Documented flags are available behaviors, not implied active behaviors.
Treat `--wave N`, `--gaps-only`, and `--interactive` as active only when the literal token appears in `$ARGUMENTS`.
If none of these tokens appear, run the standard full-phase execution flow.

`--wave N` executes only a single wave and must not mark the whole phase complete until no incomplete plans remain.

**Creates or updates:**
- `.planning/QUERIES/*.md`
- `.planning/RECEIPTS/*.md`
- Phase `SUMMARY.md`
- `.planning/STATE.md`
- `.planning/HYPOTHESES.md` when new pivots emerge
- `.planning/HUNTMAP.md` when phase status changes

**After this command:** Run `/hunt:validate-findings <phase>`.
</objective>

<context>
Available optional flags (documentation only):
- `--wave N` — run only Wave `N`
- `--gaps-only` — run only gap-closure plans
- `--interactive` — stop after each wave for operator review

Active flags must be derived from `$ARGUMENTS`.
Do not infer that a flag is active just because it is documented in this prompt.
`--interactive` is active only if the literal `--interactive` token is present in `$ARGUMENTS`.
If none of these tokens appear, run the standard full-phase execution flow.
</context>

<execution_context>
@~/.claude/thrunt-god/workflows/hunt-run.md
@~/.claude/thrunt-god/templates/query-log.md
@~/.claude/thrunt-god/templates/receipt.md
@~/.claude/thrunt-god/templates/summary-standard.md
</execution_context>

<process>
Execute the hunt run workflow from @~/.claude/thrunt-god/workflows/hunt-run.md.
Every non-trivial claim must cite receipts. Parallelize by telemetry domain when it helps.
</process>
