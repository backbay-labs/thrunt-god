# Hypotheses: OAuth Phishing Campaign — acme.corp M365

## Active Hypotheses

_(none — all resolved)_

## Supported Hypotheses

### HYP-01: OAuth consent grant to unknown app is part of a phishing campaign

- **Signal:** Defender alert "Unusual OAuth app consent" for sarah.chen@acme.corp; app "DocuSign Secure View" has no prior tenant history
- **Assertion:** The OAuth consent was triggered by a phishing email containing an embedded consent link, and the app is attacker-controlled
- **Priority:** Critical
- **Scope:** 2026-03-25 — 2026-03-28, sarah.chen@acme.corp + 2 additional recipients
- **Data sources:** M365 identity (Entra ID audit logs), M365 email (message trace), Defender alerts
- **Evidence needed:** (1) Phishing email delivered to sarah.chen with OAuth consent URL, (2) consent grant event from anomalous IP, (3) app registration metadata showing no legitimate publisher
- **Disproof condition:** App is a known legitimate DocuSign integration registered by IT, or consent was initiated from a known corporate IP during business hours with a corresponding IT change ticket
- **Confidence:** High
- **Status:** Supported

### HYP-02: Attacker established email exfiltration via mailbox rules

- **Signal:** Pack progression `phish-to-consent-to-takeover` predicts mailbox_rule_creation as expected_malicious_next after oauth_app_consent
- **Assertion:** After obtaining Mail.ReadWrite permissions, the attacker created inbox rules to forward or redirect email to an external address
- **Priority:** Critical
- **Scope:** 2026-03-28, sarah.chen@acme.corp mailbox
- **Data sources:** M365 email (Exchange Online mailbox rules), Defender alerts
- **Evidence needed:** (1) New-InboxRule creation event within 1 hour of OAuth consent, (2) rule with ForwardTo or RedirectTo pointing to an external domain
- **Disproof condition:** No mailbox rule changes after consent grant, or rules were created by sarah.chen from a known device during business hours for a documented purpose
- **Confidence:** High
- **Status:** Supported

## Parked Hypotheses

_(none)_

## Disproved Hypotheses

### HYP-03: Lateral movement via stolen tokens to other users

- **Signal:** The same phishing email targeted james.wu and maria.garcia, raising concern that the OAuth app token could be reused for additional identities
- **Assertion:** The attacker reused the malicious app or related refresh tokens to access mailboxes or Graph resources belonging to users other than sarah.chen
- **Priority:** Medium
- **Scope:** 2026-03-28 -- 2026-03-31, james.wu@acme.corp and maria.garcia@acme.corp
- **Data sources:** Entra ID audit logs, Graph token activity, Exchange mailbox telemetry
- **Evidence needed:** App token use, consent events, or mailbox actions tied to the malicious app ID for identities beyond sarah.chen
- **Disproof condition:** All malicious app activity remains confined to sarah.chen's identity and mailbox for the full observation window
- **Confidence:** Medium
- **Status:** Disproved

Disproved by RCT-20260328-003. Token usage was confined to sarah.chen's mailbox. No sign-ins from james.wu or maria.garcia used the malicious app ID, and no refresh activity for the app was observed from IPs other than the original Tor exit node during the 72-hour window.

## Notes

- HYP-01 and HYP-02 together confirm the pack's `phish-to-consent-to-takeover` progression through steps 1-3 (T1566 -> T1078 -> T1098).
- HYP-03 disproval means the campaign achieved single-user compromise but did not escalate. This is consistent with an opportunistic attacker rather than an APT.
- james.wu and maria.garcia received the same phishing email but did not click the consent link. Their accounts show no anomalous activity in the 72h window.
