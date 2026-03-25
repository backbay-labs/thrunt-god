<purpose>
Display the THRUNT command reference. Output only the reference content.
</purpose>

<reference>
# THRUNT Command Reference

THRUNT is a threat-hunting orchestration system. Hunt execution lives under `/hunt:*`. Repo and runtime utilities live under `/thrunt:*`.

## Hunt Flow

1. `/hunt:new-program`
2. `/hunt:new-case`
3. `/hunt:map-environment`
4. `/hunt:shape-hypothesis [phase]`
5. `/hunt:plan [phase]`
6. `/hunt:run [phase]`
7. `/hunt:validate-findings [phase]`
8. `/hunt:publish [target]`

Optional `--wave N` flag executes only Wave `N` without closing the full phase.
Usage: `/hunt:run 5 --wave 2`

## Hunt Docs

- `MISSION.md`
- `HYPOTHESES.md`
- `SUCCESS_CRITERIA.md`
- `HUNTMAP.md`
- `STATE.md`
- `FINDINGS.md`
- `EVIDENCE_REVIEW.md`
- `QUERIES/`
- `RECEIPTS/`
- `environment/ENVIRONMENT.md`

## THRUNT Utilities

**`/thrunt:do`**
Route freeform intent to the best hunt or THRUNT command.

**`/thrunt:progress`**
Show current hunt status, phase progress, blockers, and next actions.

**`/thrunt:next`**
Infer the next useful command from current hunt state.

**`/thrunt:resume-work`**
Restore hunt context from `.planning/`.

**`/thrunt:manager`**
Produce a manager-oriented summary of mission, huntmap, active phase, and blockers.

**`/thrunt:settings`**
Adjust workflow defaults and model profiles.

**`/thrunt:set-profile`**
Switch the active model profile.

**`/thrunt:list-workspaces`**
List workspaces and current activation state.

**`/thrunt:new-workspace`**
Create a fresh workspace for another tenant, campaign, or investigation thread.

**`/thrunt:remove-workspace`**
Remove a workspace.

**`/thrunt:workstreams`**
Inspect or manage parallel workstreams under the same hunt program.

**`/thrunt:health`**
Validate `.planning/` integrity and repair safe issues.

**`/thrunt:stats`**
Render planning and execution statistics.

**`/thrunt:note`**
Capture a note into the planning system.

**`/thrunt:add-todo`**
Create a todo entry.

**`/thrunt:check-todos`**
List pending todos.

**`/thrunt:pause-work`**
Create a checkpoint and continuation handoff.

**`/thrunt:audit-evidence`**
Audit unresolved evidence review and findings debt across phases.

**`/thrunt:debug`**
Run the structured debugging workflow.

## Installer

```bash
npx thrunt-god@latest
```

After install:

- Claude / Gemini: `/hunt:help`
- OpenCode: `/hunt-help`
- Codex: `$hunt-help`
- Copilot: `/hunt-help`
- Cursor / Windsurf: `hunt-help`
</reference>
