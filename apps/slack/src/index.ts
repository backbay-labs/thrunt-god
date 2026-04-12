/**
 * THRUNT GOD Slack War Room Bot
 *
 * Surfaces for coordinating hunts, approvals, and handoff in Slack.
 * Runs in socket mode by default (no public URL needed).
 *
 * Module-level imports are side-effect-free. The Bolt App and handler
 * registration happen inside `start()` so external callers can import
 * utility exports (readHuntStatus, createBindings, etc.) without
 * requiring Slack environment variables.
 */

import { App, LogLevel } from "@slack/bolt"
import type { KnownBlock } from "@slack/types"
import type { Config } from "./config.ts"
import type { ChannelBindings } from "./bindings.ts"
import type { ApprovalStore } from "./approvals.ts"
import type { NotifierManager } from "./notify.ts"
import type { PlanningWatcher } from "./watcher.ts"
import { approvalRequestBlocks } from "./blocks/approval.ts"

// ── Lazy runtime state ─────────────────────────────────────────────────

let app: App | null = null
let config: Config | null = null
let bindings: ChannelBindings | null = null
let approvalStore: ApprovalStore | null = null
let activeWatcher: PlanningWatcher | null = null
let notifierManager: NotifierManager | null = null

function requireApp(): App {
  if (!app) throw new Error("Slack bot not started. Call start() first.")
  return app
}

// ── Side-effect-free exports (safe to import without env vars) ─────────

export { loadConfig } from "./config.ts"
export { createBindings } from "./bindings.ts"
export { createApprovalStore } from "./approvals.ts"
export { startNotifier } from "./notify.ts"
export { readHuntStatus, readFindings, readReceipts, readMission, listCases } from "./hunt/state.ts"

export type { Config } from "./config.ts"
export type { ChannelBindings } from "./bindings.ts"
export type { ApprovalStore, PendingApproval } from "./approvals.ts"
export type { PlanningWatcher, WatcherEvent, WatcherCallback } from "./watcher.ts"

/** Access the running App instance (throws if not started) */
export function getApp(): App { return requireApp() }
export function getConfig(): Config {
  if (!config) throw new Error("Slack bot not started. Call start() first.")
  return config
}
export function getBindings(): ChannelBindings {
  if (!bindings) throw new Error("Slack bot not started. Call start() first.")
  return bindings
}

// ── Runtime API (requires start() to have been called) ─────────────────

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
  await requireApp().client.chat.postMessage({
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
  if (!approvalStore) throw new Error("Slack bot not started. Call start() first.")

  const req = {
    ...approval,
    requestedAt: new Date().toISOString(),
    status: "pending" as const,
  }

  const result = await requireApp().client.chat.postMessage({
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

export async function start(): Promise<void> {
  const { loadConfig } = await import("./config.ts")
  const { createBindings } = await import("./bindings.ts")
  const { createApprovalStore } = await import("./approvals.ts")
  const { registerCommands } = await import("./handlers/commands.ts")
  const { registerActions } = await import("./handlers/actions.ts")
  const { registerEvents } = await import("./handlers/events.ts")
  const { registerShortcuts } = await import("./handlers/shortcuts.ts")
  const { registerViews } = await import("./handlers/views.ts")
  const { startNotifier, createNotifierManager } = await import("./notify.ts")

  config = loadConfig()
  bindings = createBindings(config.workspaceRoot)
  approvalStore = createApprovalStore(config.workspaceRoot)

  app = new App({
    token: config.slackBotToken,
    appToken: config.slackAppToken,
    signingSecret: config.slackSigningSecret,
    socketMode: true,
    logLevel: ({ debug: LogLevel.DEBUG, info: LogLevel.INFO, warn: LogLevel.WARN, error: LogLevel.ERROR } as const)[config.logLevel],
  })

  // Capture local refs for the binding-change callback (TS knows these are non-null here)
  const localConfig = config
  const localBindings = bindings
  const runtimeApp = app

  // Register handlers
  registerCommands(app, localConfig, localBindings, () => {
    const defaultChannelId = localConfig.defaultChannelId
    if (defaultChannelId) {
      const defaultBinding = localBindings.resolve(defaultChannelId)

      if (defaultBinding && activeWatcher) {
        activeWatcher.stop()
        activeWatcher = null
      } else if (!defaultBinding && !activeWatcher) {
        activeWatcher = startNotifier(runtimeApp, defaultChannelId, localConfig.workspaceRoot)
      }
    }
    notifierManager?.sync()
  })
  registerActions(app, config, approvalStore, bindings)
  registerEvents(app, config, bindings)
  registerShortcuts(app, config)
  registerViews(app, config, bindings)

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

  // Register signal handlers only when running as the main process
  const localApp = app
  const cleanup = async () => {
    if (activeWatcher) { activeWatcher.stop(); activeWatcher = null }
    if (notifierManager) { notifierManager.stopAll(); notifierManager = null }
    try { await localApp.stop() } catch { /* may not have started */ }
    process.exit(0)
  }
  process.on("SIGINT", () => void cleanup())
  process.on("SIGTERM", () => void cleanup())
}

if (import.meta.main) {
  start().catch((err) => {
    console.error("[thrunt-slack] Fatal:", err)
    process.exit(1)
  })
}
