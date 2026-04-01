# Hunt State Template

Template for `.planning/STATE.md`.

<template>

```markdown
# Hunt State

## Mission Reference

See: .planning/MISSION.md (updated [date])

**Active signal:** [one line]
**Current focus:** [current phase]

## Current Position

Phase: [X] of [Y] ([Phase name])
Plan: [A] of [B] in current phase
Status: [Ready to plan | Planning | Ready to execute | In progress | Awaiting validation | Ready to publish]
Last activity: [YYYY-MM-DD] - [what happened]

Progress: [░░░░░░░░░░] 0%

## Hunt Context

### Current Scope

- [time window]
- [entities]
- [tenants]

### Data Sources In Play

- [EDR]
- [SIEM]
- [identity]

### Confidence

[Current confidence with one-sentence reason]

### Blockers

- [active blocker]

## Session Continuity

Last session: [YYYY-MM-DD HH:MM]
Stopped at: [last completed action]
Resume file: [path or None]
```

</template>

<guidelines>

- Unknown state details should remain `TBD`; do not backfill fake progress or data sources.
- Keep this short and current.
- Preserve the `Current Position` field names because THRUNT state tooling reads them directly.
- Confidence should move as evidence moves.

</guidelines>
