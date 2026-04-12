# @thrunt/slack

Slack war room bot for THRUNT GOD threat hunting.

## What it does

| Capability | Surface |
|---|---|
| Open a case from an alert or pasted IOC | `/hunt case`, message shortcut, auto-detect |
| Show hunt status, blockers, current phase | `/hunt status`, `@mention` |
| Request operator approval for autonomous steps | `requestApproval()` API |
| Publish receipt-backed summaries | `publishToChannel()` API |
| Turn a live thread into a THRUNT case | "Create THRUNT Case" message shortcut |

## Setup

### 1. Create a Slack App

Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app with:

**Socket Mode:** Enabled (generates an app-level token starting with `xapp-`)

**Bot Token Scopes:**
- `chat:write`
- `commands`
- `channels:history`
- `groups:history`
- `im:history`
- `mpim:history`

**Event Subscriptions:**
- `message.channels`
- `message.groups`
- `app_mention`

**Slash Commands:**
- `/hunt` — THRUNT hunt operations

**Interactivity & Shortcuts:**
- Message shortcut: `create_thrunt_case` — "Create THRUNT Case"

### 2. Environment

```bash
cp .env.example .env
# Fill in your tokens
```

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
SLACK_SIGNING_SECRET=...
THRUNT_WORKSPACE_ROOT=/path/to/your/project  # directory with .planning/
SLACK_DEFAULT_CHANNEL=C0123456789             # optional
LOG_LEVEL=info                                # debug|info|warn|error
```

### 3. Run

```bash
cd apps/slack
bun install
bun run dev     # watch mode
bun run start   # production
```

## Architecture

```
src/
├── index.ts              # Bolt app init, socket mode, exported API
├── config.ts             # Env → typed config with Zod
├── types.ts              # Domain types (hunt status, IOCs, approvals)
├── hunt/
│   ├── state.ts          # Read .planning/ artifacts (STATE, HUNTMAP, FINDINGS, RECEIPTS)
│   └── case.ts           # Create cases from Slack messages, extract IOCs
├── handlers/
│   ├── commands.ts       # /hunt slash command
│   ├── actions.ts        # Button clicks (approve, deny, view status)
│   ├── events.ts         # Message events (IOC detection, @mention)
│   ├── shortcuts.ts      # Message shortcuts (right-click → create case)
│   └── views.ts          # Modal submissions
└── blocks/
    ├── common.ts         # Block Kit helpers
    ├── status.ts         # Hunt status cards
    ├── approval.ts       # Approval request/response surfaces
    ├── findings.ts       # Findings + receipt summaries
    └── case.ts           # Case creation cards
```

## Programmatic API

The bot exports functions for use by external systems (CLI, agents):

```typescript
import { publishToChannel, requestApproval } from "@thrunt/slack"

// Post findings to an incident channel
await publishToChannel(channelId, findingsBlocks(findings), "Hunt findings")

// Request operator approval before autonomous next step
const messageTs = await requestApproval(channelId, {
  id: crypto.randomUUID(),
  action: "Execute phase 73 — lateral movement sweep",
  rationale: "HYP-02 supported by 3 receipts, ready to expand scope",
  phase: "73",
})
```
