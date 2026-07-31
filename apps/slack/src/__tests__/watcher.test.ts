import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createPlanningWatcher, type WatcherEvent, type PlanningWatcher } from "../watcher.ts"

let tmpDir: string
let watcher: PlanningWatcher | null = null

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "watcher-test-"))
})

afterEach(async () => {
  if (watcher) {
    watcher.stop()
    watcher = null
  }
  await rm(tmpDir, { recursive: true, force: true })
})

/** Helper: scaffold .planning/ with optional files */
async function scaffold(files: Record<string, string>): Promise<void> {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(tmpDir, relPath)
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"))
    await mkdir(dir, { recursive: true })
    await writeFile(fullPath, content)
  }
}

/** Collect events from the watcher for a given duration */
function collectEvents(
  w: PlanningWatcher,
  durationMs: number,
): Promise<WatcherEvent[]> {
  return new Promise((resolve) => {
    const events: WatcherEvent[] = []
    w.on((event) => {
      events.push(event)
    })
    setTimeout(() => resolve(events), durationMs)
  })
}

// Use a short debounce for tests to keep them fast
const TEST_DEBOUNCE_MS = 100
const SETTLE_MS = TEST_DEBOUNCE_MS * 4

// =============================================================================
// Phase transitions
// =============================================================================

describe("phase transitions", () => {
  test("detects phase change when STATE.md is updated", async () => {
    // Set up initial state
    await scaffold({
      ".planning/STATE.md": `# State\n\n**Status**: Executing\n**Current Phase**: 1 - Signal Triage\n`,
      ".planning/HUNTMAP.md": `# Huntmap\n\n| Phase | Name | Status |\n|-------|------|--------|\n| 1 | Signal Triage | executing |\n| 2 | Deep Dive | pending |\n`,
    })

    watcher = createPlanningWatcher(tmpDir, { debounceMs: TEST_DEBOUNCE_MS })
    const collecting = collectEvents(watcher, SETTLE_MS * 3)
    watcher.start()

    // Wait for initial snapshot, then update
    await new Promise((r) => setTimeout(r, SETTLE_MS))

    await writeFile(
      join(tmpDir, ".planning/STATE.md"),
      `# State\n\n**Status**: Executing\n**Current Phase**: 2 - Deep Dive\n`,
    )

    const events = await collecting
    const phaseChanged = events.filter((e) => e.type === "phase_changed")

    expect(phaseChanged.length).toBe(1)
    expect(phaseChanged[0].data.previousPhase).toBe("1")
    expect(phaseChanged[0].data.currentPhase).toBe("2")
    expect(phaseChanged[0].detail).toContain("Deep Dive")
  })

  test("detects phase_completed when HUNTMAP.md marks a phase completed", async () => {
    await scaffold({
      ".planning/STATE.md": `# State\n\n**Status**: Executing\n**Current Phase**: 2 - Deep Dive\n`,
      ".planning/HUNTMAP.md": `# Huntmap\n\n| Phase | Name | Status |\n|-------|------|--------|\n| 1 | Signal Triage | executing |\n| 2 | Deep Dive | pending |\n`,
    })

    watcher = createPlanningWatcher(tmpDir, { debounceMs: TEST_DEBOUNCE_MS })
    const collecting = collectEvents(watcher, SETTLE_MS * 3)
    watcher.start()

    await new Promise((r) => setTimeout(r, SETTLE_MS))

    await writeFile(
      join(tmpDir, ".planning/HUNTMAP.md"),
      `# Huntmap\n\n| Phase | Name | Status |\n|-------|------|--------|\n| 1 | Signal Triage | completed |\n| 2 | Deep Dive | executing |\n`,
    )

    const events = await collecting
    const completed = events.filter((e) => e.type === "phase_completed")

    expect(completed.length).toBe(1)
    expect(completed[0].data.phaseNumber).toBe("1")
    expect(completed[0].data.phaseName).toBe("Signal Triage")
  })
})

// =============================================================================
// Receipt detection
// =============================================================================

describe("receipt detection", () => {
  test("detects new receipt files in RECEIPTS/", async () => {
    await scaffold({
      ".planning/STATE.md": `# State\n\n**Status**: Executing\n`,
      ".planning/RECEIPTS/.gitkeep": "",
    })

    watcher = createPlanningWatcher(tmpDir, { debounceMs: TEST_DEBOUNCE_MS })
    const collecting = collectEvents(watcher, SETTLE_MS * 3)
    watcher.start()

    await new Promise((r) => setTimeout(r, SETTLE_MS))

    await writeFile(
      join(tmpDir, ".planning/RECEIPTS/RCT-20260411-001.md"),
      `source: EDR\nclaim_status: supports\nrelated_hypotheses: HYP-01\n\n# Receipt: Malware Detected\n`,
    )

    const events = await collecting
    const newReceipts = events.filter((e) => e.type === "new_receipt")

    expect(newReceipts.length).toBe(1)
    expect(newReceipts[0].data.receiptId).toBe("RCT-20260411-001")
  })
})

// =============================================================================
// Debouncing
// =============================================================================

describe("debouncing", () => {
  test("multiple rapid writes produce a single batch of events", async () => {
    await scaffold({
      ".planning/STATE.md": `# State\n\n**Status**: Executing\n**Current Phase**: 1 - Triage\n`,
      ".planning/HUNTMAP.md": `# Huntmap\n\n| Phase | Name | Status |\n|-------|------|--------|\n| 1 | Triage | executing |\n| 2 | Analysis | pending |\n`,
    })

    watcher = createPlanningWatcher(tmpDir, { debounceMs: TEST_DEBOUNCE_MS })
    const collecting = collectEvents(watcher, SETTLE_MS * 4)
    watcher.start()

    await new Promise((r) => setTimeout(r, SETTLE_MS))

    // Rapid writes — STATE.md + HUNTMAP.md + new receipt, all within debounce window
    await writeFile(
      join(tmpDir, ".planning/STATE.md"),
      `# State\n\n**Status**: Executing\n**Current Phase**: 2 - Analysis\n`,
    )
    await writeFile(
      join(tmpDir, ".planning/HUNTMAP.md"),
      `# Huntmap\n\n| Phase | Name | Status |\n|-------|------|--------|\n| 1 | Triage | completed |\n| 2 | Analysis | executing |\n`,
    )
    await mkdir(join(tmpDir, ".planning/RECEIPTS"), { recursive: true })
    await writeFile(
      join(tmpDir, ".planning/RECEIPTS/RCT-20260411-001.md"),
      `source: SIEM\nclaim_status: neutral\n\n# Receipt: Log Query\n`,
    )

    const events = await collecting

    // We should get events for: phase_changed, phase_completed, new_receipt
    // but they should all come from the same debounced diff (not 4 separate diffs)
    const phaseChanged = events.filter((e) => e.type === "phase_changed")
    const phaseCompleted = events.filter((e) => e.type === "phase_completed")
    const newReceipt = events.filter((e) => e.type === "new_receipt")

    expect(phaseChanged.length).toBe(1)
    expect(phaseCompleted.length).toBe(1)
    expect(newReceipt.length).toBe(1)
  })
})

// =============================================================================
// No-op when nothing changed
// =============================================================================

describe("no event when nothing changed", () => {
  test("re-writing the same content does not emit events", async () => {
    const stateContent = `# State\n\n**Status**: Executing\n**Current Phase**: 1 - Triage\n`

    await scaffold({
      ".planning/STATE.md": stateContent,
    })

    watcher = createPlanningWatcher(tmpDir, { debounceMs: TEST_DEBOUNCE_MS })
    const collecting = collectEvents(watcher, SETTLE_MS * 3)
    watcher.start()

    await new Promise((r) => setTimeout(r, SETTLE_MS))

    // Re-write same content
    await writeFile(join(tmpDir, ".planning/STATE.md"), stateContent)

    const events = await collecting
    expect(events.length).toBe(0)
  })
})

// =============================================================================
// Missing .planning/ directory
// =============================================================================

describe("missing .planning/ directory", () => {
  test("handles missing .planning/ gracefully and watches once it appears", async () => {
    // No .planning/ directory at all
    watcher = createPlanningWatcher(tmpDir, {
      debounceMs: TEST_DEBOUNCE_MS,
      retryIntervalMs: 200,
    })

    const collecting = collectEvents(watcher, 1200)
    watcher.start()

    // Wait, then create .planning/ with state
    await new Promise((r) => setTimeout(r, 400))

    await scaffold({
      ".planning/STATE.md": `# State\n\n**Status**: Executing\n**Current Phase**: 1 - Triage\n`,
    })

    // Wait for retry to pick it up and take initial snapshot, then make a change
    await new Promise((r) => setTimeout(r, 400))

    await writeFile(
      join(tmpDir, ".planning/STATE.md"),
      `# State\n\n**Status**: Complete\n**Current Phase**: 1 - Triage\n`,
    )

    const events = await collecting
    const statusChanged = events.filter((e) => e.type === "status_changed")

    expect(statusChanged.length).toBe(1)
    expect(statusChanged[0].data.current).toBe("Complete")
  })

  test("stop() is safe to call even when .planning/ never appeared", async () => {
    watcher = createPlanningWatcher(tmpDir, {
      debounceMs: TEST_DEBOUNCE_MS,
      retryIntervalMs: 200,
    })
    watcher.start()
    await new Promise((r) => setTimeout(r, 100))

    // This should not throw
    expect(() => watcher!.stop()).not.toThrow()
    watcher = null
  })
})

// =============================================================================
// Blocker events
// =============================================================================

describe("blocker events", () => {
  test("detects added and resolved blockers", async () => {
    await scaffold({
      ".planning/STATE.md": `# State\n\n**Status**: Blocked\n\n## Blockers\n\n- Need EDR access\n`,
    })

    watcher = createPlanningWatcher(tmpDir, { debounceMs: TEST_DEBOUNCE_MS })
    const collecting = collectEvents(watcher, SETTLE_MS * 3)
    watcher.start()

    await new Promise((r) => setTimeout(r, SETTLE_MS))

    // Remove old blocker, add new one
    await writeFile(
      join(tmpDir, ".planning/STATE.md"),
      `# State\n\n**Status**: Blocked\n\n## Blockers\n\n- Waiting for approval\n`,
    )

    const events = await collecting
    const added = events.filter((e) => e.type === "blocker_added")
    const resolved = events.filter((e) => e.type === "blocker_resolved")

    expect(added.length).toBe(1)
    expect(added[0].data.blocker).toBe("Waiting for approval")

    expect(resolved.length).toBe(1)
    expect(resolved[0].data.blocker).toBe("Need EDR access")
  })
})

// =============================================================================
// Findings detection
// =============================================================================

describe("findings detection", () => {
  test("detects when FINDINGS.md appears", async () => {
    await scaffold({
      ".planning/STATE.md": `# State\n\n**Status**: Executing\n`,
    })

    watcher = createPlanningWatcher(tmpDir, { debounceMs: TEST_DEBOUNCE_MS })
    const collecting = collectEvents(watcher, SETTLE_MS * 3)
    watcher.start()

    await new Promise((r) => setTimeout(r, SETTLE_MS))

    await writeFile(
      join(tmpDir, ".planning/FINDINGS.md"),
      `# Findings\n\n## Executive Summary\n\nCompromise confirmed via OAuth abuse.\n`,
    )

    const events = await collecting
    const findings = events.filter((e) => e.type === "findings_published")

    expect(findings.length).toBe(1)
    expect(findings[0].detail).toBe("Findings published")
    expect(findings[0].data.summary).toContain("Compromise confirmed")
  })

  test("detects when FINDINGS.md is updated", async () => {
    await scaffold({
      ".planning/STATE.md": `# State\n\n**Status**: Executing\n`,
      ".planning/FINDINGS.md": `# Findings\n\n## Executive Summary\n\nInitial analysis.\n`,
    })

    watcher = createPlanningWatcher(tmpDir, { debounceMs: TEST_DEBOUNCE_MS })
    const collecting = collectEvents(watcher, SETTLE_MS * 3)
    watcher.start()

    await new Promise((r) => setTimeout(r, SETTLE_MS))

    await writeFile(
      join(tmpDir, ".planning/FINDINGS.md"),
      `# Findings\n\n## Executive Summary\n\nUpdated: compromise scope expanded.\n`,
    )

    const events = await collecting
    const findings = events.filter((e) => e.type === "findings_published")

    expect(findings.length).toBe(1)
    expect(findings[0].detail).toBe("Findings updated")
    expect(findings[0].data.summary).toContain("scope expanded")
  })
})
