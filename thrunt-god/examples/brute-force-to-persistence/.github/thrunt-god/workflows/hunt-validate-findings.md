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
- `.github/thrunt-god/references/anomaly-framing.md` (sequential prediction pattern)
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

## 2. Sequential Evidence Integrity

When findings reference entity behavior over time, verify the sequential reasoning chain is complete:

1. **Entity timelines exist** -- For each entity mentioned in a material finding, confirm a chronological event timeline was constructed in QUERIES/ (see anomaly-framing.md Step 1). If no timeline exists, the finding lacks foundational evidence.

2. **Baselines documented** -- For each entity with a material claim, confirm a baseline section documents normal behavior (typical locations, hours, devices, applications). A claim of "anomalous" without a documented "normal" is unsupported narrative.

3. **Predictions documented** -- For each deviation claim, confirm the analyst documented what they expected BEFORE observing the actual event. Findings that connect events retroactively without prediction are post-hoc rationalization (see Common Mistakes in anomaly-framing.md).

4. **Deviation scores present** -- For each material anomaly, confirm a composite score exists with explicit increase/decrease factors. Scores must reference the baseline and use the five-category rubric (EXPECTED_BENIGN, AMBIGUOUS, NOVEL_ANOMALY, TEMPORAL_ANOMALY, EXPECTED_MALICIOUS).

5. **Score-verdict consistency** -- A hypothesis marked "Supported" should have at least one deviation score >= 4 (HIGH). A hypothesis marked "Disproved" should show deviation scores <= 1. Flag mismatches for review.

If a finding claims anomalous behavior but lacks ANY of: (a) documented baseline, (b) explicit prediction, (c) scored deviation -- mark it as **incomplete evidence** in the Evidence Quality Checks table.

## 3. Write `.planning/FINDINGS.md`

Use the template. Keep it decision-useful:

- Executive summary
- Per-hypothesis findings
- Impacted scope
- Confidence
- Remaining gaps
- Recommended action

## 4. Write `.planning/EVIDENCE_REVIEW.md`

Use the template to assess:

- Receipt completeness
- Chain of custody
- Contradictory evidence
- Blind spots
- Whether the hunt is publishable

## 5. Sync State

Update:

- `.planning/STATE.md`

## 6. Close Out

State one of:

- Ready to publish
- Needs more collection
- Needs hypothesis reshaping

</process>
