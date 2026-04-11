/**
 * Slash command handlers.
 *
 * /hunt status     — show current hunt status, blockers, phase
 * /hunt findings   — post latest findings summary
 * /hunt receipts   — post receipt inventory
 * /hunt case <title> — open a new case from the current channel
 * /hunt bind [path] — bind channel to a case/workspace path
 * /hunt unbind      — unbind channel
 */

import type { App } from "@slack/bolt"
import type { Config } from "../config.ts"
import type { ChannelBindings } from "../bindings.ts"
import { readHuntStatus, readFindings, readReceipts, readMission, resolvePlanningDir } from "../hunt/state.ts"
import { createCase, extractIocs } from "../hunt/case.ts"
import { huntStatusBlocks } from "../blocks/status.ts"
import { findingsBlocks, receiptSummaryBlocks } from "../blocks/findings.ts"
import { caseCreatedBlocks } from "../blocks/case.ts"
import type { CaseSource } from "../types.ts"

export function registerCommands(
  app: App,
  config: Config,
  bindings?: ChannelBindings,
  onBindingChange?: () => void,
): void {
  app.command("/hunt", async ({ command, ack, respond }) => {
    await ack()

    const args = command.text.trim().split(/\s+/)
    const subcommand = args[0]?.toLowerCase() || "status"

    switch (subcommand) {
      case "status": {
        const root = bindings?.resolve(command.channel_id) ?? config.workspaceRoot
        const [status, mission] = await Promise.all([
          readHuntStatus(root),
          readMission(root),
        ])
        await respond({
          response_type: "in_channel",
          blocks: huntStatusBlocks(status, mission),
        })
        break
      }

      case "findings": {
        const root = bindings?.resolve(command.channel_id) ?? config.workspaceRoot
        const findings = await readFindings(root)
        if (!findings) {
          await respond({
            response_type: "ephemeral",
            text: "No findings available yet. The hunt may still be in progress.",
          })
          return
        }
        await respond({
          response_type: "in_channel",
          blocks: findingsBlocks(findings),
        })
        break
      }

      case "receipts": {
        const root = bindings?.resolve(command.channel_id) ?? config.workspaceRoot
        const receipts = await readReceipts(root)
        await respond({
          response_type: "in_channel",
          blocks: receiptSummaryBlocks(receipts),
        })
        break
      }

      case "case": {
        const title = args.slice(1).join(" ")
        if (!title) {
          await respond({
            response_type: "ephemeral",
            text: "Usage: `/hunt case <title>` — provide a descriptive title for the new case.",
          })
          return
        }

        const rawText = command.text.replace(/^case\s+/i, "")
        const iocs = extractIocs(rawText)

        const source: CaseSource = {
          origin: "slash_command",
          channelId: command.channel_id,
          userId: command.user_id,
          rawText,
          extractedIocs: iocs,
        }

        const caseRoot = bindings?.resolve(command.channel_id) ?? config.workspaceRoot
        const result = await createCase(caseRoot, title, source)

        await respond({
          response_type: "in_channel",
          blocks: caseCreatedBlocks(result, source),
        })
        break
      }

      case "bind": {
        if (!bindings) {
          await respond({
            response_type: "ephemeral",
            text: "Channel bindings are not enabled.",
          })
          return
        }

        const bindPath = args.slice(1).join(" ").trim() || config.workspaceRoot

        // Validate the path is a THRUNT workspace or case directory
        try {
          const planningDir = await resolvePlanningDir(bindPath)
          const { access } = await import("node:fs/promises")
          await access(planningDir)
        } catch {
          await respond({
            response_type: "ephemeral",
            text: `Invalid workspace path: \`${bindPath}\` does not contain THRUNT planning artifacts (.planning/ or MISSION.md).`,
          })
          return
        }

        await bindings.bind(command.channel_id, bindPath)
        onBindingChange?.()
        await respond({
          response_type: "in_channel",
          text: `Channel bound to workspace: \`${bindPath}\``,
        })
        break
      }

      case "unbind": {
        if (!bindings) {
          await respond({
            response_type: "ephemeral",
            text: "Channel bindings are not enabled.",
          })
          return
        }

        await bindings.unbind(command.channel_id)
        onBindingChange?.()
        await respond({
          response_type: "in_channel",
          text: "Channel unbound from workspace.",
        })
        break
      }

      case "help":
      default: {
        await respond({
          response_type: "ephemeral",
          text: [
            "*THRUNT Hunt Bot Commands:*",
            "`/hunt status` — Current hunt status, phase, blockers",
            "`/hunt findings` — Latest findings summary",
            "`/hunt receipts` — Evidence receipt inventory",
            "`/hunt case <title>` — Open a new case",
            "`/hunt bind [path]` — Bind channel to a workspace path",
            "`/hunt unbind` — Unbind channel from workspace",
            "`/hunt help` — This help message",
          ].join("\n"),
        })
        break
      }
    }
  })
}
