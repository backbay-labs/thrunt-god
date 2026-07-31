import type { CaseSource } from "../types.ts"

export interface CaseModalMetadata {
  channelId?: string
  messageTs?: string
  threadTs?: string
  rawText?: string
  origin?: CaseSource["origin"]
}

// Slack caps private_metadata at 3000 chars. Keep a small buffer.
export const CASE_MODAL_PRIVATE_METADATA_LIMIT = 2800

function serializeWithRawText(base: Omit<CaseModalMetadata, "rawText">, rawText?: string): string {
  return JSON.stringify(rawText === undefined ? base : { ...base, rawText })
}

export function serializeCaseModalMetadata(meta: CaseModalMetadata): string {
  const { rawText, ...base } = meta

  if (!rawText) {
    return JSON.stringify(base)
  }

  const fallback = JSON.stringify(base)
  const emptyRawText = serializeWithRawText(base, "")

  if (emptyRawText.length > CASE_MODAL_PRIVATE_METADATA_LIMIT) {
    return fallback
  }

  const full = serializeWithRawText(base, rawText)
  if (full.length <= CASE_MODAL_PRIVATE_METADATA_LIMIT) {
    return full
  }

  let best = emptyRawText
  let truncated = ""

  for (const char of rawText) {
    const candidate = serializeWithRawText(base, truncated + char)
    if (candidate.length <= CASE_MODAL_PRIVATE_METADATA_LIMIT) {
      best = candidate
      truncated += char
      continue
    }

    break
  }

  return best.length > CASE_MODAL_PRIVATE_METADATA_LIMIT ? fallback : best
}
