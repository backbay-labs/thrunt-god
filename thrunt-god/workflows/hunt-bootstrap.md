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

Bootstrap should default to honest scaffolding:

- Ask only for the minimum naming/context needed to label the artifacts
- If the name and high-level goal are already supplied, do not ask additional follow-up questions before writing the bootstrap docs
- Replace bootstrap-known fields immediately: program or case name, mode, opened date, active signal or goal, current phase label, initial plan, and initial status
- Scaffold the hunt docs without filling in unknown environment facts
- Use `TBD` for missing tenants, tools, query paths, retention windows, entities, owners, and constraints
- Do not simulate example telemetry, example detections, example query logs, or example receipts
- Do not leave bracketed template placeholders in the generated files; replace every unknown with `TBD`
- Keep the environment-mapping phase present but not started

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

Create `.planning/config.json` before the document set if it does not already exist:

- use `node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" config-new-program '{"mode":"interactive"}'` for normal bootstrap
- use `node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" config-new-program '{"mode":"yolo"}'` when `--auto` is present
- do not overwrite an existing config; preserve operator connector profiles and workflow choices
- never hand-write `.planning/config.json` or replace it with an ad hoc environment summary
- keep `.planning/config.json` in THRUNT schema only; record human-readable connector notes, endpoint status, and environment commentary in `ENVIRONMENT.md`
- if you need to add or update connector profiles, use `node "$HOME/.claude/thrunt-god/bin/thrunt-tools.cjs" config-set connector_profiles.<connector>.<profile> '<json>'` instead of editing JSON by hand
- use built-in connector ids exactly as registered by the runtime, for example `splunk` and `elastic`; do not substitute `elasticsearch`
- connector profiles must use the canonical runtime field `base_url`; do not write `endpoint` as a substitute key
- only configure connector profiles when the auth type and secret reference names are confirmed from user input or workspace evidence
- `secret_refs` must be an object keyed by the confirmed connector secret names, and each entry must use the THRUNT reference shape `{ "type": "env", "value": "ENV_VAR_NAME" }`; do not write raw strings such as `"secret_refs":{"authorization":"TOKEN"}`
- never invent placeholder env vars, placeholder tokens, placeholder usernames, or placeholder secret refs such as `*_UNSET`
- if a connector is blocked or auth is unknown, record the blocker in `ENVIRONMENT.md` and omit the unusable connector profile from `.planning/config.json`

Write or update in this exact order so the blank environment scaffold and state
exist even if later formatting or summary work changes:

- `.planning/config.json`
- `.planning/environment/ENVIRONMENT.md`
- `.planning/STATE.md`
- `.planning/MISSION.md`
- `.planning/HYPOTHESES.md`
- `.planning/SUCCESS_CRITERIA.md`
- `.planning/HUNTMAP.md`

Do not generate or update `CLAUDE.md` during hunt bootstrap. The bootstrap must
complete using hunt-native artifacts only and must not depend on optional
profile-generation steps.

Program mode defaults:

- Focus on reusable environment context, telemetry inventory, tool access, and repeatable hunt loops
- Start with `.planning/environment/ENVIRONMENT.md` and capture the operator toolchain before creating later hunt phases
- Use an environment-first huntmap:
  1. Environment Mapping
  2. Tool & Access Validation
  3. Hypothesis Library
  4. Pilot Hunts
  5. Publish Cadence
- Create `.planning/QUERIES/` and `.planning/RECEIPTS/` as empty directories only during bootstrap
- Do not create query-log or receipt files during bootstrap
- Do not invent sample query logs, sample receipts, or mark any phase/plan complete during bootstrap
- Do not invent or simulate environment details. Unknown values must remain `TBD` until the operator confirms them.
- Write the full bootstrap artifact set, including `STATE.md` and `environment/ENVIRONMENT.md`, before any optional wrap-up work
- Ensure `.planning/config.json` exists before closing out so later runtime, settings, and connector commands work without manual recovery
- The bootstrap is not complete if `.planning/config.json` is not valid THRUNT config produced via `thrunt-tools`

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

When facts are still unknown, keep the scaffold honest:

- `MISSION.md`, `HYPOTHESES.md`, `SUCCESS_CRITERIA.md`, and `STATE.md` may contain `TBD` placeholders
- `ENVIRONMENT.md` should stay scaffold-only rather than being populated with guessed products or invented retention windows
- Open questions should be surfaced explicitly instead of being answered by inference
- Do not leave bootstrap-known fields as `TBD` after writing the files

Program mode initial state defaults:

- `MISSION.md` title should use the confirmed program name
- `STATE.md` should start at `Phase: 1 of 5 (Environment Mapping)`
- `STATE.md` should start at `Plan: 1 of 1 in current phase`
- `STATE.md` should start at `Status: Ready to plan`

Case mode initial state defaults:

- `MISSION.md` title should use the confirmed case name or signal label
- `STATE.md` should start at `Phase: 1 of 5 (Signal Intake)`
- `STATE.md` should start at `Plan: 1 of 1 in current phase`
- `STATE.md` should start at `Status: Ready to plan`

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
--files .planning/MISSION.md .planning/HUNTMAP.md .planning/STATE.md .planning/HYPOTHESES.md .planning/SUCCESS_CRITERIA.md .planning/environment/ENVIRONMENT.md
```

</process>
