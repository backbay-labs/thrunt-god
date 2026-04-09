<purpose>
Detect current project or hunt state and automatically advance to the next logical hunt or THRUNT workflow step.
Reads active planning docs to determine: shape → plan → run → validate → publish progression.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="detect_state">
Read structured progress state to determine current position:

```bash
INIT=$(node ".github/thrunt-god/bin/thrunt-tools.cjs" init progress 2>/dev/null || echo "{}")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Extract:
- `mission_exists`
- `huntmap_exists`
- `state_exists`
- `current_phase`
- `next_phase`
- `phase_count`
- `paused_at`
- `huntmap_source`
- `mission_source`

Set `WORKFLOW_MODE`:
- `hunt` when `huntmap_source` is `HUNTMAP.md` or `mission_source` is `MISSION.md`
- `thrunt` otherwise

If no `.planning/` directory exists:
```
No planning structure found.

For threat hunting run `/hunt-new-case` or `/hunt-new-program`.
```
Exit.

If `paused_at` exists, that takes precedence:
→ Next action: `/thrunt-resume-work`
</step>

<step name="determine_next_action">
Apply routing rules based on `WORKFLOW_MODE`:

**Hunt-native routes**

1. If no active huntmap exists but `mission_source` is `MISSION.md`:
→ Next action: `/hunt-new-case`

2. If no phases exist yet:
→ Next action: `/hunt-shape-hypothesis`

3. If the current phase exists and has plans but incomplete summaries:
→ Next action: `/hunt-run <current-phase>`

4. If the current phase exists and all plans have summaries:
→ Next action: `/hunt-validate-findings <current-phase>`

5. If there is no current phase but `next_phase` exists:
→ Next action: `/hunt-plan <next-phase>`

6. If all phases are complete:
→ Next action: `/hunt-publish`

**Directory-first routes**

1. If HUNTMAP has phases but no phase directories exist on disk:
→ Next action: `/hunt-shape-hypothesis <first-phase>`

2. If the current phase directory exists but has neither CONTEXT.md nor RESEARCH.md:
→ Next action: `/hunt-shape-hypothesis <current-phase>`

3. If the current phase has CONTEXT.md (or RESEARCH.md) but no PLAN.md files:
→ Next action: `/hunt-plan <current-phase>`

4. If plans exist but not all have matching summaries:
→ Next action: `/hunt-run <current-phase>`

5. If all plans in the current phase have summaries:
→ Next action: `/hunt-validate-findings <current-phase>`

6. If the current phase is complete and the next phase exists:
→ Next action: `/hunt-shape-hypothesis <next-phase>`

7. If all phases are complete:
→ Next action: `/thrunt-complete-milestone`
</step>

<step name="show_and_execute">
Display the determination:

```
## Workflow Next

**Mode:** [HUNT or THRUNT]
**Planning Docs:** [{mission_source}] / [{huntmap_source}]
**Current:** Phase [N] — [name] | [progress or status]
**Status:** [status description]

▶ **Next step:** `/hunt:[command]` or `/thrunt:[command]`
  [One-line explanation of why this is the next step]
```

Then immediately invoke the determined command via SlashCommand.
Do not ask for confirmation — the whole point of `/thrunt-next` is zero-friction advancement.
</step>

</process>

<success_criteria>
- [ ] Project state correctly detected
- [ ] Next action correctly determined from hunt or THRUNT routing rules
- [ ] Command invoked immediately without user confirmation
- [ ] Clear status shown before invoking
</success_criteria>
