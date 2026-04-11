import { describe, test, expect } from "bun:test"
import { formatThreadAsSignal, type ThreadMessage } from "../hunt/thread.ts"

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
