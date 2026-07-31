/**
 * Block Kit surfaces for operator approval requests.
 */

import type { KnownBlock } from "@slack/types"
import type { ApprovalRequest } from "../types.ts"
import { header, section, fields, divider, actions, context } from "./common.ts"

export function approvalRequestBlocks(req: ApprovalRequest): KnownBlock[] {
  return [
    header("Approval Required"),
    section(`The hunt bot wants to proceed with the following action:`),
    divider(),
    fields([
      ["Action", req.action],
      ["Phase", req.phase],
    ]),
    section(`*Rationale:* ${req.rationale}`),
    actions("approval_actions", [
      {
        text: "Approve",
        actionId: "approval_approve",
        value: req.id,
        style: "primary",
      },
      {
        text: "Deny",
        actionId: "approval_deny",
        value: req.id,
        style: "danger",
      },
    ]),
    context([`Requested at ${req.requestedAt}`]),
  ]
}

export function approvalResponseBlocks(
  req: ApprovalRequest,
  approved: boolean,
  responderId: string,
): KnownBlock[] {
  const verdict = approved ? ":white_check_mark: Approved" : ":x: Denied"

  return [
    section(`${verdict} by <@${responderId}>`),
    fields([
      ["Action", req.action],
      ["Phase", req.phase],
    ]),
    context([
      `Requested at ${req.requestedAt} | Responded at ${new Date().toISOString()}`,
    ]),
  ]
}
