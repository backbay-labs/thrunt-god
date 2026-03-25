<purpose>
Add a new integer phase to the end of the current milestone in the huntmap. Automatically calculates next phase number, creates phase directory, and updates huntmap structure.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="parse_arguments">
Parse the command arguments:
- All arguments become the phase description
- Example: `/thrunt:add-phase Add authentication` → description = "Add authentication"
- Example: `/thrunt:add-phase Fix critical performance issues` → description = "Fix critical performance issues"

If no arguments provided:

```
ERROR: Phase description required
Usage: /thrunt:add-phase <description>
Example: /thrunt:add-phase Add authentication system
```

Exit.
</step>

<step name="init_context">
Load phase operation context:

```bash
INIT=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" init phase-op "0")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Check `huntmap_exists` from init JSON. If false:
```
ERROR: No huntmap found (.planning/HUNTMAP.md)
Run /hunt:new-program to initialize.
```
Exit.
</step>

<step name="add_phase">
**Delegate the phase addition to thrunt-tools:**

```bash
RESULT=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" phase add "${description}")
```

The CLI handles:
- Finding the highest existing integer phase number
- Calculating next phase number (max + 1)
- Generating slug from description
- Creating the phase directory (`.planning/phases/{NN}-{slug}/`)
- Inserting the phase entry into HUNTMAP.md with Goal, Depends on, and Plans sections

Extract from result: `phase_number`, `padded`, `name`, `slug`, `directory`.
</step>

<step name="update_project_state">
Update STATE.md to reflect the new phase:

1. Read `.planning/STATE.md`
2. Under "## Accumulated Context" → "### Huntmap Evolution" add entry:
   ```
   - Phase {N} added: {description}
   ```

If "Huntmap Evolution" section doesn't exist, create it.
</step>

<step name="completion">
Present completion summary:

```
Phase {N} added to current milestone:
- Description: {description}
- Directory: .planning/phases/{phase-num}-{slug}/
- Status: Not planned yet

Huntmap updated: .planning/HUNTMAP.md

---

## ▶ Next Up

**Phase {N}: {description}**

`/hunt:plan {N}`

<sub>`/clear` first → fresh context window</sub>

---

**Also available:**
- `/thrunt:add-phase <description>` — add another phase
- Review huntmap

---
```
</step>

</process>

<success_criteria>
- [ ] `thrunt-tools phase add` executed successfully
- [ ] Phase directory created
- [ ] Huntmap updated with new phase entry
- [ ] STATE.md updated with huntmap evolution note
- [ ] User informed of next steps
</success_criteria>
