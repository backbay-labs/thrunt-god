# Receipt Template

Template for files in `.planning/RECEIPTS/`.

<template>

```markdown
---
receipt_id: RCT-[timestamp-or-seq]
created_at: [ISO timestamp]
source: [system or dataset]
claim_status: [supports | disproves | context]
related_hypotheses:
  - [HYP-01]
related_queries:
  - [QRY-...]
---

# Receipt: [Short title]

## Claim

[Specific claim this receipt supports, disproves, or contextualizes]

## Evidence

[Observable facts only]

## Chain Of Custody

- **Collected by:** [who]
- **Collection path:** [how]
- **Identifiers:** [event ids, hashes, object ids]
- **Time observed:** [timestamp or range]

## Confidence

[Low | Medium | High] - [why]

## Notes

[Important caveats or limitations]
```

</template>
