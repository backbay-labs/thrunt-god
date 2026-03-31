/**
 * Main Screen - Search-first home surface with quick navigation and copyable prompts.
 */

import { THEME, LOGO, AGENTS, getAnimatedGod } from "../theme"
import type { Screen, ScreenContext, Command, HomeFocus } from "../types"
import { renderBox } from "../components/box"
import { centerBlock, centerLine, joinColumns } from "../components/layout"
import { fitString } from "../components/types"
import type { AppState } from "../types"

const HOME_ACTION_COLUMNS = 2
const HOME_ACTION_SELECTED_BG = "\x1b[48;2;60;30;80m"
const BOX_TRACE_FRAMES = 8
const SEARCH_RESULT_LIMIT = 8

interface HomeAction {
  key: string
  label: string
  description: string
  action: (ctx: ScreenContext) => void
}

interface HomeSearchResult {
  id: string
  kind: "suggestion" | "action" | "finding" | "report" | "pack" | "connector" | "phase" | "activity"
  title: string
  subtitle: string
  preview: string
  copyText?: string
  action?: (ctx: ScreenContext) => void
}

interface SuggestionSpec {
  id: string
  title: string
  subtitle: string
  preview: string
  copyText: string
}

const HOME_ACTIONS: HomeAction[] = [
  { key: "W", label: "Watch", description: "live stream", action: (ctx) => ctx.app.setScreen("hunt-watch") },
  { key: "Q", label: "Query", description: "hunt query", action: (ctx) => ctx.app.setScreen("hunt-query") },
  { key: "H", label: "History", description: "report bundles", action: (ctx) => ctx.app.setScreen("hunt-report-history") },
  { key: "P", label: "Phases", description: "hunt progress", action: (ctx) => ctx.app.setScreen("hunt-phases") },
  { key: "E", label: "Evidence", description: "manifests", action: (ctx) => ctx.app.setScreen("hunt-evidence") },
  { key: "T", label: "Detections", description: "candidates", action: (ctx) => ctx.app.setScreen("hunt-detections") },
  { key: "K", label: "Packs", description: "hunt packs", action: (ctx) => ctx.app.setScreen("hunt-packs") },
  { key: "C", label: "Connectors", description: "status", action: (ctx) => ctx.app.setScreen("hunt-connectors") },
]

const SEARCH_SUGGESTIONS: SuggestionSpec[] = [
  {
    id: "prompt:watch-summary",
    title: "Prompt: summarize suspicious watch activity",
    subtitle: "copy a prompt into Claude Code or Codex",
    preview: "Summarize the latest deny and audit events from the hunt watch pane, group them by pattern, and call out the highest-confidence anomalies.",
    copyText:
      "Summarize the latest deny and audit events from the hunt watch pane. Group them by repeated pattern, source, and verdict, then call out the highest-confidence anomalies and what to investigate next.",
  },
  {
    id: "prompt:report-brief",
    title: "Prompt: turn the latest hunt into a short brief",
    subtitle: "copyable status update for another agent tab",
    preview: "Create a concise incident-hunt brief from the latest report history entry, including severity, evidence count, and the top next actions.",
    copyText:
      "Create a concise hunt brief from the latest exported report. Include severity, the most important evidence, likely interpretation, and the top next actions.",
  },
  {
    id: "prompt:identity-hunt",
    title: "Prompt: start an identity abuse hunt",
    subtitle: "reusable starting prompt",
    preview: "Build a focused hunt for suspicious authentication patterns, unusual principals, and privilege changes across the available connectors.",
    copyText:
      "Build a focused hunt for suspicious authentication patterns, unusual principals, and privilege changes across the available connectors. Suggest the first three queries I should run and explain why.",
  },
  {
    id: "prompt:pack-triage",
    title: "Prompt: recommend the best pack to run next",
    subtitle: "pack selection helper",
    preview: "Look at the available hunt packs and recommend the strongest next pack based on the current investigation state and likely attack path.",
    copyText:
      "Look at the available hunt packs and recommend the strongest next pack to run based on the current investigation state. Explain the reasoning and the connector prerequisites.",
  },
  {
    id: "prompt:connector-gap",
    title: "Prompt: identify the biggest connector blind spot",
    subtitle: "environment readiness prompt",
    preview: "Review configured connectors and tell me which gap most limits useful hunting right now.",
    copyText:
      "Review the currently available connectors and tell me which missing or degraded connector most limits useful hunting right now. Give me the practical impact and the best workaround.",
  },
]

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

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase()
}

function tokenizeQuery(value: string): string[] {
  return normalizeSearchQuery(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function scoreText(queryTokens: string[], ...parts: string[]): number {
  if (queryTokens.length === 0) {
    return 0
  }

  const haystack = parts.join(" ").toLowerCase()
  let score = 0
  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += haystack.startsWith(token) ? 4 : 2
    } else {
      return -1
    }
  }
  return score
}

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
  return focus === "prompt" ? "Search" : "Navigate"
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
  const decoratedTitle = ` ⟨ ${title} ⟩ `
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

function renderHomeActionRows(ctx: ScreenContext, contentWidth: number): string[] {
  const rows: string[] = []
  const selection = Math.min(ctx.state.homeActionIndex, HOME_ACTIONS.length - 1)
  const activeSelection = ctx.state.homeFocus !== "prompt"
  const gap = 3
  const cellWidth = Math.max(22, Math.floor((contentWidth - gap) / HOME_ACTION_COLUMNS))

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

function buildSearchResults(ctx: ScreenContext): HomeSearchResult[] {
  if (ctx.state.homeSearch.hydrated || ctx.state.homeSearch.results.length > 0) {
    return ctx.state.homeSearch.results.map((result) => ({
      ...(() => {
        const target = result.target
        return {
          action: target
            ? () => {
                if (target.nlQuery) {
                  ctx.state.hunt.query.mode = "nl"
                  ctx.state.hunt.query.nlInput = target.nlQuery
                }
                ctx.app.setScreen(target.screen as never)
              }
            : undefined,
        }
      })(),
      id: result.id,
      kind:
        result.kind === "event"
          ? "finding"
          : result.kind,
      title: result.title,
      subtitle: result.subtitle,
      preview: result.preview,
      copyText: result.copyText,
    }))
  }

  const query = ctx.state.promptBuffer
  const queryTokens = tokenizeQuery(query)
  if (queryTokens.length === 0) {
    return []
  }

  const results: Array<{ score: number; result: HomeSearchResult }> = []
  const push = (result: HomeSearchResult, ...parts: string[]) => {
    const score = scoreText(queryTokens, ...parts)
    if (score >= 0) {
      results.push({ score, result })
    }
  }

  for (const action of HOME_ACTIONS) {
    push(
      {
        id: `action:${action.key}`,
        kind: "action",
        title: action.label,
        subtitle: action.description,
        preview: `Open the ${action.label.toLowerCase()} surface.`,
        action: action.action,
      },
      action.label,
      action.description,
    )
  }

  for (const suggestion of SEARCH_SUGGESTIONS) {
    push(
      {
        id: suggestion.id,
        kind: "suggestion",
        title: suggestion.title,
        subtitle: suggestion.subtitle,
        preview: suggestion.preview,
        copyText: suggestion.copyText,
      },
      suggestion.title,
      suggestion.subtitle,
      suggestion.preview,
      suggestion.copyText,
    )
  }

  const phase = ctx.state.thruntContext?.phase
  if (phase?.name || phase?.number) {
    const title = `Phase ${phase.number ?? "?"}`
    const subtitle = phase.name ?? "Current phase"
    push(
      {
        id: "phase:current",
        kind: "phase",
        title,
        subtitle,
        preview: ctx.state.thruntContext?.status ?? "Current hunt phase status.",
        copyText: `${title}: ${subtitle}`,
        action: () => ctx.app.setScreen("hunt-phases"),
      },
      title,
      subtitle,
      ctx.state.thruntContext?.status ?? "",
    )
  }

  for (const finding of ctx.state.hunt.investigation.findings.slice(0, SEARCH_RESULT_LIMIT)) {
    push(
      {
        id: `finding:${finding}`,
        kind: "finding",
        title: finding,
        subtitle: "current investigation finding",
        preview: `Copy this finding into another agent tab or jump into the evidence/report surfaces for more detail.`,
        copyText: finding,
        action: () => ctx.app.setScreen("hunt-evidence"),
      },
      finding,
      "investigation finding",
    )
  }

  for (const entry of ctx.state.hunt.reportHistory.entries.slice(0, SEARCH_RESULT_LIMIT)) {
    push(
      {
        id: `report:${entry.reportId}`,
        kind: "report",
        title: entry.title,
        subtitle: `${entry.severity} severity exported report`,
        preview: entry.summary,
        copyText: `${entry.title}\n\n${entry.summary}`,
        action: () => ctx.app.setScreen("hunt-report-history"),
      },
      entry.title,
      entry.summary,
      entry.severity,
      entry.investigationOrigin ?? "",
    )
  }

  for (const connector of ctx.state.thruntConnectors.connectors.slice(0, SEARCH_RESULT_LIMIT)) {
    push(
      {
        id: `connector:${connector.id}`,
        kind: "connector",
        title: connector.name,
        subtitle: connector.id,
        preview: `Auth: ${connector.auth_types.join(", ") || "none"}  Datasets: ${connector.supported_datasets.join(", ") || "unknown"}`,
        copyText: connector.id,
        action: () => ctx.app.setScreen("hunt-connectors"),
      },
      connector.name,
      connector.id,
      connector.auth_types.join(" "),
      connector.supported_datasets.join(" "),
      connector.supported_languages.join(" "),
    )
  }

  for (const pack of ctx.state.thruntPacks.packs.slice(0, SEARCH_RESULT_LIMIT)) {
    push(
      {
        id: `pack:${pack.id}`,
        kind: "pack",
        title: pack.title,
        subtitle: `${pack.kind} pack`,
        preview: `Pack ${pack.id} • connectors: ${pack.required_connectors.join(", ") || "none"} • datasets: ${pack.supported_datasets.join(", ") || "none"}`,
        copyText: pack.id,
        action: () => ctx.app.setScreen("hunt-packs"),
      },
      pack.title,
      pack.id,
      pack.kind,
      pack.required_connectors.join(" "),
      pack.supported_datasets.join(" "),
    )
  }

  for (const event of ctx.state.agentActivity.events.slice(0, SEARCH_RESULT_LIMIT)) {
    push(
      {
        id: `activity:${event.id}`,
        kind: "activity",
        title: event.title,
        subtitle: `${event.kind} • ${event.actor ?? "agent"}`,
        preview: event.body ?? "Recent agent activity from the external watch bridge.",
        copyText: [event.title, event.body].filter(Boolean).join("\n\n"),
        action: () => ctx.app.setScreen("hunt-watch"),
      },
      event.title,
      event.body ?? "",
      event.kind,
      event.actor ?? "",
    )
  }

  results.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }
    return left.result.title.localeCompare(right.result.title)
  })

  return results.slice(0, SEARCH_RESULT_LIMIT).map((entry) => entry.result)
}

function searchSelection(results: HomeSearchResult[], selected: number): HomeSearchResult | null {
  if (results.length === 0) {
    return null
  }

  return results[Math.min(selected, results.length - 1)] ?? null
}

async function activateSearchResult(result: HomeSearchResult | null, ctx: ScreenContext): Promise<boolean> {
  if (!result) {
    return false
  }

  if (result.copyText) {
    if (ctx.app.copyText) {
      await ctx.app.copyText(result.copyText, result.title)
    }
  }
  result.action?.(ctx)
  return true
}

function renderSearchResultsBox(ctx: ScreenContext, width: number): string[] {
  const results = buildSearchResults(ctx)
  const selection = Math.min(ctx.state.homeActionIndex, Math.max(0, results.length - 1))
  const selectedResult = searchSelection(results, selection)
  const body: string[] = []

  if (results.length === 0) {
    body.push(`${THEME.muted}No results yet.${THEME.reset}`)
    body.push(`${THEME.dim}Try searching for watch, report, identity, pack, connector, or phase.${THEME.reset}`)
  } else {
    for (const [index, result] of results.entries()) {
      const marker =
        index === selection
          ? `${THEME.accent}${THEME.bold}▸${THEME.reset}`
          : `${THEME.dim}•${THEME.reset}`
      const label = `${THEME.white}${result.title}${THEME.reset}`
      const subtitle = `${THEME.dim}${result.subtitle}${THEME.reset}`
      body.push(fitString(`${marker} ${label} ${subtitle}`, width - 4))
    }
  }

  body.push("")
  body.push(`${THEME.secondary}${THEME.bold}Preview${THEME.reset}`)
  if (selectedResult) {
    body.push(...selectedResult.preview.split(/\s+/).reduce<string[]>((lines, word) => {
      const current = lines.at(-1) ?? ""
      const next = current ? `${current} ${word}` : word
      if (next.length > width - 4) {
        lines.push(word)
      } else if (lines.length === 0) {
        lines.push(word)
      } else {
        lines[lines.length - 1] = next
      }
      return lines
    }, []))
    body.push("")
    body.push(
      `${THEME.white}Enter${THEME.reset} ${THEME.dim}${selectedResult.action ? "open" : "copy"}${THEME.reset}  ` +
        `${THEME.white}y${THEME.reset} ${THEME.dim}copy${THEME.reset}`,
    )
  } else {
    body.push(`${THEME.dim}Type to search copyable prompts, reports, findings, packs, and connectors.${THEME.reset}`)
  }

  body.push("")
  body.push(`${THEME.secondary}${THEME.bold}Agent Activity${THEME.reset}`)
  if (ctx.state.agentActivity.events.length === 0) {
    body.push(`${THEME.dim}No agent activity yet. External agents can post updates into .thrunt-god/ui/events.jsonl.${THEME.reset}`)
  } else {
    for (const event of ctx.state.agentActivity.events.slice(0, 3)) {
      body.push(fitString(`${THEME.dim}•${THEME.reset} ${THEME.white}${event.title}${THEME.reset} ${THEME.dim}${event.actor ?? event.kind}${THEME.reset}`, width - 4))
    }
  }

  return renderBox("Search Results", body, width, THEME, {
    style: "rounded",
    titleAlign: "left",
    padding: 1,
    borderColor: ctx.state.homeFocus === "prompt" ? THEME.secondary : THEME.dim,
  })
}

function renderAgentWatchBox(ctx: ScreenContext, width: number): string[] {
  const body: string[] = []
  const events = ctx.state.agentActivity.events.slice(0, 3)

  if (events.length === 0) {
    body.push(`${THEME.muted}No agent updates yet.${THEME.reset}`)
    body.push(`${THEME.dim}External agents can append status, search, and copy events into .thrunt-god/ui/events.jsonl.${THEME.reset}`)
  } else {
    for (const event of events) {
      body.push(`${THEME.secondary}${event.kind}${THEME.reset} ${THEME.white}${fitString(event.title, Math.max(12, width - 12))}${THEME.reset}`)
      if (event.body) {
        body.push(`  ${THEME.dim}${fitString(event.body, Math.max(12, width - 6))}${THEME.reset}`)
      }
    }
  }

  if (ctx.state.agentActivity.error) {
    body.push("")
    body.push(`${THEME.error}${ctx.state.agentActivity.error}${THEME.reset}`)
  }

  return renderBox("Agent Watch", body, width, THEME, {
    style: "rounded",
    titleAlign: "left",
    padding: 1,
  })
}

function renderStatusSubtitle(state: AppState): string {
  const ctx = state.thruntContext
  const parts: string[] = []

  if (ctx?.phase.number || ctx?.phase.name) {
    parts.push(`${THEME.secondary}Phase ${ctx.phase.number ?? "?"}${THEME.reset}${THEME.dim}: ${ctx.phase.name ?? "unknown"}${THEME.reset}`)
  }

  const investigationFindings = state.hunt.investigation.findings.length
  if (investigationFindings > 0) {
    parts.push(`${THEME.warning}${investigationFindings} finding${investigationFindings === 1 ? "" : "s"}${THEME.reset}`)
  }

  if (state.hunt.watch.running) {
    parts.push(`${THEME.success}watch live${THEME.reset}`)
  }

  parts.push(renderHealthStatus(state))
  return parts.join(`${THEME.dim}  ·  ${THEME.reset}`)
}

function renderMainContent(ctx: ScreenContext): string {
  const { state, width, height } = ctx
  const lines: string[] = []
  const inputWidth = Math.min(82, width - 10)
  const actionRows = renderHomeActionRows(ctx, inputWidth - 4)
  const subtitle = renderStatusSubtitle(state)
  const startY = Math.max(1, Math.floor((height - 26) / 4))
  const query = state.promptBuffer
  const selectedAgent = AGENTS[state.agentIndex]
  const agentEvents = state.agentActivity.events.slice(0, 3)

  for (let i = 0; i < startY; i++) {
    lines.push("")
  }

  lines.push(...centerBlock(LOGO.main.map((line) => `${THEME.accent}${line}${THEME.reset}`), width))
  lines.push(...centerBlock(getAnimatedGod(state.animationFrame), width))
  lines.push(centerLine(subtitle, width))
  lines.push("")

  const placeholder = 'Search hunts, packs, reports, connectors, prompts'
  const visibleQuery =
    query.length > inputWidth - 8
      ? `…${query.slice(-(inputWidth - 9))}`
      : query
  const cursor = `${THEME.secondary}▎${THEME.reset}`
  const inputBox = renderPromptBox(
    homeFocusTitle(state.homeFocus),
    [
      query
        ? `${THEME.white}${visibleQuery}${cursor}${THEME.reset}`
        : `${THEME.dim}${placeholder}${THEME.reset}`,
      "",
      `${THEME.accent}${selectedAgent.name}${THEME.reset}  ${THEME.dim}copy target${THEME.reset}  ${THEME.white}${selectedAgent.model}${THEME.reset}`,
    ],
    inputWidth,
    state,
  )
  lines.push(...centerBlock(inputBox, width))
  lines.push("")

  if (query.trim()) {
    lines.push(
      centerLine(
        `${THEME.bold}Enter${THEME.reset}${THEME.muted} open/copy${THEME.reset}  ` +
          `${THEME.bold}y${THEME.reset}${THEME.muted} copy${THEME.reset}  ` +
          `${THEME.bold}↑/↓${THEME.reset}${THEME.muted} select${THEME.reset}  ` +
          `${THEME.bold}Ctrl+N${THEME.reset}${THEME.muted} target${THEME.reset}`,
        width,
      ),
    )
    lines.push("")
    lines.push(...centerBlock(renderSearchResultsBox(ctx, inputWidth), width))
    lines.push("")
    lines.push(...centerBlock(renderAgentWatchBox(ctx, inputWidth), width))
  } else {
    lines.push(
      centerLine(
        `${THEME.bold}Tab${THEME.reset}${THEME.muted} quick actions${THEME.reset}  ` +
          `${THEME.bold}Ctrl+P${THEME.reset}${THEME.muted} commands${THEME.reset}  ` +
          `${THEME.bold}Ctrl+N${THEME.reset}${THEME.muted} target${THEME.reset}`,
        width,
      ),
    )
    lines.push("")
    lines.push(...centerBlock(actionRows.map((row) => `  ${row}`), width))
    lines.push("")
    lines.push(
      ...centerBlock(
        renderBox(
          agentEvents.length > 0 ? "Agent Activity" : "Quick Suggestions",
          (agentEvents.length > 0 ? agentEvents.map((event) => ({
            title: event.title,
            subtitle: event.kind,
          })) : SEARCH_SUGGESTIONS.slice(0, 3)).map((item) =>
            fitString(`${THEME.dim}•${THEME.reset} ${THEME.white}${item.title}${THEME.reset} ${THEME.dim}${item.subtitle}${THEME.reset}`, inputWidth - 4),
          ),
          inputWidth,
          THEME,
          { style: "rounded", titleAlign: "left", padding: 1 },
        ),
        width,
      ),
    )
    lines.push("")
    lines.push(
      ...centerBlock(
        renderBox(
          "Recent Agent Activity",
          ctx.state.agentActivity.events.length > 0
            ? ctx.state.agentActivity.events.slice(0, 4).map((event) =>
                fitString(`${THEME.dim}•${THEME.reset} ${THEME.white}${event.title}${THEME.reset} ${THEME.dim}${event.actor ?? event.kind}${THEME.reset}`, inputWidth - 4),
              )
            : [`${THEME.dim}No external agent activity yet.${THEME.reset}`],
          inputWidth,
          THEME,
          { style: "rounded", titleAlign: "left", padding: 1 },
        ),
        width,
      ),
    )
    lines.push("")
    lines.push(...centerBlock(renderAgentWatchBox(ctx, inputWidth), width))
  }

  if (state.statusMessage) {
    lines.push("")
    lines.push(centerLine(state.statusMessage, width))
  }

  while (lines.length < height - 1) {
    lines.push("")
  }

  return lines.join("\n")
}

function printableTextChunk(key: string): string | null {
  if (!key || key.includes("\x1b")) {
    return null
  }
  const text = [...key].filter((ch) => ch >= " " && ch !== "\x7f").join("")
  return text.length > 0 ? text : null
}

function handleCommandsInput(key: string, ctx: ScreenContext, commands: Command[]): boolean {
  const { state, app } = ctx

  if (key === "\x1b" || key === "\x1b\x1b" || key === "\x10") {
    state.inputMode = "main"
    app.render()
    return true
  }

  if (key === "\x1b[A" || key === "k") {
    state.commandIndex = Math.max(0, state.commandIndex - 1)
    app.render()
    return true
  }

  if (key === "\x1b[B" || key === "j") {
    state.commandIndex = Math.min(commands.length - 1, state.commandIndex + 1)
    app.render()
    return true
  }

  if (key === "\r") {
    const command = commands[state.commandIndex]
    state.inputMode = "main"
    command?.action()
    return true
  }

  const command = commands.find((candidate) => candidate.key.toLowerCase() === key.toLowerCase())
  if (command) {
    state.inputMode = "main"
    command.action()
    return true
  }

  return false
}

async function handleCopySelection(ctx: ScreenContext): Promise<boolean> {
  const result = searchSelection(buildSearchResults(ctx), ctx.state.homeActionIndex)
  if (!result?.copyText) {
    return false
  }

  if (ctx.app.copyText) {
    await ctx.app.copyText(result.copyText, result.title)
  }
  return true
}

function handleMainInput(key: string, ctx: ScreenContext): boolean {
  const { state, app } = ctx

  if (key === "\x13") {
    app.setScreen("security")
    return true
  }

  if (key === "\x0e") {
    state.agentIndex = (state.agentIndex + 1) % AGENTS.length
    app.render()
    return true
  }

  if (key === "\x10") {
    state.inputMode = "commands"
    state.commandIndex = 0
    app.render()
    return true
  }

  if (key === "\t") {
    setHomeFocus(state, cycleHomeFocus(state.homeFocus))
    app.render()
    return true
  }

  const hasSearchQuery = state.promptBuffer.trim().length > 0
  const isArrowKey = key === "\x1b[A" || key === "\x1b[B" || key === "\x1b[C" || key === "\x1b[D" || key === "up" || key === "down" || key === "left" || key === "right"

  if (hasSearchQuery && (key === "\x1b[A" || key === "up" || key === "\x1b[B" || key === "down")) {
    const results = buildSearchResults(ctx)
    if (results.length > 0) {
      const delta = key === "\x1b[A" || key === "up" ? -1 : 1
      state.homeActionIndex = Math.min(Math.max(0, state.homeActionIndex + delta), results.length - 1)
      app.render()
      return true
    }
  }

  if (!hasSearchQuery && (state.homeFocus === "actions" || state.homeFocus === "nav") && isArrowKey) {
    state.homeActionIndex = moveHomeActionSelection(state.homeActionIndex, key)
    app.render()
    return true
  }

  if (!hasSearchQuery && state.homeFocus === "nav") {
    const actionIndex = findHomeActionIndex(key)
    if (actionIndex >= 0) {
      return activateHomeAction(actionIndex, ctx)
    }
  }

  if (!hasSearchQuery && state.homeFocus === "prompt") {
    const actionIndex = HOME_ACTIONS.findIndex((action) => action.key === key.toUpperCase())
    if (actionIndex >= 0) {
      return activateHomeAction(actionIndex, ctx)
    }
  }

  if (key === "\r") {
    if (hasSearchQuery) {
      void activateSearchResult(searchSelection(buildSearchResults(ctx), state.homeActionIndex), ctx)
      return true
    }

    if (state.homeFocus !== "prompt") {
      return activateHomeAction(state.homeActionIndex, ctx)
    }

    return true
  }

  if ((key === "y" || key === "c") && hasSearchQuery) {
    void handleCopySelection(ctx)
    return true
  }

  if ((key === "\x7f" || key === "\b") && state.homeFocus === "prompt") {
    state.promptBuffer = state.promptBuffer.slice(0, -1)
    state.homeActionIndex = 0
    app.render()
    return true
  }

  if (key === "\x15" && state.homeFocus === "prompt") {
    state.promptBuffer = ""
    state.homeActionIndex = 0
    app.render()
    return true
  }

  if (key === "\x1b" || key === "\x1b\x1b") {
    if (state.promptBuffer.trim().length > 0 && state.homeFocus === "prompt") {
      state.promptBuffer = ""
      state.homeActionIndex = 0
    } else if (state.homeFocus === "actions") {
      setHomeFocus(state, "prompt")
    } else {
      setHomeFocus(state, state.homeFocus === "prompt" ? "nav" : "prompt")
    }
    app.render()
    return true
  }

  const printableChunk = state.homeFocus === "prompt" ? printableTextChunk(key) : null
  if (printableChunk) {
    state.promptBuffer += printableChunk
    state.homeActionIndex = 0
    app.render()
    return true
  }

  return false
}

function commandStageTag(command: Command): { text: string; plainLength: number } {
  if (command.stage === "experimental") {
    return {
      text: `${THEME.warning}exp${THEME.reset}`,
      plainLength: 3,
    }
  }

  return {
    text: `${THEME.success}core${THEME.reset}`,
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
    `${THEME.dim}Navigate:${THEME.reset} ${THEME.white}↑/↓${THEME.reset} select  ${THEME.white}Enter${THEME.reset} run  ${THEME.white}Esc${THEME.reset} close`,
    "",
  ]

  for (const [index, command] of commands.entries()) {
    const isSelected = index === state.commandIndex
    const stage = commandStageTag(command)
    const left = isSelected
      ? `${THEME.accent}${THEME.bold}▶${THEME.reset} ${THEME.white}${THEME.bold}${command.label}${THEME.reset} ${THEME.dim}${command.description}${THEME.reset}`
      : `${THEME.dim}•${THEME.reset} ${THEME.white}${command.label}${THEME.reset} ${THEME.dim}${command.description}${THEME.reset}`
    const right = `${stage.text} ${THEME.dim}${command.key}${THEME.reset}`
    paletteLines.push(joinColumns(left, right, contentWidth))
  }

  const palette = centerBlock(
    renderBox("Commands", paletteLines, paletteWidth, THEME, {
      style: "rounded",
      titleAlign: "left",
      padding: 1,
    }),
    width,
  )

  for (let i = 0; i < palette.length; i++) {
    const lineIndex = startY + i
    if (lineIndex < lines.length) {
      lines[lineIndex] = palette[i]
    }
  }

  return lines.join("\n")
}

export function createMainScreen(commands: Command[]): Screen {
  return {
    render(ctx: ScreenContext): string {
      let content = renderMainContent(ctx)
      if (ctx.state.inputMode === "commands") {
        content = overlayCommandPalette(content, ctx, commands)
      }
      return content
    },

    handleInput(key: string, ctx: ScreenContext): boolean {
      if (ctx.state.inputMode === "commands") {
        return handleCommandsInput(key, ctx, commands)
      }

      return handleMainInput(key, ctx)
    },
  }
}
