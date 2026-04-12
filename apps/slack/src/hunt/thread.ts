/**
 * Fetch full thread history from Slack and format it for case context.
 */

import type { WebClient } from "@slack/web-api"

export interface ThreadMessage {
  userId: string
  text: string
  timestamp: string
}

const MAX_SIGNAL_LENGTH = 3000

/** Fetch all messages in a thread (paginates for threads >100 messages) */
export async function fetchThread(
  client: WebClient,
  channelId: string,
  threadTs: string,
): Promise<ThreadMessage[]> {
  const messages: ThreadMessage[] = []
  let cursor: string | undefined

  do {
    const result = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 200,
      cursor,
    })

    if (result.messages) {
      for (const msg of result.messages) {
        messages.push({
          userId: msg.user ?? "unknown",
          text: msg.text ?? "",
          timestamp: msg.ts ?? "",
        })
      }
    }

    cursor = result.response_metadata?.next_cursor || undefined
  } while (cursor)

  return messages
}

/** Fetch one message's text, using thread APIs when the message is inside a thread. */
export async function fetchMessageText(
  client: WebClient,
  channelId: string,
  messageTs: string,
  threadTs?: string,
): Promise<string> {
  if (threadTs) {
    const threadMessages = await fetchThread(client, channelId, threadTs)
    const message = threadMessages.find((msg) => msg.timestamp === messageTs)
    if (message?.text) return message.text
  }

  const result = await client.conversations.history({
    channel: channelId,
    latest: messageTs,
    inclusive: true,
    limit: 1,
  })

  return result.messages?.[0]?.text ?? ""
}

/** Format thread messages as markdown for MISSION.md signal section */
export function formatThreadAsSignal(messages: ThreadMessage[]): string {
  if (messages.length === 0) return ""

  const header = `**Thread context** (${messages.length} message${messages.length === 1 ? "" : "s"}):\n\n`

  const lines = messages
    .filter((msg) => msg.text.trim().length > 0)
    .map((msg) => {
      const date = formatTimestamp(msg.timestamp)
      return `> [${date}] <@${msg.userId}>: ${msg.text}`
    })

  const full = header + lines.join("\n")

  if (full.length <= MAX_SIGNAL_LENGTH) return full

  // Truncate: keep header, trim lines until under limit
  const ellipsis = "\n> _...truncated_"
  const budget = MAX_SIGNAL_LENGTH - header.length - ellipsis.length
  let accumulated = ""

  for (const line of lines) {
    const next = accumulated ? accumulated + "\n" + line : line
    if (next.length > budget) break
    accumulated = next
  }

  return header + accumulated + ellipsis
}

/** Convert a Slack timestamp (epoch.seq) to a readable date string */
function formatTimestamp(ts: string): string {
  const epoch = parseFloat(ts)
  if (isNaN(epoch)) return ts

  const d = new Date(epoch * 1000)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(d.getUTCDate()).padStart(2, "0")
  const hh = String(d.getUTCHours()).padStart(2, "0")
  const min = String(d.getUTCMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`
}
