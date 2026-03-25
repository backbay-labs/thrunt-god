# THRUNT GOD

Threat-hunting orchestration for Claude Code, OpenCode, Gemini, Codex, Copilot, Cursor, and Windsurf.

THRUNT centers a hunt loop:

1. Signal
2. Hunt
3. Swarm
4. Receipt
5. Publish

## Command Surface

- `/hunt:new-program`
- `/hunt:new-case`
- `/hunt:map-environment`
- `/hunt:shape-hypothesis`
- `/hunt:plan <phase>`
- `/hunt:run <phase>`
- `/hunt:validate-findings [phase]`
- `/hunt:publish [target]`
- `/hunt:help`

`/thrunt:*` remains the orchestration and utility namespace for repo management, workspace management, diagnostics, settings, and agent control.

## Planning Artifacts

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

These are the canonical hunt artifacts. Unsupported narrative is not a finding. Exact queries, receipts, timestamps, and evidence lineage matter.

## Installation

```bash
npx thrunt-god@latest --claude --local
```

After install:

- Claude / Gemini: `/hunt:help`
- OpenCode: `/hunt-help`
- Codex: `$hunt-help`
- Copilot: `/hunt-help`
- Cursor / Windsurf: `hunt-help`

## Suggested Flow

For a signal:

```text
/hunt:new-case
/hunt:shape-hypothesis
/hunt:plan 1
/hunt:run 1
/hunt:validate-findings 1
/hunt:publish
```

For a long-lived program:

```text
/hunt:new-program
/hunt:map-environment
/hunt:new-case
```
