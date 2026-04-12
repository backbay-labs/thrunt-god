/**
 * Block Kit surfaces for findings and receipt summaries.
 */

import type { KnownBlock } from "@slack/types"
import type { Findings, Receipt } from "../types.ts"
import { header, section, fields, divider, context, verdictEmoji } from "./common.ts"

export function findingsBlocks(findings: Findings): KnownBlock[] {
  const blocks: KnownBlock[] = []

  blocks.push(header("Hunt Findings"))

  if (findings.summary) {
    blocks.push(section(findings.summary.slice(0, 2000)))
  }

  // Hypothesis verdicts
  if (findings.hypotheses.length > 0) {
    blocks.push(divider())
    blocks.push(section("*Hypothesis Verdicts*"))

    const verdictLines = findings.hypotheses
      .map(
        (h) =>
          `${verdictEmoji(h.verdict)}  *${h.id}* — ${h.verdict}${h.confidence ? ` (${h.confidence})` : ""}${h.evidence ? ` | ${h.evidence}` : ""}`,
      )
      .join("\n")

    blocks.push(section(verdictLines))
  }

  // Impact scope
  if (findings.impactScope.length > 0) {
    blocks.push(divider())
    blocks.push(section("*Impact Scope*"))
    blocks.push(section(findings.impactScope.map((s) => `• ${s}`).join("\n")))
  }

  // Recommendations
  if (findings.recommendations.length > 0) {
    blocks.push(divider())
    blocks.push(section("*Recommendations*"))
    blocks.push(
      section(findings.recommendations.map((r) => `• ${r}`).join("\n")),
    )
  }

  return blocks
}

export function receiptSummaryBlocks(receipts: Receipt[]): KnownBlock[] {
  if (receipts.length === 0) {
    return [section("_No receipts found._")]
  }

  const blocks: KnownBlock[] = [
    header(`Evidence Receipts (${receipts.length})`),
  ]

  const claimEmoji = {
    supports: ":white_check_mark:",
    contradicts: ":x:",
    neutral: ":white_circle:",
  }

  for (const receipt of receipts.slice(0, 15)) {
    const emoji = claimEmoji[receipt.claimStatus] ?? ":question:"
    const hypList = receipt.relatedHypotheses.join(", ") || "—"

    blocks.push(
      fields([
        [receipt.id, `${emoji} ${receipt.claimStatus}`],
        ["Source", receipt.source || "—"],
      ]),
    )

    if (receipt.relatedHypotheses.length > 0) {
      blocks.push(context([`Hypotheses: ${hypList}`]))
    }
  }

  if (receipts.length > 15) {
    blocks.push(
      context([`_...and ${receipts.length - 15} more receipts_`]),
    )
  }

  return blocks
}
