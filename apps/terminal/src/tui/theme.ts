/**
 * Theme - Sovereign
 *
 * Regal gothic: obsidian background, royal purple primary, sovereign gold secondary.
 * Authority without blood. Crown energy.
 */

// =============================================================================
// COLORS
// =============================================================================

// Background color - deep obsidian black (kept from gothic era)
export const BG_COLOR = "\x1b[48;2;12;12;16m"

export const THEME = {
  // Primary accent - royal purple (sovereign authority)
  accent: BG_COLOR + "\x1b[38;2;155;89;182m",
  // Secondary accent - sovereign gold (crown elegance)
  secondary: BG_COLOR + "\x1b[38;2;212;168;67m",
  // Tertiary - midnight blue (deep court shadow)
  tertiary: BG_COLOR + "\x1b[38;2;44;62;107m",
  // Success - emerald (royal seal)
  success: BG_COLOR + "\x1b[38;2;39;174;96m",
  // Warning - burnished orange (herald flame)
  warning: BG_COLOR + "\x1b[38;2;230;126;34m",
  // Error - deep carmine (blood oath)
  error: BG_COLOR + "\x1b[38;2;192;57;43m",
  // Muted text - pewter
  muted: BG_COLOR + "\x1b[38;2;127;140;141m",
  // Dimmer muted - dark pewter
  dim: BG_COLOR + "\x1b[38;2;90;100;105m",
  // White text - marble
  white: BG_COLOR + "\x1b[38;2;236;240;241m",
  // Background - deep obsidian black
  bg: BG_COLOR,
  // Reset - resets foreground but keeps background
  reset: "\x1b[0m" + BG_COLOR,
  // Bold
  bold: "\x1b[1m",
  // Dim
  dimAttr: "\x1b[2m",
  // Italic
  italic: "\x1b[3m",
} as const

export type ThemeColors = typeof THEME

// =============================================================================
// LOGO
// =============================================================================

// Sovereign ASCII logo - THRUNT GOD stacked two-part layout
// "THRUNT" is static royal purple, "GOD" is animated with gold shimmer
export const LOGO = {
  // "THRUNT" - static crimson
  main: [
    "████████╗██╗  ██╗██████╗ ██╗   ██╗███╗   ██╗████████╗",
    "╚══██╔══╝██║  ██║██╔══██╗██║   ██║████╗  ██║╚══██╔══╝",
    "   ██║   ███████║██████╔╝██║   ██║██╔██╗ ██║   ██║   ",
    "   ██║   ██╔══██║██╔══██╗██║   ██║██║╚██╗██║   ██║   ",
    "   ██║   ██║  ██║██║  ██║╚██████╔╝██║ ╚████║   ██║   ",
    "   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝",
  ],
  // "GOD" - will be animated with gold shimmer
  god: [
    " ██████╗  ██████╗ ██████╗ ",
    "██╔════╝ ██╔═══██╗██╔══██╗",
    "██║  ███╗██║   ██║██║  ██║",
    "██║   ██║██║   ██║██║  ██║",
    "╚██████╔╝╚██████╔╝██████╔╝",
    " ╚═════╝  ╚═════╝ ╚═════╝ ",
  ],
}

// =============================================================================
// ANIMATION
// =============================================================================

// Gold shimmer palette for the animated "GOD"
export const GOLD_SHIMMER_COLORS = [
  "\x1b[38;2;132;90;32m",   // Deep brass
  "\x1b[38;2;165;113;40m",  // Burnished bronze
  "\x1b[38;2;198;142;58m",  // Antique gold
  "\x1b[38;2;224;180;96m",  // Warm gold
  "\x1b[38;2;242;215;150m", // Champagne
  "\x1b[38;2;255;246;228m", // Ivory glint
] as const

// Get animated "GOD" with smooth metallic shimmer
export function getAnimatedGod(frame: number): string[] {
  const result: string[] = []

  const height = LOGO.god.length
  const width = LOGO.god[0]?.length ?? 0

  const diagonalSlope = 0.75
  const travel = (width - 1) + (height - 1) * diagonalSlope
  const shimmerCenter = (frame * 0.32) % (travel + 1)
  const bandWidth = 1.65

  for (let row = 0; row < height; row++) {
    let line = ""
    let currentColor: string | null = null
    const chars = [...LOGO.god[row]]

    for (let col = 0; col < chars.length; col++) {
      const char = chars[col]

      if (char === " ") {
        line += " "
        continue
      }

      // Smooth diagonal shimmer band + subtle micro-variation for "metal" feel
      const pos = col + row * diagonalSlope
      let dist = Math.abs(pos - shimmerCenter)
      dist = Math.min(dist, (travel + 1) - dist)
      const glint = Math.exp(-(dist * dist) / (2 * bandWidth * bandWidth))

      const microWave = (Math.sin(frame * 0.18 + row * 1.1 + col * 0.65) + 1) / 2
      const intensity = Math.min(1, Math.max(0, 0.58 + glint * 0.42 + (microWave - 0.5) * 0.08))

      const colorIdx = Math.min(
        GOLD_SHIMMER_COLORS.length - 1,
        Math.floor(intensity * (GOLD_SHIMMER_COLORS.length - 1)),
      )
      const color = GOLD_SHIMMER_COLORS[colorIdx]

      if (color !== currentColor) {
        line += BG_COLOR + color
        currentColor = color
      }
      line += char
    }
    result.push(line + THEME.reset)
  }

  return result
}

// =============================================================================
// ESCAPE SEQUENCES
// =============================================================================

export const ESC = {
  clearScreen: "\x1b[2J",
  moveTo: (row: number, col: number) => `\x1b[${row};${col}H`,
  hideCursor: "\x1b[?25l",
  showCursor: "\x1b[?25h",
  altScreen: "\x1b[?1049h",
  mainScreen: "\x1b[?1049l",
  clearLine: "\x1b[2K",
  clearToEndOfScreen: "\x1b[J",
} as const

// =============================================================================
// AGENTS
// =============================================================================

export const AGENTS = [
  { id: "claude", name: "Claude", model: "Opus 4", provider: "Anthropic" },
  { id: "codex", name: "Codex", model: "GPT-5.2", provider: "OpenAI" },
  { id: "opencode", name: "OpenCode", model: "Multi", provider: "Open" },
  { id: "crush", name: "Crush", model: "Fallback", provider: "Multi" },
] as const

export type Agent = (typeof AGENTS)[number]
