# Mission Template

Template for `.planning/MISSION.md` - the source-of-truth description of the hunt program or case.

<template>

```markdown
# Mission: [Program or Case Name]

**Mode:** [program | case]
**Opened:** [date]
**Owner:** [team or analyst]
**Status:** [Active | Parked | Closed]

## Signal

[What triggered this effort: detection, telemetry anomaly, intel lead, leadership request, analyst suspicion]

## Desired Outcome

[What useful end-state looks like. Example: confirm or disprove compromised identities tied to impossible-travel alerts.]

## Scope

- **Time window:** [start - end]
- **Entities:** [users, hosts, apps, mailboxes, tenants, subscriptions]
- **Environment:** [production, corp, cloud accounts, business unit]
- **Priority surfaces:** [EDR, SIEM, identity, cloud, email, network]

## Operating Constraints

- **Access:** [what can and cannot be queried]
- **Retention:** [known retention limits]
- **Legal / privacy:** [constraints that shape collection]
- **Operational:** [business impact, timing, staffing]

## Working Theory

[Current framing of the threat or operational question. Short and explicit.]

## Success Definition

[What counts as a useful answer even if the result is benign or inconclusive.]

## Key Decisions

| Decision | Reason | Date |
|----------|--------|------|
| [Choice] | [Why] | [YYYY-MM-DD] |

---
*Last updated: [date] after [trigger]*
```

</template>

<guidelines>

- Unknown facts should remain `TBD`; do not invent a mission narrative to make the file feel complete.
- Use precise analyst language, not product language.
- Keep the signal and desired outcome separate.
- Scope should reflect what is actually in play, not every possible pivot.
- Constraints belong here because they shape what "good evidence" means.
- When the working theory changes materially, update this file.

</guidelines>
