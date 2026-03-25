<purpose>
Check hunt progress, summarize recent work and what's ahead, then intelligently route to the next action.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="init_context">
**Load progress context (paths only):**

```bash
INIT=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" init progress)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Extract from init JSON: `mission_exists`, `huntmap_exists`, `state_exists`, `phases`, `current_phase`, `next_phase`, `milestone_version`, `completed_count`, `phase_count`, `paused_at`, `state_path`, `huntmap_path`, `huntmap_source`, `mission_path`, `mission_source`, `config_path`.

```bash
DISCUSS_MODE=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" config-get workflow.discuss_mode 2>/dev/null || echo "discuss")
```

Set workflow mode:
- `hunt` when `huntmap_source` is `HUNTMAP.md` or `mission_source` is `MISSION.md`
- `thrunt` otherwise

If `mission_exists` is false (no `.planning/` directory):

```
No planning structure found.

For threat hunting:
- `/hunt:new-case` — start from a signal
- `/hunt:new-program` — initialize durable hunt coverage

```

Exit.

If missing STATE.md: suggest `/hunt:new-program`.

**If the active huntmap doc is missing but the active mission doc exists:**

This means a milestone was completed and archived, or a hunt workspace has mission context but no active huntmap. Go to **Route F**.

If missing both the active huntmap and active mission docs: suggest `/hunt:new-case` or `/hunt:new-program` based on intent.
</step>

<step name="load">
**Use structured extraction from thrunt-tools:**

Instead of reading full files, use targeted tools to get only the data needed for the report:
- `HUNTMAP=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" huntmap analyze)`
- `STATE=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" state-snapshot)`

This minimizes orchestrator context usage.
</step>

<step name="analyze_huntmap">
**Get comprehensive huntmap analysis (replaces manual parsing):**

```bash
HUNTMAP=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" huntmap analyze)
```

This returns structured JSON with:
- All phases with disk status (complete/partial/planned/empty/no_directory)
- Goal and dependencies per phase
- Plan and summary counts per phase
- Aggregated stats: total plans, summaries, progress percent
- Current and next phase identification

Use this instead of manually reading/parsing `HUNTMAP.md`.
</step>

<step name="recent">
**Gather recent work context:**

- Find the 2-3 most recent SUMMARY.md files
- Use `summary-extract` for efficient parsing:
  ```bash
  node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" summary-extract <path> --fields one_liner
  ```
- This shows "what we've been working on"
  </step>

<step name="position">
**Parse current position from init context and huntmap analysis:**

- Use `current_phase` and `next_phase` from `$HUNTMAP`
- Track `huntmap_source` and `mission_source` from `$INIT`
- Note `paused_at` if work was paused (from `$STATE`)
- Count pending todos: use `init todos` or `list-todos`
- Check for active debug sessions: `(ls .planning/debug/*.md 2>/dev/null || true) | grep -v resolved | wc -l`
  </step>

<step name="report">
**Generate progress bar from thrunt-tools, then present rich status report:**

```bash
# Get formatted progress bar
PROGRESS_BAR=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" progress bar --raw)
```

Present:

```
# [Mission or Project Name]

**Workflow:** [Hunt or THRUNT Utility]
**Planning Docs:** [{mission_source}] / [{huntmap_source}]
**Progress:** {PROGRESS_BAR}
**Profile:** [quality/balanced/budget/inherit]
**Discuss mode:** {DISCUSS_MODE}

## Recent Work
- [Phase X, Plan Y]: [what was accomplished - 1 line from summary-extract]
- [Phase X, Plan Z]: [what was accomplished - 1 line from summary-extract]

## Current Position
Phase [N] of [total]: [phase-name]
Plan [M] of [phase-total]: [status]
CONTEXT: [✓ if has_context | - if not]

## Key Decisions Made
- [extract from $STATE.decisions[]]
- [e.g. jq -r '.decisions[].decision' from state-snapshot]

## Blockers/Concerns
- [extract from $STATE.blockers[]]
- [e.g. jq -r '.blockers[].text' from state-snapshot]

## Pending Todos
- [count] pending — /thrunt:check-todos to review

## Active Debug Sessions
- [count] active — /thrunt:debug to continue
(Only show this section if count > 0)

## What's Next
[Next phase/plan objective from huntmap analyze]
```

</step>

<step name="route">
**Determine next action based on verified counts.**

**Step 1: Count plans, summaries, and issues in current phase**

List files in the current phase directory:

```bash
(ls -1 .planning/phases/[current-phase-dir]/*-PLAN.md 2>/dev/null || true) | wc -l
(ls -1 .planning/phases/[current-phase-dir]/*-SUMMARY.md 2>/dev/null || true) | wc -l
(ls -1 .planning/phases/[current-phase-dir]/*-EVIDENCE_REVIEW.md 2>/dev/null || true) | wc -l
```

State: "This phase has {X} plans, {Y} summaries."

If `huntmap_source` is `HUNTMAP.md`, skip the Evidence Review-specific file scan below. Hunt work should route through findings validation and evidence review instead.

**Step 1.5: Directory-first THRUNT only — check for unaddressed Evidence Review gaps**

Check for EVIDENCE_REVIEW.md files with status "diagnosed" (has gaps needing fixes).

```bash
# Check for diagnosed Evidence Review with gaps or partial (incomplete) testing
grep -l "status: diagnosed\|status: partial" .planning/phases/[current-phase-dir]/*-EVIDENCE_REVIEW.md 2>/dev/null || true
```

Track:
- `uat_with_gaps`: EVIDENCE_REVIEW.md files with status "diagnosed" (gaps need fixing)
- `uat_partial`: EVIDENCE_REVIEW.md files with status "partial" (incomplete testing)

**Step 1.6: Cross-phase health check**

Scan ALL phases in the current milestone for outstanding validation debt using the CLI (which respects milestone boundaries via `getMilestonePhaseFilter`):

```bash
DEBT=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" audit-evidence --raw 2>/dev/null)
```

Parse JSON for `summary.total_items` and `summary.total_files`.

Track: `outstanding_debt` — `summary.total_items` from the audit.

**If outstanding_debt > 0:** Add a warning section to the progress report output (in the `report` step), placed between "## What's Next" and the route suggestion:

```markdown
## Validation Debt ({N} files across prior phases)

| Phase | File | Issue |
|-------|------|-------|
| {phase} | {filename} | {pending_count} pending, {skipped_count} skipped, {blocked_count} blocked |
| {phase} | {filename} | human_needed — {count} items |

Directory-first THRUNT follow-up:
- Review: `/thrunt:audit-evidence ${THRUNT_WS}` — full cross-phase audit
- Resume testing: `/hunt:validate-findings {phase} ${THRUNT_WS}` — retest specific phase

Hunt-native follow-up:
- Review: `/thrunt:audit-evidence` — full cross-phase evidence/findings audit
- Resume collection: `/hunt:run {phase}` — collect more receipts
- Validate conclusions: `/hunt:validate-findings {phase}` — reconcile evidence
```

This is a WARNING, not a blocker — routing proceeds normally. The debt is visible so the user can make an informed choice.

**Step 2: Route based on counts**

| Condition | Meaning | Action |
|-----------|---------|--------|
| huntmap_source = HUNTMAP.md AND summaries < plans | Unexecuted hunt plans exist | Go to **Route A.H** |
| huntmap_source = HUNTMAP.md AND summaries = plans AND plans > 0 | Phase ready for findings validation | Go to **Route H** |
| huntmap_source = HUNTMAP.md AND plans = 0 | Phase needs hunt planning | Go to **Route B.H** |
| uat_partial > 0 | Evidence Review testing incomplete | Go to **Route E.2** |
| uat_with_gaps > 0 | Evidence Review gaps need fix plans | Go to **Route E** |
| summaries < plans | Unexecuted plans exist | Go to **Route A** |
| summaries = plans AND plans > 0 | Phase complete | Go to Step 3 |
| plans = 0 | Phase not yet planned | Go to **Route B** |

---

**Route A.H: Unexecuted hunt plan exists**

Find the first PLAN.md without matching SUMMARY.md.
Read its `<objective>` section.

```
---

## ▶ Next Up

**Phase {phase}: [Hunt Plan]** — [objective summary from PLAN.md]

`/hunt:run {phase}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/hunt:plan {phase}` — adjust telemetry scope, receipt requirements, or plan boundaries first
- `/hunt:shape-hypothesis {phase}` — reshape the hunt if pivots changed the scope

---
```

---

**Route H: Hunt phase needs findings validation**

```
---

## ▶ Next Up

**Phase {phase}: Evidence Review** — validate findings against receipts and counter-evidence

`/hunt:validate-findings {phase}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/hunt:run {phase}` — gather more receipts before validating
- `/hunt:shape-hypothesis {phase}` — refresh hypotheses if contradictory evidence changed the hunt

---
```

---

**Route B.H: Hunt phase needs planning**

```
---

## ▶ Next Up

**Phase {N}: {Name}** — {Goal from HUNTMAP.md}

`/hunt:plan {phase}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/hunt:shape-hypothesis {phase}` — refresh hypotheses, scope, or receipt expectations first

---
```

---

**Route A: Unexecuted plan exists**

Find the first PLAN.md without matching SUMMARY.md.
Read its `<objective>` section.

```
---

## ▶ Next Up

**{phase}-{plan}: [Plan Name]** — [objective summary from PLAN.md]

`/hunt:run {phase} ${THRUNT_WS}`

<sub>`/clear` first → fresh context window</sub>

---
```

---

**Route B: Phase needs planning**

Check if `{phase_num}-CONTEXT.md` exists in phase directory.

Check if current phase has UI indicators:

```bash
PHASE_SECTION=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" huntmap get-phase "${CURRENT_PHASE}" 2>/dev/null)
PHASE_HAS_UI=$(echo "$PHASE_SECTION" | grep -qi "UI hint.*yes" && echo "true" || echo "false")
```

**If CONTEXT.md exists:**

```
---

## ▶ Next Up

**Phase {N}: {Name}** — {Goal from HUNTMAP.md}
<sub>✓ Context gathered, ready to plan</sub>

`/hunt:plan {phase-number} ${THRUNT_WS}`

<sub>`/clear` first → fresh context window</sub>

---
```

**If CONTEXT.md does NOT exist AND phase has UI (`PHASE_HAS_UI` is `true`):**

```
---

## ▶ Next Up

**Phase {N}: {Name}** — {Goal from HUNTMAP.md}

`/hunt:shape-hypothesis {phase}` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/thrunt:ui-phase {phase}` — generate UI design contract (recommended for frontend phases)
- `/hunt:plan {phase}` — skip discussion, plan directly
- `/thrunt:list-phase-assumptions {phase}` — see Claude's assumptions

---
```

**If CONTEXT.md does NOT exist AND phase has no UI:**

```
---

## ▶ Next Up

**Phase {N}: {Name}** — {Goal from HUNTMAP.md}

`/hunt:shape-hypothesis {phase} ${THRUNT_WS}` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/hunt:plan {phase} ${THRUNT_WS}` — skip discussion, plan directly
- `/thrunt:list-phase-assumptions {phase} ${THRUNT_WS}` — see Claude's assumptions

---
```

---

**Route E: Evidence Review gaps need fix plans**

EVIDENCE_REVIEW.md exists with gaps (diagnosed issues). User needs to plan fixes.

```
---

## ⚠ Evidence Review Gaps Found

**{phase_num}-EVIDENCE_REVIEW.md** has {N} gaps requiring fixes.

`/hunt:plan {phase} --gaps ${THRUNT_WS}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/hunt:run {phase} ${THRUNT_WS}` — execute phase plans
- `/hunt:validate-findings {phase} ${THRUNT_WS}` — run more Evidence Review testing

---
```

---

**Route E.2: Evidence Review testing incomplete (partial)**

EVIDENCE_REVIEW.md exists with `status: partial` — testing session ended before all items resolved.

```
---

## Incomplete Evidence Review Testing

**{phase_num}-EVIDENCE_REVIEW.md** has {N} unresolved tests (pending, blocked, or skipped).

`/hunt:validate-findings {phase} ${THRUNT_WS}` — resume testing from where you left off

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/thrunt:audit-evidence ${THRUNT_WS}` — full cross-phase Evidence Review audit
- `/hunt:run {phase} ${THRUNT_WS}` — execute phase plans

---
```

---

**Step 3: Check remaining phase status (only when the current phase is complete)**

Use the active huntmap document and identify:
1. Current phase number
2. All phase numbers in the active huntmap section

Count total phases and identify the highest phase number.

State: "Current phase is {X}. The active huntmap has {N} phases (highest: {Y})."

**Route based on remaining phase status:**

| Condition | Meaning | Action |
|-----------|---------|--------|
| huntmap_source = HUNTMAP.md AND current phase < highest phase | More hunt phases remain | Go to **Route C.H** |
| huntmap_source = HUNTMAP.md AND current phase = highest phase | Hunt ready to publish | Go to **Route D.H** |
| current phase < highest phase | More phases remain | Go to **Route C** |
| current phase = highest phase | Milestone complete | Go to **Route D** |

---

**Route C.H: Hunt phase complete, more phases remain**

Read `HUNTMAP.md` to get the next phase's name and goal.

```
---

## ✓ Phase {Z} Complete

## ▶ Next Up

**Phase {Z+1}: {Name}** — {Goal from HUNTMAP.md}

`/hunt:plan {Z+1}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/hunt:shape-hypothesis {Z+1}` — reshape the next phase if pivots changed the scope
- `/hunt:validate-findings {Z}` — revisit evidence before moving on

---
```

---

**Route C: Phase complete, more phases remain**

Read HUNTMAP.md to get the next phase's name and goal.

Check if next phase has UI indicators:

```bash
NEXT_PHASE_SECTION=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" huntmap get-phase "$((Z+1))" 2>/dev/null)
NEXT_HAS_UI=$(echo "$NEXT_PHASE_SECTION" | grep -qi "UI hint.*yes" && echo "true" || echo "false")
```

**If next phase has UI (`NEXT_HAS_UI` is `true`):**

```
---

## ✓ Phase {Z} Complete

## ▶ Next Up

**Phase {Z+1}: {Name}** — {Goal from HUNTMAP.md}

`/hunt:shape-hypothesis {Z+1}` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/thrunt:ui-phase {Z+1}` — generate UI design contract (recommended for frontend phases)
- `/hunt:plan {Z+1}` — skip discussion, plan directly
- `/hunt:validate-findings {Z}` — user acceptance test before continuing

---
```

**If next phase has no UI:**

```
---

## ✓ Phase {Z} Complete

## ▶ Next Up

**Phase {Z+1}: {Name}** — {Goal from HUNTMAP.md}

`/hunt:shape-hypothesis {Z+1} ${THRUNT_WS}` — gather context and clarify approach

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/hunt:plan {Z+1} ${THRUNT_WS}` — skip discussion, plan directly
- `/hunt:validate-findings {Z} ${THRUNT_WS}` — user acceptance test before continuing

---
```

---

**Route D: Milestone complete**

```
---

## 🎉 Milestone Complete

All {N} phases finished!

## ▶ Next Up

**Complete Milestone** — archive and prepare for next

`/thrunt:complete-milestone ${THRUNT_WS}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/hunt:validate-findings ${THRUNT_WS}` — user acceptance test before completing milestone

---
```

---

**Route D.H: Hunt ready to publish**

```
---

## ✓ Hunt Execution Complete

All {N} phases finished.

## ▶ Next Up

**Publish Findings** — produce the case report, escalation, or detection promotion

`/hunt:publish`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/hunt:validate-findings {phase}` — revisit findings before publishing
- `/hunt:new-case` — start another signal after publication

---
```

---

**Route F: Between milestones or between hunts**

If `mission_source` is `MISSION.md`, the workspace still has mission context but no active huntmap. Ready to start the next hunt cycle.

```
---

## ✓ Mission Context Ready

No active `HUNTMAP.md` found.

## ▶ Next Up

**Start Next Hunt** — turn a new signal into an active case

`/hunt:new-case`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/hunt:new-program` — refresh or widen the standing program scope

---
```

If `mission_source` is `MISSION.md`, a milestone was completed and archived. Ready to start the next milestone cycle.

Read MILESTONES.md to find the last completed milestone version.

```
---

## ✓ Milestone v{X.Y} Complete

Ready to plan the next milestone.

## ▶ Next Up

**Start Next Milestone** — questioning → research → requirements → huntmap

`/hunt:new-program ${THRUNT_WS}`

<sub>`/clear` first → fresh context window</sub>

---
```

</step>

<step name="edge_cases">
**Handle edge cases:**

- Phase complete but next phase not planned → offer `/hunt:plan [next] ${THRUNT_WS}`
- Hunt phase complete but next phase not planned → offer `/hunt:plan [next]`
- All work complete → offer milestone completion
- Hunt findings contradictory or confidence not settled → mention `/hunt:validate-findings [phase]` or `/hunt:run [phase]`
- Blockers present → highlight before offering to continue
- Handoff file exists → mention it, offer `/thrunt:resume-work ${THRUNT_WS}`
  </step>

</process>

<success_criteria>

- [ ] Rich context provided (recent work, decisions, issues)
- [ ] Current position clear with visual progress
- [ ] What's next clearly explained
- [ ] Smart routing uses `/hunt:*` for hunt work and `/thrunt:*` for THRUNT utilities
- [ ] No forced auto-execution — progress recommends the next command clearly
- [ ] Seamless handoff to the appropriate command surface
      </success_criteria>
