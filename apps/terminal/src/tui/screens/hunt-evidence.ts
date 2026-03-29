/**
 * Hunt Evidence Screen - Evidence manifest viewer with tree-view.
 *
 * Displays evidence audit results hierarchically: phase -> file -> items,
 * with integrity status indicators (checkmark/x) per manifest node.
 */

import { THEME } from "../theme"
import type { Screen, ScreenContext } from "../types"
import { renderSurfaceHeader } from "../components/surface-header"
import type { TreeNode } from "../components/tree-view"
import { renderTree, toggleExpand, moveUp, moveDown, flattenTree } from "../components/tree-view"
import { fitString, stripAnsi } from "../components/types"
import { auditEvidence } from "../../thrunt-bridge/evidence"
import type { EvidenceAuditResult } from "../../thrunt-bridge/evidence"

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadEvidence(ctx: ScreenContext) {
  const es = ctx.state.thruntEvidence
  es.loading = true
  es.error = null
  ctx.app.render()
  try {
    es.results = await auditEvidence()
    es.loading = false
  } catch (err) {
    es.error = err instanceof Error ? err.message : String(err)
    es.loading = false
  }
  ctx.app.render()
}

// ---------------------------------------------------------------------------
// Tree building
// ---------------------------------------------------------------------------

function buildEvidenceTree(results: EvidenceAuditResult[]): TreeNode[] {
  // Group by phase
  const byPhase = new Map<string, EvidenceAuditResult[]>()
  for (const r of results) {
    const list = byPhase.get(r.phase) ?? []
    list.push(r)
    byPhase.set(r.phase, list)
  }

  return Array.from(byPhase.entries()).map(([phase, items]) => {
    const phaseLabel = `${phase}`
    return {
      key: `phase:${phase}`,
      label: phaseLabel,
      plainLength: stripAnsi(phaseLabel).length,
      color: THEME.secondary,
      children: items.map((item) => {
        const integrityIcon = item.integrity
          ? item.integrity.valid
            ? `${THEME.success}\u2713${THEME.reset}` // checkmark
            : `${THEME.error}\u2717${THEME.reset}` // x mark
          : `${THEME.dim}-${THEME.reset}`
        const fileLabel = `${item.file} [${item.type}]`
        return {
          key: `file:${item.file_path}`,
          label: fileLabel,
          plainLength: stripAnsi(fileLabel).length,
          icon: integrityIcon,
          color: THEME.white,
          children: item.items.map((sub, i) => {
            const subLabel = sub.id ?? sub.text ?? sub.status ?? "item"
            return {
              key: `item:${item.file_path}:${i}`,
              label: subLabel,
              plainLength: stripAnsi(subLabel).length,
              color: THEME.dim,
            }
          }),
        }
      }),
    }
  })
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export const huntEvidenceScreen: Screen = {
  onEnter(ctx: ScreenContext) {
    const es = ctx.state.thruntEvidence
    if (es.results.length === 0 && !es.loading) {
      loadEvidence(ctx)
    }
  },

  render(ctx: ScreenContext): string {
    const { width, height } = ctx
    const es = ctx.state.thruntEvidence
    const lines: string[] = []

    // Header
    lines.push(...renderSurfaceHeader("hunt-evidence", "Evidence Manifests", width, THEME))

    // Loading state
    if (es.loading) {
      const spinChars = ["\u2847", "\u2846", "\u2834", "\u2831", "\u2839", "\u283B", "\u283F", "\u2857"]
      const frame = ctx.state.animationFrame % spinChars.length
      lines.push(fitString(`${THEME.accent}  ${spinChars[frame]} Loading evidence...${THEME.reset}`, width))
      while (lines.length < height - 1) lines.push(" ".repeat(width))
      lines.push(fitString(`${THEME.dim}  ESC back${THEME.reset}`, width))
      return lines.join("\n")
    }

    // Error state
    if (es.error) {
      lines.push(fitString(`${THEME.error}  Error: ${es.error}${THEME.reset}`, width))
      lines.push(fitString("", width))
      lines.push(fitString(`${THEME.muted}  r reload  ESC back${THEME.reset}`, width))
      while (lines.length < height - 1) lines.push(" ".repeat(width))
      return lines.join("\n")
    }

    // Build tree nodes
    const nodes = buildEvidenceTree(es.results)

    if (nodes.length === 0) {
      lines.push(fitString(`${THEME.muted}  No evidence manifests found.${THEME.reset}`, width))
      lines.push(fitString(`${THEME.dim}  Run a hunt phase with evidence collection first.${THEME.reset}`, width))
      lines.push(fitString("", width))
      lines.push(fitString(`${THEME.muted}  r reload  ESC back${THEME.reset}`, width))
      while (lines.length < height - 1) lines.push(" ".repeat(width))
      return lines.join("\n")
    }

    // Tree view
    const treeHeight = Math.max(1, height - lines.length - 2) // 2 = help bar + padding
    const treeLines = renderTree(nodes, es.tree, treeHeight, width, THEME)
    lines.push(...treeLines)

    // Help bar
    while (lines.length < height - 1) lines.push(" ".repeat(width))
    lines.push(fitString(
      `${THEME.dim}  ESC back  j/k navigate  Space expand/collapse  r reload${THEME.reset}`,
      width,
    ))

    return lines.join("\n")
  },

  handleInput(key: string, ctx: ScreenContext): boolean {
    const es = ctx.state.thruntEvidence
    const nodes = buildEvidenceTree(es.results)
    const flat = flattenTree(nodes, es.tree.expandedKeys)
    const visibleCount = flat.length
    const treeHeight = Math.max(1, ctx.height - 5) // approximate visible height

    // j or down: move down
    if (key === "j" || key === "\x1b[B") {
      es.tree = moveDown(es.tree, visibleCount, treeHeight)
      ctx.app.render()
      return true
    }

    // k or up: move up
    if (key === "k" || key === "\x1b[A") {
      es.tree = moveUp(es.tree)
      ctx.app.render()
      return true
    }

    // Space or Enter: toggle expand/collapse
    if (key === " " || key === "\r") {
      const selectedEntry = flat[es.tree.selected]
      if (selectedEntry) {
        es.tree = toggleExpand(es.tree, selectedEntry.node.key)
      }
      ctx.app.render()
      return true
    }

    // r: reload evidence
    if (key === "r") {
      loadEvidence(ctx)
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
