<purpose>
Initialize THRUNT in either program mode or case mode. Write the hunt artifacts directly.
</purpose>

<required_reading>
Read all files referenced by the invoking prompt's execution_context before starting.
</required_reading>

<process>

## 1. Determine Mode

Use the invoking prompt to determine whether you are in program mode or case mode.

- `hunt:new-program` -> long-lived program context, reusable environment knowledge
- `hunt:new-case` -> one signal or investigation thread with a narrow outcome

If the workspace already contains hunt artifacts, do not overwrite them blindly. Ask whether to extend the current program/case or reset it.

## 2. Gather Minimum Context

Ask only for missing facts. Prefer inline follow-up questions over large questionnaires.

Collect:

- Name of the program or case
- Triggering signal, lead, or goal
- Time window
- Priority entities, tenants, users, hosts, or identities
- Available data sources
- Constraints: retention, access, legal, operational
- Desired output: case report, escalation, detection, leadership summary

If `--auto` is present, use the supplied brief as the primary source of truth and ask only where ambiguity would materially change the hunt.

If `--pack <id>` is present:

- inspect the pack first with `node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" pack bootstrap <id> ...`
- use the pack bootstrap output as the default mission, hypothesis, success-criteria, and phase seed structure
- ask only for missing pack parameters or signal-specific overrides before writing the case artifacts

## 3. Create Directory Layout

Create these paths if they do not exist:

- `.planning/`
- `.planning/QUERIES/`
- `.planning/RECEIPTS/`
- `.planning/environment/`
- `.planning/published/`

## 4. Write Hunt-Native Files

Write or update:

- `.planning/MISSION.md`
- `.planning/HYPOTHESES.md`
- `.planning/SUCCESS_CRITERIA.md`
- `.planning/HUNTMAP.md`
- `.planning/STATE.md`
- `CLAUDE.md`

| Purpose | Artifact |
| --- | --- |
| Project guide  | `CLAUDE.md` |

Generate `CLAUDE.md` before the final commit:

```bash
node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" generate-claude-md
```

Program mode defaults:

- Focus on reusable environment context, telemetry inventory, and repeatable hunt loops
- Make Phase 1 about baseline/environment mapping if that knowledge is missing

Case mode defaults:

- Focus on the active signal
- Default hunt phases:
  1. Signal Intake
  2. Hypothesis Shaping
  3. Swarm Execution
  4. Evidence Correlation
  5. Publish

Pack-backed case mode defaults:

- Let the selected pack seed the case title, hypotheses, success criteria, and default phase structure
- Preserve the pack id and provided parameters in `MISSION.md` and `STATE.md` so later `/hunt:run` phases can re-materialize the same pack intent

## 5. Initialize State

`STATE.md` should remain hunt-native and keep these fields as the canonical state headers:

- `## Current Position`
- `Phase:`
- `Plan:`
- `Status:`
- `Last activity:`
- `Progress:`

Also include hunt-specific sections for:

- Active signal
- Current scope
- Data sources in play
- Current confidence
- Open blockers

## 6. Close Out

Summarize:

- What was created
- What remains ambiguous
- The next best command

Program mode next steps:

- `/hunt:map-environment`
- `/hunt:new-case`

Case mode next steps:

- `/hunt:shape-hypothesis`
- `/hunt:plan 1`

When committing the bootstrap, include:

```text
--files .planning/HUNTMAP.md .planning/STATE.md .planning/HYPOTHESES.md CLAUDE.md
```

</process>
