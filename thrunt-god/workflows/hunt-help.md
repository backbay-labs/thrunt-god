# THRUNT Command Reference

THRUNT is the threat-hunting orchestration surface for this repo.
The operating loop is:

1. Signal
2. Hunt
3. Swarm
4. Receipt
5. Publish

## Core Commands

| Command | Purpose |
|---------|---------|
| `/hunt:help` | Show this reference |
| `/hunt:new-program [--auto] [--skeleton]` | Initialize a long-lived threat hunting program |
| `/hunt:new-case [--auto]` | Initialize a case from a detection, intel lead, or analyst suspicion |
| `/hunt:map-environment [--skeleton]` | Inventory telemetry, retention, blind spots, and query surfaces |
| `/hunt:shape-hypothesis [signal-or-phase]` | Refine raw leads into testable hypotheses |
| `/hunt:plan <phase>` | Create phase plans with exact evidence and receipt expectations |
| `/hunt:run <phase>` | Execute hunt plans and record query logs plus receipts |
| `/hunt:validate-findings [phase]` | Test conclusions against evidence and counter-evidence |
| `/hunt:publish [target]` | Ship a case report, escalation, detection promotion, or summary |

## Artifact Layout

```text
.planning/
├── MISSION.md
├── HYPOTHESES.md
├── SUCCESS_CRITERIA.md
├── HUNTMAP.md
├── STATE.md
├── FINDINGS.md
├── EVIDENCE_REVIEW.md
├── QUERIES/
├── RECEIPTS/
├── environment/
│   └── ENVIRONMENT.md
├── phases/
└── published/
```

## Hunt Phases

Default case flow:

1. **Signal Intake** - clarify the lead, scope, and desired outcome
2. **Hypothesis Shaping** - convert suspicion into testable assertions
3. **Swarm Execution** - parallelize collection across telemetry domains
4. **Evidence Correlation** - reconcile receipts, contradictions, and gaps
5. **Publish** - drive action with the smallest useful report

## Working Rules

- Every material claim must cite evidence or remain marked as a hypothesis.
- Query logs belong in `QUERIES/`.
- Evidence receipts belong in `RECEIPTS/`.
- Confidence is not implied; it must be stated.
- Contradictory evidence is first-class, not an appendix.
- Hunt-native docs stay authoritative.

## Practical Paths

New signal:

```text
/hunt:new-case
/hunt:shape-hypothesis
/hunt:plan 1
/hunt:run 1
/hunt:validate-findings 1
/hunt:publish
```

New program:

```text
/hunt:new-program --skeleton
/hunt:map-environment --skeleton
/hunt:map-environment
/hunt:new-case
```
