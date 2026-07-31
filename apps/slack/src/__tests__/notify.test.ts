import { describe, test, expect } from "bun:test"
import { eventBlocks } from "../notify.ts"
import type { WatcherEvent } from "../watcher.ts"

// =============================================================================
// Helpers
// =============================================================================

function makeEvent(
  type: WatcherEvent["type"],
  detail: string,
  data: Record<string, unknown> = {},
): WatcherEvent {
  return {
    type,
    timestamp: "2026-04-11T10:00:00.000Z",
    detail,
    data,
  }
}

// =============================================================================
// Event type tests
// =============================================================================

describe("eventBlocks", () => {
  test("phase_changed returns header with phase fields", () => {
    const event = makeEvent("phase_changed", "Phase changed from 1 to 2 (Scoping)", {
      previousPhase: "1",
      currentPhase: "2",
      currentPhaseName: "Scoping",
    })

    const { blocks, text } = eventBlocks(event)

    expect(text).toBe(event.detail)
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks[0].type).toBe("header")
    // Should have a fields section and a context block
    expect(blocks.some((b) => b.type === "section")).toBe(true)
    expect(blocks.some((b) => b.type === "context")).toBe(true)
  })

  test("phase_changed with null phase shows 'No active phase'", () => {
    const event = makeEvent("phase_changed", "Phase changed", {
      previousPhase: "1",
      currentPhase: null,
      currentPhaseName: null,
    })

    const { blocks } = eventBlocks(event)
    expect(blocks.length).toBeGreaterThan(0)
    // The fields block should contain "No active phase"
    const fieldsBlock = blocks.find(
      (b) => b.type === "section" && "fields" in b,
    ) as any
    expect(fieldsBlock).toBeTruthy()
    const fieldTexts = fieldsBlock.fields.map((f: any) => f.text).join(" ")
    expect(fieldTexts).toContain("No active phase")
  })

  test("phase_completed returns section with checkmark", () => {
    const event = makeEvent("phase_completed", "Phase 2 (Scoping) completed", {
      phaseNumber: "2",
      phaseName: "Scoping",
    })

    const { blocks, text } = eventBlocks(event)

    expect(text).toBe(event.detail)
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks[0].type).toBe("section")
    const sectionText = (blocks[0] as any).text.text
    expect(sectionText).toContain("Phase 2")
    expect(sectionText).toContain("Scoping")
    expect(sectionText).toContain(":white_check_mark:")
  })

  test("new_receipt returns section with receipt ID", () => {
    const event = makeEvent("new_receipt", "New receipt: R-001", {
      receiptId: "R-001",
    })

    const { blocks, text } = eventBlocks(event)

    expect(text).toBe(event.detail)
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks[0].type).toBe("section")
    const sectionText = (blocks[0] as any).text.text
    expect(sectionText).toContain("R-001")
    expect(sectionText).toContain(":receipt:")
  })

  test("blocker_added returns section with blocker text", () => {
    const event = makeEvent("blocker_added", "New blocker: Missing EDR logs", {
      blocker: "Missing EDR logs",
    })

    const { blocks, text } = eventBlocks(event)

    expect(text).toBe(event.detail)
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks[0].type).toBe("section")
    const sectionText = (blocks[0] as any).text.text
    expect(sectionText).toContain("Missing EDR logs")
    expect(sectionText).toContain(":no_entry:")
  })

  test("blocker_resolved returns section with strikethrough", () => {
    const event = makeEvent("blocker_resolved", "Blocker resolved: Missing EDR logs", {
      blocker: "Missing EDR logs",
    })

    const { blocks, text } = eventBlocks(event)

    expect(text).toBe(event.detail)
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks[0].type).toBe("section")
    const sectionText = (blocks[0] as any).text.text
    expect(sectionText).toContain("~Missing EDR logs~")
    expect(sectionText).toContain(":white_check_mark:")
  })

  test("status_changed returns header with status fields", () => {
    const event = makeEvent("status_changed", 'Hunt status changed from "planning" to "executing"', {
      previous: "planning",
      current: "executing",
    })

    const { blocks, text } = eventBlocks(event)

    expect(text).toBe(event.detail)
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks[0].type).toBe("header")
    // Should have a fields section
    const fieldsBlock = blocks.find(
      (b) => b.type === "section" && "fields" in b,
    ) as any
    expect(fieldsBlock).toBeTruthy()
    const fieldTexts = fieldsBlock.fields.map((f: any) => f.text).join(" ")
    expect(fieldTexts).toContain("planning")
    expect(fieldTexts).toContain("executing")
  })

  test("findings_published returns header with summary section", () => {
    const event = makeEvent("findings_published", "Findings published", {
      summary: "Analysis revealed lateral movement via compromised service account.",
    })

    const { blocks, text } = eventBlocks(event)

    expect(text).toBe(event.detail)
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks[0].type).toBe("header")
    // Should have a section with the summary
    const sectionBlock = blocks.find(
      (b) => b.type === "section" && "text" in b && !("fields" in b),
    ) as any
    expect(sectionBlock).toBeTruthy()
    expect(sectionBlock.text.text).toContain("lateral movement")
  })

  test("findings_published truncates long summaries at 300 chars", () => {
    const longSummary = "A".repeat(350)
    const event = makeEvent("findings_published", "Findings published", {
      summary: longSummary,
    })

    const { blocks } = eventBlocks(event)

    const sectionBlock = blocks.find(
      (b) => b.type === "section" && "text" in b && !("fields" in b),
    ) as any
    expect(sectionBlock).toBeTruthy()
    expect(sectionBlock.text.text.length).toBeLessThanOrEqual(300)
    expect(sectionBlock.text.text).toEndWith("...")
  })

  test("findings_published with empty summary omits section block", () => {
    const event = makeEvent("findings_published", "Findings published", {
      summary: "",
    })

    const { blocks } = eventBlocks(event)

    // Should have header and context, but no summary section
    expect(blocks[0].type).toBe("header")
    const sectionBlocks = blocks.filter(
      (b) => b.type === "section" && "text" in b && !("fields" in b),
    )
    expect(sectionBlocks).toHaveLength(0)
  })

  test("unknown event type returns fallback blocks", () => {
    const event = makeEvent(
      "some_unknown_type" as WatcherEvent["type"],
      "Something unexpected happened",
    )

    const { blocks, text } = eventBlocks(event)

    expect(text).toBe("Something unexpected happened")
    expect(blocks.length).toBeGreaterThan(0)
    expect(blocks[0].type).toBe("section")
    const sectionText = (blocks[0] as any).text.text
    expect(sectionText).toBe("Something unexpected happened")
    expect(blocks.some((b) => b.type === "context")).toBe(true)
  })
})
