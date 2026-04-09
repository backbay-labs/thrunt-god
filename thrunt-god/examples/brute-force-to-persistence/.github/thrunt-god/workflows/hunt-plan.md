<purpose>
Plan a hunt phase with exact telemetry tasks, receipts, and completion conditions.
</purpose>

<required_reading>
Read:

- `.planning/HUNTMAP.md`
- `.planning/HYPOTHESES.md`
- `.planning/SUCCESS_CRITERIA.md`
- `.planning/STATE.md`
- `.planning/environment/ENVIRONMENT.md` if present
- Existing phase artifacts if the phase already has a directory
</required_reading>

<process>

## 1. Resolve the Phase

Use the phase argument to find the matching phase in `HUNTMAP.md`.
If the phase does not exist, stop and say so.

## 2. Create or Reuse a Phase Directory

Use the existing phase directory convention:

- `.planning/phases/[phase-number]-[slug]/`

Within it, create:

- `CONTEXT.md`
- One or more `PLAN.md` files with numeric prefixes

## 3. Write Phase Context

`CONTEXT.md` must capture:

- Hypotheses this phase advances
- Entities and time windows
- Telemetry sources in scope
- Known blind spots
- Receipts that must exist before the phase is considered done

## 4. Split Into Executable Plans

Create 1-4 plans. Split by telemetry domain, pivot path, or analytic objective.

Each plan must specify:

- Objective
- Data source owner
- Exact query or analysis tasks
- Expected outputs
- Receipt IDs or receipt types to produce
- Stop conditions

## 5. Sync State

Update:

- `.planning/STATE.md`
- `.planning/HUNTMAP.md` if the plan count changed; it remains the source of truth

## 6. Close Out

Show:

- Phase planned
- Plan files created
- What `/hunt-run <phase>` will do

</process>
