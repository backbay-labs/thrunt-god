/**
 * Hunt Packs Screen - Pack Browser with Tree View
 *
 * Browse available hunt packs grouped by kind, with expandable tree
 * showing stability badges, connector targets, and dataset info.
 */

import { THEME } from "../theme"
import type { Screen, ScreenContext } from "../types"
import { renderSurfaceHeader } from "../components/surface-header"
import type { TreeNode } from "../components/tree-view"
import { renderTree, flattenTree, toggleExpand, moveUp, moveDown } from "../components/tree-view"
import { fitString } from "../components/types"
import { listPacks } from "../../thrunt-bridge/pack"
import type { PackListEntry } from "../../thrunt-bridge/pack"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stabilityBadge(stability: string): string {
  switch (stability) {
    case "stable": return `${THEME.success}stable${THEME.reset}`
    case "preview": return `${THEME.warning}preview${THEME.reset}`
    case "experimental": return `${THEME.warning}exp${THEME.reset}`
    case "deprecated": return `${THEME.error}depr${THEME.reset}`
    default: return `${THEME.dim}${stability}${THEME.reset}`
  }
}

function buildPackTree(packs: PackListEntry[]): TreeNode[] {
  const byKind = new Map<string, PackListEntry[]>()
  for (const p of packs) {
    const list = byKind.get(p.kind) ?? []
    list.push(p)
    byKind.set(p.kind, list)
  }

  // Sort kinds alphabetically
  return Array.from(byKind.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, items]) => ({
      key: `kind:${kind}`,
      label: `${THEME.secondary}${kind}${THEME.reset} ${THEME.dim}(${items.length})${THEME.reset}`,
      plainLength: `${kind} (${items.length})`.length,
      children: items.map((p) => ({
        key: `pack:${p.id}`,
        label: `${stabilityBadge(p.stability)} ${THEME.white}${p.title}${THEME.reset} ${THEME.dim}${p.id}${THEME.reset}`,
        plainLength: `${p.stability} ${p.title} ${p.id}`.length,
        children: [
          ...(p.required_connectors.length > 0 ? [{
            key: `connectors:${p.id}`,
            label: `${THEME.dim}connectors:${THEME.reset} ${p.required_connectors.join(", ")}`,
            plainLength: `connectors: ${p.required_connectors.join(", ")}`.length,
          }] : []),
          ...(p.supported_datasets.length > 0 ? [{
            key: `datasets:${p.id}`,
            label: `${THEME.dim}datasets:${THEME.reset} ${p.supported_datasets.join(", ")}`,
            plainLength: `datasets: ${p.supported_datasets.join(", ")}`.length,
          }] : []),
        ],
      })),
    }))
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export const huntPacksScreen: Screen = {
  onEnter(ctx: ScreenContext) {
    const ps = ctx.state.thruntPacks
    if (ps.packs.length === 0 && !ps.loading) {
      loadPacks(ctx)
    }
  },

  render(ctx: ScreenContext): string {
    const { state, width, height } = ctx
    const ps = state.thruntPacks
    const lines: string[] = []

    lines.push(...renderSurfaceHeader("hunt-packs", "Hunt Packs", width, THEME,
      ps.packs.length > 0 ? `${ps.packs.length} packs` : undefined))

    if (ps.loading) {
      lines.push(fitString(`  ${THEME.dim}Loading packs...${THEME.reset}`, width))
    } else if (ps.error) {
      lines.push(fitString(`  ${THEME.error}${ps.error}${THEME.reset}`, width))
    } else if (ps.packs.length === 0) {
      lines.push(fitString(`  ${THEME.dim}No packs found${THEME.reset}`, width))
    } else {
      const nodes = buildPackTree(ps.packs)
      const treeHeight = height - lines.length - 2
      lines.push(...renderTree(nodes, ps.tree, treeHeight, width, THEME))
    }

    while (lines.length < height - 1) lines.push(" ".repeat(width))
    lines.push(fitString(
      `${THEME.dim}ESC${THEME.reset} back  ${THEME.dim}j/k${THEME.reset} navigate  ` +
      `${THEME.dim}Space${THEME.reset} expand  ${THEME.dim}r${THEME.reset} reload`,
      width))

    return lines.join("\n")
  },

  handleInput(key: string, ctx: ScreenContext): boolean {
    const ps = ctx.state.thruntPacks
    const nodes = buildPackTree(ps.packs)
    const flat = flattenTree(nodes, ps.tree.expandedKeys)

    switch (key) {
      case "j":
      case "\x1b[B":
        ctx.state.thruntPacks.tree = moveDown(ps.tree, flat.length, ctx.height - 5)
        ctx.app.render()
        return true
      case "k":
      case "\x1b[A":
        ctx.state.thruntPacks.tree = moveUp(ps.tree)
        ctx.app.render()
        return true
      case " ":
      case "\r": {
        // Toggle expand on the currently selected node
        const selectedEntry = flat[ps.tree.selected]
        if (selectedEntry) {
          ctx.state.thruntPacks.tree = toggleExpand(ps.tree, selectedEntry.node.key)
        }
        ctx.app.render()
        return true
      }
      case "r":
        loadPacks(ctx)
        return true
      case "\x1b":
        ctx.app.setScreen("main")
        return true
      default:
        return false
    }
  },
}

async function loadPacks(ctx: ScreenContext) {
  const ps = ctx.state.thruntPacks
  ps.loading = true
  ps.error = null
  ctx.app.render()

  try {
    const packs = await listPacks({ cwd: ctx.app.getCwd() })
    ps.packs = packs
    ps.tree = { offset: 0, selected: 0, expandedKeys: new Set() }
    ps.loading = false
  } catch (err) {
    ps.error = err instanceof Error ? err.message : String(err)
    ps.loading = false
  }
  ctx.app.render()
}
