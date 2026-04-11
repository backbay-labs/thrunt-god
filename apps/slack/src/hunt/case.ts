/**
 * Case creation from Slack messages — extract IOCs, scaffold .planning/ artifacts.
 */

import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { IOC_PATTERNS, type CaseSource, type IocType } from "../types.ts"

/** Extract all IOCs from raw text */
export function extractIocs(text: string): CaseSource["extractedIocs"] {
  const found: CaseSource["extractedIocs"] = []
  const seen = new Set<string>()

  for (const [type, pattern] of Object.entries(IOC_PATTERNS)) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const value = match[0]
      const key = `${type}:${value}`
      if (!seen.has(key)) {
        seen.add(key)
        found.push({ type: type as IocType, value })
      }
    }
  }

  return found
}

/** Slugify a case title for use as a directory name */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}

/** Generate MISSION.md content from a Slack case source */
function buildMissionMd(title: string, source: CaseSource): string {
  const now = new Date().toISOString().split("T")[0]
  const iocList = source.extractedIocs
    .map((ioc) => `- **${ioc.type}**: \`${ioc.value}\``)
    .join("\n")

  return `# Mission: ${title}

**Mode:** hunt
**Opened:** ${now}
**Owner:** <@${source.userId}> (via Slack)
**Status:** Open

## Signal

${source.rawText.slice(0, 2000)}

## Desired Outcome

Investigate the signal and determine scope of impact, root cause, and recommended response actions.

## Scope

${iocList || "- No IOCs extracted — manual scoping required"}

## Working Theory

_To be developed during hunt._
`
}

/** Generate HYPOTHESES.md stub */
function buildHypothesesMd(source: CaseSource): string {
  const hypotheses: string[] = []

  if (source.extractedIocs.some((i) => i.type === "ip" || i.type === "domain")) {
    hypotheses.push(
      "| HYP-01 | Network indicators relate to known C2 infrastructure | not_tested | |",
    )
  }
  if (source.extractedIocs.some((i) => i.type === "hash")) {
    hypotheses.push(
      `| HYP-0${hypotheses.length + 1} | File hash matches known malware family | not_tested | |`,
    )
  }
  if (hypotheses.length === 0) {
    hypotheses.push(
      "| HYP-01 | Signal represents true positive requiring response | not_tested | |",
    )
  }

  return `# Hypotheses

| ID | Hypothesis | Status | Evidence |
|----|-----------|--------|----------|
${hypotheses.join("\n")}
`
}

export interface CreateCaseResult {
  caseDir: string
  slug: string
  title: string
}

/**
 * Create a new hunt case directory from a Slack message.
 * Returns the path to the created case.
 */
export async function createCase(
  workspaceRoot: string,
  title: string,
  source: CaseSource,
): Promise<CreateCaseResult> {
  const slug = slugify(title)
  const caseDir = join(workspaceRoot, ".planning", "cases", slug)
  const receiptsDir = join(caseDir, "RECEIPTS")
  const queriesDir = join(caseDir, "QUERIES")

  await mkdir(receiptsDir, { recursive: true })
  await mkdir(queriesDir, { recursive: true })

  await Promise.all([
    writeFile(join(caseDir, "MISSION.md"), buildMissionMd(title, source)),
    writeFile(join(caseDir, "HYPOTHESES.md"), buildHypothesesMd(source)),
  ])

  return { caseDir, slug, title }
}
