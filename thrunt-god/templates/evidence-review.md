# Evidence Review Template

Template for `.planning/EVIDENCE_REVIEW.md`.

<template>

```markdown
# Evidence Review: [Program or Case Name]

## Publishability Verdict

[Ready to publish | Needs more evidence | Needs scope correction]

## Evidence Quality Checks

| Check | Status | Notes |
|-------|--------|-------|
| Receipts exist for material claims | [Pass/Fail] | [notes] |
| Contradictory evidence captured | [Pass/Fail] | [notes] |
| Scope boundaries documented | [Pass/Fail] | [notes] |
| Confidence stated | [Pass/Fail] | [notes] |
| Chain of custody captured | [Pass/Fail] | [notes] |
| Sequential evidence integrity | [Pass/Fail] | [Entity timelines, baselines, predictions, scores] |

## Sequential Evidence Anti-Patterns

Check for these anti-patterns in any finding that references entity behavior over time:

| Anti-Pattern | Signal | Required Fix |
|-------------|--------|--------------|
| Post-hoc rationalization | Events connected retroactively without documented prediction before observation | Document what was predicted BEFORE each event was examined |
| Missing baseline | Claim of "anomalous" behavior without documented normal behavior | Add baseline section with typical patterns for the entity |
| Score inflation | Deviation score assigned without explicit increase/decrease factors | Recompute score showing each factor and its contribution |
| Bare sequential claim | Finding asserts sequence-dependent behavior (e.g., "after X, the attacker did Y") without entity timeline | Construct timeline in QUERIES/ before making sequential claims |
| Single-source timeline | Entity timeline built from only one telemetry source when multiple are available | Cross-reference with additional connectors per pack execution_targets |

## Contradictory Evidence

- [receipt or observation]

## Blind Spots

- [gap]

## Follow-Up Needed

- [next action]
```

</template>
