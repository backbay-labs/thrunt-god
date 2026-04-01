/**
 * Hunt Connectors Screen - Connector Status Viewer
 *
 * Shows connector list with health indicators from runtimeDoctor,
 * including aggregate summary line and per-connector health status.
 */

import { THEME } from "../theme"
import type { Screen, ScreenContext } from "../types"
import { renderSurfaceHeader } from "../components/surface-header"
import type { ListItem } from "../components/scrollable-list"
import { renderList, scrollUp, scrollDown } from "../components/scrollable-list"
import { fitString } from "../components/types"
import { runtimeDoctor } from "../../thrunt-bridge/connector"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function healthColor(health: string): string {
  switch (health) {
    case "healthy": return THEME.success
    case "degraded": return THEME.warning
    case "unavailable": return THEME.error
    default: return THEME.dim
  }
}

function healthIcon(health: string): string {
  switch (health) {
    case "healthy": return `${THEME.success}\u25CF${THEME.reset}`     // filled circle
    case "degraded": return `${THEME.warning}\u25CB${THEME.reset}`   // empty circle
    case "unavailable": return `${THEME.error}\u2717${THEME.reset}`  // x mark
    default: return `${THEME.dim}?${THEME.reset}`
  }
}

function formatConnector(c: { id: string; name: string; health: string; score: number; configured: boolean }): string {
  const icon = healthIcon(c.health)
  const hc = healthColor(c.health)
  const configLabel = c.configured
    ? `${THEME.success}configured${THEME.reset}`
    : `${THEME.dim}not configured${THEME.reset}`
  return `${icon} ${THEME.white}${c.name}${THEME.reset} ${hc}${c.health}${THEME.reset} ` +
    `${THEME.dim}score:${THEME.reset}${hc}${c.score}${THEME.reset}/100 ${configLabel}`
}

function formatConnectorPlain(c: { id: string; name: string; health: string; score: number; configured: boolean }): string {
  const configLabel = c.configured ? "configured" : "not configured"
  return `X ${c.name} ${c.health} score:${c.score}/100 ${configLabel}`
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export const huntConnectorsScreen: Screen = {
  onEnter(ctx: ScreenContext) {
    const cs = ctx.state.thruntConnectors
    if (!cs.doctor && !cs.loading) {
      loadConnectors(ctx)
    }
  },

  render(ctx: ScreenContext): string {
    const { state, width, height } = ctx
    const cs = state.thruntConnectors
    const lines: string[] = []

    lines.push(...renderSurfaceHeader("hunt-connectors", "Connector Status", width, THEME,
      cs.doctor ? `${cs.doctor.summary.total} connectors` : undefined))

    if (cs.loading) {
      lines.push(fitString(`  ${THEME.dim}Loading connector status...${THEME.reset}`, width))
    } else if (cs.error) {
      lines.push(fitString(`  ${THEME.error}${cs.error}${THEME.reset}`, width))
    } else if (!cs.doctor) {
      lines.push(fitString(`  ${THEME.dim}No connector data available${THEME.reset}`, width))
    } else {
      // Summary line
      const s = cs.doctor.summary
      lines.push(fitString(
        `  ${THEME.dim}Total:${THEME.reset} ${THEME.white}${s.total}${THEME.reset}  ` +
        `${THEME.success}Healthy:${THEME.reset} ${THEME.white}${s.healthy}${THEME.reset}  ` +
        `${THEME.warning}Degraded:${THEME.reset} ${THEME.white}${s.degraded}${THEME.reset}  ` +
        `${THEME.error}Unavailable:${THEME.reset} ${THEME.white}${s.unavailable}${THEME.reset}`,
        width))
      lines.push(fitString(`${THEME.dim}${"─".repeat(width)}${THEME.reset}`, width))

      // Connector list
      const connectors = cs.doctor.connectors
      const items: ListItem[] = connectors.map((c) => ({
        label: formatConnector(c),
        plainLength: formatConnectorPlain(c).length,
      }))
      const listHeight = Math.max(1, height - lines.length - 2)
      lines.push(...renderList(items, cs.list, listHeight, width, THEME))
    }

    while (lines.length < height - 1) lines.push(" ".repeat(width))
    lines.push(fitString(
      `${THEME.dim}ESC${THEME.reset} back  ${THEME.dim}j/k${THEME.reset} navigate  ` +
      `${THEME.dim}r${THEME.reset} reload`,
      width))

    return lines.join("\n")
  },

  handleInput(key: string, ctx: ScreenContext): boolean {
    const cs = ctx.state.thruntConnectors
    const connectorCount = cs.doctor?.connectors.length ?? 0

    switch (key) {
      case "j":
      case "\x1b[B":
        if (connectorCount > 0) {
          ctx.state.thruntConnectors.list = scrollDown(
            cs.list, connectorCount, ctx.height - 7)
          ctx.app.render()
        }
        return true
      case "k":
      case "\x1b[A":
        if (connectorCount > 0) {
          ctx.state.thruntConnectors.list = scrollUp(cs.list)
          ctx.app.render()
        }
        return true
      case "r":
        loadConnectors(ctx)
        return true
      case "\x1b":
        ctx.app.setScreen("main")
        return true
      default:
        return false
    }
  },
}

async function loadConnectors(ctx: ScreenContext) {
  const cs = ctx.state.thruntConnectors
  cs.loading = true
  cs.error = null
  ctx.app.render()

  try {
    const result = await runtimeDoctor()
    cs.doctor = result
    cs.list = { offset: 0, selected: 0 }
    cs.loading = false
  } catch (err) {
    cs.error = err instanceof Error ? err.message : String(err)
    cs.loading = false
  }
  ctx.app.render()
}
