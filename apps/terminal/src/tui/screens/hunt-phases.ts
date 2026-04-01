/**
 * Hunt Phases Screen - Phase navigation with split-pane layout.
 *
 * Left pane shows phase list with completion checkmarks,
 * right pane shows selected phase detail (goal, success criteria).
 */

import { THEME } from "../theme"
import type { Screen, ScreenContext } from "../types"
import { renderSurfaceHeader } from "../components/surface-header"
import { renderSplit } from "../components/split-pane"
import { renderBox } from "../components/box"
import { fitString, stripAnsi } from "../components/types"
import { analyzeHuntmap, getPhaseDetail } from "../../thrunt-bridge/huntmap"

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadPhases(ctx: ScreenContext) {
  const ps = ctx.state.thruntPhases
  ps.loading = true
  ps.error = null
  ctx.app.render()
  try {
    ps.analysis = await analyzeHuntmap({ cwd: ctx.app.getCwd() })
    ps.loading = false
    // Auto-load detail for first phase
    if (ps.analysis && ps.analysis.phases.length > 0) {
      await loadPhaseDetail(ctx, ps.analysis.phases[0].number)
    }
  } catch (err) {
    ps.error = err instanceof Error ? err.message : String(err)
    ps.loading = false
  }
  ctx.app.render()
}

async function loadPhaseDetail(ctx: ScreenContext, phaseNum: string) {
  const ps = ctx.state.thruntPhases
  ps.detailLoading = true
  ctx.app.render()
  try {
    ps.phaseDetail = await getPhaseDetail(phaseNum, { cwd: ctx.app.getCwd() })
    ps.detailLoading = false
  } catch (_err) {
    ps.phaseDetail = null
    ps.detailLoading = false
  }
  ctx.app.render()
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function renderPhaseList(ctx: ScreenContext, width: number, height: number): string[] {
  const ps = ctx.state.thruntPhases
  if (!ps.analysis || ps.analysis.phases.length === 0) {
    return [`${THEME.muted}  No phases found${THEME.reset}`]
  }

  const lines: string[] = []
  const phases = ps.analysis.phases
  const selected = ps.list.selected

  // Simple viewport: show phases around selection
  const startIdx = Math.max(0, Math.min(selected - Math.floor(height / 2), phases.length - height))
  const visibleStart = Math.max(0, startIdx)
  const visibleEnd = Math.min(phases.length, visibleStart + height)

  for (let i = visibleStart; i < visibleEnd; i++) {
    const phase = phases[i]
    const isSelected = i === selected
    const checkIcon = phase.roadmap_complete
      ? `${THEME.success}[x]${THEME.reset}`
      : `${THEME.dim}[ ]${THEME.reset}`

    const label = `${phase.number}. ${phase.name}`

    if (isSelected) {
      const line = `${THEME.accent}${THEME.bold} \u25B8 ${THEME.reset}${checkIcon} ${THEME.white}${THEME.bold}${label}${THEME.reset}`
      lines.push(fitString(line, width))
    } else {
      const line = `   ${checkIcon} ${THEME.white}${label}${THEME.reset}`
      lines.push(fitString(line, width))
    }
  }

  // Pad to fill height
  while (lines.length < height) {
    lines.push(" ".repeat(width))
  }

  return lines
}

function renderPhaseDetail(ctx: ScreenContext, width: number, height: number): string[] {
  const ps = ctx.state.thruntPhases

  if (ps.detailLoading) {
    return [`${THEME.muted}  Loading...${THEME.reset}`]
  }

  if (!ps.phaseDetail || !ps.phaseDetail.found) {
    return [`${THEME.muted}  Select a phase to view details${THEME.reset}`]
  }

  const detail = ps.phaseDetail
  const innerWidth = Math.max(10, width - 6)
  const lines: string[] = []

  // Title
  lines.push(`${THEME.secondary}Phase ${detail.phase_number}${THEME.reset}${THEME.dim}:${THEME.reset} ${THEME.white}${detail.phase_name}${THEME.reset}`)
  lines.push("")

  // Goal
  if (detail.goal) {
    lines.push(`${THEME.dim}Goal:${THEME.reset}`)
    // Word-wrap goal text
    const words = detail.goal.split(" ")
    let currentLine = "  "
    for (const word of words) {
      if (stripAnsi(currentLine).length + word.length + 1 > innerWidth) {
        lines.push(`${THEME.white}${currentLine}${THEME.reset}`)
        currentLine = "  " + word
      } else {
        currentLine += (currentLine === "  " ? "" : " ") + word
      }
    }
    if (currentLine.trim()) {
      lines.push(`${THEME.white}${currentLine}${THEME.reset}`)
    }
    lines.push("")
  }

  // Success criteria
  if (detail.success_criteria && detail.success_criteria.length > 0) {
    lines.push(`${THEME.dim}Success Criteria:${THEME.reset}`)
    for (const criterion of detail.success_criteria) {
      lines.push(fitString(`  ${THEME.muted}\u2022${THEME.reset} ${THEME.white}${criterion}${THEME.reset}`, width))
    }
  }

  const boxLines = renderBox(
    "Phase Detail",
    lines,
    width,
    THEME,
    { style: "rounded", titleAlign: "left", padding: 1 },
  )

  // Pad to fill height
  while (boxLines.length < height) {
    boxLines.push(" ".repeat(width))
  }

  return boxLines
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export const huntPhasesScreen: Screen = {
  onEnter(ctx: ScreenContext) {
    const ps = ctx.state.thruntPhases
    if (!ps.analysis && !ps.loading) {
      loadPhases(ctx)
    }
  },

  render(ctx: ScreenContext): string {
    const { width, height } = ctx
    const ps = ctx.state.thruntPhases
    const lines: string[] = []

    // Header
    lines.push(...renderSurfaceHeader("hunt-phases", "Phase Navigation", width, THEME))

    // Loading state
    if (ps.loading) {
      const spinChars = ["\u2847", "\u2846", "\u2834", "\u2831", "\u2839", "\u283B", "\u283F", "\u2857"]
      const frame = ctx.state.animationFrame % spinChars.length
      lines.push(fitString(`${THEME.accent}  ${spinChars[frame]} Loading phases...${THEME.reset}`, width))
      while (lines.length < height - 1) lines.push(" ".repeat(width))
      lines.push(fitString(`${THEME.dim}  ESC back${THEME.reset}`, width))
      return lines.join("\n")
    }

    // Error state
    if (ps.error) {
      lines.push(fitString(`${THEME.error}  Error: ${ps.error}${THEME.reset}`, width))
      lines.push(fitString("", width))
      lines.push(fitString(`${THEME.muted}  r reload  ESC back${THEME.reset}`, width))
      while (lines.length < height - 1) lines.push(" ".repeat(width))
      return lines.join("\n")
    }

    // Split pane: left = phase list, right = phase detail
    const contentHeight = Math.max(1, height - lines.length - 2) // 2 = help bar + padding
    const leftLines = renderPhaseList(ctx, width, contentHeight)
    const rightLines = renderPhaseDetail(ctx, width, contentHeight)

    const splitLines = renderSplit(leftLines, rightLines, width, contentHeight, THEME, 0.4)
    lines.push(...splitLines)

    // Help bar
    while (lines.length < height - 1) lines.push(" ".repeat(width))
    lines.push(fitString(
      `${THEME.dim}  ESC back  j/k navigate  Enter select  r reload${THEME.reset}`,
      width,
    ))

    return lines.join("\n")
  },

  handleInput(key: string, ctx: ScreenContext): boolean {
    const ps = ctx.state.thruntPhases

    // j or down: move selection down
    if (key === "j" || key === "\x1b[B") {
      if (ps.analysis && ps.list.selected < ps.analysis.phases.length - 1) {
        ps.list.selected++
        const phase = ps.analysis.phases[ps.list.selected]
        if (phase) {
          loadPhaseDetail(ctx, phase.number)
        }
      }
      ctx.app.render()
      return true
    }

    // k or up: move selection up
    if (key === "k" || key === "\x1b[A") {
      if (ps.list.selected > 0) {
        ps.list.selected--
        const phase = ps.analysis?.phases[ps.list.selected]
        if (phase) {
          loadPhaseDetail(ctx, phase.number)
        }
      }
      ctx.app.render()
      return true
    }

    // Enter: load detail for selected phase
    if (key === "\r") {
      const phase = ps.analysis?.phases[ps.list.selected]
      if (phase) {
        loadPhaseDetail(ctx, phase.number)
      }
      return true
    }

    // r: reload entire analysis
    if (key === "r") {
      loadPhases(ctx)
      return true
    }

    // ESC: back to main
    if (key === "\x1b" || key === "\x1b\x1b") {
      ctx.app.setScreen("main")
      return true
    }

    return false
  },
}
