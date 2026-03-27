---
candidate_id: DET-[timestamp-or-seq]
source_finding_id: [F-XXX]
technique_ids:
  - [T1XXX]
target_format: [sigma | splunk_spl | elastic_eql | kql]
status: [draft | reviewed | promoted | rejected]
confidence: [low | medium | high]
promotion_readiness: [0.0 - 1.0]
created_at: [ISO timestamp]
author: [who]
---

# Detection Candidate: [Short title]

## Source Finding

[Link to finding + description of what was observed]

## Detection Logic

[Detection query or rule logic in target format]

## Evidence Chain

- **Receipt:** [RCT-...] -- [claim status]
- **Query:** [QRY-...] -- [what it searched for]

## ATT&CK Mapping

- [TXXXX: Technique Name]
- [TXXXX.XXX: Sub-technique Name]

## Promotion Notes

[Why this candidate is ready/not ready for promotion. Confidence reasoning.]

## False Positives

- [Known FP scenario]
