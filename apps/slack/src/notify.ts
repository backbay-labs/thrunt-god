/**
 * Slack notification bridge.
 *
 * Converts PlanningWatcher events into Slack messages and posts them
 * to a configured channel. Each event type maps to an appropriate
 * Block Kit surface using the existing block builders.
 *
 * Supports bindings: when a ChannelBindings instance is provided,
 * events are posted to all channels bound to the watched workspace root.
 */

import type { App } from "@slack/bolt"
import type { KnownBlock } from "@slack/types"
import { createPlanningWatcher, type PlanningWatcher, type WatcherEvent } from "./watcher.ts"
import type { ChannelBindings } from "./bindings.ts"
import { header, section, context, fields } from "./blocks/common.ts"

// =============================================================================
// Event → Slack message formatting
// =============================================================================

export function eventBlocks(event: WatcherEvent): { blocks: KnownBlock[]; text: string } {
  switch (event.type) {
    case "phase_changed": {
      const phase = event.data.currentPhase as string | null
      const name = event.data.currentPhaseName as string | null
      const label = phase
        ? `Phase ${phase}${name ? ` — ${name}` : ""}`
        : "No active phase"

      return {
        text: event.detail,
        blocks: [
          header("Phase Transition"),
          fields([
            ["From", `Phase ${(event.data.previousPhase as string) ?? "none"}`],
            ["To", label],
          ]),
          context([`${event.timestamp}`]),
        ],
      }
    }

    case "phase_completed": {
      return {
        text: event.detail,
        blocks: [
          section(
            `:white_check_mark: *Phase ${event.data.phaseNumber} (${event.data.phaseName})* completed`,
          ),
          context([`${event.timestamp}`]),
        ],
      }
    }

    case "new_receipt": {
      return {
        text: event.detail,
        blocks: [
          section(`:receipt: New evidence receipt: *${event.data.receiptId}*`),
          context([`${event.timestamp}`]),
        ],
      }
    }

    case "blocker_added": {
      return {
        text: event.detail,
        blocks: [
          section(`:no_entry: *Blocker added*\n${event.data.blocker}`),
          context([`${event.timestamp}`]),
        ],
      }
    }

    case "blocker_resolved": {
      return {
        text: event.detail,
        blocks: [
          section(`:white_check_mark: *Blocker resolved*\n~${event.data.blocker}~`),
          context([`${event.timestamp}`]),
        ],
      }
    }

    case "status_changed": {
      return {
        text: event.detail,
        blocks: [
          header("Hunt Status Changed"),
          fields([
            ["Previous", String(event.data.previous ?? "unknown")],
            ["Current", String(event.data.current ?? "unknown")],
          ]),
          context([`${event.timestamp}`]),
        ],
      }
    }

    case "findings_published": {
      const summary = (event.data.summary as string) ?? ""
      const truncated = summary.length > 300 ? summary.slice(0, 297) + "..." : summary

      return {
        text: event.detail,
        blocks: [
          header("Findings Published"),
          ...(truncated ? [section(truncated)] : []),
          context([`${event.timestamp} — Use \`/hunt findings\` for full details`]),
        ],
      }
    }

    default: {
      return {
        text: event.detail,
        blocks: [section(event.detail), context([event.timestamp])],
      }
    }
  }
}

// =============================================================================
// Notifier
// =============================================================================

/**
 * Start watching a workspace and posting change notifications to a Slack channel.
 * Returns the underlying PlanningWatcher for lifecycle management.
 */
export function startNotifier(
  app: App,
  channelId: string,
  workspaceRoot: string,
): PlanningWatcher {
  const watcher = createPlanningWatcher(workspaceRoot)

  watcher.on(async (event: WatcherEvent) => {
    const { blocks, text } = eventBlocks(event)

    try {
      await app.client.chat.postMessage({
        channel: channelId,
        blocks,
        text,
      })
    } catch (err) {
      console.error("[notify] Failed to post to Slack:", err)
    }
  })

  watcher.start()
  console.log(`[notify] Watching ${workspaceRoot} → channel ${channelId}`)

  return watcher
}

// =============================================================================
// Bindings-aware notifier manager
// =============================================================================

/**
 * Manages watchers for all bound workspace roots. One watcher per unique
 * workspace root; events are posted to every channel bound to that root.
 */
export interface NotifierManager {
  /** Sync watchers with current bindings. Call after bind/unbind. */
  sync(): void
  /** Stop all active watchers. */
  stopAll(): void
}

export function createNotifierManager(
  app: App,
  bindings: ChannelBindings,
): NotifierManager {
  const watchers = new Map<string, PlanningWatcher>()

  function channelsForRoot(root: string): string[] {
    const all = bindings.list()
    return Object.entries(all)
      .filter(([, path]) => path === root)
      .map(([ch]) => ch)
  }

  function sync(): void {
    const allBindings = bindings.list()
    const activeRoots = new Set(Object.values(allBindings))

    // Start watchers for new roots
    for (const root of activeRoots) {
      if (watchers.has(root)) continue

      const watcher = createPlanningWatcher(root)

      watcher.on(async (event: WatcherEvent) => {
        const { blocks, text } = eventBlocks(event)
        const channels = channelsForRoot(root)

        for (const ch of channels) {
          try {
            await app.client.chat.postMessage({ channel: ch, blocks, text })
          } catch (err) {
            console.error(`[notify] Failed to post to ${ch}:`, err)
          }
        }
      })

      watcher.start()
      watchers.set(root, watcher)
      console.log(`[notify] Watching ${root} (bindings-managed)`)
    }

    // Stop watchers for roots that no longer have bindings
    for (const [root, watcher] of watchers) {
      if (!activeRoots.has(root)) {
        watcher.stop()
        watchers.delete(root)
        console.log(`[notify] Stopped watching ${root}`)
      }
    }
  }

  function stopAll(): void {
    for (const [root, watcher] of watchers) {
      watcher.stop()
      console.log(`[notify] Stopped watching ${root}`)
    }
    watchers.clear()
  }

  return { sync, stopAll }
}
