# Query Log Template

Template for files in `.planning/QUERIES/`.

<template>

```markdown
---
query_id: QRY-[timestamp-or-seq]
query_spec_version: "1.0"
source: [EDR | SIEM | Identity | Cloud | Email | Other]
connector_id: [splunk | elastic | sentinel | okta | m365 | crowdstrike | aws | gcp | other]
dataset: [events | alerts | identity | endpoint | cloud | email | entities | other]
executed_at: [ISO timestamp]
author: [analyst or agent]
related_hypotheses:
  - [HYP-01]
related_receipts:
  - [RCT-...]
content_hash: sha256:[hex digest of this document]
manifest_id: [MAN-... ID of the manifest linking this query log]
---
<!-- related_receipts, content_hash, and manifest_id are auto-populated by the runtime and used for evidence integrity (Phase 14). -->

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

## Runtime Metadata

- **Profile:** [default | named profile]
- **Pagination:** [mode, limit, cursor/page if relevant]
- **Execution hints:** [timeout, consistency, dry-run, priority]
- **Result status:** [ok | partial | error | empty]
- **Warnings:** [count or summary]
- **Errors:** [count or summary]

## Result Summary

[High-signal result, not narrative padding]

## Related Receipts

- [RCT-...]

## Notes

[Caveats, partial failures, or follow-up pivots]
```

</template>
