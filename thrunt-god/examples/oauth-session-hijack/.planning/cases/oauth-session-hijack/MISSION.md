# Mission: OAuth Phishing Campaign — acme.corp M365

**Mode:** case
**Opened:** 2026-03-28
**Owner:** SOC Tier 2 — threat hunting team
**Status:** Closed

## Signal

Microsoft Defender for Office 365 alert: "Unusual OAuth app consent" triggered for user sarah.chen@acme.corp. The alert fired because an application with no prior tenant history requested Mail.ReadWrite and Contacts.Read permissions and the consent was granted from an IP address not associated with the user's historical sign-in locations.

## Desired Outcome

Confirm or disprove that the OAuth consent grant is part of a phishing campaign. If confirmed, identify the blast radius (how many users were targeted, how many were compromised) and determine whether the attacker established persistence or exfiltration mechanisms.

## Scope

- **Time window:** 2026-03-25T00:00:00Z — 2026-03-28T12:00:00Z (72 hours)
- **Entities:** sarah.chen@acme.corp, james.wu@acme.corp, maria.garcia@acme.corp
- **Environment:** acme.corp M365 tenant (E5 licensing), Okta as primary IdP
- **Priority surfaces:** M365 identity (Entra ID audit logs), M365 email (Exchange Online), Okta system log, Defender for Office 365 alerts

## Operating Constraints

- **Access:** Full read access to M365 Unified Audit Log, Okta system log, and Defender alerts via Graph API and Okta API. No access to endpoint telemetry (CrowdStrike) for this case — would require IR escalation.
- **Retention:** M365 UAL retains 90 days. Okta retains 90 days. Defender alerts retain 30 days.
- **Legal / privacy:** Standard SOC authorization. No legal hold required unless data exfiltration is confirmed, at which point legal team must be notified.
- **Operational:** Non-disruptive investigation. Do not revoke OAuth consent or disable accounts until findings are confirmed and approved by SOC lead.

## Working Theory

A phishing campaign sent OAuth consent links to multiple acme.corp users. At least one user (sarah.chen) clicked the link and granted permissions to a malicious application. The attacker may have used the granted permissions to establish email exfiltration or lateral movement.

## Success Definition

A useful answer confirms or disproves the phishing campaign theory, identifies the full blast radius of targeted and compromised users, and documents any persistence or exfiltration mechanisms. Even a negative result (benign OAuth app) is useful if it explains why Defender flagged it and can inform tuning.

## Key Decisions

| Decision | Reason | Date |
|----------|--------|------|
| Scope to 72h window | Alert fired 2026-03-28; phishing delivery likely within prior 48h based on typical campaign timelines | 2026-03-28 |
| Include james.wu and maria.garcia | Email log search revealed same sender targeted these two users within the same time window | 2026-03-28 |
| Skip endpoint telemetry | No CrowdStrike access for this case; OAuth-based attack chain does not require endpoint pivots unless credential theft is suspected | 2026-03-28 |
| Close case after 3 hypotheses resolved | All material questions answered; lateral movement disproved within scope window | 2026-03-28 |

---
*Last updated: 2026-03-28 after case closure*
