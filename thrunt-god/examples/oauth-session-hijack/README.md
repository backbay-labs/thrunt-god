# Example: OAuth Session Hijack Hunt

This example now opens as a real `.planning` workspace with a closed child case. It is intended for testing the new program dashboard, child-case discovery, published findings indicator, and technique rollup behavior in the VS Code extension.

## Scenario

Microsoft Defender raised an "Unusual OAuth app consent" alert in the `acme.corp` M365 tenant. The investigation confirmed a phishing campaign that tricked `sarah.chen@acme.corp` into granting `Mail.ReadWrite` and `Contacts.Read` to a malicious app, which then created a forwarding rule to exfiltrate email to Protonmail.

## PR Features Demonstrated

- Program workspace rooted at `.planning/` with a real child case under `cases/oauth-session-hijack/`
- Case `STATE.md` frontmatter populated with final `technique_ids` for dashboard aggregation
- Published findings mirrored to `published/FINDINGS.md`
- Case scope discoverable from `.planning/.active-case`

## Legacy Hunt Features Still Visible

| Feature | Where to Look |
|---------|---------------|
| Template clustering | `.planning/cases/oauth-session-hijack/QUERIES/QRY-20260328-001.md` |
| Dataset-aware defaults | All three query logs |
| Anomaly framing | `.planning/cases/oauth-session-hijack/RECEIPTS/RCT-20260328-001.md` and `RCT-20260328-002.md` |
| Pack progressions | Findings and receipts for `family.oauth-phishing-session-hijack` |

## How to Read the Workspace

1. Open `.planning/MISSION.md` for the program-level context.
2. Open `.planning/STATE.md` or the Program Dashboard for the rollup view.
3. Review `.planning/cases/oauth-session-hijack/MISSION.md` and `HYPOTHESES.md` for the actual case.
4. Walk the case `QUERIES/` and `RECEIPTS/`.
5. Compare `FINDINGS.md` with `published/FINDINGS.md` to see the publish marker the extension consumes.

## Pack Reference

This case uses `family.oauth-phishing-session-hijack`. The progression `phish-to-consent-to-takeover` is confirmed through:

1. `T1566` phishing delivery
2. `T1078` session hijack through OAuth consent
3. `T1098` mailbox tampering via forwarding rule creation
