# Example: OAuth Session Hijack Hunt

A completed hunt case demonstrating THRUNT v1.0 features against a realistic OAuth phishing campaign in a corporate M365 tenant.

## Scenario

A SOC analyst received a Microsoft Defender alert ("Unusual OAuth app consent") for the acme.corp M365 tenant. The hunt discovered a phishing campaign targeting three users. One user (sarah.chen@acme.corp) clicked an embedded OAuth consent link, granted Mail.ReadWrite and Contacts.Read permissions to a malicious app masquerading as "DocuSign Secure View," and the attacker created a mailbox forwarding rule to exfiltrate email to an external Protonmail address.

## v1.0 Features Demonstrated

| Feature | Where to Look |
|---------|---------------|
| **Template clustering** | `.hunt/QUERIES/QRY-20260328-001.md` -- 312 identity events reduced to 4 templates via Drain |
| **Dataset-aware defaults** | All three query logs show `dataset.kind` driving pagination limits, max pages, and timeouts |
| **Anomaly framing** | `.hunt/RECEIPTS/RCT-20260328-001.md` and `RCT-20260328-002.md` -- sequential prediction with scored deviations |
| **Pack progressions** | Receipts reference `family.oauth-phishing-session-hijack` expected progression steps and scoring |

## How to Read the Artifacts

1. Start with `.hunt/MISSION.md` for the signal and scope.
2. Read `.hunt/HYPOTHESES.md` for the three testable assertions.
3. Walk the three query logs in `.hunt/QUERIES/` to see telemetry collection with template clustering results.
4. Read the three receipts in `.hunt/RECEIPTS/` for evidence with anomaly framing scores.
5. Review `.hunt/FINDINGS.md` for the executive summary and recommended actions.
6. Check `.hunt/EVIDENCE_REVIEW.md` for publishability verification.

## Pack Reference

This hunt uses the `family.oauth-phishing-session-hijack` pack. The expected progression pattern `phish-to-consent-to-takeover` was confirmed through two of its three steps:

1. T1566 Phishing delivery (consent link in email)
2. T1078 Session hijack (OAuth consent grant from Tor exit node)
3. T1098 Mailbox tampering (forwarding rule to external address)

The third hypothesis (lateral movement via stolen tokens) was disproved, indicating a targeted single-user compromise rather than a broader campaign escalation.
