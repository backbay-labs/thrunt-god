# Environment Map

## Scope

- **Program / case:** OAuth Phishing Campaign — acme.corp M365
- **Covered tenants:** acme.corp (M365 tenant ID: 7b2a4c91-8d3e-4f1a-b6c5-9e0d2f8a7b3c)
- **Excluded areas:** Endpoint telemetry (CrowdStrike — requires IR escalation), AWS workloads (out of scope for this case)

## Telemetry Surfaces

| Surface | System | Retention | Query Path | Notes |
|---------|--------|-----------|------------|-------|
| Identity | Entra ID (via M365 Graph API) | 90 days | `GET /auditLogs/signIns`, `GET /auditLogs/directoryAudits` | Covers sign-ins, app consents, directory changes. Conditional Access logs available. |
| Identity | Okta (system log) | 90 days | `GET /api/v1/logs` | Primary IdP. Covers authentication, MFA events, session lifecycle. Federation with Entra ID. |
| Email | Exchange Online (unified audit log) | 90 days | `Search-UnifiedAuditLog` or Graph API `/security/alerts_v2` | Covers mailbox rule changes, message trace. No content inspection without eDiscovery. |
| Alerts | Defender for Office 365 | 30 days | `GET /security/alerts_v2` | Pre-built detections for suspicious OAuth, phishing, mailbox rules. |

## Key Entities And Pivots

- **User identifiers:** UPN (user@acme.corp), Entra Object ID, Okta User ID, email address
- **Host identifiers:** Not applicable for this case (no endpoint telemetry)
- **Cloud identifiers:** M365 tenant ID (7b2a4c91-8d3e-4f1a-b6c5-9e0d2f8a7b3c), Entra app registration ID
- **Message identifiers:** Internet Message ID, Message Trace ID

## Known Blind Spots

- No endpoint telemetry: if the phishing email delivered a payload alongside the OAuth link, we cannot observe it
- No browser telemetry: cannot confirm whether sarah.chen visited the consent URL via browser redirect or direct link
- Exchange Online message content is not accessible without eDiscovery; we can see delivery metadata and subject lines but not email body/URLs
- Okta system log does not capture OAuth consent events in M365 — those are only visible in Entra ID audit logs

## Escalation Boundaries

- **IR / SOC owner:** SOC Tier 2 threat hunting team (current)
- **Cloud owner:** Cloud Security team (for tenant-wide app blocking)
- **Identity owner:** Identity and Access Management team (for credential reset, Conditional Access policy changes)
- **Legal / privacy:** Legal team (notify if data exfiltration is confirmed — forwarding rule suggests exfiltration)

## Notes

- acme.corp uses Okta as the primary IdP with federation to Entra ID. This means some authentication events appear in both Okta and Entra ID logs, but OAuth consent events are only in Entra ID.
- E5 licensing provides full Defender for Office 365 alert coverage and advanced hunting capabilities.
- The 72h hunt window is well within retention limits for all surfaces.
