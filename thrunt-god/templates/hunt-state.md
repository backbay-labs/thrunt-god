# Hunt State Template

Template for `.planning/STATE.md`.

<template>

```markdown
# Hunt State

## Mission Reference

See: .planning/MISSION.md (updated TBD)

**Active signal:** TBD
**Current focus:** TBD

## Current Position

Phase: TBD
Plan: TBD
Status: TBD
Last activity: TBD

Progress: [░░░░░░░░░░] 0%

## Hunt Context

### Current Scope

- TBD

### Data Sources In Play

- TBD

### Confidence

TBD

### Blockers

- TBD

## Session Continuity

Last session: TBD
Stopped at: TBD
Resume file: TBD
```

</template>

<guidelines>

- Bootstrap should replace the mission reference date, active signal, current focus, phase, plan, status, and last activity whenever those facts are already known from the prompt and selected mode.
- Unknown state details should remain `TBD`; do not backfill fake progress or data sources.
- Keep this short and current.
- Preserve the `Current Position` field names because THRUNT state tooling reads them directly.
- Confidence should move as evidence moves.

</guidelines>
