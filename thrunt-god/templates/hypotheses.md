# Hypotheses Template

Template for `.planning/HYPOTHESES.md`.

<template>

```markdown
# Hypotheses: [Program or Case Name]

## Active Hypotheses

### HYP-01: [Short statement]

- **Signal:** [what suggested this]
- **Assertion:** [what would have to be true]
- **Priority:** [Critical | High | Medium | Low]
- **Scope:** [time window, entities, tenants]
- **Data sources:** [which telemetry can confirm or disprove]
- **Evidence needed:** [what supporting evidence should exist]
- **Disproof condition:** [what would make this false]
- **Confidence:** [Low | Medium | High]
- **Status:** [Open | In progress | Supported | Disproved | Inconclusive]

## Parked Hypotheses

- [Hypothesis parked because ...]

## Disproved Hypotheses

- **HYP-0X:** [statement] - disproved by [receipt or query id]

## Notes

[Cross-hypothesis relationships, competing explanations, or confidence caveats]
```

</template>

<guidelines>

- One hypothesis per materially distinct theory.
- A hypothesis must be falsifiable.
- Confidence is about current evidence, not how plausible the story feels.
- "Inconclusive" is acceptable when data is missing or retention is gone.

</guidelines>
