/**
 * Message event handlers.
 *
 * - Detect IOCs pasted into monitored channels and offer to create a case
 * - Respond to @mentions with hunt status
 */

import type { App } from "@slack/bolt"
import type { BlockAction, ButtonAction } from "@slack/bolt/dist/types/actions/block-action"
import type { Config } from "../config.ts"
import type { ChannelBindings } from "../bindings.ts"
import { extractIocs } from "../hunt/case.ts"
import { fetchMessageText } from "../hunt/thread.ts"
import { readHuntStatus, readMission } from "../hunt/state.ts"
import { huntStatusOneliner } from "../blocks/status.ts"
import { caseModalBlocks } from "../blocks/case.ts"
import { actions, section } from "../blocks/common.ts"

export function registerEvents(app: App, config: Config, bindings?: ChannelBindings): void {
  // ── IOC detection in messages ──────────────────────────────────────────

  app.event("message", async ({ event, client }) => {
    // Only handle regular user messages (not bot messages, edits, etc.)
    if (
      event.subtype ||
      !("text" in event) ||
      !event.text ||
      ("bot_id" in event && event.bot_id)
    ) {
      return
    }

    const iocs = extractIocs(event.text)
    if (iocs.length === 0) return

    // Only surface if there are meaningful IOCs (IPs, hashes, domains)
    const meaningful = iocs.filter(
      (i) => i.type === "ip" || i.type === "hash" || i.type === "domain",
    )
    if (meaningful.length === 0) return

    const iocSummary = meaningful
      .slice(0, 5)
      .map((i) => `\`${i.value}\``)
      .join(", ")

    // Reply in the parent thread if the message is in a thread, otherwise start a new thread
    const replyTs = ("thread_ts" in event && event.thread_ts) ? event.thread_ts : event.ts

    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: replyTs,
      blocks: [
        section(
          `:mag: Detected ${meaningful.length} IOC(s) in this message: ${iocSummary}`,
        ),
        actions("ioc_actions", [
          {
            text: "Open Case",
            actionId: "ioc_open_case",
            value: event.ts,
            style: "primary",
          },
          {
            text: "Dismiss",
            actionId: "ioc_dismiss",
          },
        ]),
      ],
      text: `Detected ${meaningful.length} IOC(s): ${iocSummary}`,
    })
  })

  // ── App mention → status reply ─────────────────────────────────────────

  app.event("app_mention", async ({ event, client }) => {
    const root = bindings?.resolve(event.channel) ?? config.workspaceRoot
    const [status, mission] = await Promise.all([
      readHuntStatus(root),
      readMission(root),
    ])

    const title = mission?.title ? `*${mission.title}*\n` : ""
    const oneliner = huntStatusOneliner(status)

    await client.chat.postMessage({
      channel: event.channel,
      thread_ts: event.ts,
      text: `${title}${oneliner}`,
    })
  })

  // ── IOC action handlers ────────────────────────────────────────────────

  app.action<BlockAction<ButtonAction>>("ioc_open_case", async ({ ack, body, client, action }) => {
    await ack()

    const messageTs = action.value
    if (!messageTs) return

    // If the IOC detection was posted in a thread, include the thread_ts
    // so the case creation modal can pull full thread context
    const threadTs = body.message?.thread_ts ?? body.message?.ts
    const channelId = body.channel?.id ?? ""

    // Fetch the original message to show signal/IOC preview
    let rawText = ""
    try {
      rawText = await fetchMessageText(client, channelId, messageTs, threadTs)
    } catch {
      // fall through with empty text
    }

    const iocs = extractIocs(rawText)

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: "modal",
        callback_id: "create_case_modal",
        private_metadata: JSON.stringify({
          channelId,
          messageTs,
          threadTs,
          rawText,
          origin: "ioc_paste",
        }),
        title: { type: "plain_text", text: "Open Hunt Case" },
        submit: { type: "plain_text", text: "Open Case" },
        close: { type: "plain_text", text: "Cancel" },
        blocks: [
          {
            type: "input",
            block_id: "case_title_block",
            label: { type: "plain_text", text: "Case Title" },
            element: {
              type: "plain_text_input",
              action_id: "case_title_input",
              placeholder: {
                type: "plain_text",
                text: "e.g., Suspicious C2 beacon from 10.0.0.5",
              },
            },
          },
          ...caseModalBlocks(rawText, iocs),
        ],
      },
    })
  })

  app.action<BlockAction<ButtonAction>>("ioc_dismiss", async ({ ack, body, client }) => {
    await ack()

    if (body.channel?.id && body.message?.ts) {
      await client.chat.delete({
        channel: body.channel.id,
        ts: body.message.ts,
      }).catch(() => {
        // Bot may not have permission to delete — silently ignore
      })
    }
  })
}
