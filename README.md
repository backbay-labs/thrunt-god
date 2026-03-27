<p align="center">
  <img src="assets/hero.png" alt="THRUNT GOD" width="820" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/thrunt-god"><img src="https://img.shields.io/npm/v/thrunt-god?style=flat-square&logo=npm&label=npm" alt="npm"></a>
  <a href="https://github.com/backbay-labs/thrunt-god/actions"><img src="https://img.shields.io/github/actions/workflow/status/backbay-labs/thrunt-god/test.yml?branch=main&style=flat-square&logo=github&label=CI" alt="CI Status"></a>
  <a href="https://discord.gg/tWKSGCvq"><img src="https://img.shields.io/badge/discord-join-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License: MIT"></a>
</p>

<p align="center">
  <em>
    From signal, to swarm.<br/>
    No gods. Only Thrunt.
  </em>
</p>

<p align="center">
  <strong>Threat hunting command system for agentic IDEs.</strong><br/>
  Claude Code &middot; OpenCode &middot; Gemini &middot; Codex &middot; Copilot &middot; Cursor &middot; Windsurf
</p>

<p align="center">
  <code>/thrunt:autonomous</code> &nbsp;|&nbsp; one command, full hunt
</p>

<p align="center">
  <a href="#installation">Install</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;
  <a href="#the-five-phases">Phases</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;
  <a href="#hunt-commands">Commands</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;
  <a href="#common-flows">Flows</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;
  <a href="#canonical-artifacts">Artifacts</a>
</p>

---

## Installation

```bash
npx thrunt-god@latest --claude --local
```

<p align="center">
  <img src="assets/terminal.svg" alt="thrunt-god install" width="640" />
</p>

Bootstrap the hunt command surface into your local IDE environment.

| IDE                  | Command      |
| -------------------- | ------------ |
| Claude Code / Gemini | `/hunt:help` |
| OpenCode             | `/hunt-help` |
| Codex                | `$hunt-help` |
| Copilot              | `/hunt-help` |
| Cursor / Windsurf    | `hunt-help`  |

---

## The Five Phases

Every hunt resolves through five phases. Each step is explicit.

<p align="center">
  <img src="assets/phases.png" alt="Signal → Hunt → Swarm → Receipt → Publish" width="820" />
</p>

| Phase       |                                                                            |
| ----------- | -------------------------------------------------------------------------- |
| **Signal**  | A detection, anomaly, lead, or intel input opens the case                  |
| **Hunt**    | Hypotheses are formed, scoped, and made testable                           |
| **Swarm**   | Parallel agents execute structured investigations across available sources |
| **Receipt** | Every claim is bound to exact queries, timestamps, and evidence lineage    |
| **Publish** | Only validated findings are packaged for downstream consumers              |

---

## Hunt Commands

| Command                           | Purpose                                      |
| --------------------------------- | -------------------------------------------- |
| `/hunt:new-program`               | Stand up a long-lived hunt program           |
| `/hunt:new-case`                  | Open a case from a signal                    |
| `/hunt:map-environment`           | Inventory data sources, access, and topology |
| `/hunt:shape-hypothesis`          | Develop and refine testable hypotheses       |
| `/hunt:plan <phase>`              | Plan a hunt phase                            |
| `/hunt:run <phase>`               | Execute a hunt phase                         |
| `/hunt:validate-findings [phase]` | Validate evidence chain for findings         |
| `/hunt:publish [target]`          | Package and ship findings                    |
| `/hunt:help`                      | Show all commands and usage                  |

### Thrunt Commands

Utility and orchestration commands (`/thrunt:*`) for workspace management, diagnostics, settings, and agent control.

---

## Common Flows

<table>
<tr>
<td width="50%">

### Single signal

```text
/hunt:new-case
/hunt:shape-hypothesis
/hunt:plan 1
/hunt:run 1
/hunt:validate-findings 1
/hunt:publish
```

</td>
<td width="50%">

### Long-lived program

```text
/hunt:new-program
/hunt:map-environment
/hunt:new-case
  ... repeat per signal ...
```

</td>
</tr>
<tr>
<td width="50%">

### Pack-seeded signal

```text
/hunt:new-case --pack domain.identity-abuse
/hunt:run 1
/hunt:validate-findings 1
```

</td>
<td width="50%">

### Autonomous

```text
/thrunt:autonomous
```

Runs all remaining phases end-to-end: discuss, plan, execute. Pauses only for operator decisions.

</td>
</tr>
</table>

---

## Canonical Artifacts

Every hunt produces a structured artifact tree. These are the canonical hunt artifacts and the system of record — not prose, not summaries.

```text
.planning/
├── MISSION.md              # Hunt program mission and scope
├── HYPOTHESES.md           # Testable hypotheses with status
├── SUCCESS_CRITERIA.md     # What "done" looks like
├── HUNTMAP.md              # Data sources and access map
├── STATE.md                # Current hunt state
├── FINDINGS.md             # Validated findings only
├── EVIDENCE_REVIEW.md      # Evidence chain review
├── QUERIES/                # Exact queries, reproducible
├── RECEIPTS/               # Signed execution receipts
├── environment/
│   └── ENVIRONMENT.md      # Environment inventory
├── phases/                 # Per-phase plans and results
└── published/              # Final deliverables
```

> Exact queries, receipts, timestamps, and lineage are the finding. If it cannot be reproduced, it does not exist.
