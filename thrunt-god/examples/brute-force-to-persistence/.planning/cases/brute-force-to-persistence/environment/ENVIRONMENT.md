# Environment Map

## Scope

- **Program / case:** Meridian Brute Force to Persistence
- **Covered tenants:** meridian.io (Okta), Meridian Financial Services (M365)
- **Excluded areas:** AWS infrastructure (not relevant to identity attack chain), on-premises AD (federated through Okta, no direct query access)

## Telemetry Surfaces

| Surface | System | Retention | Query Path | Notes |
|---------|--------|-----------|------------|-------|
| Identity | Okta System Log | 90 days | Okta connector (`connector_id: okta`, `dataset.kind: identity`) | Primary surface. Covers auth events, MFA lifecycle, admin actions. `dataset.kind = 'identity'` applies defaults: `limit=200, max_pages=10, timeout=30s` |
| Cloud | M365 Unified Audit Log | 180 days | M365 connector (`connector_id: m365`, `dataset.kind: cloud`) | SharePoint file operations, Exchange admin events. `dataset.kind = 'cloud'` applies defaults: `limit=500, max_pages=10, timeout=45s` |
| Endpoint | Microsoft Defender for Endpoint | 30 days | Defender XDR connector (`connector_id: defender-xdr`, `dataset.kind: endpoint`) | Available but not primary. No endpoint IOCs identified during hunt. `dataset.kind = 'endpoint'` would apply: `limit=1000, max_pages=5, timeout=60s` |
| Email | Exchange Online Protection | 30 days | M365 connector (`connector_id: m365`, `dataset.kind: email`) | Not queried -- no phishing vector identified in this attack chain |

## Key Entities And Pivots

- **User identifiers:** UPN (david.park@meridian.io), Okta user ID (00u8a3b7c9d1e2f4g6h8), M365 object ID (a1b2c3d4-e5f6-7890-abcd-ef1234567890)
- **Host identifiers:** Not applicable (cloud-only attack chain)
- **Cloud identifiers:** Okta org ID (0oa1b2c3d4e5f6g7h8i9), M365 tenant ID (f47ac10b-58cc-4372-a567-0e02b2c3d479)
- **Message identifiers:** Not applicable

## Known Blind Spots

- No DLP or CASB in deployment -- cannot distinguish file access (viewing/downloading within SharePoint) from exfiltration (data leaving the M365 tenant boundary)
- No network proxy logs for outbound data transfer from M365
- Okta System Log does not capture whether MFA push was preceded by a phone call or SMS social engineering attempt
- On-premises Active Directory not directly queryable (federation through Okta only)

## Escalation Boundaries

- **IR / SOC owner:** Meridian SOC (soc@meridian.io)
- **Cloud owner:** Meridian IT Cloud Operations (cloud-ops@meridian.io)
- **Identity owner:** Meridian IAM Team (iam@meridian.io)
- **Legal / privacy:** Meridian Legal -- General Counsel (legal@meridian.io, required if data exfiltration confirmed)

## Notes

The Okta tenant uses Okta ThreatInsight for IP reputation but does not have network zone restrictions for residential proxy ranges. M365 tenant has Conditional Access policies but they do not block access from unmanaged devices for SharePoint. These configuration gaps contributed to the attack success and should be addressed in remediation recommendations.
