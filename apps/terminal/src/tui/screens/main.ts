/**
 * Main Screen - Hero input + command palette overlay
 */

import { THEME, LOGO, AGENTS, getAnimatedStrike } from "../theme"
import type { Screen, ScreenContext, Command, HomeFocus } from "../types"
import { renderBox } from "../components/box"
import { centerBlock, centerLine, joinColumns, wrapText } from "../components/layout"
import { fitString } from "../components/types"
import type { AppState } from "../types"

const HOME_ACTION_COLUMNS = 2
const HOME_ACTION_SELECTED_BG = "\x1b[48;5;52m"
const BOX_TRACE_FRAMES = 8

interface HomeAction {
  key: string
  label: string
  description: string
  action: (ctx: ScreenContext) => void
}

function flattenHealth(state: AppState) {
  return state.health
    ? [...state.health.security, ...state.health.ai, ...state.health.infra, ...state.health.mcp]
    : []
}

function renderHealthStatus(state: AppState): string {
  if (state.healthChecking) {
    return `${THEME.secondary}checking${THEME.reset}`
  }

  const items = flattenHealth(state)
  if (items.length === 0) {
    return `${THEME.dim}unknown${THEME.reset}`
  }

  const unavailable = items.filter((item) => !item.available)
  if (unavailable.length === 0) {
    return `${THEME.success}healthy${THEME.reset} ${THEME.dim}${items.length}/${items.length} up${THEME.reset}`
  }

  return `${THEME.warning}degraded${THEME.reset} ${THEME.dim}${unavailable.length}/${items.length} down${THEME.reset}`
}

const HOME_ACTIONS: HomeAction[] = [
  { key: "D", label: "Dispatch", description: "agent task", action: (ctx) => ctx.app.setScreen("dispatch-sheet") },
  { key: "P", label: "Phases", description: "hunt progress", action: (ctx) => ctx.app.setScreen("hunt-phases") },
  { key: "E", label: "Evidence", description: "manifests", action: (ctx) => ctx.app.setScreen("hunt-evidence") },
  { key: "T", label: "Detections", description: "candidates", action: (ctx) => ctx.app.setScreen("hunt-detections") },
  { key: "K", label: "Packs", description: "hunt packs", action: (ctx) => ctx.app.setScreen("hunt-packs") },
  { key: "C", label: "Connectors", description: "status", action: (ctx) => ctx.app.setScreen("hunt-connectors") },
]

function findHomeActionIndex(key: string): number {
  return HOME_ACTIONS.findIndex((action) => action.key === key.toUpperCase())
}

function activateHomeAction(index: number, ctx: ScreenContext): boolean {
  const action = HOME_ACTIONS[index]
  if (!action) {
    return false
  }

  ctx.state.homeActionIndex = index
  action.action(ctx)
  return true
}

function moveHomeActionSelection(index: number, key: string): number {
  const maxIndex = HOME_ACTIONS.length - 1
  switch (key) {
    case "\x1b[A":
    case "up":
      return Math.max(0, index - HOME_ACTION_COLUMNS)
    case "\x1b[B":
    case "down":
      return Math.min(maxIndex, index + HOME_ACTION_COLUMNS)
    case "\x1b[D":
    case "left":
      return index % HOME_ACTION_COLUMNS === 0 ? index : index - 1
    case "\x1b[C":
    case "right":
      return index + 1 > maxIndex || index % HOME_ACTION_COLUMNS === HOME_ACTION_COLUMNS - 1 ? index : index + 1
    default:
      return index
  }
}

function renderHomeActionCell(action: HomeAction, selected: boolean, width: number): string {
  if (selected) {
    const innerWidth = Math.max(0, width - 2)
    const content = fitString(
      `${THEME.bold}[${action.key}]${THEME.reset} ${THEME.bold}${action.label}${THEME.reset} ${THEME.white}${action.description}${THEME.reset}`,
      innerWidth,
    )
    return `${THEME.accent}${THEME.bold}▌${THEME.reset}${HOME_ACTION_SELECTED_BG}${THEME.white}${content}${THEME.reset}${THEME.accent}${THEME.bold}▐${THEME.reset}`
  }

  const prefix = `${THEME.dim}•${THEME.reset}`
  const badge = `${THEME.secondary}${action.key}${THEME.reset}`
  const label = `${THEME.white}${action.label}${THEME.reset}`
  return fitString(`${prefix} ${badge} ${label} ${THEME.dim}${action.description}${THEME.reset}`, width)
}

function cycleHomeFocus(focus: HomeFocus): HomeFocus {
  return focus === "prompt" ? "actions" : "prompt"
}

function homeFocusTitle(focus: HomeFocus): string {
  switch (focus) {
    case "actions":
      return "Dispatch [actions]"
    case "nav":
      return "Dispatch [nav]"
    default:
      return "Dispatch [prompt]"
  }
}

function setHomeFocus(state: AppState, focus: HomeFocus): void {
  if (state.homeFocus === focus) {
    return
  }

  const previousFocus = state.homeFocus
  state.homeFocus = focus
  if (focus === "prompt") {
    state.homePromptTraceStartFrame = state.animationFrame
  } else if (previousFocus === "prompt") {
    state.homeActionsTraceStartFrame = state.animationFrame
  }
}

function boxTraceProgress(animationFrame: number, traceStartFrame: number): number {
  const age = Math.max(0, animationFrame - traceStartFrame)
  if (age >= BOX_TRACE_FRAMES) {
    return 1
  }

  return Math.max(0.08, (age + 1) / BOX_TRACE_FRAMES)
}

function renderTracedBox(
  title: string,
  contentLines: string[],
  width: number,
  state: AppState,
  options: {
    focused: boolean
    traceStartFrame: number
    focusedTitleColor?: string
    unfocusedTitleColor?: string
  },
): string[] {
  const { focused, traceStartFrame, focusedTitleColor = THEME.secondary, unfocusedTitleColor = THEME.dim } = options
  const baseBorderColor = THEME.dim
  const activeBorderColor = THEME.secondary
  const titleColor = focused ? focusedTitleColor : unfocusedTitleColor

  if (!focused) {
    return renderBox(title, contentLines, width, THEME, {
      style: "rounded",
      titleAlign: "left",
      padding: 1,
      borderColor: baseBorderColor,
      titleColor,
    })
  }

  const padding = 1
  const innerWidth = width - 2
  const paddedInnerWidth = innerWidth - padding * 2
  const padStr = " ".repeat(padding)
  const border = { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" }
  const rows = contentLines.length === 0 ? [""] : contentLines
  const decoratedTitle = ` \u27E8 ${title} \u27E9 `
  const titleFits = decoratedTitle.length < innerWidth
  const remaining = titleFits ? innerWidth - decoratedTitle.length : innerWidth
  const leftFill = titleFits ? 1 : 0
  const rightFill = titleFits ? remaining - leftFill : innerWidth
  const visibleTopSegments = titleFits ? leftFill + rightFill + 2 : innerWidth + 2
  const perimeterSegments = visibleTopSegments + width + rows.length * 2
  const activeSegments = Math.min(
    perimeterSegments,
    Math.max(1, Math.ceil(perimeterSegments * boxTraceProgress(state.animationFrame, traceStartFrame))),
  )

  let segmentIndex = 0
  const segment = (char: string): string => {
    const color = segmentIndex < activeSegments ? activeBorderColor : baseBorderColor
    segmentIndex += 1
    return `${color}${char}${THEME.reset}`
  }

  const topLine = titleFits
    ? `${segment(border.tl)}${Array.from({ length: leftFill }, () => segment(border.h)).join("")}` +
      `${titleColor}${decoratedTitle}${THEME.reset}` +
      `${Array.from({ length: rightFill }, () => segment(border.h)).join("")}${segment(border.tr)}`
    : `${segment(border.tl)}${Array.from({ length: innerWidth }, () => segment(border.h)).join("")}${segment(border.tr)}`

  const lines = [topLine]
  for (const line of rows) {
    const fitted = fitString(line, paddedInnerWidth)
    lines.push(`${segment(border.v)}${padStr}${fitted}${padStr}${segment(border.v)}`)
  }
  lines.push(
    `${segment(border.bl)}${Array.from({ length: innerWidth }, () => segment(border.h)).join("")}${segment(border.br)}`,
  )

  return lines
}

function renderPromptBox(title: string, contentLines: string[], width: number, state: AppState): string[] {
  return renderTracedBox(title, contentLines, width, state, {
    focused: state.homeFocus === "prompt",
    traceStartFrame: state.homePromptTraceStartFrame,
  })
}

function renderHomeActionGuide(focus: HomeFocus, contentWidth: number): string[] {
  switch (focus) {
    case "actions":
      return wrapText(
        `${THEME.dim}Actions focus:${THEME.reset} ${THEME.white}↑↓←→${THEME.reset} move  ` +
          `${THEME.white}Enter${THEME.reset} open  ${THEME.white}Tab${THEME.reset} prompt  ` +
          `${THEME.white}Esc${THEME.reset} prompt`,
        contentWidth,
      )
    case "nav":
      return wrapText(
        `${THEME.dim}Nav mode:${THEME.reset} ${THEME.white}D/P/E/T/K/C${THEME.reset} hunt actions  ` +
          `${THEME.white}Esc${THEME.reset} prompt`,
        contentWidth,
      )
    default:
      return wrapText(
        `${THEME.dim}Prompt focus:${THEME.reset} ${THEME.white}Tab${THEME.reset} actions  ` +
          `${THEME.white}Enter${THEME.reset} dispatch sheet  ${THEME.white}Esc${THEME.reset} nav  ` +
          `${THEME.dim}empty prompt keeps D/P/E/T/K/C live; once you type, keys stay in the prompt${THEME.reset}`,
        contentWidth,
      )
  }
}

function renderHomeActionRows(ctx: ScreenContext, contentWidth: number): string[] {
  const rows: string[] = []
  const selection = Math.min(ctx.state.homeActionIndex, HOME_ACTIONS.length - 1)
  const activeSelection = ctx.state.homeFocus !== "prompt"
  const selectedAction = HOME_ACTIONS[selection]
  const gap = 3
  const cellWidth = Math.max(22, Math.floor((contentWidth - gap) / HOME_ACTION_COLUMNS))

  rows.push(...renderHomeActionGuide(ctx.state.homeFocus, contentWidth))
  if (activeSelection && selectedAction) {
    rows.push(
      fitString(
        `${THEME.accent}${THEME.bold}Selected${THEME.reset} ${THEME.secondary}[${selectedAction.key}]${THEME.reset} ` +
          `${THEME.white}${selectedAction.label}${THEME.reset} ${THEME.dim}${selectedAction.description}${THEME.reset}`,
        contentWidth,
      ),
    )
  }

  for (let i = 0; i < HOME_ACTIONS.length; i += HOME_ACTION_COLUMNS) {
    const left = renderHomeActionCell(HOME_ACTIONS[i], activeSelection && selection === i, cellWidth)
    const rightAction = HOME_ACTIONS[i + 1]
    const right = rightAction
      ? renderHomeActionCell(rightAction, activeSelection && selection === i + 1, cellWidth)
      : ""
    rows.push(joinColumns(left, right, contentWidth))
  }

  return rows
}

export function createMainScreen(commands: Command[]): Screen {
  return {
    render(ctx: ScreenContext): string {
      let content = renderMainContent(ctx, commands)
      if (ctx.state.inputMode === "commands") {
        content = overlayCommandPalette(content, ctx, commands)
      } else if (ctx.state.inputMode === "dispatch-sheet") {
        content = overlayDispatchSheet(content, ctx)
      }
      return content
    },

    handleInput(key: string, ctx: ScreenContext): boolean {
      if (ctx.state.inputMode === "commands") {
        return handleCommandsInput(key, ctx, commands)
      }
      if (ctx.state.inputMode === "dispatch-sheet") {
        return handleDispatchSheetInput(key, ctx)
      }
      return handleMainInput(key, ctx)
    },
  }
}

function handleMainInput(key: string, ctx: ScreenContext): boolean {
  const { state, app } = ctx

  // Ctrl+S - security overview
  if (key === "\x13") {
    app.setScreen("security")
    return true
  }

  // Ctrl+N - cycle agents
  if (key === "\x0e") {
    state.agentIndex = (state.agentIndex + 1) % AGENTS.length
    app.render()
    return true
  }

  // Tab - cycle prompt/actions focus
  if (key === "\t") {
    setHomeFocus(state, cycleHomeFocus(state.homeFocus))
    app.render()
    return true
  }

  // Ctrl+P - open command palette
  if (key === "\x10") {
    state.inputMode = "commands"
    state.commandIndex = 0
    app.render()
    return true
  }

  const isArrowKey =
    key === "\x1b[A" ||
    key === "\x1b[B" ||
    key === "\x1b[C" ||
    key === "\x1b[D" ||
    key === "up" ||
    key === "down" ||
    key === "left" ||
    key === "right"

  if (state.homeFocus === "actions" || state.homeFocus === "nav") {
    if (isArrowKey) {
      state.homeActionIndex = moveHomeActionSelection(state.homeActionIndex, key)
      app.render()
      return true
    }
  }

  if (state.homeFocus === "nav") {
    const actionIndex = findHomeActionIndex(key)
    if (actionIndex >= 0) {
      return activateHomeAction(actionIndex, ctx)
    }
  }

  if (state.homeFocus === "prompt" && state.promptBuffer.length === 0) {
    const actionIndex = HOME_ACTIONS.findIndex((action) => action.key === key)
    if (actionIndex >= 0) {
      return activateHomeAction(actionIndex, ctx)
    }
  }

  // Enter - submit prompt or open selected action
  if (key === "\r") {
    if (state.homeFocus !== "prompt") {
      return activateHomeAction(state.homeActionIndex, ctx)
    }
    if (state.promptBuffer.trim()) {
      app.submitPrompt("dispatch")
    }
    return true
  }

  // Backspace
  if ((key === "\x7f" || key === "\b") && state.homeFocus === "prompt") {
    state.promptBuffer = state.promptBuffer.slice(0, -1)
    app.render()
    return true
  }

  // Ctrl+U - clear line
  if (key === "\x15" && state.homeFocus === "prompt") {
    state.promptBuffer = ""
    app.render()
    return true
  }

  // Escape - toggle prompt/nav, or exit actions focus back to prompt
  if (key === "\x1b" || key === "\x1b\x1b") {
    if (state.homeFocus === "actions") {
      setHomeFocus(state, "prompt")
    } else {
      setHomeFocus(state, state.homeFocus === "prompt" ? "nav" : "prompt")
    }
    app.render()
    return true
  }

  // Regular characters or pasted text - add to prompt
  const printableChunk = state.homeFocus === "prompt" ? printableTextChunk(key) : null
  if (printableChunk) {
    state.promptBuffer += printableChunk
    app.render()
    return true
  }

  return false
}

function handleCommandsInput(key: string, ctx: ScreenContext, commands: Command[]): boolean {
  const { state, app } = ctx

  // Escape - close palette
  if (key === "\x1b" || key === "\x1b\x1b" || key === "\x10") {
    state.inputMode = "main"
    app.render()
    return true
  }

  // Arrow up / k
  if (key === "\x1b[A" || key === "k") {
    state.commandIndex = Math.max(0, state.commandIndex - 1)
    app.render()
    return true
  }

  // Arrow down / j
  if (key === "\x1b[B" || key === "j") {
    state.commandIndex = Math.min(commands.length - 1, state.commandIndex + 1)
    app.render()
    return true
  }

  // Enter - execute command
  if (key === "\r") {
    const cmd = commands[state.commandIndex]
    state.inputMode = "main"
    cmd.action()
    return true
  }

  // Direct key shortcuts
  const cmd = commands.find((c) => c.key.toLowerCase() === key.toLowerCase())
  if (cmd) {
    state.inputMode = "main"
    cmd.action()
    return true
  }

  return false
}

function renderHuntStatusPanel(state: AppState): string[] {
  const ctx = state.thruntContext
  if (!ctx) {
    return [`${THEME.muted}No hunt state loaded${THEME.reset}`]
  }

  const lines: string[] = []

  // Phase line
  const phaseNum = ctx.phase.number ?? "?"
  const phaseName = ctx.phase.name ?? "unknown"
  lines.push(`${THEME.dim}Phase${THEME.reset} ${THEME.secondary}${phaseNum}${THEME.reset}${THEME.dim}:${THEME.reset} ${THEME.white}${phaseName}${THEME.reset}`)

  // Plan line
  const planCurrent = ctx.plan.current ?? "?"
  const planTotal = ctx.plan.total ?? "?"
  const status = ctx.status ?? "unknown"
  lines.push(`${THEME.dim}Plan${THEME.reset} ${THEME.white}${planCurrent}/${planTotal}${THEME.reset} ${THEME.dim}--${THEME.reset} ${THEME.white}${status}${THEME.reset}`)

  // Progress bar
  const percent = ctx.progressPercent ?? 0
  const barWidth = 20
  const filled = Math.round((percent / 100) * barWidth)
  const empty = barWidth - filled
  const bar = `${"█".repeat(filled)}${"░".repeat(empty)}`
  lines.push(`${THEME.success}${bar}${THEME.reset} ${THEME.white}${percent}%${THEME.reset}`)

  // Blockers
  if (ctx.blockers.length > 0) {
    lines.push("")
    for (const blocker of ctx.blockers) {
      lines.push(`${THEME.warning}!${THEME.reset} ${THEME.white}${blocker}${THEME.reset}`)
    }
  }

  return lines
}

function buildOpsSnapshot(ctx: ScreenContext, width: number): { boxWidth: number; lines: string[] } | null {
  const { state } = ctx
  const boxWidth = Math.min(84, width - 8)
  if (boxWidth < 28) {
    return null
  }

  const lines: string[] = []

  // Hunt status panel
  lines.push(...renderHuntStatusPanel(state))

  // Health line
  lines.push(`${THEME.dim}Health:${THEME.reset} ${renderHealthStatus(state)}  ` +
    `${THEME.dim}runs:${THEME.reset} ${THEME.white}${state.activeRuns}${THEME.reset}`)

  lines.push("")
  lines.push(...renderHomeActionRows(ctx, boxWidth - 4))

  return {
    boxWidth,
    lines: renderTracedBox(
      state.homeFocus === "prompt"
        ? "Hunt Status"
        : `Hunt Status • ${state.homeFocus}`,
      lines,
      boxWidth,
      state,
      {
        focused: state.homeFocus !== "prompt",
        traceStartFrame: state.homeActionsTraceStartFrame,
      },
    ),
  }
}

function renderMainContent(ctx: ScreenContext, _commands: Command[]): string {
  const { state, width, height } = ctx
  const lines: string[] = []
  const opsSnapshot = buildOpsSnapshot(ctx, width)
  const opsHeight = opsSnapshot ? opsSnapshot.lines.length + 2 : 0
  const statusHeight = state.statusMessage ? 2 : 0

  // Calculate vertical centering for logo + input
  const contentHeight = LOGO.main.length + LOGO.strike.length + 10 + opsHeight + statusHeight
  const startY = Math.max(1, Math.floor((height - contentHeight) / 3))

  // Top padding
  for (let i = 0; i < startY; i++) {
    lines.push("")
  }

  // Logo - stacked layout: CLAWD on top, STRIKE below
  // Render CLAWD lines in crimson
  lines.push(...centerBlock(
    LOGO.main.map((line) => `${THEME.accent}${line}${THEME.reset}`),
    width,
  ))

  // Get animated STRIKE for current frame and render below
  const animatedStrike = getAnimatedStrike(state.animationFrame)
  lines.push(...centerBlock(animatedStrike, width))

  lines.push("")

  // Hero input box
  const inputWidth = Math.min(78, width - 10)

  const prompt = state.promptBuffer
  const placeholder = 'Ask anything... "Fix broken tests"'
  const cursor = prompt ? THEME.secondary + "▎" + THEME.reset : ""
  const promptFocused = state.homeFocus === "prompt"
  const promptTextColor = promptFocused ? THEME.white : THEME.muted
  const placeholderColor = promptFocused ? THEME.dim : THEME.dimAttr + THEME.muted
  const metaColor = promptFocused ? THEME.dim : THEME.muted

  const innerWidth = inputWidth - 4
  const visiblePrompt = prompt.length > innerWidth - 2
    ? "…" + prompt.slice(-(innerWidth - 3))
    : prompt
  const inputContent = visiblePrompt + cursor
  const agent = AGENTS[state.agentIndex]
  const inputBox = renderPromptBox(
    homeFocusTitle(state.homeFocus),
    [
      prompt
        ? `${promptTextColor}${inputContent}${THEME.reset}`
        : `${placeholderColor}${placeholder}${THEME.reset}`,
      "",
      joinColumns(
        `${THEME.accent}${agent.name}${THEME.reset}  ${metaColor}${agent.model}${THEME.reset} ${THEME.dim}${agent.provider}${THEME.reset}`,
        `${metaColor}ctrl+n${THEME.reset} ${metaColor}next agent${THEME.reset}`,
        inputWidth - 4,
      ),
    ],
    inputWidth,
    state,
  )
  lines.push(...centerBlock(inputBox, width))

  lines.push("")

  // Hint bar - centered
  const primaryHints = state.homeFocus === "prompt"
    ? `${THEME.bold}Enter${THEME.reset}${THEME.muted} dispatch sheet${THEME.reset}    ` +
      `${THEME.bold}Tab${THEME.reset}${THEME.muted} actions${THEME.reset}    ` +
      `${THEME.bold}Ctrl+P${THEME.reset}${THEME.muted} commands${THEME.reset}    ` +
      `${THEME.bold}Esc${THEME.reset}${THEME.muted} nav${THEME.reset}`
    : state.homeFocus === "actions"
      ? `${THEME.bold}↑↓←→${THEME.reset}${THEME.muted} move${THEME.reset}    ` +
        `${THEME.bold}Enter${THEME.reset}${THEME.muted} open${THEME.reset}    ` +
        `${THEME.bold}Tab${THEME.reset}${THEME.muted} prompt${THEME.reset}    ` +
        `${THEME.bold}Esc${THEME.reset}${THEME.muted} prompt${THEME.reset}`
      : `${THEME.bold}D/P/E/T/K/C${THEME.reset}${THEME.muted} hunt actions${THEME.reset}    ` +
        `${THEME.bold}Esc${THEME.reset}${THEME.muted} prompt${THEME.reset}`
  const secondaryHints = state.homeFocus === "prompt"
    ? `${THEME.bold}Ctrl+N${THEME.reset}${THEME.muted} next agent${THEME.reset}    ` +
      `${THEME.bold}↑↓←→${THEME.reset}${THEME.muted} available after Tab${THEME.reset}`
    : `${THEME.bold}Ctrl+P${THEME.reset}${THEME.muted} commands${THEME.reset}    ` +
      `${THEME.bold}Ctrl+N${THEME.reset}${THEME.muted} next agent${THEME.reset}`
  lines.push(centerLine(primaryHints, width))
  lines.push(centerLine(secondaryHints, width))

  // Status message (if any)
  if (state.statusMessage) {
    lines.push("")
    lines.push(centerLine(state.statusMessage, width))
  }

  if (opsSnapshot) {
    lines.push("")
    lines.push(...centerBlock(opsSnapshot.lines, width))
  }

  // Fill remaining space (leave room for status bar)
  const currentLines = lines.length
  for (let i = currentLines; i < height - 2; i++) {
    lines.push("")
  }

  return lines.join("\n")
}

function cycleDispatchSheetOption(
  current: number,
  length: number,
  direction: -1 | 1,
): number {
  return (current + direction + length) % length
}

function printableTextChunk(key: string): string | null {
  if (!key || key.includes("\x1b")) {
    return null
  }
  const text = [...key].filter((ch) => ch >= " " && ch !== "\x7f").join("")
  return text.length > 0 ? text : null
}

function handleDispatchSheetInput(key: string, ctx: ScreenContext): boolean {
  const { state, app } = ctx
  const sheet = state.dispatchSheet
  if (!sheet.open) {
    return false
  }

  if (key === "\x1b" || key === "\x1b\x1b" || key.toLowerCase() === "q") {
    app.closeDispatchSheet()
    return true
  }

  if (key === "\r") {
    app.launchDispatchSheet()
    return true
  }

  if (key === "\t" || key === "\x1b[B" || key === "down") {
    sheet.focusedField = ((sheet.focusedField + 1) % 4) as 0 | 1 | 2 | 3
    sheet.error = null
    app.render()
    return true
  }

  if (key === "\x1b[A" || key === "up") {
    sheet.focusedField = ((sheet.focusedField + 3) % 4) as 0 | 1 | 2 | 3
    sheet.error = null
    app.render()
    return true
  }

  if (key === "\x1b[C" || key === "right" || key === "\x1b[D" || key === "left") {
    const direction: -1 | 1 = key === "\x1b[D" || key === "left" ? -1 : 1
    if (sheet.focusedField === 1) {
      sheet.action = sheet.action === "dispatch" ? "speculate" : "dispatch"
    } else if (sheet.focusedField === 2) {
      const modes = ["managed", "attach", "external"] as const
      sheet.mode = modes[cycleDispatchSheetOption(modes.indexOf(sheet.mode), modes.length, direction)]
    } else if (sheet.focusedField === 3) {
      sheet.agentIndex = cycleDispatchSheetOption(sheet.agentIndex, AGENTS.length, direction)
    }
    sheet.error = null
    app.render()
    return true
  }

  if (key === "d" || key === "s") {
    sheet.action = key === "d" ? "dispatch" : "speculate"
    sheet.error = null
    app.render()
    return true
  }

  return false
}

function dispatchField(label: string, value: string, selected: boolean): string {
  const marker = selected ? `${THEME.accent}${THEME.bold}▸${THEME.reset}` : `${THEME.dim}•${THEME.reset}`
  return `${marker} ${THEME.dim}${label}:${THEME.reset} ${value}`
}

function overlayDispatchSheet(baseScreen: string, ctx: ScreenContext): string {
  const { state, width } = ctx
  const lines = baseScreen.split("\n")
  const sheetWidth = Math.max(52, Math.min(82, width - 12))
  const startY = 6
  const sheet = state.dispatchSheet
  const promptPreview = wrapText(sheet.prompt, sheetWidth - 8)
  const content: string[] = [
    `${THEME.dim}Use${THEME.reset} ${THEME.white}↑/↓${THEME.reset} ${THEME.dim}focus${THEME.reset}  ` +
      `${THEME.white}←/→${THEME.reset} ${THEME.dim}change${THEME.reset}  ` +
      `${THEME.white}Enter${THEME.reset} ${THEME.dim}launch${THEME.reset}  ` +
      `${THEME.white}Esc${THEME.reset} ${THEME.dim}cancel${THEME.reset}`,
    "",
    dispatchField(
      "Prompt",
      promptPreview[0]
        ? `${THEME.white}${promptPreview[0]}${THEME.reset}`
        : `${THEME.muted}(empty)${THEME.reset}`,
      sheet.focusedField === 0,
    ),
    ...promptPreview.slice(1).map((line) => `  ${THEME.muted}${line}${THEME.reset}`),
    "",
    dispatchField("Action", `${THEME.white}${sheet.action}${THEME.reset}`, sheet.focusedField === 1),
    dispatchField(
      "Mode",
      sheet.mode === "managed"
        ? `${THEME.white}${sheet.mode}${THEME.reset}`
        : sheet.mode === "attach"
          ? `${THEME.success}${sheet.mode}${THEME.reset} ${THEME.dim}(phase 3)${THEME.reset}`
          : `${THEME.warning}${sheet.mode}${THEME.reset} ${THEME.dim}(phase 5)${THEME.reset}`,
      sheet.focusedField === 2,
    ),
    dispatchField(
      "Agent",
      `${THEME.white}${AGENTS[sheet.agentIndex]?.name ?? AGENTS[0].name}${THEME.reset}`,
      sheet.focusedField === 3,
    ),
  ]

  if (sheet.error) {
    content.push("")
    content.push(`${THEME.error}${sheet.error}${THEME.reset}`)
  }

  const overlay = centerBlock(
    renderBox("Dispatch Sheet", content, sheetWidth, THEME, {
      style: "rounded",
      titleAlign: "left",
      padding: 1,
    }),
    width,
  )

  for (let i = 0; i < overlay.length; i++) {
    const lineIndex = startY + i
    if (lineIndex < lines.length) {
      lines[lineIndex] = overlay[i]
    }
  }

  return lines.join("\n")
}

function commandStageTag(command: Command): { text: string; plainLength: number } {
  if (command.stage === "experimental") {
    return {
      text: `${THEME.warning}exp${THEME.reset}`,
      plainLength: 3,
    }
  }

  return {
    text: `${THEME.success}beta${THEME.reset}`,
    plainLength: 4,
  }
}

function overlayCommandPalette(baseScreen: string, ctx: ScreenContext, commands: Command[]): string {
  const { state, width } = ctx
  const lines = baseScreen.split("\n")
  const paletteWidth = Math.min(78, width - 12)
  const startY = 4
  const contentWidth = paletteWidth - 4

  const paletteLines: string[] = [
    `${THEME.dim}Navigate:${THEME.reset} ${THEME.white}↑/↓${THEME.reset} select  ` +
      `${THEME.white}Enter${THEME.reset} run  ${THEME.white}Esc${THEME.reset} close  ` +
      `${THEME.dim}or press a shortcut key directly${THEME.reset}`,
    "",
  ]

  // Group commands by category
  const categories = [
    { name: "Actions", commands: commands.filter(c => ["d", "s", "g"].includes(c.key)) },
    { name: "Security", commands: commands.filter(c => ["S", "a", "p"].includes(c.key)) },
    { name: "Hunt", commands: commands.filter(c => ["W", "X", "T", "R", "Q", "D", "E", "H", "M", "P"].includes(c.key)) },
    { name: "Views", commands: commands.filter(c => ["b", "r", "i"].includes(c.key)) },
    { name: "System", commands: commands.filter(c => ["?", "q"].includes(c.key)) },
  ]

  let globalIndex = 0
  for (const category of categories) {
    if (category.commands.length === 0) continue

    paletteLines.push(`${THEME.secondary}${THEME.bold}${category.name}${THEME.reset}`)

    for (const cmd of category.commands) {
      const isSelected = globalIndex === state.commandIndex
      const stage = commandStageTag(cmd)
      const left = isSelected
        ? `${THEME.accent}${THEME.bold}▶${THEME.reset} ${THEME.white}${THEME.bold}${cmd.label}${THEME.reset} ${THEME.dim}${cmd.description}${THEME.reset}`
        : `${THEME.dim}•${THEME.reset} ${THEME.white}${cmd.label}${THEME.reset} ${THEME.dim}${cmd.description}${THEME.reset}`
      const right = `${stage.text} ${THEME.dim}${cmd.key}${THEME.reset}`
      paletteLines.push(joinColumns(left, right, contentWidth))
      globalIndex++
    }

    paletteLines.push("")
  }

  while (paletteLines.length > 0 && paletteLines[paletteLines.length - 1] === "") {
    paletteLines.pop()
  }

  const palette = centerBlock(
    renderBox("Commands", paletteLines, paletteWidth, THEME, {
      style: "rounded",
      titleAlign: "left",
      padding: 1,
    }),
    width,
  )

  // Overlay palette onto base screen
  for (let i = 0; i < palette.length; i++) {
    const lineIndex = startY + i
    if (lineIndex < lines.length) {
      lines[lineIndex] = palette[i]
    }
  }

  return lines.join("\n")
}
