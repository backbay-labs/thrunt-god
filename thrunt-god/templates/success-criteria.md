# Success Criteria Template

Template for `.planning/SUCCESS_CRITERIA.md`.

<template>

```markdown
# Success Criteria: [Program or Case Name]

## Hunt Quality Gates

- Every material claim cites a receipt or query log
- Contradictory evidence is called out explicitly
- Scope boundaries are recorded
- Confidence is stated for each conclusion

## Exit Conditions

### Confirmed Malicious Activity

- [Observable condition]
- [Observable condition]

### Benign / False Positive

- [Observable condition]
- [Observable condition]

### Inconclusive But Actionable

- [What is known]
- [What remains unknown]
- [What follow-up is recommended]

## Publish Gates

- [What must exist before the case is published]
- [What must exist before a detection is promoted]
- [What must exist before an escalation is sent]

## Non-Goals

- [What this hunt is explicitly not trying to answer]
```

</template>

<guidelines>

- Unknown gates should remain `TBD`; do not simulate exit conditions.
- Define what a useful answer looks like even when the result is negative.
- Publish gates should reflect evidence quality, not perfection.
- Non-goals prevent the hunt from drifting into a general forensic engagement.

</guidelines>
