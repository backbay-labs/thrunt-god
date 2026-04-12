import { describe, test, expect, mock } from "bun:test"
import { fetchMessageText, formatThreadAsSignal, type ThreadMessage } from "../hunt/thread.ts"
import type { WebClient } from "@slack/web-api"

// =============================================================================
// formatThreadAsSignal
// =============================================================================

describe("formatThreadAsSignal", () => {
  test("empty array returns empty string", () => {
    expect(formatThreadAsSignal([])).toBe("")
  })

  test("single message formats correctly", () => {
    const messages: ThreadMessage[] = [
      { userId: "U123", text: "Something suspicious here", timestamp: "1711633800.000100" },
    ]

    const result = formatThreadAsSignal(messages)

    expect(result).toContain("**Thread context** (1 message):")
    expect(result).toContain("<@U123>: Something suspicious here")
    expect(result).toMatch(/> \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\]/)
  })

  test("multiple messages all appear in order", () => {
    const messages: ThreadMessage[] = [
      { userId: "U001", text: "First message", timestamp: "1711633800.000100" },
      { userId: "U002", text: "Second message", timestamp: "1711633920.000200" },
      { userId: "U003", text: "Third message", timestamp: "1711634040.000300" },
    ]

    const result = formatThreadAsSignal(messages)

    expect(result).toContain("**Thread context** (3 messages):")
    expect(result).toContain("<@U001>: First message")
    expect(result).toContain("<@U002>: Second message")
    expect(result).toContain("<@U003>: Third message")

    // Order should be preserved
    const idx1 = result.indexOf("<@U001>")
    const idx2 = result.indexOf("<@U002>")
    const idx3 = result.indexOf("<@U003>")
    expect(idx1).toBeLessThan(idx2)
    expect(idx2).toBeLessThan(idx3)
  })

  test("truncation at 3000 chars", () => {
    // Build messages that total well over 3000 chars
    const longText = "A".repeat(200)
    const messages: ThreadMessage[] = Array.from({ length: 30 }, (_, i) => ({
      userId: `U${String(i).padStart(3, "0")}`,
      text: `${longText} message ${i}`,
      timestamp: `${1711633800 + i * 60}.000100`,
    }))

    const result = formatThreadAsSignal(messages)

    expect(result.length).toBeLessThanOrEqual(3000)
    expect(result).toContain("**Thread context** (30 messages):")
    expect(result).toContain("_...truncated_")
  })

  test("no truncation marker when under limit", () => {
    const messages: ThreadMessage[] = [
      { userId: "U001", text: "Short msg", timestamp: "1711633800.000100" },
    ]

    const result = formatThreadAsSignal(messages)

    expect(result).not.toContain("truncated")
  })
})

// =============================================================================
// fetchMessageText
// =============================================================================

describe("fetchMessageText", () => {
  test("uses thread replies to fetch a reply message when threadTs is provided", async () => {
    const replies = mock(async () => ({
      messages: [
        { user: "U001", text: "Parent", ts: "1711633800.000100" },
        { user: "U002", text: "Reply with IOC 10.0.0.5", ts: "1711633920.000200" },
      ],
    }))
    const history = mock(async () => ({ messages: [] }))
    const client = {
      conversations: { replies, history },
    } as unknown as WebClient

    const text = await fetchMessageText(
      client,
      "C001",
      "1711633920.000200",
      "1711633800.000100",
    )

    expect(text).toBe("Reply with IOC 10.0.0.5")
    expect(replies).toHaveBeenCalledTimes(1)
    expect(history).not.toHaveBeenCalled()
  })

  test("falls back to history when no threadTs is provided", async () => {
    const replies = mock(async () => ({ messages: [] }))
    const history = mock(async () => ({
      messages: [{ text: "Top-level IOC message" }],
    }))
    const client = {
      conversations: { replies, history },
    } as unknown as WebClient

    const text = await fetchMessageText(client, "C001", "1711633800.000100")

    expect(text).toBe("Top-level IOC message")
    expect(replies).not.toHaveBeenCalled()
    expect(history).toHaveBeenCalledTimes(1)
  })

  test("falls back to history when thread lookup does not find the target message", async () => {
    const replies = mock(async () => ({
      messages: [
        { user: "U001", text: "Parent", ts: "1711633800.000100" },
      ],
    }))
    const history = mock(async () => ({
      messages: [{ text: "Recovered from history" }],
    }))
    const client = {
      conversations: { replies, history },
    } as unknown as WebClient

    const text = await fetchMessageText(
      client,
      "C001",
      "1711633920.000200",
      "1711633800.000100",
    )

    expect(text).toBe("Recovered from history")
    expect(replies).toHaveBeenCalledTimes(1)
    expect(history).toHaveBeenCalledTimes(1)
  })
})
