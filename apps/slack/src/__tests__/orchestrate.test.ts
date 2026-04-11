import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  createDispatch,
  listPendingDispatches,
  markDispatched,
  type HuntDispatch,
} from "../hunt/orchestrate.ts"

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "orchestrate-test-"))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

function makeDispatch(overrides?: Partial<HuntDispatch>): HuntDispatch {
  return {
    caseSlug: "suspicious-c2-beacon",
    caseDir: "/workspace/.planning/cases/suspicious-c2-beacon",
    channelId: "C001",
    requestedBy: "U123",
    requestedAt: "2026-04-11T10:00:00Z",
    ...overrides,
  }
}

// =============================================================================
// createDispatch
// =============================================================================

describe("createDispatch", () => {
  test("creates dispatch file with correct content", async () => {
    const dispatch = makeDispatch()
    const filePath = await createDispatch(tmpDir, dispatch)

    expect(filePath).toContain("suspicious-c2-beacon.json")

    const raw = await readFile(filePath, "utf8")
    const parsed = JSON.parse(raw)

    expect(parsed.caseSlug).toBe("suspicious-c2-beacon")
    expect(parsed.caseDir).toBe("/workspace/.planning/cases/suspicious-c2-beacon")
    expect(parsed.channelId).toBe("C001")
    expect(parsed.requestedBy).toBe("U123")
    expect(parsed.requestedAt).toBe("2026-04-11T10:00:00Z")
  })

  test("includes threadTs when provided", async () => {
    const dispatch = makeDispatch({ threadTs: "1711633800.000100" })
    const filePath = await createDispatch(tmpDir, dispatch)

    const raw = await readFile(filePath, "utf8")
    const parsed = JSON.parse(raw)

    expect(parsed.threadTs).toBe("1711633800.000100")
  })
})

// =============================================================================
// listPendingDispatches
// =============================================================================

describe("listPendingDispatches", () => {
  test("returns created dispatches", async () => {
    await createDispatch(tmpDir, makeDispatch({ caseSlug: "case-a" }))
    await createDispatch(tmpDir, makeDispatch({ caseSlug: "case-b" }))

    const pending = await listPendingDispatches(tmpDir)

    expect(pending).toHaveLength(2)
    const slugs = pending.map((d) => d.caseSlug).sort()
    expect(slugs).toEqual(["case-a", "case-b"])
  })

  test("returns empty array when directory does not exist", async () => {
    const pending = await listPendingDispatches(tmpDir)
    expect(pending).toEqual([])
  })
})

// =============================================================================
// markDispatched
// =============================================================================

describe("markDispatched", () => {
  test("removes dispatch from pending list", async () => {
    await createDispatch(tmpDir, makeDispatch({ caseSlug: "case-a" }))
    await createDispatch(tmpDir, makeDispatch({ caseSlug: "case-b" }))

    await markDispatched(tmpDir, "case-a")

    const pending = await listPendingDispatches(tmpDir)
    expect(pending).toHaveLength(1)
    expect(pending[0].caseSlug).toBe("case-b")
  })

  test("marking non-existent dispatch is a no-op", async () => {
    await createDispatch(tmpDir, makeDispatch({ caseSlug: "case-a" }))

    // Should not throw
    await markDispatched(tmpDir, "non-existent")

    const pending = await listPendingDispatches(tmpDir)
    expect(pending).toHaveLength(1)
  })
})
