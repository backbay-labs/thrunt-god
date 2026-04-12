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

  let best = emptyRawText
  let low = 0
  let high = rawText.length

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const candidate = serializeWithRawText(base, rawText.slice(0, mid))

    if (candidate.length <= CASE_MODAL_PRIVATE_METADATA_LIMIT) {
      best = candidate
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  return best.length > CASE_MODAL_PRIVATE_METADATA_LIMIT ? fallback : best
}
