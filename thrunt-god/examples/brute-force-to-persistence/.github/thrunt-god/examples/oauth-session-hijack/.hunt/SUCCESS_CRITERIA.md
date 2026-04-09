# Success Criteria: OAuth Phishing Campaign — acme.corp M365

## Hunt Quality Gates

- Every material claim cites a receipt or query log
- Contradictory evidence is called out explicitly
- Scope boundaries are recorded
- Confidence is stated for each conclusion

## Exit Conditions

### Confirmed Malicious Activity

- OAuth consent grant linked to phishing delivery (email with consent URL identified)
- Consent grant from anomalous IP not in user's sign-in history
- Malicious app permissions include data access scopes (Mail.ReadWrite, Contacts.Read)
- Post-consent persistence or exfiltration mechanism identified (mailbox rule, delegate, forwarding)

### Benign / False Positive

- App is a known legitimate integration registered by IT with a corresponding change ticket
- Consent was initiated from a known corporate IP during business hours
- App publisher is verified and matches expected vendor

### Inconclusive But Actionable

- What is known: Consent grant occurred but no downstream malicious activity observed
- What remains unknown: Whether the app will be used maliciously in the future
- What follow-up is recommended: Monitor app API activity for 30 days; add app ID to watchlist

## Publish Gates

- All three hypotheses resolved with evidence (supported or disproved)
- Entity timelines constructed for all focus users with baselines documented
- Sequential evidence integrity verified (predictions documented before observations)
- Anomaly framing scores computed for all material deviations
- Pack progression match documented against `family.oauth-phishing-session-hijack`

## Non-Goals

- Full forensic analysis of sarah.chen's endpoint (requires IR escalation with CrowdStrike access)
- Attribution of the attacker beyond IP and app registration metadata
- Remediation execution (this hunt produces findings; remediation is a separate SOC workflow)
