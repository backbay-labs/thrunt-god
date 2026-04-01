# Anomaly Framing: Sequential Prediction Pattern

How to reason about event sequences during hunt execution. This pattern turns implicit "that looks suspicious" into auditable "I expected X, observed Y, and scored the deviation."

## Core Principle

**Predict before you observe.**

For every entity timeline you examine, explicitly state what the EXPECTED next event would be BEFORE looking at the actual next event. This forces structured reasoning instead of post-hoc rationalization.

The prediction comes from three sources:

1. **Baseline behavior** -- what this entity normally does (from the telemetry itself)
2. **Attack progression** -- what an adversary would do next (from MITRE ATT&CK and pack progressions)
3. **Business context** -- what the entity's role and environment predict (from ENVIRONMENT.md)

## When to Apply

Apply this pattern whenever the hunt plan includes:

- Timeline construction for any entity (user, host, service account, process)
- Correlation across multiple telemetry surfaces for the same entity
- Hypothesis testing that involves sequence-dependent behavior

Do NOT apply when:

- Performing point-in-time searches (single event queries)
- Aggregating statistics (count-based analysis)
- Reviewing static configuration

## The Five-Step Sequence

### Step 1: Entity Selection and Timeline Construction

Group raw telemetry by entity. Entity types from pack scope_defaults:

| Entity Type | Grouping Key | Common Sources |
|-------------|-------------|----------------|
| user | UPN / email / account ID | Identity (Okta, Entra ID), email, SIEM |
| host | hostname / asset ID / agent ID | Endpoint (CrowdStrike), SIEM |
| session | session ID / token | Identity, cloud audit |
| process | PID + host + timestamp | Endpoint |
| ip | source IP | All |
| service_account | principal / SPN | Cloud (AWS, GCP), identity |

Sort events chronologically within each entity group. If events span multiple connectors, normalize timestamps to UTC before sorting.

Record the timeline in the QUERIES/ log:

```
## Entity Timeline: alice@example.com
| # | Timestamp (UTC) | Source | Event Type | Detail |
|---|-----------------|--------|------------|--------|
| 1 | 2025-01-15T08:30:00Z | Okta | sign_in | Location: NYC, Device: known laptop |
| 2 | 2025-01-15T08:35:00Z | M365 | app_access | SharePoint, normal |
| 3 | 2025-01-15T14:20:00Z | Okta | sign_in | Location: Moscow, Device: unknown |
| 4 | 2025-01-15T14:22:00Z | Okta | mfa_factor_enrolled | New TOTP factor |
| 5 | 2025-01-15T14:25:00Z | M365 | mailbox_rule_created | Auto-forward to external |
```

### Step 2: Baseline Establishment

Before examining anomalies, establish what NORMAL looks like for this entity.

**From the telemetry itself:**

- Typical sign-in times and locations
- Normal application access patterns
- Expected session durations
- Usual device/user-agent fingerprints

**From ENVIRONMENT.md:**

- Entity role (admin, standard user, service account)
- Expected geographic locations
- Business hours for the entity's timezone
- Known automation patterns

**From prior hunt phases:**

- Previously validated behaviors from earlier receipts
- Known-good baselines established in prior hunts

Document the baseline explicitly:

```
## Baseline: alice@example.com
- Typical locations: NYC, NJ
- Typical hours: 08:00-18:00 EST
- Known devices: MacBook Pro (device ID: abc123)
- Normal apps: SharePoint, Teams, Outlook
- MFA method: Push notification via Okta Verify
- Admin: No
```

### Step 3: Sequential Prediction

For each event in the timeline, BEFORE examining the next event, state:

1. **Expected benign next:** What would a legitimate user do next?
2. **Expected malicious next:** What would an adversary do next (per MITRE ATT&CK)?
3. **Ambiguous next:** What events could go either way?

Use pack `expected_progressions` if defined. Otherwise, apply these common patterns:

#### After Anomalous Sign-In (T1078 indicator)

| Category | Expected Events |
|----------|----------------|
| Benign | VPN reconnect, password reset via helpdesk, travel-related IP change |
| Malicious | MFA factor change, mailbox rule creation, OAuth app consent, privilege escalation attempt |
| Ambiguous | Access to sensitive resources (could be normal or reconnaissance) |

#### After Account Modification (T1098 indicator)

| Category | Expected Events |
|----------|----------------|
| Benign | Documented change request fulfilled, admin performing routine maintenance |
| Malicious | Immediate use of new privileges, creation of additional accounts, disabling of security controls |
| Ambiguous | Group membership change (could be HR-driven or adversary-driven) |

#### After Suspicious Execution (T1059 indicator)

| Category | Expected Events |
|----------|----------------|
| Benign | Scheduled task, IT admin maintenance, CI/CD pipeline |
| Malicious | Encoded commands, credential dumping, network scanning, lateral tool transfer |
| Ambiguous | Script execution by admin user outside normal hours |

#### After Phishing Delivery (T1566 indicator)

| Category | Expected Events |
|----------|----------------|
| Benign | User reports phish, message quarantined, no follow-on activity |
| Malicious | Link click followed by credential entry, OAuth consent, mailbox compromise |
| Ambiguous | User opens email but no downstream indicators |

### Step 4: Deviation Detection and Scoring

Compare the ACTUAL next event against predictions from Step 3.

**Deviation categories:**

| Category | Definition | Score |
|----------|-----------|-------|
| EXPECTED_BENIGN | Actual matches benign prediction | 0 (clear) |
| EXPECTED_MALICIOUS | Actual matches known attack progression | 3 (critical -- known TTP) |
| NOVEL_ANOMALY | Actual matches neither benign nor malicious predictions | 2 (investigate -- unknown pattern) |
| AMBIGUOUS | Actual could be benign or malicious | 1 (context needed) |
| TEMPORAL_ANOMALY | Event order is reversed or time gap is abnormal | 2 (investigate) |

**Scoring factors that increase severity:**

| Factor | Modifier |
|--------|----------|
| Multiple deviation signals for the same entity within the time window | +1 per additional |
| Deviation occurs after a confirmed earlier anomaly | +1, cumulative |
| Entity is a privileged account or service account | +1 |
| No corresponding change ticket, helpdesk interaction, or documented reason | +1 |
| Event matches a specific MITRE ATT&CK sub-technique with pack coverage | +1 |

**Scoring factors that decrease severity:**

| Factor | Modifier |
|--------|----------|
| Event correlates with known helpdesk ticket or change request | -2 |
| Entity's role explains the activity (admin doing admin things) | -1 |
| Event is within business hours and from known location | -1 |
| Similar pattern seen across many entities simultaneously (likely automated/benign) | -1 |

**Composite scoring:**

| Total Score | Classification | Action |
|-------------|---------------|--------|
| 0 | Clear | No finding |
| 1 | Low interest | Document, continue |
| 2-3 | Medium interest | Add to findings, pivot for more context |
| 4-5 | High interest | Material finding, create receipt, escalate in findings |
| 6+ | Critical | Material finding with high confidence, prioritize in FINDINGS.md |

### Step 5: Documentation as Receipt

Every prediction-deviation pair that scores >= 2 MUST be documented as a receipt:

```markdown
## Receipt: RCPT-{id}

**Entity:** alice@example.com
**Event #:** 3 in timeline (sign_in from Moscow)
**Timestamp:** 2025-01-15T14:20:00Z

### Prediction (before observing event #4)
- Expected benign: VPN reconnect, travel login
- Expected malicious: MFA change, mailbox rule, privilege escalation
- Ambiguous: Sensitive resource access

### Actual Event #4
MFA factor enrolled (new TOTP factor) at 2025-01-15T14:22:00Z

### Deviation Assessment
- **Category:** EXPECTED_MALICIOUS
- **Score:** 3 (known TTP match) + 1 (follows confirmed anomaly) + 1 (no change ticket) = 5 (HIGH)
- **ATT&CK mapping:** T1098.005 (Device Registration) or T1098 (Account Manipulation)
- **Pack reference:** technique.t1098-account-manipulation

### What Would Change This Assessment
- Evidence of legitimate travel to Moscow (business context)
- Helpdesk ticket for MFA reset initiated by the user
- User self-service MFA enrollment following device replacement
```

## Integration Points

### During hunt-run (thrunt-telemetry-executor)

When executing hunt plans that produce entity timelines:

1. **Before the first query:** Read ENVIRONMENT.md and pack scope_defaults to identify entity grouping keys
2. **After receiving query results:** Apply Steps 1-2 (timeline construction and baseline)
3. **For each event in the timeline:** Apply Steps 3-4 (predict then score)
4. **For material deviations (score >= 2):** Apply Step 5 (receipt creation)
5. **In SUMMARY.md:** Include a "Sequential Analysis" section listing entity timelines examined, total events, deviations found, and highest-scoring anomalies

### During hunt-validate-findings (thrunt-findings-validator)

When validating hunt output:

1. **Check that entity timelines exist** for entities mentioned in findings
2. **Verify baselines are documented** for entities with material claims
3. **Verify prediction-deviation pairs are documented** -- findings that claim "suspicious" without prediction-deviation pairs are unsupported narrative
4. **Cross-reference deviation scores** against hypothesis verdicts -- a hypothesis marked "Supported" should have at least one deviation score >= 4
5. **Flag bare claims:** Any finding that asserts anomalous behavior without (a) a documented baseline, (b) an explicit prediction, and (c) a scored deviation is incomplete evidence

### During hunt-publish

When publishing findings:

1. **Include entity timelines** in the situation summary for material findings
2. **Reference deviation scores** in confidence assessments
3. **Map deviations to ATT&CK techniques** for detection promotion artifacts
4. **Note prediction accuracy** -- which predictions were correct, which were wrong, and what was novel

## Common Mistakes

### Mistake 1: Post-Hoc Rationalization

**Wrong:** "I found a sign-in from Moscow, then found an MFA change -- this is suspicious."

**Right:** "After observing a sign-in from Moscow (deviation from NYC baseline), I predicted the next event would be MFA change or mailbox rule if malicious. The actual next event was MFA enrollment, matching the malicious prediction."

The difference: in the wrong version, the analyst already knows both events and connects them retroactively. In the right version, the prediction is explicit and documented before the observation.

### Mistake 2: Scoring Without Baseline

**Wrong:** "MFA enrollment score: HIGH because MFA changes are suspicious."

**Right:** "MFA enrollment score: HIGH because (1) it followed an impossible-travel sign-in by 2 minutes, (2) the user's baseline shows no MFA changes in 6 months, (3) no helpdesk ticket exists."

A score without a baseline is an opinion, not an assessment.

### Mistake 3: Ignoring Benign Predictions

**Wrong:** Only documenting malicious predictions that matched.

**Right:** Also documenting when the actual next event matched the benign prediction. This REDUCES the overall anomaly score and provides counter-evidence for the hypothesis.

Ignoring benign predictions is confirmation bias. Every prediction cycle must document all three categories (benign, malicious, ambiguous) regardless of outcome.

### Mistake 4: Single-Entity Tunnel Vision

**Wrong:** Examining only the target user's timeline.

**Right:** Checking whether the same anomalous pattern affects multiple entities (mass phishing vs. targeted attack) and whether the anomalous source IP appears in other entity timelines.

Multi-entity correlation changes the interpretation: a single user with impossible travel is an account compromise; fifty users from the same IP is a VPN or proxy misconfiguration.

### Mistake 5: Treating Novel as Malicious

**Wrong:** "Event doesn't match any known pattern, therefore malicious."

**Right:** "Event doesn't match benign OR malicious predictions. Score: 2 (NOVEL_ANOMALY). Needs investigation -- pivot to additional telemetry sources before classifying."

NOVEL_ANOMALY is a category, not a verdict. It means the agent's predictions were insufficient, not that the event is malicious. The correct response is to gather more context, not to escalate.

## Relationship to Existing Hunt Pack Fields

| Pack Field | How Anomaly Framing Uses It |
|------------|---------------------------|
| `scope_defaults.entities` | Entity grouping keys for Step 1 |
| `scope_defaults.time_window` | Observation period for timeline construction |
| `hypothesis_templates` | Seed for malicious predictions in Step 3 |
| `execution_targets` | Queries that produce the raw timeline data |
| `blind_spots` | Known gaps where sequential reasoning may be incomplete |
| `publish.expected_outcomes` | Narrative structure for deviation documentation |
| `expected_progressions` (NEW) | Pre-defined attack chains for Step 3 predictions |
