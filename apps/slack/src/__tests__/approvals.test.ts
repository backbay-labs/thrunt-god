import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createApprovalStore, type ApprovalStore, type PendingApproval } from "../approvals.ts"

let tmpDir: string
let store: ApprovalStore

const sampleApproval: PendingApproval = {
  action: "execute_query",
  rationale: "Need to search for lateral movement indicators",
  phase: "3",
  requestedAt: "2026-04-11T10:00:00.000Z",
  channelId: "C001",
  messageTs: "1712830000.000100",
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "approvals-test-"))
  store = createApprovalStore(tmpDir)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// =============================================================================
// CRUD operations
// =============================================================================

describe("CRUD operations", () => {
  test("set and get an approval", async () => {
    await store.set("appr-1", sampleApproval)
    expect(store.get("appr-1")).toEqual(sampleApproval)
  })

  test("delete removes an approval", async () => {
    await store.set("appr-1", sampleApproval)
    await store.delete("appr-1")
    expect(store.get("appr-1")).toBeUndefined()
  })

  test("get returns undefined for unknown key", () => {
    expect(store.get("nonexistent")).toBeUndefined()
  })

  test("delete non-existent key is a no-op", async () => {
    // Should not throw
    await store.delete("nonexistent")
    expect(store.get("nonexistent")).toBeUndefined()
  })

  test("set overwrites existing approval", async () => {
    await store.set("appr-1", sampleApproval)

    const updated: PendingApproval = {
      ...sampleApproval,
      action: "updated_action",
      rationale: "Updated rationale",
    }
    await store.set("appr-1", updated)

    expect(store.get("appr-1")).toEqual(updated)
  })

  test("multiple approvals stored independently", async () => {
    const second: PendingApproval = {
      ...sampleApproval,
      action: "scan_endpoint",
      channelId: "C002",
    }

    await store.set("appr-1", sampleApproval)
    await store.set("appr-2", second)

    expect(store.get("appr-1")).toEqual(sampleApproval)
    expect(store.get("appr-2")).toEqual(second)
  })
})

// =============================================================================
// Persistence
// =============================================================================

describe("persistence", () => {
  test("save writes JSON to disk", async () => {
    await store.set("appr-1", sampleApproval)

    const filePath = join(tmpDir, ".thrunt-god", "slack-approvals.json")
    const raw = await readFile(filePath, "utf8")
    const parsed = JSON.parse(raw)

    expect(parsed["appr-1"]).toEqual(sampleApproval)
  })

  test("load restores approvals from disk", async () => {
    await store.set("appr-1", sampleApproval)
    await store.set("appr-2", { ...sampleApproval, action: "other_action" })

    // Create a fresh instance and load from same directory
    const fresh = createApprovalStore(tmpDir)
    await fresh.load()

    expect(fresh.get("appr-1")).toEqual(sampleApproval)
    expect(fresh.get("appr-2")?.action).toBe("other_action")
  })

  test("load from non-existent file starts empty", async () => {
    const fresh = createApprovalStore(tmpDir)
    await fresh.load()
    expect(fresh.get("anything")).toBeUndefined()
  })

  test("save + reload round-trips correctly after modifications", async () => {
    await store.set("appr-1", sampleApproval)
    await store.set("appr-2", { ...sampleApproval, action: "second" })
    await store.delete("appr-1")

    const fresh = createApprovalStore(tmpDir)
    await fresh.load()

    expect(fresh.get("appr-1")).toBeUndefined()
    expect(fresh.get("appr-2")?.action).toBe("second")
  })
})
