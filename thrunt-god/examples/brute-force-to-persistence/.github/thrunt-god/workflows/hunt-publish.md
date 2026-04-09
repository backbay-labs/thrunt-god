<purpose>
Turn validated hunt output into the smallest report that will drive action.
</purpose>

<required_reading>
Read:

- `.planning/FINDINGS.md`
- `.planning/EVIDENCE_REVIEW.md`
- `.planning/HYPOTHESES.md`
- `.planning/STATE.md`
- Relevant phase summaries and receipts
</required_reading>

<process>

## 1. Choose the Publish Target

If the target is not explicit, ask the user which of these they want:

- Case report
- Escalation
- Detection promotion
- Leaderpublish summary

## 2. Write the Publish Artifact

Create a file in `.planning/published/` named with date and slug.

All publish artifacts must include:

- Situation summary
- Scope and confidence
- Evidence references
- What action is requested
- What remains unknown

Detection promotion artifacts must also include:

- Detection logic or pseudocode
- Required fields and data sources
- Tuning notes
- Likely false positives

Escalations must also include:

- Why now
- Impacted entities
- Suggested containment or owner

## 3. Update State

Update `.planning/STATE.md` with the publish decision and next action.

## 4. Close Out

Name:

- The artifact path
- The requested action
- The next hunt, if one follows immediately

</process>
