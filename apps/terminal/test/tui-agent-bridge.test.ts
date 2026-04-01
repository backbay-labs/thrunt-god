import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  appendAgentBridgeEvent,
  getAgentBridgePath,
  readAgentBridgeEvents,
} from "../src/tui/agent-bridge"
import { appendUiBridgeEvent } from "../src/tui/bridge"

let tempDir: string | null = null

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

describe("agent bridge", () => {
  test("appends and reads recent events in reverse chronological order", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "thrunt-god-agent-bridge-"))
    await appendAgentBridgeEvent(tempDir, {
      kind: "status",
      title: "Running Okta query",
      body: "Collecting suspicious sessions",
      actor: "claude",
    })
    await appendAgentBridgeEvent(tempDir, {
      kind: "copy",
      title: "Prepared follow-up prompt",
      actor: "claude",
    })

    const events = await readAgentBridgeEvents(tempDir, 10)
    expect(events).toHaveLength(2)
    expect(events[0]?.title).toBe("Prepared follow-up prompt")
    expect(events[1]?.title).toBe("Running Okta query: Collecting suspicious sessions")
    expect(getAgentBridgePath(tempDir)).toContain(".thrunt-god/ui/events.jsonl")
  })

  test("normalizes richer ui bridge events into agent activity entries", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "thrunt-god-agent-bridge-"))

    await appendUiBridgeEvent(tempDir, {
      kind: "status",
      source: "codex",
      message: "searching report history",
    })
    await appendUiBridgeEvent(tempDir, {
      kind: "offer-copy",
      source: "codex",
      label: "prompt",
      text: "Summarize the latest hunt watch anomalies",
    })

    const events = await readAgentBridgeEvents(tempDir, 10)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      kind: "copy",
      title: "prompt",
      body: "Summarize the latest hunt watch anomalies",
      actor: "codex",
    })
    expect(events[1]).toMatchObject({
      kind: "status",
      title: "searching report history",
      actor: "codex",
    })
  })

  test("normalizes show events instead of treating them as legacy agent events", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "thrunt-god-agent-bridge-"))

    await appendUiBridgeEvent(tempDir, {
      kind: "show",
      source: "codex",
      title: "Open hunt report",
      body: "Jump to the latest exported report bundle",
    })

    const events = await readAgentBridgeEvents(tempDir, 10)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      kind: "search",
      title: "Open hunt report",
      body: "Jump to the latest exported report bundle",
      actor: "codex",
    })
  })
})
