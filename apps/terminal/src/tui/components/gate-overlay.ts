/**
 * Gate overlay component - renders a centered overlay showing gate verification results.
 */

import type { ThemeColors } from "./types"
import { renderBox } from "./box"
import type { ThruntGateResults } from "../types"

export function renderGateOverlay(
  results: ThruntGateResults,
  width: number,
  height: number,
  theme: ThemeColors,
): string[] {
  const boxWidth = Math.min(60, width - 4)
  const lines: string[] = []

  // Header
  const header = results.allPassed
    ? `${theme.success}Gates PASSED${theme.reset}`
    : `${theme.error}Gates FAILED${theme.reset}`
  lines.push(header)
  lines.push(`${theme.dim}Score: ${results.score}/100  |  ${results.ranAt}${theme.reset}`)
  lines.push("")

  // Per-gate results
  for (const r of results.results) {
    const icon = r.passed ? `${theme.success}pass${theme.reset}` : `${theme.error}FAIL${theme.reset}`
    lines.push(`  ${icon}  ${theme.white}${r.gate}${theme.reset}`)
    lines.push(`       ${theme.dim}${r.output}${theme.reset}`)
    if (r.diagnostics && r.diagnostics.length > 0) {
      for (const d of r.diagnostics.slice(0, 5)) {
        const sev = d.severity === "error" ? theme.error : theme.warning
        lines.push(`       ${sev}${d.severity}${theme.reset} ${d.message}`)
      }
      if (r.diagnostics.length > 5) {
        lines.push(`       ${theme.dim}... +${r.diagnostics.length - 5} more${theme.reset}`)
      }
    }
    lines.push("")
  }

  lines.push(`${theme.dim}Press ESC or G to close${theme.reset}`)

  const title = results.allPassed ? "Gate Results" : "Gate Results"
  return renderBox(title, lines, boxWidth, theme, { style: "rounded" })
}
