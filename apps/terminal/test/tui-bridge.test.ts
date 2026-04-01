import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  appendUiBridgeEvent,
  parseUiBridgeEventLine,
  readUiBridgeEvents,
  reduceUiBridgeEvents,
  resolveUiBridgePaths,
} from "../src/tui/bridge"

let fixtureDir: string | null = null

afterEach(async () => {
  if (fixtureDir) {
    await rm(fixtureDir, { recursive: true, force: true })
    fixtureDir = null
  }
})

describe("tui bridge", () => {
  test("writes and reads JSONL events", async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), "thrunt-god-bridge-"))

    await appendUiBridgeEvent(fixtureDir, {
      kind: "status",
      source: "claude",
      message: "running elastic query",
    })
    await appendUiBridgeEvent(fixtureDir, {
      kind: "log",
      source: "claude",
      level: "info",
      message: "found three suspicious events",
    })

    const { eventsPath } = resolveUiBridgePaths(fixtureDir)
    expect(eventsPath).toContain(".thrunt-god/ui/events.jsonl")

    const events = await readUiBridgeEvents(fixtureDir)
    expect(events).toHaveLength(2)
    expect(events[0]?.kind).toBe("status")
    expect(events[1]?.kind).toBe("log")
  })

  test("serializes concurrent appends into valid JSONL entries", async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), "thrunt-god-bridge-"))

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        appendUiBridgeEvent(fixtureDir!, {
          kind: "log",
          source: "codex",
          level: "info",
          message: `event-${index}`,
        }),
      ),
    )

    const events = await readUiBridgeEvents(fixtureDir)
    const messages = new Set(
      events.flatMap((event) => (event.kind === "log" ? [event.message] : [])),
    )
    expect(events).toHaveLength(12)
    expect(new Set(events.map((event) => event.kind))).toEqual(new Set(["log"]))
    expect(messages.size).toBe(12)
  })

  test("repairs the missing separator when the existing file has no trailing newline", async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), "thrunt-god-bridge-"))
    const { directory, eventsPath } = resolveUiBridgePaths(fixtureDir)
    await mkdir(directory, { recursive: true })

    await Bun.write(
      eventsPath,
      JSON.stringify({
        id: "evt-existing",
        timestamp: "2026-04-01T12:00:00Z",
        source: "claude",
        kind: "status",
        message: "already here",
      }),
    )

    await appendUiBridgeEvent(fixtureDir, {
      kind: "log",
      source: "claude",
      level: "warning",
      message: "follow-up",
    })

    const raw = await readFile(eventsPath, "utf8")
    const lines = raw.trim().split("\n")
    const events = await readUiBridgeEvents(fixtureDir)

    expect(lines).toHaveLength(2)
    expect(events).toHaveLength(2)
    expect(events[0]?.kind).toBe("status")
    expect(events[1]?.kind).toBe("log")
  })

  test("fills event defaults even when id and timestamp are explicitly undefined", async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), "thrunt-god-bridge-"))

    await appendUiBridgeEvent(fixtureDir, {
      kind: "status",
      source: "claude",
      message: "ready",
      id: undefined,
      timestamp: undefined,
    } as any)

    const events = await readUiBridgeEvents(fixtureDir)
    expect(events).toHaveLength(1)
    expect(events[0]?.id).toBeTruthy()
    expect(events[0]?.timestamp).toBeTruthy()
  })

  test("ignores malformed lines and reduces the latest snapshot", () => {
    const status = parseUiBridgeEventLine(
      JSON.stringify({
        id: "evt-1",
        timestamp: "2026-03-31T12:00:00Z",
        source: "codex",
        kind: "status",
        message: "preparing search summary",
      }),
    )
    const ignored = parseUiBridgeEventLine("{bad json")
    const snapshot = reduceUiBridgeEvents([
      status!,
      {
        id: "evt-2",
        timestamp: "2026-03-31T12:00:01Z",
        source: "codex",
        kind: "pin",
        label: "connector",
        value: "elastic",
      },
      {
        id: "evt-3",
        timestamp: "2026-03-31T12:00:02Z",
        source: "codex",
        kind: "offer-copy",
        label: "prompt",
        text: "Summarize the current watch feed",
      },
    ])

    expect(ignored).toBeNull()
    expect(snapshot.status).toBe("preparing search summary")
    expect(snapshot.pins[0]?.value).toBe("elastic")
    expect(snapshot.offerCopy?.text).toContain("watch feed")
  })
})
