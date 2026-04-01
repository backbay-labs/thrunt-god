/**
 * Hunt Detections Screen - Detection Candidates List
 *
 * Scrollable list of detection candidates with inline score bars,
 * ATT&CK technique IDs, and status badges.
 */

import { THEME } from "../theme"
import type { Screen, ScreenContext } from "../types"
import { renderSurfaceHeader } from "../components/surface-header"
import type { ListItem } from "../components/scrollable-list"
import { renderList, scrollUp, scrollDown } from "../components/scrollable-list"
import { fitString } from "../components/types"
import { listDetections } from "../../thrunt-bridge/detection"
import type { DetectionCandidate } from "../../thrunt-bridge/detection"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatScoreBar(score: number, barWidth: number = 10): string {
  const filled = Math.round(score * barWidth)
  const empty = barWidth - filled
  const color = score >= 0.7 ? THEME.success : score >= 0.4 ? THEME.warning : THEME.error
  return `${color}${"\u2588".repeat(filled)}${THEME.dim}${"\u2591".repeat(empty)}${THEME.reset}`
}

function statusBadge(status: string): string {
  switch (status) {
    case "approved": return `${THEME.success}approved${THEME.reset}`
    case "rejected": return `${THEME.error}rejected${THEME.reset}`
    case "candidate": return `${THEME.warning}candidate${THEME.reset}`
    default: return `${THEME.dim}${status}${THEME.reset}`
  }
}

function formatDetection(c: DetectionCandidate): string {
  const techniques = c.technique_ids.length > 0 ? c.technique_ids.join(",") : "none"
  const title = c.detection_logic?.title ?? c.candidate_id
  return `${statusBadge(c.metadata.status)} ${formatScoreBar(c.promotion_readiness)} ` +
    `${THEME.secondary}${techniques}${THEME.reset} ${THEME.white}${title}${THEME.reset}`
}

function formatDetectionPlain(c: DetectionCandidate): string {
  const techniques = c.technique_ids.length > 0 ? c.technique_ids.join(",") : "none"
  const title = c.detection_logic?.title ?? c.candidate_id
  const barWidth = 10
  return `${c.metadata.status} ${"X".repeat(barWidth)} ${techniques} ${title}`
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export const huntDetectionsScreen: Screen = {
  onEnter(ctx: ScreenContext) {
    const ds = ctx.state.thruntDetections
    if (ds.candidates.length === 0 && !ds.loading) {
      loadDetections(ctx)
    }
  },

  render(ctx: ScreenContext): string {
    const { state, width, height } = ctx
    const ds = state.thruntDetections
    const lines: string[] = []

    lines.push(...renderSurfaceHeader("hunt-detections", "Detection Candidates", width, THEME,
      ds.candidates.length > 0 ? `${ds.candidates.length} candidates` : undefined))

    if (ds.loading) {
      lines.push(fitString(`  ${THEME.dim}Loading detection candidates...${THEME.reset}`, width))
    } else if (ds.error) {
      lines.push(fitString(`  ${THEME.error}${ds.error}${THEME.reset}`, width))
    } else if (ds.candidates.length === 0) {
      lines.push(fitString(`  ${THEME.dim}No detection candidates found${THEME.reset}`, width))
    } else {
      const items: ListItem[] = ds.candidates.map((c) => ({
        label: formatDetection(c),
        plainLength: formatDetectionPlain(c).length,
      }))
      const listHeight = Math.max(1, height - lines.length - 2)
      lines.push(...renderList(items, ds.list, listHeight, width, THEME))
    }

    while (lines.length < height - 1) lines.push(" ".repeat(width))
    lines.push(fitString(
      `${THEME.dim}ESC${THEME.reset} back  ${THEME.dim}j/k${THEME.reset} navigate  ` +
      `${THEME.dim}r${THEME.reset} reload`,
      width))

    return lines.join("\n")
  },

  handleInput(key: string, ctx: ScreenContext): boolean {
    const ds = ctx.state.thruntDetections

    switch (key) {
      case "j":
      case "\x1b[B":
        ctx.state.thruntDetections.list = scrollDown(
          ds.list, ds.candidates.length, ctx.height - 5)
        ctx.app.render()
        return true
      case "k":
      case "\x1b[A":
        ctx.state.thruntDetections.list = scrollUp(ds.list)
        ctx.app.render()
        return true
      case "r":
        loadDetections(ctx)
        return true
      case "\x1b":
        ctx.app.setScreen("main")
        return true
      default:
        return false
    }
  },
}

async function loadDetections(ctx: ScreenContext) {
  const ds = ctx.state.thruntDetections
  ds.loading = true
  ds.error = null
  ctx.app.render()

  try {
    const candidates = await listDetections()
    ds.candidates = candidates
    ds.list = { offset: 0, selected: 0 }
    ds.loading = false
  } catch (err) {
    ds.error = err instanceof Error ? err.message : String(err)
    ds.loading = false
  }
  ctx.app.render()
}
