# Mission: Meridian Brute Force to Persistence

**Mode:** case
**Opened:** 2026-03-29
**Owner:** Threat Hunt Team (analyst: j.chen)
**Status:** Closed

## Signal

Okta System Log alert "Brute force attack detected" fired at 2026-03-29T14:05:00Z. The alert flagged 1,200+ failed authentication attempts across 15 user accounts within an 8-minute window. Source IPs rotated across residential proxy ranges (AS-RESIDENTIAL-PROXY, AS396982, AS16276). Pattern is consistent with password spray rather than single-account brute force.

## Desired Outcome

Determine whether any of the 15 targeted accounts were compromised. If so, establish the scope of access, identify persistence mechanisms, and assess data exposure.

## Scope

- **Time window:** 2026-03-29T13:00:00Z -- 2026-03-29T16:00:00Z (extended to 48 hours for historical baseline: 2026-03-27T14:00:00Z -- 2026-03-29T16:00:00Z)
- **Entities:** david.park@meridian.io (primary -- compromised), 14 additional targeted accounts (see HYPOTHESES.md HYP-04)
- **Environment:** Meridian Financial Services production identity and cloud tenants
- **Priority surfaces:** Okta System Log (identity), Microsoft 365 Unified Audit Log (cloud), Microsoft Defender for Endpoint (endpoint), SharePoint Online (cloud)

## Operating Constraints

- **Access:** Full read access to Okta System Log and M365 Unified Audit Log via API connectors. Defender for Endpoint telemetry available but limited to 30-day retention. No DLP or CASB console access.
- **Retention:** Okta: 90 days. M365 UAL: 180 days. Defender: 30 days. SharePoint audit: 90 days.
- **Legal / privacy:** Standard employee monitoring policy applies. Financial data classification requires legal notification if exfiltration is confirmed.
- **Operational:** Finance team quarter-end close in progress -- david.park is a senior finance analyst with legitimate access to all identified files. Account disablement requires CFO approval.

## Working Theory

Credential stuffing attack using credentials from a known breach database, delivered via residential proxy infrastructure to evade IP-based rate limiting. One account (david.park) had a password match, and the attacker exploited MFA push fatigue or social engineering to gain access. Post-compromise activity focused on financial data access and MFA persistence.

## Success Definition

Useful answer achieved if: (1) the compromised account(s) are identified, (2) the attack timeline is reconstructed with evidence receipts, (3) the scope of data accessed is determined, and (4) persistence mechanisms are documented. A negative finding (no compromise) is also useful if supported by evidence showing all accounts were protected.

## Key Decisions

| Decision | Reason | Date |
|----------|--------|------|
| Extended time window to 48 hours | Establish baseline for david.park normal activity | 2026-03-29 |
| Focused HYP-03 on SharePoint only | david.park's role and first post-auth activity pointed to SharePoint; email access showed no anomalies | 2026-03-29 |
| Closed without DLP confirmation | No CASB/DLP access; documented as blind spot rather than blocking | 2026-03-29 |

---
*Last updated: 2026-03-29 after evidence synthesis complete*
