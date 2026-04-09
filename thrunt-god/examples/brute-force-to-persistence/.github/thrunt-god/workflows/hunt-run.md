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
If the requested phase has no `PLAN.md` files, stop and tell the operator to run `/hunt-plan <phase>` first instead of hanging or improvising execution.

Every material telemetry action should be representable as a shared runtime `QuerySpec`.
Backend-specific request shapes belong inside connector adapters, not in the workflow narrative.
When a connector-backed execution path is needed, hand off through `thrunt-tools runtime execute` rather than inventing ad hoc request code in the workflow.
When the phase is driven by a selected hunt pack, use `thrunt-tools pack render-targets <id>` to inspect the generated `QuerySpec` set and `thrunt-tools runtime execute --pack <id>` to execute it through the shared runtime contract.

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
- Include the runtime metadata that produced the query: connector id, dataset, execution profile, pagination mode, and result status

For each material claim or evidence item:

- Create a receipt in `.planning/RECEIPTS/`
- Record identifiers, timestamps, source, claim, confidence, and chain-of-custody details
- Include the runtime metadata needed to reconstruct or audit the execution later
- Keep query and receipt cross-references exact: every `related_receipts` entry in a query log must match a real receipt ID written in this run, and every receipt `related_queries` entry must point back to the real query log ID that produced it

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
- `.planning/HYPOTHESES.md` whenever a hypothesis is confirmed, disproved, or left inconclusive so confidence and status do not stay stale
- `.planning/HUNTMAP.md` when phase or plan completion changes; it remains the source of truth and must reflect the real completed state before close-out
- when updating `.planning/HUNTMAP.md`, keep all three representations in sync: the phase checkbox list, the specific plan checklist entry or entries, and the `## Progress` table row for the executed phase

## 6. Close Out

State:

- What evidence was collected
- Which hypotheses moved materially
- Whether the next command is another `/hunt-run`, `/hunt-validate-findings`, or a return to `/hunt-shape-hypothesis`

<step name="handle_partial_wave_execution">
If `WAVE_FILTER` was used and other waves remain:

- Do NOT run phase verification
- Do NOT mark the phase complete
- Record what finished in `SUMMARY.md` and `STATE.md`
- Tell the operator to continue with the next wave or rerun `/hunt-run <phase>`
</step>

</process>
