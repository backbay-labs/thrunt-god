# Hypotheses: Meridian Brute Force to Persistence

## Active Hypotheses

### HYP-01: Password spray from residential proxies targeting meridian.io

- **Signal:** Okta System Log brute force alert, 1,200+ failed auths in 8 minutes
- **Assertion:** An external actor conducted a coordinated password spray against 15 meridian.io accounts using rotating residential proxy IPs to evade rate limiting
- **Priority:** Critical
- **Scope:** 2026-03-29T14:00:00Z -- 2026-03-29T14:08:00Z, all 15 targeted accounts, meridian.io Okta tenant
- **Data sources:** Okta System Log (authentication events, failed/success), IP threat intelligence
- **Evidence needed:** Clustered authentication failures showing spray pattern (same time window, multiple accounts, rotating IPs), IP attribution to residential proxy ASNs
- **Disproof condition:** Failed logins originate from known Meridian office IPs or VPN ranges, or failures are spread across days rather than concentrated
- **Confidence:** High
- **Status:** Supported

### HYP-02: david.park account compromised via credential stuffing, MFA fatigue push accepted

- **Signal:** Successful Okta authentication for david.park from spray-associated IP 2 minutes after spray ended, followed by MFA push acceptance
- **Assertion:** david.park's credentials were present in a breach database; the attacker used a valid password and socially engineered or fatigued an MFA push acceptance, then established persistence by changing the MFA factor
- **Priority:** Critical
- **Scope:** 2026-03-29T14:10:00Z -- 2026-03-29T15:00:00Z, david.park@meridian.io, meridian.io Okta tenant
- **Data sources:** Okta System Log (auth success, MFA events, factor lifecycle), Okta admin audit (factor changes)
- **Evidence needed:** Successful auth from known-bad IP immediately after spray, single MFA push accept without prior denials, MFA factor change within the same session
- **Disproof condition:** MFA push was preceded by multiple denials (not fatigue -- user deliberately accepted), or factor change correlates with a helpdesk ticket
- **Confidence:** High
- **Status:** Supported

### HYP-03: Attacker accessed sensitive financial data via david.park's SharePoint permissions

- **Signal:** SharePoint Online file access events from david.park's compromised session
- **Assertion:** The attacker used david.park's access to view and download sensitive financial documents from the company's financial reporting SharePoint site
- **Priority:** High
- **Scope:** 2026-03-29T14:25:00Z -- 2026-03-29T15:00:00Z, david.park@meridian.io, M365 tenant
- **Data sources:** M365 Unified Audit Log (SharePoint file operations), SharePoint access logs
- **Evidence needed:** File access/download events from anomalous IP or session, sensitive file names, volume of downloads inconsistent with normal behavior
- **Disproof condition:** All SharePoint activity during the window originated from david.park's known device and IP, or no sensitive files were accessed
- **Confidence:** Medium -- access confirmed but exfiltration (data leaving the tenant) cannot be confirmed without DLP/CASB
- **Status:** Supported

### HYP-04: Other targeted accounts were also compromised

- **Signal:** 14 additional accounts targeted in the same spray
- **Assertion:** One or more of the other 14 targeted accounts were also compromised during or after the spray
- **Priority:** High
- **Scope:** 2026-03-29T14:00:00Z -- 2026-03-29T16:00:00Z, 14 accounts (excluding david.park), meridian.io Okta tenant
- **Data sources:** Okta System Log (auth success/failure for all 14), Okta policy logs (lockout events)
- **Evidence needed:** Successful authentication from any of the 14 accounts from a non-corporate IP after the spray window
- **Disproof condition:** All 14 accounts show only failed authentications followed by lockout, or successful auths only from known-good IPs
- **Confidence:** High
- **Status:** Disproved

## Parked Hypotheses

- None

## Disproved Hypotheses

- **HYP-04:** Other targeted accounts were also compromised -- disproved by RCT-20260329-004. All 14 accounts protected: 12 locked out by Okta policy after 5 failed attempts, 2 had FIDO2 hardware keys making MFA fatigue impossible.

## Notes

HYP-02 and HYP-03 follow the `domain.identity-abuse` pack's `brute-force-to-access` and `credential-to-persistence` progressions respectively. The sequential prediction pattern (anomaly framing) was applied to david.park's entity timeline across both hypotheses. HYP-01 provides the foundation context for HYP-02's deviation scoring.
