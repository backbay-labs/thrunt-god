/**
 * Modal view submission handlers.
 */

import type { App } from "@slack/bolt"
import type { Config } from "../config.ts"
import type { ChannelBindings } from "../bindings.ts"
import { createCase, extractIocs } from "../hunt/case.ts"
import { caseCreatedBlocks } from "../blocks/case.ts"
import { fetchThread, fetchMessageText, formatThreadAsSignal } from "../hunt/thread.ts"
import type { CaseSource } from "../types.ts"

export function registerViews(app: App, config: Config, bindings?: ChannelBindings): void {
  app.view("create_case_modal", async ({ ack, view, body, client }) => {
    await ack()

    const title =
      view.state.values["case_title_block"]?.["case_title_input"]?.value ?? ""
    if (!title) return

    const meta = JSON.parse(view.private_metadata || "{}") as {
      channelId?: string
      messageTs?: string
      threadTs?: string
      rawText?: string
      origin?: CaseSource["origin"]
    }

    // If there's a thread, fetch the full thread for richer context
    let rawText = ""
    if (meta.threadTs && meta.channelId) {
      try {
        const threadMessages = await fetchThread(client, meta.channelId, meta.threadTs)
        if (threadMessages.length > 0) {
          rawText = formatThreadAsSignal(threadMessages)
        }
      } catch {
        // Fall through to single-message fetch
      }
    }

    // Fall back to single message or metadata rawText
    if (!rawText) rawText = meta.rawText ?? ""
    if (!rawText && meta.channelId && meta.messageTs) {
      try {
        rawText = await fetchMessageText(
          client,
          meta.channelId,
          meta.messageTs,
          meta.threadTs,
        ) || title
      } catch {
        rawText = title
      }
    }

    const iocs = extractIocs(rawText)

    const source: CaseSource = {
      origin: meta.origin ?? "slash_command",
      channelId: meta.channelId ?? "",
      threadTs: meta.threadTs,
      userId: body.user.id,
      rawText,
      extractedIocs: iocs,
    }

    const root = bindings?.resolve(meta.channelId ?? "") ?? config.workspaceRoot
    const result = await createCase(root, title, source)

    // Post case creation message to the channel
    if (meta.channelId) {
      await client.chat.postMessage({
        channel: meta.channelId,
        thread_ts: meta.threadTs,
        blocks: caseCreatedBlocks(result, source),
        text: `Case opened: ${result.title}`,
      })
    }
  })
}
