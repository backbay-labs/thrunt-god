/**
 * Block Kit surfaces for hunt status display.
 */

import type { KnownBlock } from "@slack/types"
import type { HuntStatus } from "../types.ts"
import type { MissionSummary } from "../hunt/state.ts"
import { header, section, fields, divider, context, statusEmoji } from "./common.ts"

export function huntStatusBlocks(
  status: HuntStatus,
  mission: MissionSummary | null,
): KnownBlock[] {
  const blocks: KnownBlock[] = []

  // Header
  blocks.push(header(mission?.title ?? "Hunt Status"))

  // Mission context
  if (mission?.signal) {
    blocks.push(section(`> ${mission.signal.slice(0, 200)}`))
  }

  // Status fields
  const statusFields: [string, string][] = [
    ["Status", status.status ?? "Unknown"],
    ["Progress", status.progressPercent != null ? `${status.progressPercent}%` : "N/A"],
  ]

  if (status.currentPhase) {
    statusFields.push([
      "Current Phase",
      `Phase ${status.currentPhase}${status.currentPhaseName ? ` — ${status.currentPhaseName}` : ""}`,
    ])
  }

  if (status.milestoneVersion) {
    statusFields.push(["Milestone", `v${status.milestoneVersion}`])
  }

  blocks.push(fields(statusFields))

  // Phase list
  if (status.phases.length > 0) {
    blocks.push(divider())
    blocks.push(section("*Phases*"))

    const phaseLines = status.phases
      .map((p) => `${statusEmoji(p.status)}  *${p.number}* — ${p.name}`)
      .join("\n")

    blocks.push(section(phaseLines))
  }

  // Blockers
  if (status.blockers.length > 0) {
    blocks.push(divider())
    blocks.push(section(":no_entry: *Blockers*"))
    const blockerLines = status.blockers.map((b) => `• ${b}`).join("\n")
    blocks.push(section(blockerLines))
  }

  // Last activity
  if (status.lastActivity) {
    blocks.push(context([`Last activity: ${status.lastActivity}`]))
  }

  return blocks
}

/** Compact single-line status for thread replies */
export function huntStatusOneliner(status: HuntStatus): string {
  const phase = status.currentPhase
    ? `Phase ${status.currentPhase}`
    : "No active phase"
  const progress = status.progressPercent != null
    ? `${status.progressPercent}%`
    : "?"
  const blockerSuffix = status.blockers.length > 0
    ? ` | :no_entry: ${status.blockers.length} blocker(s)`
    : ""

  return `${phase} | ${progress} complete${blockerSuffix}`
}
