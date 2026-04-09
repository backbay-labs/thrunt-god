<purpose>
Convert vague suspicion into explicit hunt hypotheses with clear proof, disproof, scope, and evidence requirements.
</purpose>

<required_reading>
Read:

- `.planning/MISSION.md`
- `.planning/HYPOTHESES.md`
- `.planning/SUCCESS_CRITERIA.md`
- `.planning/HUNTMAP.md`
- `.planning/STATE.md`
- `.planning/environment/ENVIRONMENT.md` if present
- Recent receipts or query logs if they exist
</required_reading>

<process>

## 1. Identify the Active Signal

Use the supplied argument if present. Otherwise take the active signal from `MISSION.md` or `STATE.md`.

If multiple signals compete for attention, ask the user which one to shape now.

## 2. Refine Into Hypotheses

Produce 1-5 hypotheses. Each hypothesis must include:

- `HYP-XX` ID
- Short statement
- What would have to be true
- Scope: time window, entities, tenants
- Data sources to check
- Evidence that would support it
- Evidence that would disprove it
- Confidence level
- Current status

Do not collapse materially different theories into one item.

## 3. Update Success Criteria

Translate the hypotheses into exit conditions:

- Confirmed malicious activity
- Benign or false positive
- Inconclusive with explicit gaps

## 4. Update Huntmap

Refine `HUNTMAP.md` so each phase now reflects the shaped hypotheses, expected telemetry, and receipts required.

If the phase order is wrong for the actual hunt, fix it.

## 5. Sync State

Refresh:

- `.planning/STATE.md`

If the shaping session materially changed scope or assumptions, write `DISCUSSION-LOG.md` as an audit trail only.

## 6. Close Out

State:

- Active hypotheses
- High-risk unknowns
- The best next command

If you created `DISCUSSION-LOG.md`, note that it is Audit trail only and does not replace `HYPOTHESES.md` or `HUNTMAP.md`.

</process>
