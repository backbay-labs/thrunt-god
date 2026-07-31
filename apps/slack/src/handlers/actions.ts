/**
 * Interactive action handlers — button clicks from Block Kit surfaces.
 *
 * Handles:
 * - approval_approve / approval_deny — operator approval flow
 * - case_view_status — show case status in thread
 * - case_start_hunt — kick off autonomous hunt for a case
 */

import type { App } from "@slack/bolt"
import type { BlockAction, ButtonAction } from "@slack/bolt/dist/types/actions/block-action"
import type { Config } from "../config.ts"
import type { ApprovalStore } from "../approvals.ts"
import type { ChannelBindings } from "../bindings.ts"
import { readHuntStatus, readMission } from "../hunt/state.ts"
import { createDispatch } from "../hunt/orchestrate.ts"
import { resolveCaseDir, startHuntCommand } from "../hunt/paths.ts"
import { huntStatusBlocks } from "../blocks/status.ts"
import { approvalResponseBlocks } from "../blocks/approval.ts"

export function registerActions(app: App, config: Config, approvalStore?: ApprovalStore, bindings?: ChannelBindings): void {
  // ── Approval flow ──────────────────────────────────────────────────────

  async function handleApproval(
    approved: boolean,
    { ack, body, client, action }: { ack: () => Promise<void>; body: BlockAction<ButtonAction>; client: typeof app.client; action: ButtonAction },
  ): Promise<void> {
    await ack()

    const value = action.value
    if (!value) return

    const approval = approvalStore?.get(value)
    if (!approval) {
      await client.chat.postEphemeral({
        channel: body.channel?.id ?? "",
        user: body.user.id,
        text: "This approval request has expired or was already handled.",
      })
      return
    }

    await approvalStore!.delete(value)

    const status = approved ? "approved" : "denied"
    const label = approved ? "Approved" : "Denied"

    await client.chat.update({
      channel: approval.channelId,
      ts: approval.messageTs,
      blocks: approvalResponseBlocks(
        {
          id: value,
          action: approval.action,
          rationale: approval.rationale,
          phase: approval.phase,
          requestedAt: approval.requestedAt,
          status,
          respondedBy: body.user.id,
          respondedAt: new Date().toISOString(),
        },
        approved,
        body.user.id,
      ),
      text: `${label} by <@${body.user.id}>`,
    })
  }

  app.action<BlockAction<ButtonAction>>("approval_approve", async (args) => handleApproval(true, args))
  app.action<BlockAction<ButtonAction>>("approval_deny", async (args) => handleApproval(false, args))

  // ── Case actions ───────────────────────────────────────────────────────

  app.action<BlockAction<ButtonAction>>("case_view_status", async ({ ack, body, client, action }) => {
    await ack()

    const slug = action.value
    if (!slug) return

    const root = bindings?.resolve(body.channel?.id ?? "") ?? config.workspaceRoot
    const { caseDir } = await resolveCaseDir(root, slug)
    const [status, mission] = await Promise.all([
      readHuntStatus(caseDir),
      readMission(caseDir),
    ])

    await client.chat.postEphemeral({
      channel: body.channel?.id ?? "",
      user: body.user.id,
      blocks: huntStatusBlocks(status, mission),
      text: `Status for case: ${slug}`,
    })
  })

  app.action<BlockAction<ButtonAction>>("case_start_hunt", async ({ ack, body, client, action }) => {
    await ack()

    const slug = action.value
    if (!slug) return

    const channelId = body.channel?.id ?? ""
    const threadTs = body.message?.ts
    const root = bindings?.resolve(channelId) ?? config.workspaceRoot
    const { workspaceRoot, caseDir } = await resolveCaseDir(root, slug)

    // Create a dispatch marker for operators/automation
    await createDispatch(workspaceRoot, {
      caseSlug: slug,
      caseDir,
      channelId,
      threadTs,
      requestedBy: body.user.id,
      requestedAt: new Date().toISOString(),
    })

    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: `:rocket: Hunt dispatched for case \`${slug}\`.\n\nOperator — run:\n\`\`\`${startHuntCommand(workspaceRoot, slug)}\`\`\``,
    })
  })
}
