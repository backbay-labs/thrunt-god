import { describe, expect, test } from "bun:test"
import { stripAnsi } from "../src/tui/components/types"
import { huntQueryScreen } from "../src/tui/screens/hunt-query"
import { huntReportScreen } from "../src/tui/screens/hunt-report"
import { huntReportHistoryScreen } from "../src/tui/screens/hunt-report-history"
import { createMainScreen } from "../src/tui/screens/main"
import { getRecommendedSandboxIndex, getSetupSandboxOptions } from "../src/tui/screens/setup"
import { huntWatchScreen } from "../src/tui/screens/hunt-watch"
import type { AgentBridgeEvent } from "../src/tui/agent-bridge"
import type { ReportHistoryEntry } from "../src/tui/report-export"
import type { SearchResult } from "../src/tui/search"
import { THEME } from "../src/tui/theme"
import type { AppController, AppState, InputMode, ScreenContext } from "../src/tui/types"
import {
  createInitialAgentActivityState,
  createInitialDispatchSheetState,
  createInitialExternalExecutionSheetState,
  createInitialHuntState,
  createInitialHomeSearchState,
  createInitialInteractiveSessionState,
  createInitialRunListState,
  createInitialThruntConnectorsState,
  createInitialThruntDetectionsState,
  createInitialThruntEvidenceState,
  createInitialThruntExecutionState,
  createInitialThruntPacksState,
  createInitialThruntPhasesState,
} from "../src/tui/types"

class TestApp implements AppController {
  public screen: InputMode | null = null
  public copied: Array<{ text: string; label?: string }> = []
  public renderCount = 0

  constructor(private cwd = process.cwd()) {}

  setScreen(mode: InputMode): void {
    this.screen = mode
  }

  launchDispatchSheet(): void {}
  closeDispatchSheet(): void {}
  openRun(_runId: string): void {}
  beginAttachRun(_runId: string): void {}
  confirmAttachRun(): void {}
  cancelAttachRun(): void {}
  beginExternalRun(_runId: string): void {}
  confirmExternalRun(): void {}
  cancelExternalRun(): void {}
  launchRunInMode(_runId: string, _mode: "managed" | "attach" | "external"): void {}
  relaunchRunInMode(_runId: string, _mode: "attach" | "external"): void {}
  cancelRun(_runId: string): void {}
  render(): void {
    this.renderCount += 1
  }
  runHealthcheck(): void {}
  submitPrompt(_action: "dispatch" | "speculate"): void {}
  runGates(): void {}
  showRuns(): void {}
  showHelp(): void {}
  quit(): void {}
  getCwd(): string {
    return this.cwd
  }
  async copyText(text: string, label?: string): Promise<boolean> {
    this.copied.push({ text, label })
    return true
  }
}

function createState(): AppState {
  return {
    promptBuffer: "",
    agentIndex: 0,
    homeActionIndex: 0,
    homeFocus: "prompt",
    homePromptTraceStartFrame: 0,
    homeActionsTraceStartFrame: 0,
    inputMode: "main",
    commandIndex: 0,
    statusMessage: "",
    isRunning: false,
    activeRuns: 0,
    lastRefresh: new Date(),
    health: null,
    healthChecking: false,
    animationFrame: 0,
    runtimeInfo: null,
    dispatchSheet: createInitialDispatchSheetState(),
    externalSheet: createInitialExternalExecutionSheetState(),
    runs: createInitialRunListState(),
    interactiveSession: createInitialInteractiveSessionState(),
    activeRunId: null,
    pendingAttachRunId: null,
    attachedRunId: null,
    ptyHandoffActive: false,
    runDetailEvents: { offset: 0, selected: 0 },
    lastResult: null,
    setupDetection: null,
    setupStep: "detecting",
    setupSandboxIndex: 0,
    hunt: createInitialHuntState(),
    homeSearch: createInitialHomeSearchState(),
    agentActivity: createInitialAgentActivityState(),
    thruntContext: null,
    thruntPhases: createInitialThruntPhasesState(),
    thruntEvidence: createInitialThruntEvidenceState(),
    thruntDetections: createInitialThruntDetectionsState(),
    thruntPacks: createInitialThruntPacksState(),
    thruntConnectors: createInitialThruntConnectorsState(),
    thruntGateResults: null,
    thruntExecution: createInitialThruntExecutionState(),
  }
}

function createContext(
  state: AppState,
  app: AppController,
  width = 120,
  height = 40,
): ScreenContext {
  return {
    state,
    width,
    height,
    theme: THEME,
    app,
  }
}

function createAgentEvent(overrides: Partial<AgentBridgeEvent> = {}): AgentBridgeEvent {
  return {
    id: "evt-1",
    timestamp: "2026-03-31T12:00:00Z",
    kind: "status",
    title: "Running Elastic query",
    actor: "claude",
    ...overrides,
  }
}

function createSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: "result-1",
    kind: "suggestion",
    title: "Pasteable live watch brief",
    subtitle: "agent prompt",
    preview: "Summarize the current watch stream and propose the next pivots.",
    copyText: "Summarize the current watch stream and propose the next pivots.",
    keywords: ["watch", "brief"],
    target: null,
    ...overrides,
  }
}

function createHistoryEntry(overrides: Partial<ReportHistoryEntry> = {}): ReportHistoryEntry {
  return {
    version: 1,
    reportId: "report-1",
    title: "Suspicious OAuth grants",
    severity: "high",
    summary: "Broad delegated scopes were granted to a newly observed application.",
    reportCreatedAt: "2026-03-31T11:45:00Z",
    exportedAt: "2026-03-31T12:00:00Z",
    evidenceCount: 3,
    merkleRoot: "merkle-root-1",
    investigationOrigin: "query",
    jsonPath: ".thrunt-god/reports/report-1.json",
    markdownPath: ".thrunt-god/reports/report-1.md",
    trace: {
      eventSources: ["tetragon"],
      receiptIds: ["receipt-1"],
      auditEventIds: ["audit-1"],
      sessionIds: ["session-1"],
    },
    traceability: {
      exportAuditEventId: "export-audit-1",
      auditStatus: "not_configured",
    },
    ...overrides,
  }
}

describe("main screen", () => {
  test("opens supported surfaces from home hotkeys with an empty prompt", () => {
    const state = createState()
    const app = new TestApp()
    const screen = createMainScreen([])
    const ctx = createContext(state, app)

    expect(screen.handleInput("W", ctx)).toBe(true)
    expect(app.screen).toBe("hunt-watch")
    expect(state.promptBuffer).toBe("")
  })

  test("renders hydrated search results and supports select, copy, and open behavior", async () => {
    const state = createState()
    const app = new TestApp()
    const screen = createMainScreen([])

    state.promptBuffer = "oauth"
    state.homeSearch = {
      ...state.homeSearch,
      hydrated: true,
      results: [
        createSearchResult({
          id: "report-1",
          kind: "report",
          title: "Suspicious OAuth grants",
          subtitle: "report high",
          preview: "Broad delegated scopes were granted to a new app.",
          copyText: "Copy the OAuth report summary.",
          target: { screen: "hunt-report-history", selectedIndex: 0 },
        }),
        createSearchResult({
          id: "suggest-1",
          title: "Seed hunt query",
          subtitle: "starter query",
          preview: "Start a hunt focused on suspicious OAuth consent grants.",
          copyText: "Investigate suspicious oauth consent grants",
          keywords: ["oauth", "consent", "query"],
          target: {
            screen: "hunt-query",
            nlQuery: "suspicious oauth consent grants",
          },
        }),
      ],
    }
    state.agentActivity = {
      ...state.agentActivity,
      events: [createAgentEvent()],
      updatedAt: "2026-03-31T12:00:00Z",
    }

    const ctx = createContext(state, app)
    const output = stripAnsi(screen.render(ctx))

    expect(output).toContain("Search Results")
    expect(output).toContain("Suspicious OAuth grants")
    expect(output).toContain("Agent Activity")
    expect(output).toContain("Running Elastic query")

    expect(screen.handleInput("down", ctx)).toBe(true)
    expect(state.homeActionIndex).toBe(1)

    expect(screen.handleInput("y", ctx)).toBe(true)
    await Bun.sleep(0)
    expect(app.copied.at(-1)).toEqual({
      text: "Investigate suspicious oauth consent grants",
      label: "Seed hunt query",
    })

    expect(screen.handleInput("\r", ctx)).toBe(true)
    await Bun.sleep(0)
    expect(app.screen).toBe("hunt-query")
    expect(state.hunt.query.mode).toBe("nl")
    expect(state.hunt.query.nlInput).toBe("suspicious oauth consent grants")
  })
})

describe("setup screen", () => {
  test("maps sandbox selection without tmpdir", () => {
    const options = getSetupSandboxOptions(true)

    expect(options.map((option) => option.name)).toEqual(["inplace", "worktree"])
    expect(getRecommendedSandboxIndex("worktree", true)).toBe(1)
    expect(getRecommendedSandboxIndex("tmpdir" as never, true)).toBe(0)
  })
})

describe("supported hunt surfaces", () => {
  test("renders hunt report empty state", () => {
    const state = createState()
    const app = new TestApp()
    const output = stripAnsi(huntReportScreen.render(createContext(state, app)))

    expect(output).toContain("Evidence Report")
    expect(output).toContain("No report loaded.")
  })

  test("renders hunt watch with agent activity", () => {
    const state = createState()
    const app = new TestApp()

    state.hunt.watch.running = true
    state.hunt.watch.stats = {
      events_processed: 12,
      alerts_fired: 2,
      uptime_seconds: 45,
      active_rules: 6,
    }
    state.agentActivity = {
      ...state.agentActivity,
      events: [createAgentEvent()],
      updatedAt: "2026-03-31T12:00:00Z",
    }

    const output = stripAnsi(huntWatchScreen.render(createContext(state, app)))

    expect(output).toContain("Live Watch")
    expect(output).toContain("Agent Activity")
    expect(output).toContain("Running Elastic query")
  })

  test("renders hunt query and allows mode switching", () => {
    const state = createState()
    const app = new TestApp()
    const ctx = createContext(state, app)

    let output = stripAnsi(huntQueryScreen.render(ctx))
    expect(output).toContain("Hunt Query")
    expect(output).toContain("No Matches")

    expect(huntQueryScreen.handleInput("\t", ctx)).toBe(true)
    expect(state.hunt.query.mode).toBe("structured")

    output = stripAnsi(huntQueryScreen.render(ctx))
    expect(output).toContain("Filters")
  })

  test("renders hunt report history entries", () => {
    const state = createState()
    const app = new TestApp()

    state.hunt.reportHistory.entries = [createHistoryEntry()]

    const output = stripAnsi(huntReportHistoryScreen.render(createContext(state, app)))

    expect(output).toContain("Report History")
    expect(output).toContain("Export Bundles")
    expect(output).toContain("Suspicious OAuth grants")
    expect(output).toContain("Traceability")
  })
})
