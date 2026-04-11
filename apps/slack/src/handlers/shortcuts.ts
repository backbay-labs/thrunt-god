/**
 * Message shortcut handlers.
 *
 * "Create THRUNT Case" — right-click a message to turn it into a hunt case.
 */

import type { App } from "@slack/bolt"
import type { Config } from "../config.ts"
import { extractIocs } from "../hunt/case.ts"
import { caseModalBlocks } from "../blocks/case.ts"

export function registerShortcuts(app: App, _config: Config): void {
  // ── Message shortcut: create case from any message ─────────────────────

  app.shortcut("create_thrunt_case", async ({ shortcut, ack, client }) => {
    await ack()

    if (shortcut.type !== "message_action") return

    const messageText = shortcut.message.text ?? ""
    const iocs = extractIocs(messageText)

    await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: {
        type: "modal",
        callback_id: "create_case_modal",
        private_metadata: JSON.stringify({
          channelId: shortcut.channel.id,
          messageTs: shortcut.message.ts,
          threadTs: shortcut.message.thread_ts,
          rawText: messageText,
          origin: "message_shortcut",
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
                text: "e.g., Suspicious lateral movement from compromised host",
              },
            },
          },
          ...caseModalBlocks(messageText, iocs),
        ],
      },
    })
  })
}
