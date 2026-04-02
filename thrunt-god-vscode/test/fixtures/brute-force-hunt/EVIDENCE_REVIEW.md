# Evidence Review: Meridian Brute Force to Persistence

## Publishability Verdict

Ready to publish

## Evidence Quality Checks

| Check | Status | Notes |
|-------|--------|-------|
| Receipts exist for material claims | Pass | 4 receipts (RCT-20260329-001 through 004) cover all 4 hypotheses |
| Contradictory evidence captured | Pass | HYP-04 disproval documented; no contradictory evidence for HYP-01/02/03 |
| Scope boundaries documented | Pass | Time window, entities, tenants, and telemetry surfaces recorded in MISSION.md and ENVIRONMENT.md |
| Confidence stated | Pass | Each receipt and hypothesis includes confidence level with justification |
| Chain of custody captured | Pass | All receipts include collection method, source API, event identifiers, and timestamps |
| Sequential evidence integrity | Pass | Entity timelines constructed for david.park (QRY-20260329-002) and aggregate spray (QRY-20260329-001). Baselines documented. Predictions stated before observations. Deviation scores computed with explicit factors (RCT-20260329-001: 4, RCT-20260329-002: 6, RCT-20260329-003: 5) |

## Sequential Evidence Anti-Patterns

Check for these anti-patterns in any finding that references entity behavior over time:

| Anti-Pattern | Signal | Status |
|-------------|--------|--------|
| Post-hoc rationalization | Events connected retroactively without documented prediction before observation | Clear -- predictions documented in all 3 anomaly-framed receipts using pack progressions before examining subsequent events |
| Missing baseline | Claim of "anomalous" behavior without documented normal behavior | Clear -- baseline for david.park documented in QRY-20260329-002 (typical locations, hours, devices, apps, MFA method, daily event rates) |
| Score inflation | Deviation score assigned without explicit increase/decrease factors | Clear -- all scores show factor-by-factor breakdown with named contributions |
| Bare sequential claim | Finding asserts sequence-dependent behavior without entity timeline | Clear -- entity timeline in QRY-20260329-002 (16 events), aggregate timeline in QRY-20260329-001 |
| Single-source timeline | Entity timeline built from only one telemetry source when multiple are available | Clear -- david.park timeline crosses Okta (identity) and M365 (cloud) surfaces per pack execution_targets |

## Contradictory Evidence

- None identified. The attack chain is internally consistent across identity and cloud telemetry surfaces. The only ambiguity is the MFA acceptance mechanism (fatigue vs. social engineering), which does not contradict the compromise conclusion.

## Blind Spots

- **DLP/CASB gap:** No Data Loss Prevention or Cloud Access Security Broker deployed. Cannot confirm whether the 47 downloaded files were exfiltrated beyond the M365 tenant boundary or only accessed within the browser/application. This is documented in ENVIRONMENT.md, MISSION.md (Operating Constraints), RCT-20260329-003 (Confidence section), and FINDINGS.md (What We Do Not Know).
- **MFA social engineering:** Okta System Log does not capture phone calls or SMS messages sent to david.park before the MFA push. If the attacker called david.park to request MFA approval, this interaction is invisible to the telemetry sources queried.
- **On-premises AD:** Federated through Okta but not directly queryable. Any on-premises activity by the attacker (unlikely given cloud-only attack chain) would not appear in hunt telemetry.

## Follow-Up Needed

- Deploy CASB with retroactive file access analysis to determine whether downloads resulted in data leaving the tenant
- Interview david.park regarding the MFA push acceptance (did they receive a phone call, text, or email prompting approval?)
- Monitor for attacker return using the credential or persistence mechanisms before remediation is complete
- Evaluate whether the credential source can be identified through breach database correlation services
