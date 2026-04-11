/**
 * Shared Block Kit utilities.
 */

import type { KnownBlock } from "@slack/types"

export function header(text: string): KnownBlock {
  return { type: "header", text: { type: "plain_text", text, emoji: true } }
}

export function section(text: string): KnownBlock {
  return { type: "section", text: { type: "mrkdwn", text } }
}

export function divider(): KnownBlock {
  return { type: "divider" }
}

export function fields(pairs: [string, string][]): KnownBlock {
  return {
    type: "section",
    fields: pairs.map(([label, value]) => ({
      type: "mrkdwn",
      text: `*${label}*\n${value}`,
    })),
  }
}

export function context(texts: string[]): KnownBlock {
  return {
    type: "context",
    elements: texts.map((t) => ({ type: "mrkdwn", text: t })),
  }
}

export function actions(
  blockId: string,
  buttons: Array<{
    text: string
    actionId: string
    value?: string
    style?: "primary" | "danger"
  }>,
): KnownBlock {
  return {
    type: "actions",
    block_id: blockId,
    elements: buttons.map((b) => ({
      type: "button" as const,
      text: { type: "plain_text" as const, text: b.text },
      action_id: b.actionId,
      value: b.value,
      ...(b.style ? { style: b.style } : {}),
    })),
  }
}

const STATUS_EMOJI: Record<string, string> = {
  pending: ":white_circle:",
  planned: ":large_blue_circle:",
  executing: ":spinner:",
  completed: ":white_check_mark:",
  blocked: ":no_entry:",
}

export function statusEmoji(status: string): string {
  return STATUS_EMOJI[status.toLowerCase()] ?? ":question:"
}

const VERDICT_EMOJI: Record<string, string> = {
  supported: ":white_check_mark:",
  refuted: ":x:",
  inconclusive: ":grey_question:",
  not_tested: ":white_circle:",
}

export function verdictEmoji(verdict: string): string {
  return VERDICT_EMOJI[verdict.toLowerCase()] ?? ":question:"
}
