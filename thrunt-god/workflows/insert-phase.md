<purpose>
Insert a decimal phase for urgent work discovered mid-milestone between existing integer phases. Uses decimal numbering (72.1, 72.2, etc.) to preserve the logical sequence of planned phases while accommodating urgent insertions without renumbering the entire huntmap.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

<step name="parse_arguments">
Parse the command arguments:
- First argument: integer phase number to insert after
- Remaining arguments: phase description

Example: `/thrunt:insert-phase 72 Fix critical auth bug`
-> after = 72
-> description = "Fix critical auth bug"

If arguments missing:

```
ERROR: Both phase number and description required
Usage: /thrunt:insert-phase <after> <description>
Example: /thrunt:insert-phase 72 Fix critical auth bug
```

Exit.

Validate first argument is an integer.
</step>

<step name="init_context">
Load phase operation context:

```bash
INIT=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" init phase-op "${after_phase}")
if [[ "$INIT" == @file:* ]]; then INIT=$(cat "${INIT#@file:}"); fi
```

Check `huntmap_exists` from init JSON. If false:
```
ERROR: No huntmap found (.planning/HUNTMAP.md)
```
Exit.
</step>

<step name="insert_phase">
**Delegate the phase insertion to thrunt-tools:**

```bash
RESULT=$(node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" phase insert "${after_phase}" "${description}")
```

The CLI handles:
- Verifying target phase exists in HUNTMAP.md
- Calculating next decimal phase number (checking existing decimals on disk)
- Generating slug from description
- Creating the phase directory (`.planning/phases/{N.M}-{slug}/`)
- Inserting the phase entry into HUNTMAP.md after the target phase with (INSERTED) marker

Extract from result: `phase_number`, `after_phase`, `name`, `slug`, `directory`.
</step>

<step name="update_project_state">
Update STATE.md to reflect the inserted phase:

1. Read `.planning/STATE.md`
2. Under "## Accumulated Context" → "### Huntmap Evolution" add entry:
   ```
   - Phase {decimal_phase} inserted after Phase {after_phase}: {description} (URGENT)
   ```

If "Huntmap Evolution" section doesn't exist, create it.
</step>

<step name="completion">
Present completion summary:

```
Phase {decimal_phase} inserted after Phase {after_phase}:
- Description: {description}
- Directory: .planning/phases/{decimal-phase}-{slug}/
- Status: Not planned yet
- Marker: (INSERTED) - indicates urgent work

Huntmap updated: .planning/HUNTMAP.md
Project state updated: .planning/STATE.md

---

## Next Up

**Phase {decimal_phase}: {description}** -- urgent insertion

`/hunt:plan {decimal_phase}`

<sub>`/clear` first -> fresh context window</sub>

---

**Also available:**
- Review insertion impact: Check if Phase {next_integer} dependencies still make sense
- Review huntmap

---
```
</step>

</process>

<anti_patterns>

- Don't use this for planned work at end of milestone (use /thrunt:add-phase)
- Don't insert before Phase 1 (decimal 0.1 makes no sense)
- Don't renumber existing phases
- Don't modify the target phase content
- Don't create plans yet (that's /hunt:plan)
- Don't commit changes (user decides when to commit)
</anti_patterns>

<success_criteria>
Phase insertion is complete when:

- [ ] `thrunt-tools phase insert` executed successfully
- [ ] Phase directory created
- [ ] Huntmap updated with new phase entry (includes "(INSERTED)" marker)
- [ ] STATE.md updated with huntmap evolution note
- [ ] User informed of next steps and dependency implications
</success_criteria>
