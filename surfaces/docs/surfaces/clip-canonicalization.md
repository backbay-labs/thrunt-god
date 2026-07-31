# Clip Canonicalization

## Real Working Behavior

- Browser captures no longer stop at generic evidence writes.
- The bridge now classifies each attachment as one of:
  - `query_candidate`
  - `receipt_candidate`
  - `plain_evidence`
  - `ambiguous`
- Canonicalization rules:
  - query clip with query text -> `QUERIES/`
  - result table with rows or explicit source-query context -> `RECEIPTS/`
  - entity clip with explicit source-query context, or strong structured entity-page context -> `RECEIPTS/`
  - manual note, page context, or insufficiently structured clip -> `EVIDENCE/`
- When a receipt clip includes source-query context and no canonical query exists yet, the bridge synthesizes the linked query artifact first and then writes the receipt.
- Evidence fallback artifacts now record:
  - classification
  - canonicalization reason
  - related hypotheses
  - related queries and receipts when known
- The case projection now surfaces recent canonical queries, recent canonical receipts, and recent non-canonical evidence separately in the operator shell.

## Fixture-Backed Behavior

- Bridge tests cover:
  - query clip -> `QUERIES/`
  - table clip -> `RECEIPTS/`
  - ambiguous entity clip -> `EVIDENCE/`
  - projection refresh after canonicalization
  - cross-link generation for synthesized source queries

## Live-Certified Behavior

- None yet in this repository.
- The canonicalization path is real and exercised in bridge and extension tests, but the repo does not yet contain checked-in live operator captures from real vendor sessions proving the same clip classifications against production consoles.

## Blocked / Not Yet Complete

- Screenshot metadata remains metadata only. There is no OCR or image-to-query/receipt conversion path in phase four.
- Canonicalization is intentionally conservative. Ambiguous clips stay in `EVIDENCE/` instead of forcing a potentially wrong query or receipt artifact.
- Browser clips still do not backfill every THRUNT artifact family. Phase four focuses on `QUERIES/`, `RECEIPTS/`, and `EVIDENCE/` only.
