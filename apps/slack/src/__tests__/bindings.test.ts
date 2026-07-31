import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createBindings, type ChannelBindings } from "../bindings.ts"

let tmpDir: string
let bindings: ChannelBindings

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "bindings-test-"))
  bindings = createBindings(tmpDir)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

// =============================================================================
// CRUD operations
// =============================================================================

describe("CRUD operations", () => {
  test("bind and resolve a channel", async () => {
    await bindings.bind("C001", "/workspace/case-a")
    expect(bindings.resolve("C001")).toBe("/workspace/case-a")
  })

  test("unbind removes a channel", async () => {
    await bindings.bind("C001", "/workspace/case-a")
    await bindings.unbind("C001")
    expect(bindings.resolve("C001")).toBeNull()
  })

  test("resolve returns null for unknown channel", () => {
    expect(bindings.resolve("C_UNKNOWN")).toBeNull()
  })

  test("list returns all bindings", async () => {
    await bindings.bind("C001", "/workspace/a")
    await bindings.bind("C002", "/workspace/b")

    const all = bindings.list()
    expect(all).toEqual({
      C001: "/workspace/a",
      C002: "/workspace/b",
    })
  })

  test("list returns a copy (mutations do not affect internal state)", async () => {
    await bindings.bind("C001", "/workspace/a")
    const all = bindings.list()
    all["C999"] = "/evil"
    expect(bindings.resolve("C999")).toBeNull()
  })
})

// =============================================================================
// Overwriting
// =============================================================================

describe("overwriting", () => {
  test("overwriting an existing binding updates the path", async () => {
    await bindings.bind("C001", "/workspace/old")
    await bindings.bind("C001", "/workspace/new")
    expect(bindings.resolve("C001")).toBe("/workspace/new")
  })
})

// =============================================================================
// Unbinding non-existent channel
// =============================================================================

describe("unbinding non-existent channel", () => {
  test("unbinding a non-existent channel is a no-op", async () => {
    // Should not throw
    await bindings.unbind("C_NONEXISTENT")
    expect(bindings.resolve("C_NONEXISTENT")).toBeNull()
  })
})

// =============================================================================
// Persistence
// =============================================================================

describe("persistence", () => {
  test("save writes JSON to disk", async () => {
    await bindings.bind("C001", "/workspace/case-a")

    const filePath = join(tmpDir, ".thrunt-god", "slack-bindings.json")
    const raw = await readFile(filePath, "utf8")
    const parsed = JSON.parse(raw)

    expect(parsed).toEqual({ C001: "/workspace/case-a" })
  })

  test("load restores bindings from disk", async () => {
    await bindings.bind("C001", "/workspace/a")
    await bindings.bind("C002", "/workspace/b")

    // Create a fresh instance and load from same directory
    const fresh = createBindings(tmpDir)
    await fresh.load()

    expect(fresh.resolve("C001")).toBe("/workspace/a")
    expect(fresh.resolve("C002")).toBe("/workspace/b")
  })

  test("load from non-existent file starts empty", async () => {
    const fresh = createBindings(tmpDir)
    await fresh.load()
    expect(fresh.list()).toEqual({})
  })

  test("save + reload round-trips correctly after modifications", async () => {
    await bindings.bind("C001", "/workspace/a")
    await bindings.bind("C002", "/workspace/b")
    await bindings.unbind("C001")

    const fresh = createBindings(tmpDir)
    await fresh.load()

    expect(fresh.resolve("C001")).toBeNull()
    expect(fresh.resolve("C002")).toBe("/workspace/b")
    expect(Object.keys(fresh.list())).toHaveLength(1)
  })
})
