/**
 * File system watcher for .planning/ directories.
 *
 * Detects meaningful state changes (phase transitions, new receipts,
 * blockers, findings) and emits typed events. Debounces writes so
 * multi-file THRUNT operations produce a single logical event.
 */

import { watch, type FSWatcher } from "node:fs"
import { access } from "node:fs/promises"
import { join } from "node:path"
import { readHuntStatus, readReceipts, readFindings } from "./hunt/state.ts"
import type { HuntStatus } from "./types.ts"

// =============================================================================
// Types
// =============================================================================

export interface WatcherEvent {
  type:
    | "phase_changed"
    | "phase_completed"
    | "new_receipt"
    | "blocker_added"
    | "blocker_resolved"
    | "status_changed"
    | "findings_published"
  timestamp: string
  /** Human-readable description */
  detail: string
  /** Event-specific payload */
  data: Record<string, unknown>
}

export type WatcherCallback = (event: WatcherEvent) => void | Promise<void>

export interface PlanningWatcher {
  start(): void
  stop(): void
  /** Subscribe to watcher events. Returns an unsubscribe function. */
  on(cb: WatcherCallback): () => void
}

// =============================================================================
// Snapshot — the state we diff against
// =============================================================================

interface Snapshot {
  status: HuntStatus
  receiptIds: Set<string>
  hasFindings: boolean
  findingsSummary: string
}

async function takeSnapshot(workspaceRoot: string): Promise<Snapshot> {
  const [status, receipts, findings] = await Promise.all([
    readHuntStatus(workspaceRoot),
    readReceipts(workspaceRoot),
    readFindings(workspaceRoot),
  ])

  return {
    status,
    receiptIds: new Set(receipts.map((r) => r.id)),
    hasFindings: findings !== null,
    findingsSummary: findings?.summary ?? "",
  }
}

// =============================================================================
// Diffing
// =============================================================================

function diffSnapshots(prev: Snapshot, next: Snapshot): WatcherEvent[] {
  const events: WatcherEvent[] = []
  const now = new Date().toISOString()

  // status_changed — overall hunt status changed
  if (prev.status.status !== next.status.status) {
    events.push({
      type: "status_changed",
      timestamp: now,
      detail: `Hunt status changed from "${prev.status.status ?? "unknown"}" to "${next.status.status ?? "unknown"}"`,
      data: {
        previous: prev.status.status,
        current: next.status.status,
      },
    })
  }

  // phase_changed — current phase number changed
  if (prev.status.currentPhase !== next.status.currentPhase) {
    events.push({
      type: "phase_changed",
      timestamp: now,
      detail: `Phase changed from ${prev.status.currentPhase ?? "none"} to ${next.status.currentPhase ?? "none"}${next.status.currentPhaseName ? ` (${next.status.currentPhaseName})` : ""}`,
      data: {
        previousPhase: prev.status.currentPhase,
        currentPhase: next.status.currentPhase,
        currentPhaseName: next.status.currentPhaseName,
      },
    })
  }

  // phase_completed — a phase status went to "completed"
  const prevCompleted = new Set(
    prev.status.phases.filter((p) => p.status === "completed").map((p) => p.number),
  )
  for (const phase of next.status.phases) {
    if (phase.status === "completed" && !prevCompleted.has(phase.number)) {
      events.push({
        type: "phase_completed",
        timestamp: now,
        detail: `Phase ${phase.number} (${phase.name}) completed`,
        data: {
          phaseNumber: phase.number,
          phaseName: phase.name,
        },
      })
    }
  }

  // new_receipt — new file appeared in RECEIPTS/
  for (const id of next.receiptIds) {
    if (!prev.receiptIds.has(id)) {
      events.push({
        type: "new_receipt",
        timestamp: now,
        detail: `New receipt: ${id}`,
        data: { receiptId: id },
      })
    }
  }

  // blocker_added / blocker_resolved
  const prevBlockers = new Set(prev.status.blockers)
  const nextBlockers = new Set(next.status.blockers)

  for (const b of nextBlockers) {
    if (!prevBlockers.has(b)) {
      events.push({
        type: "blocker_added",
        timestamp: now,
        detail: `New blocker: ${b}`,
        data: { blocker: b },
      })
    }
  }

  for (const b of prevBlockers) {
    if (!nextBlockers.has(b)) {
      events.push({
        type: "blocker_resolved",
        timestamp: now,
        detail: `Blocker resolved: ${b}`,
        data: { blocker: b },
      })
    }
  }

  // findings_published — FINDINGS.md appeared or was updated
  if (!prev.hasFindings && next.hasFindings) {
    events.push({
      type: "findings_published",
      timestamp: now,
      detail: "Findings published",
      data: { summary: next.findingsSummary },
    })
  } else if (
    prev.hasFindings &&
    next.hasFindings &&
    prev.findingsSummary !== next.findingsSummary
  ) {
    events.push({
      type: "findings_published",
      timestamp: now,
      detail: "Findings updated",
      data: { summary: next.findingsSummary },
    })
  }

  return events
}

// =============================================================================
// Watcher factory
// =============================================================================

/** Default debounce window in ms */
const DEBOUNCE_MS = 2000

/** Retry interval when .planning/ doesn't exist yet (ms) */
const RETRY_INTERVAL_MS = 10_000

export function createPlanningWatcher(
  workspaceRoot: string,
  options?: { debounceMs?: number; retryIntervalMs?: number },
): PlanningWatcher {
  const debounceMs = options?.debounceMs ?? DEBOUNCE_MS
  const retryIntervalMs = options?.retryIntervalMs ?? RETRY_INTERVAL_MS

  const callbacks: WatcherCallback[] = []
  let fsWatcher: FSWatcher | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let previousSnapshot: Snapshot | null = null
  let stopped = false
  let diffInProgress = false
  let pendingDiff = false

  async function emit(event: WatcherEvent): Promise<void> {
    for (const cb of callbacks) {
      try {
        await cb(event)
      } catch (err) {
        console.error("[watcher] Callback error:", err)
      }
    }
  }

  async function onDebouncedChange(): Promise<void> {
    if (diffInProgress || stopped) return
    diffInProgress = true

    try {
      const next = await takeSnapshot(workspaceRoot)

      if (previousSnapshot) {
        const events = diffSnapshots(previousSnapshot, next)
        for (const event of events) {
          await emit(event)
        }
      }

      previousSnapshot = next
    } catch (err) {
      console.error("[watcher] Error reading state:", err)
    } finally {
      diffInProgress = false

      // If changes arrived while we were diffing, re-schedule
      if (pendingDiff && !stopped) {
        pendingDiff = false
        scheduleDiff()
      }
    }
  }

  function scheduleDiff(): void {
    if (stopped) return
    if (diffInProgress) {
      pendingDiff = true
      return
    }
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(onDebouncedChange, debounceMs)
  }

  function attachWatcher(): boolean {
    const planningDir = join(workspaceRoot, ".planning")

    try {
      fsWatcher = watch(planningDir, { recursive: true }, (_eventType, _filename) => {
        scheduleDiff()
      })

      fsWatcher.on("error", (err) => {
        console.error("[watcher] FSWatcher error:", err)
        // Watcher may have died — clean up and start retrying
        cleanupFsWatcher()
        scheduleRetry()
      })

      return true
    } catch {
      return false
    }
  }

  function cleanupFsWatcher(): void {
    if (fsWatcher) {
      try {
        fsWatcher.close()
      } catch {
        // already closed
      }
      fsWatcher = null
    }
  }

  function stopRetrying(): void {
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  function scheduleRetry(): void {
    if (stopped || retryTimer) return

    retryTimer = setTimeout(async () => {
      retryTimer = null
      if (stopped) return

      const planningDir = join(workspaceRoot, ".planning")
      try {
        await access(planningDir)
      } catch {
        // Still doesn't exist — schedule the next retry
        scheduleRetry()
        return
      }

      // Directory appeared — attach watcher
      if (attachWatcher()) {
        previousSnapshot = await takeSnapshot(workspaceRoot)
        console.log("[watcher] .planning/ appeared, watching started")
      }
    }, retryIntervalMs)
  }

  const watcher: PlanningWatcher = {
    start() {
      stopped = false

      // Try to attach immediately
      const planningDir = join(workspaceRoot, ".planning")
      access(planningDir)
        .then(async () => {
          if (stopped) return

          if (attachWatcher()) {
            // Take initial snapshot so first diff has a baseline
            previousSnapshot = await takeSnapshot(workspaceRoot)
            console.log("[watcher] Watching", planningDir)
          } else {
            scheduleRetry()
          }
        })
        .catch(() => {
          if (stopped) return
          console.log("[watcher] .planning/ not found, retrying every", retryIntervalMs, "ms")
          scheduleRetry()
        })
    },

    stop() {
      stopped = true
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      cleanupFsWatcher()
      stopRetrying()
      previousSnapshot = null
    },

    on(cb: WatcherCallback) {
      callbacks.push(cb)
      return () => {
        const idx = callbacks.indexOf(cb)
        if (idx !== -1) callbacks.splice(idx, 1)
      }
    },
  }

  return watcher
}
