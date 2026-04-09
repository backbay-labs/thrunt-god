# Example: Brute Force to Persistence

This example now uses the same program-plus-case layout that the current CLI and VS Code extension expect. Open the folder in VS Code and run `THRUNT: Open Program Dashboard` to review the closed case from the program workspace.

## Scenario

Okta detected a password spray attack against Meridian Financial Services. More than 1,200 failed logins hit 15 accounts in 8 minutes from residential proxy IPs. One account, `david.park@meridian.io`, was compromised, MFA was manipulated, and the attacker accessed sensitive financial documents in SharePoint before the case was closed.

## PR Features Demonstrated

- Program workspace rooted at `.planning/` with a real child case under `cases/brute-force-to-persistence/`
- Case `STATE.md` frontmatter populated with `title`, lifecycle dates, and `technique_ids`
- Published findings mirrored to `published/FINDINGS.md` so the dashboard marks the case as published
- Active-case pointer stored in `.planning/.active-case` so CLI commands resolve case scope correctly

## Legacy Hunt Features Still Visible

- Template clustering in `QUERIES/QRY-20260329-001.md`
- Dataset-aware query defaults across identity and cloud telemetry
- Pagination deduplication for overlapping Okta pages
- Anomaly framing in `RECEIPTS/RCT-20260329-002.md`

## Workspace Layout

```text
.planning/
  MISSION.md
  HUNTMAP.md
  HYPOTHESES.md
  STATE.md
  .active-case
  cases/
    brute-force-to-persistence/
      MISSION.md
      HYPOTHESES.md
      HUNTMAP.md
      STATE.md
      SUCCESS_CRITERIA.md
      FINDINGS.md
      EVIDENCE_REVIEW.md
      environment/ENVIRONMENT.md
      QUERIES/
      RECEIPTS/
      published/FINDINGS.md
```

## Hunt Pack

Uses `domain.identity-abuse` with two progressions:

- `brute-force-to-access`
- `credential-to-persistence`
