import { readFile } from "node:fs/promises"
import {
  appendUiBridgeEvent,
  parseUiBridgeEventLine,
  resolveUiBridgePaths,
  type UiBridgeEvent,
} from "./bridge"

export type AgentEventKind = "status" | "note" | "search" | "copy" | "warning" | "error"

export interface AgentBridgeEvent {
  id: string
  timestamp: string
  kind: AgentEventKind
  title: string
  body?: string
  actor?: string
}

export interface AgentBridgeState {
  events: AgentBridgeEvent[]
  updatedAt: string | null
  error: string | null
}

export interface AgentBridgeEventInput {
  kind: AgentEventKind
  title: string
  body?: string
  actor?: string
}

export function getAgentBridgePath(cwd: string): string {
  return resolveUiBridgePaths(cwd).eventsPath
}

function isAgentEventKind(value: unknown): value is AgentEventKind {
  return (
    value === "status" ||
    value === "note" ||
    value === "search" ||
    value === "copy" ||
    value === "warning" ||
    value === "error"
  )
}

function toLegacyAgentEvent(event: UiBridgeEvent): AgentBridgeEvent {
  switch (event.kind) {
    case "status":
      return {
        id: event.id,
        timestamp: event.timestamp,
        kind: "status",
        title: event.message,
        actor: event.source,
      }
    case "log":
      return {
        id: event.id,
        timestamp: event.timestamp,
        kind: event.level === "warning" ? "warning" : event.level === "error" ? "error" : "note",
        title: event.message,
        actor: event.source,
      }
    case "show":
      return {
        id: event.id,
        timestamp: event.timestamp,
        kind: "search",
        title: event.title,
        body: event.body,
        actor: event.source,
      }
    case "pin":
      return {
        id: event.id,
        timestamp: event.timestamp,
        kind: "note",
        title: `${event.label}: ${event.value}`,
        actor: event.source,
      }
    case "offer-copy":
      return {
        id: event.id,
        timestamp: event.timestamp,
        kind: "copy",
        title: event.label,
        body: event.text,
        actor: event.source,
      }
  }
}

function parseLegacyAgentEventLine(line: string): AgentBridgeEvent | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed) as Partial<AgentBridgeEvent>
    if (
      typeof parsed.id === "string" &&
      typeof parsed.timestamp === "string" &&
      isAgentEventKind(parsed.kind) &&
      typeof parsed.title === "string"
    ) {
      return {
        id: parsed.id,
        timestamp: parsed.timestamp,
        kind: parsed.kind,
        title: parsed.title,
        body: typeof parsed.body === "string" ? parsed.body : undefined,
        actor: typeof parsed.actor === "string" ? parsed.actor : undefined,
      }
    }
  } catch {
    return null
  }

  return null
}

function isLegacyAgentBridgeEvent(
  entry: AgentBridgeEvent | UiBridgeEvent,
): entry is AgentBridgeEvent {
  return (
    typeof entry.id === "string" &&
    typeof entry.timestamp === "string" &&
    typeof (entry as Partial<AgentBridgeEvent>).title === "string" &&
    isAgentEventKind(entry.kind)
  )
}

function toUiBridgeEventInput(input: AgentBridgeEventInput) {
  const source = input.actor ?? "external-agent"
  switch (input.kind) {
    case "status":
      return {
        kind: "status" as const,
        source,
        message: input.body ? `${input.title}: ${input.body}` : input.title,
      }
    case "copy":
      return {
        kind: "offer-copy" as const,
        source,
        label: input.title,
        text: input.body ?? input.title,
      }
    case "search":
      return {
        kind: "show" as const,
        source,
        title: input.title,
        body: input.body ?? "",
      }
    case "warning":
      return {
        kind: "log" as const,
        source,
        level: "warning" as const,
        message: input.body ? `${input.title}: ${input.body}` : input.title,
      }
    case "error":
      return {
        kind: "log" as const,
        source,
        level: "error" as const,
        message: input.body ? `${input.title}: ${input.body}` : input.title,
      }
    case "note":
      return {
        kind: "log" as const,
        source,
        level: "info" as const,
        message: input.body ? `${input.title}: ${input.body}` : input.title,
      }
  }
}

export async function appendAgentBridgeEvent(
  cwd: string,
  input: AgentBridgeEventInput,
): Promise<AgentBridgeEvent> {
  const entry = await appendUiBridgeEvent(cwd, toUiBridgeEventInput(input))
  return toLegacyAgentEvent(entry)
}

export async function readAgentBridgeEvents(
  cwd: string,
  limit = 20,
): Promise<AgentBridgeEvent[]> {
  try {
    const filepath = getAgentBridgePath(cwd)
    const raw = await readFile(filepath, "utf8")
    return raw
      .split("\n")
      .map((line) => parseLegacyAgentEventLine(line) ?? parseUiBridgeEventLine(line))
      .filter((entry): entry is AgentBridgeEvent | UiBridgeEvent => entry !== null)
      .map((entry) => (isLegacyAgentBridgeEvent(entry) ? entry : toLegacyAgentEvent(entry)))
      .slice(-limit)
      .reverse()
  } catch {
    return []
  }
}
