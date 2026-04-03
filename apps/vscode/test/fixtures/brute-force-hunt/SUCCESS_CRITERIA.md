# Success Criteria: Meridian Brute Force to Persistence

## Hunt Quality Gates

- Every material claim cites a receipt or query log
- Contradictory evidence is called out explicitly
- Scope boundaries are recorded
- Confidence is stated for each conclusion
- Chain of custody captured for all evidence
- Sequential evidence integrity verified (entity timelines, baselines, predictions, scores documented before observations)

## Exit Conditions

### Confirmed Malicious Activity

- At least one account shows successful authentication from a spray-associated IP
- Post-authentication activity is inconsistent with the account owner's baseline behavior
- Persistence mechanism (MFA change, app consent, or credential modification) is documented
- Scope of accessed resources is determined

### Benign / False Positive

- All failed authentications are from known testing infrastructure
- Successful authentications only from corporate IPs with expected MFA
- No post-authentication anomalies for any targeted account

### Inconclusive But Actionable

- Spray confirmed but no successful authentication detected
- Successful authentication detected but post-auth activity within baseline
- Recommend: enforce password rotation for targeted accounts, monitor for delayed compromise

## Publish Gates

- All hypothesis verdicts have supporting receipts with deviation scores
- Entity timeline for compromised account spans identity and cloud surfaces
- Attack timeline reconstructed with timestamps and evidence chain
- Blind spots (DLP/CASB gap) documented explicitly
- Recommendations include containment, remediation, and prevention actions

## Non-Goals

- Full forensic disk imaging of david.park's endpoint (would require IR engagement)
- Attribution of the threat actor beyond IP and ASN analysis
- Assessment of breach database source or credential exposure scope
- Penetration testing of Meridian's Okta configuration
