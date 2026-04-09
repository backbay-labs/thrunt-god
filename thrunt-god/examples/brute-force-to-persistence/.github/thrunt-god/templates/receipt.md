# Receipt Template

Template for files in `.planning/RECEIPTS/`.

<template>

```markdown
---
receipt_id: RCT-[timestamp-or-seq]
query_spec_version: "1.0"
created_at: [ISO timestamp]
source: [system or dataset]
connector_id: [splunk | elastic | sentinel | okta | m365 | crowdstrike | aws | gcp | other]
dataset: [events | alerts | identity | endpoint | cloud | email | entities | other]
result_status: [ok | partial | error | empty]
claim_status: [supports | disproves | context]
related_hypotheses:
  - [HYP-01]
related_queries:
  - [QRY-...]
content_hash: sha256:[hex digest of this document]
manifest_id: [MAN-... ID of the manifest linking this receipt]
---
<!-- content_hash and manifest_id are auto-populated by the runtime and used for evidence integrity (Phase 14). -->

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

## Runtime Metadata

- **Execution profile:** [default | named profile]
- **Time window:** [requested range]
- **Pagination:** [mode and pages fetched]
- **Warnings:** [runtime warnings]
- **Errors:** [runtime errors or none]

## Confidence

[Low | Medium | High] - [why]

## Notes

[Important caveats or limitations]
```

</template>
