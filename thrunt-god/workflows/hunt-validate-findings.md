<purpose>
Validate the hunt output against evidence, contradictory evidence, and the stated success criteria. This is where unsupported narrative gets removed.
</purpose>

<required_reading>
Read:

- `.planning/FINDINGS.md` if it exists
- `.planning/EVIDENCE_REVIEW.md` if it exists
- `.planning/HYPOTHESES.md`
- `.planning/SUCCESS_CRITERIA.md`
- `.planning/QUERIES/`
- `.planning/RECEIPTS/`
- Relevant phase summaries
- `.planning/STATE.md`
</required_reading>

<process>

## 1. Test Each Hypothesis

For each active hypothesis, assign exactly one verdict:

- Supported
- Disproved
- Inconclusive

Each verdict must include:

- Receipt IDs
- Counter-evidence if any
- Current confidence
- What would change the verdict

## 2. Write `.planning/FINDINGS.md`

Use the template. Keep it decision-useful:

- Executive summary
- Per-hypothesis findings
- Impacted scope
- Confidence
- Remaining gaps
- Recommended action

## 3. Write `.planning/EVIDENCE_REVIEW.md`

Use the template to assess:

- Receipt completeness
- Chain of custody
- Contradictory evidence
- Blind spots
- Whether the hunt is publishable

## 4. Sync State

Update:

- `.planning/STATE.md`

## 5. Close Out

State one of:

- Ready to publish
- Needs more collection
- Needs hypothesis reshaping

</process>
