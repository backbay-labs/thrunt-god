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

export function serializeCaseModalMetadata(meta: CaseModalMetadata): string {
  const { rawText, ...base } = meta

  if (!rawText) {
    return JSON.stringify(base)
  }

  const emptyRawText = JSON.stringify({ ...base, rawText: "" })
  const available = CASE_MODAL_PRIVATE_METADATA_LIMIT - emptyRawText.length

  if (available <= 0) {
    return JSON.stringify(base)
  }

  const serialized = JSON.stringify({
    ...base,
    rawText: rawText.slice(0, available),
  })

  if (serialized.length <= CASE_MODAL_PRIVATE_METADATA_LIMIT) {
    return serialized
  }

  return JSON.stringify(base)
}
