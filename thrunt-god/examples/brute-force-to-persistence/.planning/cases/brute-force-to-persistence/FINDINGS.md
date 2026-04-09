# Findings: Meridian Brute Force to Persistence

## Executive Summary

A coordinated password spray attack targeted 15 meridian.io Okta accounts on 2026-03-29, delivering 1,189 failed authentication attempts in 8 minutes via 79 residential proxy IPs. One account -- david.park@meridian.io, a senior finance analyst -- was compromised through a valid credential (likely from a breach database) combined with MFA push acceptance. The attacker established persistence by swapping david.park's MFA factor to an attacker-controlled phone, changing recovery information, and resetting the password. During the compromised session, the attacker accessed the Finance-Reports SharePoint site, downloading 47 files including quarterly financial statements, board compensation reports, and revenue forecasts. The 14 other targeted accounts were not compromised: 12 were locked out by Okta policy, and 2 were protected by FIDO2 hardware keys.

## Hypothesis Verdicts

| Hypothesis | Verdict | Confidence | Evidence |
|------------|---------|------------|----------|
| HYP-01: Password spray from residential proxies | Supported | High | RCT-20260329-001 (score: 4, High) |
| HYP-02: david.park compromised, MFA push accepted | Supported | High | RCT-20260329-002 (score: 6, Critical) |
| HYP-03: Attacker accessed financial data via SharePoint | Supported | Medium | RCT-20260329-003 (score: 5, High) |
| HYP-04: Other targeted accounts also compromised | Disproved | High | RCT-20260329-004 |

## Impacted Scope

- **Users:** david.park@meridian.io (compromised, full account takeover)
- **Hosts:** None identified (cloud-only attack chain, no endpoint indicators)
- **Tenants:** meridian.io Okta, Meridian M365 (accessed via compromised SSO session)
- **Apps:** SharePoint Online (Finance-Reports site), OneDrive for Business

## Attack Timeline

| Time (UTC) | Event | Source | Evidence |
|------------|-------|--------|----------|
| 14:00:12 | Password spray begins (15 accounts, 79 IPs) | Okta | RCT-20260329-001 |
| 14:05:08-14:06:01 | 12 accounts locked out by Okta policy | Okta | RCT-20260329-004 |
| 14:08:47 | Spray ends (1,189 total failed attempts) | Okta | RCT-20260329-001 |
| 14:10:33 | david.park auth success from 198.51.100.42 | Okta | RCT-20260329-002 |
| 14:11:02 | MFA push accepted (single push, no denials) | Okta | RCT-20260329-002 |
| 14:12:15 | SSO session to M365 established | Okta | QRY-20260329-002 |
| 14:14:30-14:19:00 | SharePoint reconnaissance (folder browsing, 18 search queries) | M365 | RCT-20260329-003 |
| 14:20:15-14:40:00 | Targeted file access (financial docs) | M365 | RCT-20260329-003 |
| 14:31:10 | New SMS MFA factor enrolled (attacker phone) | Okta | RCT-20260329-002 |
| 14:32:15 | Original Okta Verify factor deactivated | Okta | RCT-20260329-002 |
| 14:33:00-14:33:30 | Recovery phone and email changed | Okta | RCT-20260329-002 |
| 14:40:00-14:52:00 | Bulk file download (47 files in 12 minutes) | M365 | RCT-20260329-003 |
| 14:56:00 | Password changed via self-service | Okta | RCT-20260329-002 |
| 14:58:00 | Re-authentication with new password | Okta | RCT-20260329-002 |

## What We Know

- The attack used credential pairs consistent with breach database sourcing -- all 1,189 failures returned INVALID_CREDENTIALS, and david.park's password was valid (RCT-20260329-001)
- david.park's password had not been changed since the most recent known breach window (inference from baseline -- no prior password change events in 6 months)
- The attacker completed full account takeover: MFA swap, recovery info change, and password change within 45 minutes of initial compromise (RCT-20260329-002)
- The attacker accessed 47+ files from Finance-Reports and Strategic-Planning SharePoint sites, including quarterly financial statements, board compensation data, and revenue forecasts (RCT-20260329-003)
- 14 other targeted accounts were not compromised (RCT-20260329-004)
- The 2 FIDO2-protected accounts (christopher.hall, stephanie.garcia) were completely immune to this attack vector

## What We Do Not Know

- Whether files were exfiltrated beyond the M365 tenant boundary (no DLP/CASB telemetry -- see ENVIRONMENT.md blind spots)
- Whether the MFA push was accepted due to fatigue, social engineering, or habitual approval
- Whether the attacker has used the downloaded data or shared it with third parties
- Whether the credential source is a known or unknown breach database
- Whether the attacker will return using the persistence mechanisms before they are remediated

## Recommended Action

### Immediate (within 1 hour)

1. **Disable david.park@meridian.io Okta account** -- prevent further attacker access via any credential or session
2. **Revoke all active sessions** -- Okta session tokens, M365 refresh tokens, SharePoint access tokens
3. **Remove attacker MFA factor** -- delete the SMS factor (+1-XXX-XXX-7734) and restore Okta Verify
4. **Reset password** -- force password reset with a new, unique password communicated out of band
5. **Restore recovery information** -- reset recovery phone and email to legitimate values

### Short-term (within 24 hours)

6. **Forensic review of accessed files** -- catalog all 47+ files accessed/downloaded, classify by sensitivity, determine disclosure obligations
7. **Notify legal** -- financial statements and board compensation data may trigger regulatory reporting requirements
8. **Force password rotation for all 15 targeted accounts** -- even locked-out accounts may have valid credentials in the breach database
9. **Review Okta sign-in policies** -- add network zone restrictions for residential proxy IP ranges, reduce lockout threshold

### Medium-term (within 1 week)

10. **Enforce FIDO2 for finance team** -- the 2 FIDO2-protected accounts were completely immune; extend this to all finance team members
11. **Deploy CASB/DLP** -- address the blind spot that prevented exfiltration confirmation
12. **Credential exposure monitoring** -- enroll meridian.io in a breach monitoring service to detect future credential exposure
13. **Conditional Access policy review** -- require managed devices for SharePoint access to sensitive sites
