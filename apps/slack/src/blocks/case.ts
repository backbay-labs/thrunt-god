/**
 * Block Kit surfaces for case creation and case summary display.
 */

import type { KnownBlock } from "@slack/types"
import type { CaseSource } from "../types.ts"
import type { CreateCaseResult } from "../hunt/case.ts"
import { header, section, fields, divider, context, actions } from "./common.ts"

export function caseCreatedBlocks(
  result: CreateCaseResult,
  source: CaseSource,
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    header("Case Opened"),
    fields([
      ["Title", result.title],
      ["Opened by", `<@${source.userId}>`],
    ]),
    fields([
      ["Source", source.origin.replace(/_/g, " ")],
      ["Path", `\`${result.slug}\``],
    ]),
  ]

  if (source.extractedIocs.length > 0) {
    blocks.push(divider())
    blocks.push(section("*Extracted IOCs*"))

    const iocLines = source.extractedIocs
      .slice(0, 20)
      .map((ioc) => `• \`${ioc.type}\`: \`${ioc.value}\``)
      .join("\n")

    blocks.push(section(iocLines))

    if (source.extractedIocs.length > 20) {
      blocks.push(
        context([`_...and ${source.extractedIocs.length - 20} more_`]),
      )
    }
  }

  blocks.push(divider())
  blocks.push(
    actions("case_actions", [
      {
        text: "View Status",
        actionId: "case_view_status",
        value: result.slug,
      },
      {
        text: "Start Hunt",
        actionId: "case_start_hunt",
        value: result.slug,
        style: "primary",
      },
    ]),
  )

  return blocks
}

/** Blocks for the case creation modal */
export function caseModalBlocks(
  rawText: string,
  iocs: CaseSource["extractedIocs"],
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    section("Review the extracted signal and IOCs before opening a case."),
    divider(),
    section(`*Signal:*\n>${rawText.slice(0, 500).replace(/\n/g, "\n>")}`),
  ]

  if (iocs.length > 0) {
    blocks.push(divider())
    blocks.push(section("*Detected IOCs:*"))
    const iocLines = iocs
      .slice(0, 10)
      .map((i) => `• \`${i.type}\`: \`${i.value}\``)
      .join("\n")
    blocks.push(section(iocLines))
  } else {
    blocks.push(section("_No IOCs detected — you can add context in the title._"))
  }

  return blocks
}
