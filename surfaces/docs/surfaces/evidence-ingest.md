# Evidence Ingest

Phase two could write browser-captured evidence, but THRUNT did not consume it. Phase three extends existing THRUNT audit logic so captured evidence becomes visible debt instead of sidecar residue.

## Real Working Behavior

- Captured evidence is written into the scoped active-case directory:
  - `.planning/cases/<slug>/EVIDENCE/` when an active case exists
  - root `.planning/EVIDENCE/` only when there is no active case context
- The bridge writes THRUNT-compatible markdown with frontmatter including:
  - `evidence_id`
  - `vendor_id`
  - `source_url`
  - `captured_at`
  - `captured_by`
  - `review_status`
  - `related_hypotheses`
- THRUNT audit ingest is extended in `thrunt-god/bin/lib/evidence.cjs`.
- `audit-evidence --raw` now scans captured `EVIDENCE/` artifacts in addition to phase `EVIDENCE_REVIEW.md` and `FINDINGS.md`.
- Captured evidence currently influences audit output in two concrete ways:
  - no linked hypothesis -> `unlinked_evidence`
  - `review_status: needs_follow_up` -> `follow_up`
- The surfaces artifact loader also projects captured evidence into the case view and surfaces evidence-driven blockers in the bridge UI.

## Fixture-Backed Behavior

- Evidence ingest is verified in:
  - `tests/evidence.test.cjs`
  - `surfaces/apps/surface-bridge/test/bridge.test.ts`
- The bridge golden-path test proves:
  - extension-style evidence write
  - later `audit-evidence` consumption
  - blocker/follow-up visibility

## Remaining Mocked Or Blocked

- Captured browser evidence is not automatically transformed into `QUERIES/` or `RECEIPTS/`.
- Hypothesis linkage is still operator-assisted. Unlinked evidence becomes visible follow-up debt instead of being auto-correlated.
- No separate evidence database or new workflow engine was added.

## Operational Meaning

- Browser capture now feeds existing THRUNT review logic.
- Analysts can use `audit-evidence --raw` to find captured evidence that still needs correlation or follow-up.
- The bridge and extension now show recent captured evidence alongside queries and receipts, so browser-origin evidence is part of the same case state loop.
