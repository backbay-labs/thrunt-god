/**
 * THRUNT GOD Slack War Room Bot
 *
 * Surfaces for coordinating hunts, approvals, and handoff in Slack.
 * Runs in socket mode by default (no public URL needed).
 */

import { App, LogLevel } from "@slack/bolt"
import type { KnownBlock } from "@slack/types"
import { loadConfig } from "./config.ts"
import { createBindings } from "./bindings.ts"
import { createApprovalStore } from "./approvals.ts"
import { registerCommands } from "./handlers/commands.ts"
import { registerActions } from "./handlers/actions.ts"
import { registerEvents } from "./handlers/events.ts"
import { registerShortcuts } from "./handlers/shortcuts.ts"
import { registerViews } from "./handlers/views.ts"
import { startNotifier, createNotifierManager } from "./notify.ts"
import type { NotifierManager } from "./notify.ts"
import type { PlanningWatcher } from "./watcher.ts"
import { approvalRequestBlocks } from "./blocks/approval.ts"

const config = loadConfig()

const app = new App({
  token: config.slackBotToken,
  appToken: config.slackAppToken,
  signingSecret: config.slackSigningSecret,
  socketMode: true,
  logLevel: config.logLevel === "debug" ? LogLevel.DEBUG : LogLevel.INFO,
})

// Channel bindings — persistent channel-to-workspace mapping
const bindings = createBindings(config.workspaceRoot)

// Approval store — persistent pending approval state
const approvalStore = createApprovalStore(config.workspaceRoot)

// Register all handler modules
// notifierManager is late-initialized in start(), so pass a lazy sync callback
registerCommands(app, config, bindings, () => notifierManager?.sync())
registerActions(app, config, approvalStore)
registerEvents(app, config)
registerShortcuts(app, config)
registerViews(app, config, bindings)

// ── Publish API (for external callers) ─────────────────────────────────

export { app, config, bindings, approvalStore }
export { readHuntStatus, readFindings, readReceipts, readMission } from "./hunt/state.ts"
export { startNotifier } from "./notify.ts"
export { createBindings } from "./bindings.ts"
export { createApprovalStore } from "./approvals.ts"
export type { ChannelBindings } from "./bindings.ts"
export type { ApprovalStore, PendingApproval } from "./approvals.ts"
export type { PlanningWatcher, WatcherEvent, WatcherCallback } from "./watcher.ts"

/**
 * Post a hunt summary to a channel. Called by external systems
 * (e.g., THRUNT CLI after a phase completes) to publish into Slack.
 */
export async function publishToChannel(
  channelId: string,
  blocks: KnownBlock[],
  text: string,
  threadTs?: string,
): Promise<void> {
  await app.client.chat.postMessage({
    channel: channelId,
    blocks,
    text,
    thread_ts: threadTs,
  })
}

/**
 * Request operator approval via Slack. Returns the message timestamp
 * so callers can track the approval state.
 */
export async function requestApproval(
  channelId: string,
  approval: {
    id: string
    action: string
    rationale: string
    phase: string
  },
): Promise<string> {
  const req = {
    ...approval,
    requestedAt: new Date().toISOString(),
    status: "pending" as const,
  }

  const result = await app.client.chat.postMessage({
    channel: channelId,
    blocks: approvalRequestBlocks(req),
    text: `Approval required: ${req.action}`,
  })

  await approvalStore.set(approval.id, {
    action: approval.action,
    rationale: approval.rationale,
    phase: approval.phase,
    requestedAt: req.requestedAt,
    channelId,
    messageTs: result.ts ?? "",
  })

  return result.ts ?? ""
}

// ── Start ──────────────────────────────────────────────────────────────

let activeWatcher: PlanningWatcher | null = null
let notifierManager: NotifierManager | null = null

async function start(): Promise<void> {
  // Load persisted state
  await bindings.load()
  await approvalStore.load()

  await app.start(config.port)
  console.log(`[thrunt-slack] Bot running (socket mode, port ${config.port})`)
  console.log(`[thrunt-slack] Workspace: ${config.workspaceRoot}`)

  // Start bindings-managed notifiers for all bound workspaces
  notifierManager = createNotifierManager(app, bindings)
  notifierManager.sync()

  // Auto-start file watcher when a default channel is configured
  // and it isn't already covered by a binding
  if (config.defaultChannelId && !bindings.resolve(config.defaultChannelId)) {
    activeWatcher = startNotifier(app, config.defaultChannelId, config.workspaceRoot)
  }
}

// Clean up watchers and stop app on process exit
async function cleanup(): Promise<void> {
  if (activeWatcher) {
    activeWatcher.stop()
    activeWatcher = null
  }
  if (notifierManager) {
    notifierManager.stopAll()
    notifierManager = null
  }
  try {
    await app.stop()
  } catch {
    // app may not have started yet
  }
  process.exit(0)
}

process.on("SIGINT", () => void cleanup())
process.on("SIGTERM", () => void cleanup())

if (import.meta.main) {
  start().catch((err) => {
    console.error("[thrunt-slack] Fatal:", err)
    process.exit(1)
  })
}
