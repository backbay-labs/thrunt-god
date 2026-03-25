# Query Log Template

Template for files in `.planning/QUERIES/`.

<template>

```markdown
---
query_id: QRY-[timestamp-or-seq]
source: [EDR | SIEM | Identity | Cloud | Email | Other]
executed_at: [ISO timestamp]
author: [analyst or agent]
related_hypotheses:
  - [HYP-01]
---

# Query Log: [Short title]

## Intent

[Why this query exists]

## Query Or Procedure

~~~text
[Exact query, API call, or step sequence]
~~~

## Parameters

- **Time window:** [range]
- **Entities:** [list]
- **Filters:** [list]

## Result Summary

[High-signal result, not narrative padding]

## Related Receipts

- [RCT-...]

## Notes

[Caveats, partial failures, or follow-up pivots]
```

</template>
