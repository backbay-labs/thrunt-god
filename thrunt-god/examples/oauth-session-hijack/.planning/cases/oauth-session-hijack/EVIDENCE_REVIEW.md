# Evidence Review: OAuth Phishing Campaign — acme.corp M365

## Publishability Verdict

Ready to publish

## Evidence Quality Checks

| Check | Status | Notes |
|-------|--------|-------|
| Receipts exist for material claims | Pass | RCT-20260328-001 (HYP-01), RCT-20260328-002 (HYP-02), RCT-20260328-003 (HYP-03) — all three hypotheses have corresponding receipts |
| Contradictory evidence captured | Pass | No contradictory evidence found. james.wu and maria.garcia clean status is documented as counter-evidence to HYP-03 (lateral movement). Absence of Okta events for the consent grant documented as environmental context. |
| Scope boundaries documented | Pass | 72h window documented in MISSION.md. Endpoint telemetry excluded (no CrowdStrike access). Email content excluded (requires eDiscovery). All boundaries recorded in FINDINGS.md "What We Do Not Know." |
| Confidence stated | Pass | HYP-01: High, HYP-02: High, HYP-03: Medium. Medium confidence on HYP-03 due to 72h window limitation — explicitly noted in RCT-20260328-003. |
| Chain of custody captured | Pass | All three receipts include collection path (Graph API, Okta API, UAL), event identifiers, timestamps, and collector (thrunt-telemetry-executor). |
| Sequential evidence integrity | Pass | Entity timelines constructed for sarah.chen (10 events in QRY-20260328-001), james.wu (218 sessions in QRY-20260328-003), maria.garcia (190 sessions in QRY-20260328-003). Baselines documented for all three entities. Predictions documented before observations in RCT-20260328-001 and RCT-20260328-002. Anomaly framing scores computed with explicit factors. |

## Sequential Evidence Anti-Patterns

| Anti-Pattern | Status | Details |
|-------------|--------|---------|
| Post-hoc rationalization | Pass | RCT-20260328-001 documents prediction (expected benign/malicious/ambiguous) before recording actual event #7. RCT-20260328-002 documents pack progression prediction before recording mailbox rule event. Predictions are falsifiable and sourced from pack expected_progressions. |
| Missing baseline | Pass | Baselines documented for all three entities: sarah.chen (SF, MacBook, Okta Verify, standard apps), james.wu (NYC, ThinkPad, Okta Verify), maria.garcia (Chicago, MacBook Air, Okta Verify). Baselines include typical locations, hours, devices, apps, and MFA methods. |
| Score inflation | Pass | Both scored deviations (RCT-20260328-001 score 5, RCT-20260328-002 score 5) show explicit base score (3 = EXPECTED_MALICIOUS) with individually justified modifiers (+1 no change ticket, +1 Tor exit node / follows prior anomaly). No unexplained score jumps. |
| Bare sequential claim | Pass | FINDINGS.md references "4-minute gap between consent and rule creation" with timestamp evidence from QRY-20260328-002. All sequential claims reference entity timelines in query logs. No narrative-only sequence assertions. |
| Single-source timeline | Pass | sarah.chen's timeline includes both M365 identity events (QRY-20260328-001) and Okta events (QRY-20260328-003). Cross-IdP correlation documented — the absence of the consent event in Okta is itself a material finding. james.wu and maria.garcia timelines include both M365 and Okta sources. |

## Template Clustering Integrity

| Query | Events | Templates | Clustering Valid |
|-------|--------|-----------|-----------------|
| QRY-20260328-001 | 312 | 4 | Yes — templates match expected M365 identity event patterns. Malicious consent isolated within 47-event cluster by app UUID and source IP. |
| QRY-20260328-002 | 23 | 2 | Yes — two distinct event types (UAL inbox rule + Defender alert) produce two templates as expected. |
| QRY-20260328-003 | 847 | 3 | Yes — templates map to Okta session start, MFA completion, and OAuth token grant event types. All clusters show baseline behavior. |

## Pack Progression Verification

| Progression Step | Technique | Expected Signal | Actual Signal | Match |
|-----------------|-----------|-----------------|---------------|-------|
| 1. phishing_delivery (T1566) | T1566 | suspicious_sender, url_in_body | Phishing email with OAuth consent URL delivered to 3 users | Yes |
| 2. session_hijack (T1078) | T1078 | oauth_app_grant, token_from_unfamiliar_ip | OAuth consent from Tor exit node to malicious app | Yes |
| 3. mailbox_tampering (T1098) | T1098 | inbox_rule_created, forwarding_enabled | New-InboxRule "Auto-Forward" to Protonmail | Yes |

All three steps of the `phish-to-consent-to-takeover` progression confirmed. Expected malicious next predictions matched actual observations in steps 2 and 3.

## Contradictory Evidence

- None identified. All evidence is consistent with the phishing campaign theory. The disproval of HYP-03 (no lateral movement) is a scope limitation result, not contradictory evidence — it narrows the impact rather than contradicting the attack theory.

## Blind Spots

- Endpoint telemetry unavailable (CrowdStrike requires IR escalation) — cannot assess whether sarah.chen's device was also compromised
- Email body content not examined (eDiscovery required) — the phishing email's consent URL and any additional payloads are unverified
- Contacts.Read API calls are not audited — cannot confirm whether the attacker harvested sarah.chen's contact list
- 72h observation window may miss slower lateral movement attempts

## Follow-Up Needed

- Execute remediation actions listed in FINDINGS.md (revoke consent, remove rule, reset credentials, block app)
- Extend monitoring for james.wu and maria.garcia to 30 days
- Request eDiscovery review of the phishing email content to extract the consent URL and assess for additional payloads
- Evaluate Conditional Access policy changes to require admin consent for sensitive permission scopes
- Promote detection candidates to production detection rules
