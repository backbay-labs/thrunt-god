import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"

const UI_DIR = ".thrunt-god/ui"
const EVENTS_FILE = "events.jsonl"

const baseEvent = {
  id: z.string(),
  timestamp: z.string(),
  source: z.string().default("external-agent"),
}

export const UiBridgeStatusEventSchema = z.object({
  ...baseEvent,
  kind: z.literal("status"),
  message: z.string(),
})

export const UiBridgeLogEventSchema = z.object({
  ...baseEvent,
  kind: z.literal("log"),
  message: z.string(),
  level: z.enum(["info", "warning", "error"]).default("info"),
})

export const UiBridgeShowEventSchema = z.object({
  ...baseEvent,
  kind: z.literal("show"),
  title: z.string(),
  body: z.string(),
})

export const UiBridgePinEventSchema = z.object({
  ...baseEvent,
  kind: z.literal("pin"),
  label: z.string(),
  value: z.string(),
})

export const UiBridgeOfferCopyEventSchema = z.object({
  ...baseEvent,
  kind: z.literal("offer-copy"),
  label: z.string(),
  text: z.string(),
})

export const UiBridgeEventSchema = z.discriminatedUnion("kind", [
  UiBridgeStatusEventSchema,
  UiBridgeLogEventSchema,
  UiBridgeShowEventSchema,
  UiBridgePinEventSchema,
  UiBridgeOfferCopyEventSchema,
])

export type UiBridgeEvent = z.infer<typeof UiBridgeEventSchema>
export type UiBridgeEventInput =
  | Omit<z.infer<typeof UiBridgeStatusEventSchema>, "id" | "timestamp">
  | Omit<z.infer<typeof UiBridgeLogEventSchema>, "id" | "timestamp">
  | Omit<z.infer<typeof UiBridgeShowEventSchema>, "id" | "timestamp">
  | Omit<z.infer<typeof UiBridgePinEventSchema>, "id" | "timestamp">
  | Omit<z.infer<typeof UiBridgeOfferCopyEventSchema>, "id" | "timestamp">

export interface UiBridgeSnapshot {
  status: string | null
  recentLogs: UiBridgeEvent[]
  panel: Extract<UiBridgeEvent, { kind: "show" }> | null
  pins: Array<Extract<UiBridgeEvent, { kind: "pin" }>>
  offerCopy: Extract<UiBridgeEvent, { kind: "offer-copy" }> | null
}

export function resolveUiBridgePaths(cwd: string): { directory: string; eventsPath: string } {
  const directory = join(cwd, UI_DIR)
  return {
    directory,
    eventsPath: join(directory, EVENTS_FILE),
  }
}

function ensureEventDefaults(event: UiBridgeEventInput & Partial<Pick<UiBridgeEvent, "id" | "timestamp">>): UiBridgeEvent {
  return UiBridgeEventSchema.parse({
    id: event.id ?? crypto.randomUUID(),
    timestamp: event.timestamp ?? new Date().toISOString(),
    ...event,
  })
}

export async function appendUiBridgeEvent(
  cwd: string,
  event: UiBridgeEventInput & Partial<Pick<UiBridgeEvent, "id" | "timestamp">>,
): Promise<UiBridgeEvent> {
  const entry = ensureEventDefaults(event)
  const { directory, eventsPath } = resolveUiBridgePaths(cwd)
  await mkdir(directory, { recursive: true })
  let prefix = ""
  try {
    const info = await stat(eventsPath)
    prefix = info.size > 0 ? "\n" : ""
  } catch {
    // Create the file on first write.
  }
  await writeFile(eventsPath, `${prefix}${JSON.stringify(entry)}`, { flag: "a" })
  return entry
}

export function parseUiBridgeEventLine(line: string): UiBridgeEvent | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }

  try {
    return UiBridgeEventSchema.parse(JSON.parse(trimmed))
  } catch {
    return null
  }
}

export async function readUiBridgeEvents(
  cwd: string,
  limit = 40,
): Promise<UiBridgeEvent[]> {
  const { eventsPath } = resolveUiBridgePaths(cwd)
  try {
    const raw = await readFile(eventsPath, "utf8")
    const entries = raw
      .split("\n")
      .map((line) => parseUiBridgeEventLine(line))
      .filter((entry): entry is UiBridgeEvent => entry !== null)
    return entries.slice(-limit)
  } catch {
    return []
  }
}

export function reduceUiBridgeEvents(events: UiBridgeEvent[]): UiBridgeSnapshot {
  const pins = new Map<string, Extract<UiBridgeEvent, { kind: "pin" }>>()
  let status: string | null = null
  let panel: Extract<UiBridgeEvent, { kind: "show" }> | null = null
  let offerCopy: Extract<UiBridgeEvent, { kind: "offer-copy" }> | null = null

  for (const event of events) {
    if (event.kind === "status") {
      status = event.message
    } else if (event.kind === "show") {
      panel = event
    } else if (event.kind === "pin") {
      pins.set(event.label, event)
    } else if (event.kind === "offer-copy") {
      offerCopy = event
    }
  }

  return {
    status,
    recentLogs: events.filter((event) => event.kind === "log").slice(-6),
    panel,
    pins: [...pins.values()].slice(-4),
    offerCopy,
  }
}
