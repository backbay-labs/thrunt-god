# Examples

These example hunts now use the current `.planning/` program layout from this PR instead of the legacy `.hunt/` mirror. Each folder opens directly in VS Code as a program workspace with a real child case under `cases/`, populated case frontmatter, a published findings marker, and an active-case pointer.

## Available Examples

### `oauth-session-hijack/`

OAuth phishing leading to consent grant abuse and mailbox exfiltration. Uses `family.oauth-phishing-session-hijack`. Good for testing program dashboard case cards, published findings status, and technique aggregation for `T1566`, `T1078`, and `T1098`.

### `brute-force-to-persistence/`

Password spray escalating through credential stuffing, MFA manipulation, and cloud data access. Uses `domain.identity-abuse`. Good for testing a richer case with a broader ATT&CK footprint and multiple receipts.

## PR Features Demonstrated

- Program root `.planning/` with parser-compliant `MISSION.md`, `HUNTMAP.md`, `HYPOTHESES.md`, and `STATE.md`
- Child hunts under `.planning/cases/<slug>/` so the Program Dashboard can discover them
- Case `STATE.md` frontmatter with `title`, lifecycle dates, and final `technique_ids`
- `published/FINDINGS.md` copies so the extension marks the case as published
- `.planning/.active-case` so CLI scope resolution matches the new case/workstream behavior

## Existing Hunt Features Demonstrated

- Dataset-aware query defaults in the case query logs
- Drain template clustering in `QRY-*.md`
- Event deduplication in the brute-force case
- Anomaly framing and ATT&CK mapping in the receipts
- Evidence review and publishability checks in `EVIDENCE_REVIEW.md`

## Artifact Structure

```text
example-name/
├── README.md
└── .planning/
    ├── MISSION.md
    ├── HUNTMAP.md
    ├── HYPOTHESES.md
    ├── STATE.md
    ├── .active-case
    └── cases/
        └── <slug>/
            ├── MISSION.md
            ├── HYPOTHESES.md
            ├── HUNTMAP.md
            ├── STATE.md
            ├── SUCCESS_CRITERIA.md
            ├── FINDINGS.md
            ├── EVIDENCE_REVIEW.md
            ├── environment/ENVIRONMENT.md
            ├── QUERIES/
            ├── RECEIPTS/
            └── published/FINDINGS.md
```

## How to Test in VS Code

1. Open one example folder as the workspace root.
2. Confirm the THRUNT sidebar activates from `.planning/MISSION.md`.
3. Run `THRUNT: Open Program Dashboard`.
4. Open the child case from the dashboard and inspect its findings, receipts, and published marker.

## Notes

- These are static examples; no live connectors are required.
- All timestamps, IPs, and identifiers are fictional but realistic.
- The examples are intentionally closed cases so the dashboard shows rollup behavior without needing to run the CLI first.
