<trigger>
Use this workflow when:
- Starting a new session on an existing project
- User says "continue", "what's next", "where were we", "resume"
- Any planning operation when .planning/ already exists
- User returns after time away from project
</trigger>

<purpose>
Instantly restore full project or hunt context so "Where were we?" has an immediate, complete answer.
</purpose>

<required_reading>
@.github/thrunt-god/references/continuation-format.md
</required_reading>

<process>

<step name="initialize">
Load all context in one call:

```bash
INIT=$(node ".github/thrunt-god/bin/thrunt-tools.cjs" init resume)
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Parse JSON for: `state_exists`, `huntmap_exists`, `mission_exists`, `planning_exists`, `has_interrupted_agent`, `interrupted_agent_id`, `commit_docs`.

Also parse: `huntmap_source`, `huntmap_path`, `mission_source`, `mission_path`.

Set `WORKFLOW_MODE`:
- `hunt` when `huntmap_source` is `HUNTMAP.md` or `mission_source` is `MISSION.md`
- `thrunt` otherwise

**If `state_exists` is true:** Proceed to load_state
**If `state_exists` is false but `huntmap_exists` or `mission_exists` is true:** Offer to reconstruct STATE.md
**If `planning_exists` is false:** This is a new workspace. Offer `/hunt-new-case` or `/hunt-new-program` based on user intent.
</step>

<step name="load_state">

Read and parse `STATE.md`, then the active mission doc from `mission_path` if it exists, then the active huntmap from `huntmap_path` if it exists:

```bash
cat .planning/STATE.md
[ "$mission_exists" = "true" ] && cat "$mission_path"
[ "$huntmap_exists" = "true" ] && cat "$huntmap_path"
```

**From STATE.md extract:**

- **Mission Reference**: Core value and current focus
- **Current Position**: Phase X of Y, Plan A of B, Status
- **Progress**: Visual progress bar
- **Recent Decisions**: Key decisions affecting current work
- **Pending Todos**: Ideas captured during sessions
- **Blockers/Concerns**: Issues carried forward
- **Session Continuity**: Where we left off, any resume files

**From `MISSION.md` extract:**

- **What This Is / Mission**: Current accurate description
- **Hypotheses / Hypotheses**: Validated, Active, Out of Scope or active hunt assumptions
- **Key Decisions**: Full decision log with outcomes
- **Constraints / Scope**: Hard limits, telemetry scope, or data-source limits

**From `HUNTMAP.md` extract:**

- **Current sequencing**: Which phase is active, next, or complete
- **Phase goals**: The current phase goal from the active huntmap
- **Dependencies**: Any blocked follow-on work

</step>

<step name="check_incomplete_work">
Look for incomplete work that needs attention:

```bash
# Check for structured handoff (preferred — machine-readable)
cat .planning/HANDOFF.json 2>/dev/null || true

# Check for continue-here files (mid-plan resumption)
ls .planning/phases/*/.continue-here*.md 2>/dev/null || true

# Check for plans without summaries (incomplete execution)
for plan in .planning/phases/*/*-PLAN.md; do
  [ -e "$plan" ] || continue
  summary="${plan/PLAN/SUMMARY}"
  [ ! -f "$summary" ] && echo "Incomplete: $plan"
done 2>/dev/null || true

# Check for interrupted agents (use has_interrupted_agent and interrupted_agent_id from init)
if [ "$has_interrupted_agent" = "true" ]; then
  echo "Interrupted agent: $interrupted_agent_id"
fi
```

**If HANDOFF.json exists:**

- This is the primary resumption source — structured data from `/thrunt-pause-work`
- Parse `status`, `phase`, `plan`, `task`, `total_tasks`, `next_action`
- Check `blockers` and `human_actions_pending` — surface these immediately
- Check `completed_tasks` for `in_progress` items — these need attention first
- Validate `uncommitted_files` against `git status` — flag divergence
- Use `context_notes` to restore mental model
- Flag: "Found structured handoff — resuming from task {task}/{total_tasks}"
- **After successful resumption, delete HANDOFF.json** (it's a one-shot artifact)

**If .continue-here file exists (fallback):**

- This is a mid-plan resumption point
- Read the file for specific resumption context
- Flag: "Found mid-plan checkpoint"

**If PLAN without SUMMARY exists:**

- Execution was started but not completed
- Flag: "Found incomplete plan execution"

**If interrupted agent found:**

- Subagent was spawned but session ended before completion
- Read agent-history.json for task details
- Flag: "Found interrupted agent"
  </step>

<step name="present_status">
Present complete project status to user:

```
╔══════════════════════════════════════════════════════════════╗
║  WORKFLOW STATUS                                              ║
╠══════════════════════════════════════════════════════════════╣
║  Workflow: [Hunt or THRUNT Utility]                             ║
║  Mission Doc: [MISSION.md]                                      ║
║  Huntmap Doc: [HUNTMAP.md]                                      ║
║  Focus: [one-liner from active mission doc]                     ║
║                                                               ║
║  Phase: [X] of [Y] - [Phase name]                            ║
║  Plan:  [A] of [B] - [Status]                                ║
║  Progress: [██████░░░░] XX%                                  ║
║                                                               ║
║  Last activity: [date] - [what happened]                     ║
╚══════════════════════════════════════════════════════════════╝

[If incomplete work found:]
⚠️  Incomplete work detected:
    - [.continue-here file or incomplete plan]

[If interrupted agent found:]
⚠️  Interrupted agent detected:
    Agent ID: [id]
    Task: [task description from agent-history.json]
    Interrupted: [timestamp]

    Resume with: Task tool (resume parameter with agent ID)

[If pending todos exist:]
📋 [N] pending todos — /thrunt-check-todos to review

[If blockers exist:]
⚠️  Carried concerns:
    - [blocker 1]
    - [blocker 2]

[If alignment is not ✓:]
⚠️  Brief alignment: [status] - [assessment]
```

</step>

<step name="determine_next_action">
Based on project state, determine the most logical next action:

**If interrupted agent exists:**
→ Primary: Resume interrupted agent (Task tool with resume parameter)
→ Option: Start fresh (abandon agent work)

**If HANDOFF.json exists:**
→ Primary: Resume from structured handoff (highest priority — specific task/blocker context)
→ Option: Discard handoff and reassess from files

**If .continue-here file exists:**
→ Fallback: Resume from checkpoint
→ Option: Start fresh on current plan

**If incomplete plan (PLAN without SUMMARY):**
→ Primary: Complete the incomplete plan
→ Option: Abandon and move on

**If `WORKFLOW_MODE` is `hunt`:**

- **If mission exists but no active hunt phase is shaped yet:**
  → Primary: `/hunt-new-case`
  → Option: `/hunt-new-program`

- **If the active phase has no context yet:**
  → Primary: `/hunt-shape-hypothesis {phase}`
  → Option: `/hunt-plan {phase}` if context already exists elsewhere

- **If the active phase is shaped but not planned:**
  → Primary: `/hunt-plan {phase}`
  → Option: Review `HYPOTHESES.md` first

- **If the active phase has plans without matching summaries:**
  → Primary: `/hunt-run {phase}`
  → Option: Review the plan first

- **If the active phase has matching summaries and hunt execution is complete:**
  → Primary: `/hunt-validate-findings {phase}`
  → Option: Review receipts before validating

- **If all phases are complete:**
  → Primary: `/hunt-publish`
  → Option: `/hunt-validate-findings`

**If `WORKFLOW_MODE` is `thrunt`:**

- Route to the relevant `/thrunt:*` utility command for repo management, diagnostics, or orchestration.
    → Option: Review huntmap

- **If phase ready to execute:**
  → Primary: Execute next plan
  → Option: Review the plan first
</step>

<step name="offer_options">
Present contextual options based on project state:

```
What would you like to do?

[Primary action based on state - e.g.:]
1. Resume interrupted agent [if interrupted agent found]
   OR
1. Run phase (`/hunt-run {phase}`) [THRUNT mode]
   OR
1. Shape Phase 3 hypothesis (`/hunt-shape-hypothesis 3`) [if CONTEXT.md missing in THRUNT mode]
   OR
1. Plan Phase 3 (`/hunt-plan 3` or `/hunt-plan 3`) [depending on workflow mode]
   OR
1. Validate findings (`/hunt-validate-findings 3`) [if execution is complete in THRUNT mode]
   OR
1. Publish the hunt (`/hunt-publish`) [if all hunt phases are complete]

[Secondary options:]
2. Review current phase status
3. Check pending todos ([N] pending)
4. Review brief alignment
5. Something else
```

**Note:** When offering phase planning, check for `CONTEXT.md` existence first:

```bash
ls .planning/phases/XX-name/*-CONTEXT.md 2>/dev/null || true
```

If missing, suggest `/hunt-shape-hypothesis` before planning. If it exists, offer plan directly.

Wait for user selection.
</step>

<step name="route_to_workflow">
Based on user selection, route to appropriate workflow:

- **Run phase / execute plan** → Show the right command for the active workflow after clearing:
  ```
  ---

  ## ▶ Next Up

  **Phase [N]: [Phase Name]** — [goal from HUNTMAP.md]

  `/hunt-run [phase-number] ${THRUNT_WS}`   [THRUNT mode]
  `/hunt-run [phase-number] ${THRUNT_WS}`   [THRUNT mode]

  <sub>`/clear` first → fresh context window</sub>

  ---
  ```
- **Plan phase** → Show the right planning command after clearing:
  ```
  ---

  ## ▶ Next Up

  **Phase [N]: [Name]** — [Goal from HUNTMAP.md]

  `/hunt-plan [phase-number] ${THRUNT_WS}`   [THRUNT mode]
  `/hunt-plan [phase-number] ${THRUNT_WS}`   [THRUNT mode]

  <sub>`/clear` first → fresh context window</sub>

  ---

  **Also available:**
  - `/hunt-shape-hypothesis [N] ${THRUNT_WS}` — gather hunt context first [THRUNT mode]
  - `/hunt-shape-hypothesis [N] ${THRUNT_WS}` — gather context first [THRUNT mode]
  - `/hunt-shape-hypothesis [N] ${THRUNT_WS}` — investigate unknowns

  ---
  ```
- **Validate findings** → Show:
  ```
  ---

  ## ▶ Next Up

  **Validate Phase [N] Findings** — confirm receipts, contradictions, and confidence.

  `/hunt-validate-findings [phase-number] ${THRUNT_WS}`

  <sub>`/clear` first → fresh context window</sub>

  ---
  ```
- **Publish hunt** → Show:
  ```
  ---

  ## ▶ Next Up

  **Publish Hunt Outcome** — package the case, escalation, or detection output.

  `/hunt-publish ${THRUNT_WS}`

  <sub>`/clear` first → fresh context window</sub>

  ---
  ```
- **Advance to next phase** → ./transition.md (internal workflow, invoked inline — NOT a user command)
- **Check todos** → Read .planning/todos/pending/, present summary
- **Review alignment** → Read `MISSION.md` or `MISSION.md`, compare to current state
- **Something else** → Ask what they need
</step>

<step name="update_session">
Before proceeding to routed workflow, update session continuity:

Update STATE.md:

```markdown
## Session Continuity

Last session: [now]
Stopped at: Session resumed, proceeding to [action]
Resume file: [updated if applicable]
```

This ensures if session ends unexpectedly, next resume knows the state.
</step>

</process>

<reconstruction>
If STATE.md is missing but other artifacts exist:

"STATE.md missing. Reconstructing from artifacts..."

1. Read `MISSION.md` → Extract the mission summary and core value
2. Read `MISSION.md` and `HUNTMAP.md` → Determine phases and current position
3. Scan \*-SUMMARY.md files → Extract decisions, concerns
4. Count pending todos in .planning/todos/pending/
5. Check for .continue-here files → Session continuity

Reconstruct and write STATE.md, then proceed normally.

This handles cases where:

- Project predates STATE.md introduction
- File was accidentally deleted
- Cloning repo without full .planning/ state
  </reconstruction>

<quick_resume>
If user says "continue" or "go":
- Load state silently
- Determine primary action
- Route immediately using `WORKFLOW_MODE` without presenting options

"Continuing from [state]... [action]"
</quick_resume>

<success_criteria>
Resume is complete when:

- [ ] STATE.md loaded (or reconstructed)
- [ ] Incomplete work detected and flagged
- [ ] Clear status presented to user
- [ ] Contextual next actions offered for the active hunt or THRUNT workflow
- [ ] User knows exactly where project stands
- [ ] Session continuity updated
      </success_criteria>
