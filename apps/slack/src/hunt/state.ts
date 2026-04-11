/**
 * Reads live hunt state from .planning/ directory artifacts.
 * Mirrors the thrunt-bridge state-adapter pattern from apps/terminal.
 */

import { readFile, readdir, access } from "node:fs/promises"
import { join } from "node:path"
import type { HuntStatus, HuntPhase, Findings, HypothesisVerdict, Receipt } from "../types.ts"

// =============================================================================
// STATE READING
// =============================================================================

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8")
  } catch {
    return null
  }
}

/** Extract YAML frontmatter between --- markers */
function extractFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return null

  const fields: Record<string, string> = {}
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w[\w_]*):\s*"?(.+?)"?\s*$/)
    if (kv) {
      fields[kv[1]] = kv[2]
    }
  }
  return fields
}

/** Parse STATE.md for current phase, status, blockers */
function parseStateMd(content: string): {
  status: string | null
  currentPhase: string | null
  currentPhaseName: string | null
  blockers: string[]
  lastActivity: string | null
} {
  const blockers: string[] = []
  let status: string | null = null
  let currentPhase: string | null = null
  let currentPhaseName: string | null = null
  let lastActivity: string | null = null
  let inBlockers = false

  // Try YAML frontmatter first
  const frontmatter = extractFrontmatter(content)
  if (frontmatter) {
    if (frontmatter.status) status = frontmatter.status
    if (frontmatter.last_activity) lastActivity = frontmatter.last_activity
    if (frontmatter.current_phase) {
      const val = frontmatter.current_phase.trim()
      const match = val.match(/^(\d+(?:\.\d+)?)\s*[-–—]\s*(.+)/)
      if (match) {
        currentPhase = match[1]
        currentPhaseName = match[2]
      } else {
        currentPhase = val
      }
    }
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim()

    if (/^\*\*Status\*\*:\s*/i.test(trimmed)) {
      status = trimmed.replace(/^\*\*Status\*\*:\s*/i, "").trim()
    } else if (/^\*\*Current Phase\*\*:\s*/i.test(trimmed)) {
      const val = trimmed.replace(/^\*\*Current Phase\*\*:\s*/i, "").trim()
      const match = val.match(/^(\d+(?:\.\d+)?)\s*[-–—]\s*(.+)/)
      if (match) {
        currentPhase = match[1]
        currentPhaseName = match[2]
      } else {
        currentPhase = val
        currentPhaseName = null
      }
    } else if (/^Phase:\s*/i.test(trimmed)) {
      // Standard format: "Phase: 3 of 3 (Evidence Correlation)"
      const val = trimmed.replace(/^Phase:\s*/i, "").trim()
      const phaseMatch = val.match(/^(\d+(?:\.\d+)?)\s+of\s+\d+\s*(?:\((.+)\))?/)
      if (phaseMatch) {
        currentPhase = phaseMatch[1]
        currentPhaseName = phaseMatch[2]?.trim() ?? null
      } else {
        const simpleMatch = val.match(/^(\d+(?:\.\d+)?)/)
        if (simpleMatch) {
          currentPhase = simpleMatch[1]
          currentPhaseName = null
        }
      }
    } else if (/^\*\*Last Activity\*\*:\s*/i.test(trimmed)) {
      lastActivity = trimmed.replace(/^\*\*Last Activity\*\*:\s*/i, "").trim()
    } else if (/^##\s*Blockers/i.test(trimmed)) {
      inBlockers = true
    } else if (/^##\s/.test(trimmed)) {
      inBlockers = false
    } else if (inBlockers && /^[-*]\s+/.test(trimmed)) {
      blockers.push(trimmed.replace(/^[-*]\s+/, "").trim())
    }
  }

  return { status, currentPhase, currentPhaseName, blockers, lastActivity }
}

/** Parse HUNTMAP.md for phase list */
function parseHuntmapMd(content: string): {
  phases: HuntPhase[]
  milestoneVersion: string | null
} {
  const phases: HuntPhase[] = []
  let milestoneVersion: string | null = null

  for (const line of content.split("\n")) {
    const trimmed = line.trim()

    const versionMatch = trimmed.match(/^#\s+.*v(\d+\.\d+(?:\.\d+)?)/i)
    if (versionMatch) {
      milestoneVersion = versionMatch[1]
    }

    // Pipe-table format: | 71 | Signal Triage | completed |
    const tableMatch = trimmed.match(/^\|\s*(\d+(?:\.\d+)?)\s*\|\s*(.+?)\s*\|\s*(\w+)\s*\|/)
    if (tableMatch) {
      const status = tableMatch[3].toLowerCase()
      phases.push({
        number: tableMatch[1],
        name: tableMatch[2].trim(),
        status: status as HuntPhase["status"],
        plans: 0,
        summaries: 0,
      })
      continue
    }

    // Checkbox-list format: - [x] **Phase 1: Name** - Description
    // or: - [ ] **Phase 2: Name** - Description
    const checkboxMatch = trimmed.match(
      /^-\s+\[([ xX])\]\s+\*\*Phase\s+(\d+(?:\.\d+)?)(?::\s*|\s*[-–—]\s*)(.+?)\*\*(?:\s*[-–—]\s*(.*))?$/
    )
    if (checkboxMatch) {
      const isCompleted = checkboxMatch[1].toLowerCase() === "x"
      phases.push({
        number: checkboxMatch[2],
        name: checkboxMatch[3].trim(),
        status: isCompleted ? "completed" : "pending",
        plans: 0,
        summaries: 0,
      })
    }
  }

  return { phases, milestoneVersion }
}

/** Count plan and summary files per phase */
async function countPhaseArtifacts(
  planningDir: string,
  phases: HuntPhase[],
): Promise<void> {
  for (const phase of phases) {
    const phaseDir = join(planningDir, `phase-${phase.number}`)
    if (!(await fileExists(phaseDir))) continue

    try {
      const entries = await readdir(phaseDir)
      phase.plans = entries.filter((e) => /^PLAN/i.test(e)).length
      phase.summaries = entries.filter((e) => /^SUMMARY/i.test(e)).length
    } catch {
      // phase directory unreadable
    }
  }
}

/**
 * Resolve the planning directory. If the given path already contains
 * planning artifacts (STATE.md, MISSION.md, HUNTMAP.md), use it directly.
 * Otherwise assume it's a workspace root and join `.planning/`.
 * This handles both workspace roots and child case directories.
 */
export async function resolvePlanningDir(root: string): Promise<string> {
  const direct = await fileExists(join(root, "STATE.md")) ||
    await fileExists(join(root, "MISSION.md")) ||
    await fileExists(join(root, "HUNTMAP.md"))
  return direct ? root : join(root, ".planning")
}

/** Read full hunt status from a workspace or case directory */
export async function readHuntStatus(workspaceRoot: string): Promise<HuntStatus> {
  const planningDir = await resolvePlanningDir(workspaceRoot)

  const [stateRaw, huntmapRaw] = await Promise.all([
    readOptional(join(planningDir, "STATE.md")),
    readOptional(join(planningDir, "HUNTMAP.md")),
  ])

  const state = stateRaw ? parseStateMd(stateRaw) : null
  const huntmap = huntmapRaw ? parseHuntmapMd(huntmapRaw) : null

  const phases = huntmap?.phases ?? []
  await countPhaseArtifacts(planningDir, phases)

  const completedCount = phases.filter((p) => p.status === "completed").length
  const progressPercent = phases.length > 0
    ? Math.round((completedCount / phases.length) * 100)
    : null

  return {
    currentPhase: state?.currentPhase ?? null,
    currentPhaseName: state?.currentPhaseName ?? null,
    totalPhases: phases.length || null,
    status: state?.status ?? null,
    progressPercent,
    lastActivity: state?.lastActivity ?? null,
    blockers: state?.blockers ?? [],
    phases,
    milestoneVersion: huntmap?.milestoneVersion ?? null,
  }
}

// =============================================================================
// FINDINGS
// =============================================================================

/** Normalize verdict strings to the supported set */
function normalizeVerdict(raw: string): HypothesisVerdict["verdict"] {
  switch (raw) {
    case "supported": case "confirmed": return "supported"
    case "refuted": case "disproved": case "disproven": return "refuted"
    case "inconclusive": return "inconclusive"
    case "not_tested": return "not_tested"
    default: return "inconclusive"
  }
}

/** Parse FINDINGS.md for hypothesis verdicts and recommendations */
export async function readFindings(workspaceRoot: string): Promise<Findings | null> {
  const planningDir = await resolvePlanningDir(workspaceRoot)
  const raw = await readOptional(join(planningDir, "FINDINGS.md"))
  if (!raw) return null

  const hypotheses: HypothesisVerdict[] = []
  const impactScope: string[] = []
  const recommendations: string[] = []
  let summary = ""

  let section = ""
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()

    if (/^##\s+Executive Summary/i.test(trimmed)) {
      section = "summary"
    } else if (/^##\s+Hypothesis Verdicts/i.test(trimmed)) {
      section = "hypotheses"
    } else if (/^##\s+Impacted Scope/i.test(trimmed)) {
      section = "impact"
    } else if (/^##\s+Recommend/i.test(trimmed)) {
      section = "recommendations"
    } else if (/^##\s/.test(trimmed)) {
      section = ""
    }

    if (section === "summary" && trimmed && !trimmed.startsWith("#")) {
      summary += (summary ? " " : "") + trimmed
    }

    // Hypothesis table row: | HYP-01 | Supported | High | RCT-... |
    // Also handles: | HYP-01: descriptive text | Supported | High | RCT-... |
    if (section === "hypotheses") {
      const match = trimmed.match(
        /^\|\s*(HYP-\d+)(?:[:\s].*?)?\s*\|\s*(\w+)\s*\|\s*(\w+)\s*\|\s*(.*?)\s*\|$/,
      )
      if (match) {
        hypotheses.push({
          id: match[1],
          text: trimmed.match(/^\|\s*(.*?)\s*\|/)?.[1]?.trim() ?? match[1],
          verdict: normalizeVerdict(match[2].toLowerCase()),
          confidence: match[3].toLowerCase() as "low" | "medium" | "high",
          evidence: match[4].trim() || undefined,
        })
      }
    }

    if (section === "impact" && /^[-*]\s+/.test(trimmed)) {
      impactScope.push(trimmed.replace(/^[-*]\s+/, ""))
    }

    if (section === "recommendations" && /^[-*]\s+/.test(trimmed)) {
      recommendations.push(trimmed.replace(/^[-*]\s+/, ""))
    }
  }

  return { summary, hypotheses, impactScope, recommendations }
}

// =============================================================================
// RECEIPTS
// =============================================================================

/** Parse a single receipt file */
function parseReceipt(filename: string, content: string): Receipt | null {
  const idMatch = filename.match(/(RCT-\d{8}-\d{3})/)
  if (!idMatch) return null

  const lines = content.split("\n")
  let title = ""
  let source = ""
  let claimStatus: Receipt["claimStatus"] = "neutral"
  const relatedHypotheses: string[] = []
  let contentHash: string | undefined
  let createdAt: string | undefined
  let inRelatedHypotheses = false

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()

    const titleMatch = trimmed.match(/^#\s+Receipt:\s*(.+)/i)
    if (titleMatch) title = titleMatch[1]

    if (/^source:\s*/i.test(trimmed)) {
      source = trimmed.replace(/^source:\s*/i, "").replace(/^["']|["']$/g, "")
      inRelatedHypotheses = false
    }
    if (/^claim_status:\s*/i.test(trimmed)) {
      const val = trimmed.replace(/^claim_status:\s*/i, "").trim()
      if (val === "supports" || val === "contradicts" || val === "neutral") {
        claimStatus = val
      } else if (val === "disproves") {
        claimStatus = "contradicts"
      } else if (val === "context") {
        claimStatus = "neutral"
      }
      inRelatedHypotheses = false
    }
    if (/^related_hypotheses:\s*/i.test(trimmed)) {
      const val = trimmed.replace(/^related_hypotheses:\s*/i, "").trim()
      if (val) {
        // Inline format: related_hypotheses: [HYP-01, HYP-02] or HYP-01, HYP-02
        const matches = val.match(/HYP-\d+/g)
        if (matches) relatedHypotheses.push(...matches)
        inRelatedHypotheses = false
      } else {
        // YAML-list format follows on subsequent lines
        inRelatedHypotheses = true
      }
      continue
    }
    if (inRelatedHypotheses) {
      const listItem = trimmed.match(/^-\s+(HYP-\d+)/)
      if (listItem) {
        relatedHypotheses.push(listItem[1])
        continue
      } else {
        inRelatedHypotheses = false
      }
    }
    if (/^content_hash:\s*/i.test(trimmed)) {
      contentHash = trimmed.replace(/^content_hash:\s*/i, "").trim()
      inRelatedHypotheses = false
    }
    if (/^created_at:\s*/i.test(trimmed)) {
      createdAt = trimmed.replace(/^created_at:\s*/i, "").trim()
      inRelatedHypotheses = false
    }
  }

  return {
    id: idMatch[1],
    title: title || idMatch[1],
    source,
    claimStatus,
    relatedHypotheses,
    contentHash,
    createdAt,
  }
}

/** Read all receipts from RECEIPTS/ */
export async function readReceipts(workspaceRoot: string): Promise<Receipt[]> {
  const planningDir = await resolvePlanningDir(workspaceRoot)
  const receiptsDir = join(planningDir, "RECEIPTS")
  if (!(await fileExists(receiptsDir))) return []

  try {
    const entries = await readdir(receiptsDir)
    const receiptFiles = entries.filter((e) => /^RCT-.*\.md$/i.test(e))

    const receipts: Receipt[] = []
    for (const file of receiptFiles) {
      const content = await readFile(join(receiptsDir, file), "utf8")
      const receipt = parseReceipt(file, content)
      if (receipt) receipts.push(receipt)
    }

    return receipts.sort((a, b) => a.id.localeCompare(b.id))
  } catch {
    return []
  }
}

// =============================================================================
// MISSION
// =============================================================================

export interface MissionSummary {
  title: string
  signal: string
  scope: string
  owner: string | null
}

/** Parse MISSION.md for case title and scope */
export async function readMission(workspaceRoot: string): Promise<MissionSummary | null> {
  const planningDir = await resolvePlanningDir(workspaceRoot)
  const raw = await readOptional(join(planningDir, "MISSION.md"))
  if (!raw) return null

  let title = ""
  let signal = ""
  let scope = ""
  let owner: string | null = null
  let section = ""

  for (const line of raw.split("\n")) {
    const trimmed = line.trim()

    const titleMatch = trimmed.match(/^#\s+Mission:\s*(.+)/i)
    if (titleMatch) title = titleMatch[1]

    if (/^\*\*Owner\*\*:\s*/i.test(trimmed)) {
      owner = trimmed.replace(/^\*\*Owner\*\*:\s*/i, "").trim()
    }

    if (/^##\s+Signal/i.test(trimmed)) section = "signal"
    else if (/^##\s+Scope/i.test(trimmed)) section = "scope"
    else if (/^##\s/.test(trimmed)) section = ""

    if (section === "signal" && trimmed && !trimmed.startsWith("#")) {
      signal += (signal ? " " : "") + trimmed
    }
    if (section === "scope" && trimmed && !trimmed.startsWith("#")) {
      scope += (scope ? "\n" : "") + trimmed
    }
  }

  return { title: title || "Untitled Hunt", signal, scope, owner }
}

// =============================================================================
// CHILD CASES (program mode)
// =============================================================================

/** List child case directories under cases/ */
export async function listCases(workspaceRoot: string): Promise<string[]> {
  const planningDir = await resolvePlanningDir(workspaceRoot)
  const casesDir = join(planningDir, "cases")
  if (!(await fileExists(casesDir))) return []

  try {
    const entries = await readdir(casesDir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch {
    return []
  }
}
