import { describe, test, expect } from "bun:test"
import {
  CASE_MODAL_PRIVATE_METADATA_LIMIT,
  serializeCaseModalMetadata,
} from "../handlers/caseModalMetadata.ts"

describe("serializeCaseModalMetadata", () => {
  test("preserves full metadata when it fits within Slack's limit", () => {
    const serialized = serializeCaseModalMetadata({
      channelId: "C001",
      messageTs: "1711633800.000100",
      threadTs: "1711633800.000100",
      rawText: "short signal",
      origin: "ioc_paste",
    })

    const parsed = JSON.parse(serialized)
    expect(parsed.rawText).toBe("short signal")
    expect(serialized.length).toBeLessThanOrEqual(CASE_MODAL_PRIVATE_METADATA_LIMIT)
  })

  test("truncates rawText to stay within the private_metadata limit", () => {
    const serialized = serializeCaseModalMetadata({
      channelId: "C001",
      messageTs: "1711633800.000100",
      threadTs: "1711633800.000100",
      rawText: "A".repeat(10_000),
      origin: "message_shortcut",
    })

    const parsed = JSON.parse(serialized)
    expect(parsed.rawText.length).toBeLessThan(10_000)
    expect(serialized.length).toBeLessThanOrEqual(CASE_MODAL_PRIVATE_METADATA_LIMIT)
  })

  test("preserves partial rawText when escaping expands the JSON payload", () => {
    const rawText = String.raw`alert "\\n"` .repeat(2_000)
    const serialized = serializeCaseModalMetadata({
      channelId: "C001",
      messageTs: "1711633800.000100",
      threadTs: "1711633800.000100",
      rawText,
      origin: "ioc_paste",
    })

    const parsed = JSON.parse(serialized)
    expect(parsed.rawText.length).toBeGreaterThan(0)
    expect(parsed.rawText.length).toBeLessThan(rawText.length)
    expect(serialized.length).toBeLessThanOrEqual(CASE_MODAL_PRIVATE_METADATA_LIMIT)
  })

  test("truncates surrogate-pair text without splitting characters", () => {
    const rawText = "\u{1F680}".repeat(5_000)
    const serialized = serializeCaseModalMetadata({
      channelId: "C001",
      messageTs: "1711633800.000100",
      threadTs: "1711633800.000100",
      rawText,
      origin: "ioc_paste",
    })

    const parsed = JSON.parse(serialized)
    expect(parsed.rawText.length).toBeGreaterThan(0)
    expect(parsed.rawText.length).toBeLessThan(rawText.length)
    expect([...parsed.rawText].every((char) => char === "\u{1F680}")).toBe(true)
    expect(serialized.length).toBeLessThanOrEqual(CASE_MODAL_PRIVATE_METADATA_LIMIT)
  })

  test("serializes cleanly when rawText is omitted", () => {
    const serialized = serializeCaseModalMetadata({
      channelId: "C001",
      messageTs: "1711633800.000100",
      threadTs: "1711633800.000100",
      origin: "ioc_paste",
    })

    const parsed = JSON.parse(serialized)
    expect(parsed.rawText).toBeUndefined()
    expect(serialized.length).toBeLessThanOrEqual(CASE_MODAL_PRIVATE_METADATA_LIMIT)
  })
})
