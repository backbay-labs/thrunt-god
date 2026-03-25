# Environment Map Template

Template for `.planning/environment/ENVIRONMENT.md`.

<template>

```markdown
# Environment Map

## Scope

- **Program / case:** [name]
- **Covered tenants:** [list]
- **Excluded areas:** [list]

## Telemetry Surfaces

| Surface | System | Retention | Query Path | Notes |
|---------|--------|-----------|------------|-------|
| Endpoint | [EDR] | [days] | [how to query] | [blind spots / caveats] |
| Identity | [IdP] | [days] | [how to query] | [blind spots / caveats] |
| Cloud | [AWS/Azure/GCP] | [days] | [how to query] | [blind spots / caveats] |
| Email | [provider] | [days] | [how to query] | [blind spots / caveats] |

## Key Entities And Pivots

- **User identifiers:** [UPN, SID, email, employee ID]
- **Host identifiers:** [hostname, sensor ID, asset ID]
- **Cloud identifiers:** [account ID, subscription ID, project ID]
- **Message identifiers:** [internet message ID, message trace ID]

## Known Blind Spots

- [blind spot]
- [blind spot]

## Escalation Boundaries

- **IR / SOC owner:** [team]
- **Cloud owner:** [team]
- **Identity owner:** [team]
- **Legal / privacy:** [team]

## Notes

[Anything that affects hunt execution quality]
```

</template>
