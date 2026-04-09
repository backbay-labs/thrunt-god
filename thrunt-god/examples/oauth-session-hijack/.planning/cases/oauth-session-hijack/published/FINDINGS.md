# Findings: OAuth Phishing Campaign — acme.corp M365

## Executive Summary

A phishing campaign targeted three acme.corp users (sarah.chen, james.wu, maria.garcia) with emails containing embedded OAuth consent links. One user, sarah.chen@acme.corp, clicked the link and granted Mail.ReadWrite and Contacts.Read permissions to a malicious application masquerading as "DocuSign Secure View." The attacker, operating from a Tor exit node (185.220.101.42), used the OAuth token to create a mailbox forwarding rule that exfiltrates all incoming email to ext-recv-4782@protonmail.com. The full attack chain was completed in under 5 minutes, consistent with automated tooling. No lateral movement to other users was observed within the 72h hunt window.

The attack followed the `family.oauth-phishing-session-hijack` pack's expected progression pattern (`phish-to-consent-to-takeover`) through all three steps: T1566 phishing delivery, T1078 session hijack via OAuth consent, and T1098 mailbox tampering via forwarding rule creation.

## Hypothesis Verdicts

| Hypothesis | Verdict | Confidence | Evidence |
|------------|---------|------------|----------|
| HYP-01: OAuth consent to unknown app is part of phishing campaign | Supported | High | RCT-20260328-001, QRY-20260328-001, QRY-20260328-003 |
| HYP-02: Attacker established email exfiltration via mailbox rules | Supported | High | RCT-20260328-002, QRY-20260328-002 |
| HYP-03: Lateral movement via stolen tokens to other users | Disproved | Medium | RCT-20260328-003, QRY-20260328-001, QRY-20260328-003 |

## Impacted Scope

- **Users:** sarah.chen@acme.corp (compromised), james.wu@acme.corp (targeted, not compromised), maria.garcia@acme.corp (targeted, not compromised)
- **Mailboxes:** sarah.chen@acme.corp (forwarding rule active — all mail forwarded to attacker)
- **Apps:** "DocuSign Secure View" (app_id: 3fa85f64-5717-4562-b3fc-2c963f66afa6) — malicious OAuth app with Mail.ReadWrite, Contacts.Read delegated permissions
- **Tenants:** acme.corp M365 (7b2a4c91-8d3e-4f1a-b6c5-9e0d2f8a7b3c)

## What We Know

- Phishing emails with OAuth consent links were delivered to 3 acme.corp users between 2026-03-27 and 2026-03-28 (RCT-20260328-001)
- sarah.chen clicked the consent link and granted Mail.ReadWrite + Contacts.Read to app 3fa85f64-... at 2026-03-28T08:42:00Z from IP 185.220.101.42 (Tor exit node) (RCT-20260328-001, QRY-20260328-001)
- The attacker bypassed Okta federation by using a direct M365 consent URL — no Okta authentication event exists for this consent (QRY-20260328-003)
- Mailbox rule "Auto-Forward" was created at 2026-03-28T08:46:12Z forwarding all mail to ext-recv-4782@protonmail.com, using the malicious app's OAuth token (RCT-20260328-002, QRY-20260328-002)
- The 4-minute gap between consent and rule creation suggests automated post-exploitation tooling (RCT-20260328-002)
- Token refresh events for the malicious app continued from 185.220.101.42, all scoped to sarah.chen's mailbox (QRY-20260328-001)
- james.wu and maria.garcia received the phishing email but did not click — their accounts show no anomalous activity (RCT-20260328-003)

## What We Do Not Know

- Email body content (requires eDiscovery to examine the actual phishing email and consent URL)
- Whether the attacker harvested sarah.chen's contact list via Contacts.Read (no audit trail for read-only Graph API calls)
- Whether sarah.chen's device was also compromised beyond the OAuth consent (no endpoint telemetry — CrowdStrike access requires IR escalation)
- The attacker's identity beyond their Tor exit node and Protonmail infrastructure
- Whether the forwarding rule has already exfiltrated sensitive data (requires mailbox content review)
- Whether the attacker will re-target acme.corp users using contact data harvested from sarah.chen's mailbox

## Recommended Action

1. **Revoke OAuth consent** — Remove app 3fa85f64-5717-4562-b3fc-2c963f66afa6 delegated permissions from sarah.chen's account immediately
2. **Remove mailbox rule** — Delete the "Auto-Forward" inbox rule from sarah.chen's mailbox
3. **Reset sarah.chen credentials** — Force password reset and revoke all active sessions/refresh tokens for sarah.chen@acme.corp
4. **Block app tenant-wide** — Add app 3fa85f64-5717-4562-b3fc-2c963f66afa6 to the tenant's blocked applications list to prevent re-consent
5. **Notify legal** — The forwarding rule to ext-recv-4782@protonmail.com constitutes confirmed data exfiltration; legal team notification is required per policy
6. **Extend monitoring** — Monitor james.wu and maria.garcia for 30 days post-remediation for delayed lateral movement
7. **Detection engineering** — Promote the following detection candidates:
   - OAuth consent from Tor exit nodes → block or alert
   - OAuth consent to apps with no verified publisher and <7 days tenant age → high-severity alert
   - Mailbox rule creation via OAuth app token (vs interactive sign-in) → medium-severity alert
   - Direct M365 consent bypass without Okta federation → alert (this is invisible to Okta-only monitoring)
8. **Preventive control** — Implement Conditional Access policy requiring admin consent for apps requesting Mail.ReadWrite or equivalent sensitive scopes
