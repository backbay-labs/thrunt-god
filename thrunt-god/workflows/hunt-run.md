<purpose>
Execute hunt plans, parallelize where appropriate, and record exact investigative work in query logs and receipts.
</purpose>

<required_reading>
Read:

- The target phase from `.planning/HUNTMAP.md`
- The phase directory contents
- `.planning/HYPOTHESES.md`
- `.planning/SUCCESS_CRITERIA.md`
- `.planning/STATE.md`
- Relevant environment mapping
</required_reading>

<process>

If Task is unavailable in the active runtime, fall back to sequential inline execution and verify completion with spot-checks before moving on.

## 1. Read the Plans Before Acting

Do not start hunting from memory.
Read the phase `CONTEXT.md` and each `PLAN.md` file.

## 1a. Parse Active Flags

Optional `--wave N` restricts execution to a single wave.
Set `WAVE_FILTER` from `$ARGUMENTS` when present. Leave it empty otherwise.

## 1b. Wave safety check

If `WAVE_FILTER` targets a later wave while earlier waves remain incomplete, stop and tell the operator to finish earlier waves first.

## 2. Parallelize Intelligently

If tasks are independent, split by telemetry domain or pivot family and run them in parallel.

Good parallel cuts:

- EDR vs identity vs cloud vs email
- Distinct tenants
- Distinct hypotheses with no shared blocker

Do not parallelize if the next step depends on a prior result.

## 3. Log Every Material Action

For each meaningful query or search:

- Create or update a file in `.planning/QUERIES/`
- Record intent, target source, query text or procedure, time window, and observed result

For each material claim or evidence item:

- Create a receipt in `.planning/RECEIPTS/`
- Record identifiers, timestamps, source, claim, confidence, and chain-of-custody details

Never summarize a claim without a receipt.

## 4. Update Phase Summary

Create or refresh a phase `SUMMARY.md` covering:

- What was executed
- What was found
- Receipt IDs
- Contradictions
- New pivots
- Remaining blockers

## 5. Update Hunt State

Update:

- `.planning/STATE.md`
- `.planning/HYPOTHESES.md` if new theories emerge
- `.planning/HUNTMAP.md` if the phase is now complete; it remains the source of truth

## 6. Close Out

State:

- What evidence was collected
- Which hypotheses moved materially
- Whether the next command is another `/hunt:run`, `/hunt:validate-findings`, or a return to `/hunt:shape-hypothesis`

<step name="handle_partial_wave_execution">
If `WAVE_FILTER` was used and other waves remain:

- Do NOT run phase verification
- Do NOT mark the phase complete
- Record what finished in `SUMMARY.md` and `STATE.md`
- Tell the operator to continue with the next wave or rerun `/hunt:run <phase>`
</step>

</process>
