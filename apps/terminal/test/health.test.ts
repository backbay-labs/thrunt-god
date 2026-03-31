/**
 * Health module tests
 *
 * Tests for the integration healthcheck system.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { Health } from "../src/health"

describe("Health", () => {
  beforeEach(() => {
    Health.clearCache()
  })

  afterEach(() => {
    Health.clearCache()
  })

  describe("checkAll", () => {
    test("returns health summary with all categories", async () => {
      const summary = await Health.checkAll({ timeout: 1000 })

      expect(summary).toHaveProperty("security")
      expect(summary).toHaveProperty("ai")
      expect(summary).toHaveProperty("infra")
      expect(summary).toHaveProperty("mcp")
      expect(summary).toHaveProperty("checkedAt")

      expect(Array.isArray(summary.security)).toBe(true)
      expect(Array.isArray(summary.ai)).toBe(true)
      expect(Array.isArray(summary.infra)).toBe(true)
      expect(Array.isArray(summary.mcp)).toBe(true)
    })

    test("security category is empty when no security integrations are registered", async () => {
      const summary = await Health.checkAll({ timeout: 1000 })

      expect(summary.security).toEqual([])
    })

    test("ai category includes claude, codex, opencode", async () => {
      const summary = await Health.checkAll({ timeout: 1000 })

      const ids = summary.ai.map((h) => h.id)
      expect(ids).toContain("claude")
      expect(ids).toContain("codex")
      expect(ids).toContain("opencode")
    })

    test("infra category includes git, python, bun", async () => {
      const summary = await Health.checkAll({ timeout: 1000 })

      const ids = summary.infra.map((h) => h.id)
      expect(ids).toContain("git")
      expect(ids).toContain("python")
      expect(ids).toContain("bun")
    })

    test("mcp category includes thrunt-god-mcp", async () => {
      const summary = await Health.checkAll({ timeout: 1000 })

      const ids = summary.mcp.map((h) => h.id)
      expect(ids).toContain("thrunt-god-mcp")
    })

    test("caches results", async () => {
      const first = await Health.checkAll({ timeout: 1000 })
      const second = await Health.checkAll({ timeout: 1000 })

      // Should be the same cached result
      expect(first.checkedAt).toBe(second.checkedAt)
    })

    test("force bypasses cache", async () => {
      const first = await Health.checkAll({ timeout: 1000 })

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10))

      const second = await Health.checkAll({ timeout: 1000, force: true })

      // Should be different timestamps
      expect(second.checkedAt).toBeGreaterThan(first.checkedAt)
    })
  })

  describe("check", () => {
    test("checks single integration", async () => {
      const result = await Health.check("git", { timeout: 1000 })

      expect(result).toBeDefined()
      expect(result?.id).toBe("git")
      expect(result?.name).toBe("Git")
      expect(result?.category).toBe("infra")
      expect(typeof result?.available).toBe("boolean")
    })

    test("returns undefined for unknown integration", async () => {
      const result = await Health.check("unknown-integration", { timeout: 1000 })
      expect(result).toBeUndefined()
    })

    test("git should be available", async () => {
      const result = await Health.check("git", { timeout: 2000 })

      expect(result?.available).toBe(true)
      expect(result?.version).toBeDefined()
      expect(result?.latency).toBeDefined()
    })

    test("bun should be available", async () => {
      const result = await Health.check("bun", { timeout: 2000 })

      expect(result?.available).toBe(true)
      expect(result?.version).toBeDefined()
    })
  })

  describe("getSummary", () => {
    test("returns empty categories before checkAll", () => {
      const summary = Health.getSummary()

      expect(summary.security).toEqual([])
      expect(summary.ai).toEqual([])
      expect(summary.infra).toEqual([])
      // MCP is always present
      expect(summary.mcp.length).toBe(1)
    })

    test("returns cached results after checkAll", async () => {
      await Health.checkAll({ timeout: 1000 })
      const summary = Health.getSummary()

      expect(summary.security).toEqual([])
      expect(summary.ai.length).toBeGreaterThan(0)
      expect(summary.infra.length).toBeGreaterThan(0)
      expect(summary.mcp).toHaveLength(1)
    })
  })

  describe("getStatus", () => {
    test("returns undefined for uncached integration", () => {
      const result = Health.getStatus("git")
      expect(result).toBeUndefined()
    })

    test("returns cached result after check", async () => {
      await Health.check("git", { timeout: 1000 })
      const result = Health.getStatus("git")

      expect(result).toBeDefined()
      expect(result?.id).toBe("git")
    })

    test("returns MCP status", () => {
      const result = Health.getStatus("thrunt-god-mcp")

      expect(result).toBeDefined()
      expect(result?.id).toBe("thrunt-god-mcp")
      expect(result?.category).toBe("mcp")
    })
  })

  describe("MCP status", () => {
    test("setMcpStatus updates status", () => {
      Health.setMcpStatus(true, 3141)
      const status = Health.getMcpStatus()

      expect(status.running).toBe(true)
      expect(status.port).toBe(3141)
    })

    test("getMcpStatus returns current status", () => {
      Health.setMcpStatus(false)
      const status = Health.getMcpStatus()

      expect(status.running).toBe(false)
      expect(status.port).toBeUndefined()
    })
  })

  describe("clearCache", () => {
    test("clears all cached results", async () => {
      await Health.checkAll({ timeout: 1000 })
      expect(Health.getSummary()["ai"].length).toBeGreaterThan(0)
      expect(Health.getSummary()["infra"].length).toBeGreaterThan(0)

      Health.clearCache()

      expect(Health.getSummary()["security"]).toEqual([])
      expect(Health.getSummary()["ai"]).toEqual([])
      expect(Health.getSummary()["infra"]).toEqual([])
      expect(Health.isCacheStale()).toBe(true)
    })
  })

  describe("getIntegrationIds", () => {
    test("returns the current registered integration IDs", () => {
      const ids = Health.getIntegrationIds()

      expect(ids).toEqual(["claude", "codex", "opencode", "git", "python", "bun"])
    })
  })

  describe("isCacheStale", () => {
    test("returns true initially", () => {
      expect(Health.isCacheStale()).toBe(true)
    })

    test("returns false after checkAll", async () => {
      await Health.checkAll({ timeout: 1000 })
      expect(Health.isCacheStale()).toBe(false)
    })

    test("returns true after clearCache", async () => {
      await Health.checkAll({ timeout: 1000 })
      Health.clearCache()
      expect(Health.isCacheStale()).toBe(true)
    })
  })
})
