# Hypotheses: acme.corp OAuth Abuse Response Program

## Active Hypotheses

### HYP-01: Program intake artifacts are complete and parseable

- **Signal:** The example workspace opens on `.planning/MISSION.md` and exposes a complete OAuth-abuse program shell
- **Assertion:** The acme.corp program root contains the singleton artifacts the extension expects and they parse into a coherent program-level investigation context
- **Priority:** High
- **Scope:** Program root only (`MISSION.md`, `HUNTMAP.md`, `HYPOTHESES.md`, `STATE.md`)
- **Data sources:** Workspace inventory, parsed root artifacts
- **Evidence needed:** Inventory of required root artifacts with parse validation
- **Disproof condition:** Required root artifacts are missing, malformed, or do not resolve as a program workspace
- **Confidence:** High
- **Status:** Supported

### HYP-02: Child case execution artifacts remain linked and published at program scope

- **Signal:** The program includes one closed child case under `cases/oauth-session-hijack`
- **Assertion:** The child case preserves mission, evidence, and published findings links so the program workspace can surface the case as a published closed investigation
- **Priority:** High
- **Scope:** `cases/oauth-session-hijack/` plus published findings path
- **Data sources:** Child case artifact inventory, published findings copy, program roster
- **Evidence needed:** Matching case-state metadata, published findings marker, and path consistency across the child case
- **Disproof condition:** Published findings are missing, the case mission cannot be discovered, or root rollup metadata does not match the child case
- **Confidence:** High
- **Status:** Supported

### HYP-03: Program closeout technique rollup matches the child case evidence corpus

- **Signal:** Program `STATE.md` reports 3 unique ATT&CK techniques for the OAuth abuse case
- **Assertion:** The program rollup accurately reflects the final technique IDs preserved in the closed child case and its receipts
- **Priority:** Medium
- **Scope:** Program `STATE.md`, child case `STATE.md`, and child case receipts
- **Data sources:** Program rollup summary, case frontmatter, ATT&CK mappings in receipts
- **Evidence needed:** One-to-one reconciliation between the program count and the underlying case technique set
- **Disproof condition:** The program count differs from the case frontmatter or omits techniques present in the closed-case evidence
- **Confidence:** High
- **Status:** Supported

## Parked Hypotheses

- None

## Disproved Hypotheses

- None

## Notes

- The program layer is intentionally static and read-only; it exists to demonstrate dashboard and lineage views over a completed OAuth-abuse case.
- The underlying phishing investigation remains in `cases/oauth-session-hijack/`.
