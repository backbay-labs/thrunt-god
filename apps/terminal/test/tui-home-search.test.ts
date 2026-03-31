import { describe, expect, test } from "bun:test"
import { createMainScreen } from "../src/tui/screens/main"
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
import { stripAnsi } from "../src/tui/components/types"

class TestApp implements AppController {
  public screen: InputMode | null = null
  public copied: { text: string; label?: string } | null = null

  setScreen(mode: InputMode): void {
    this.screen = mode
  }

  launchDispatchSheet(): void {}
  closeDispatchSheet(): void {}
  openRun(): void {}
  beginAttachRun(): void {}
  confirmAttachRun(): void {}
  cancelAttachRun(): void {}
  beginExternalRun(): void {}
  confirmExternalRun(): void {}
  cancelExternalRun(): void {}
  launchRunInMode(): void {}
  relaunchRunInMode(): void {}
  cancelRun(): void {}
  render(): void {}
  runHealthcheck(): void {}
  submitPrompt(): void {}
  runGates(): void {}
  showRuns(): void {}
  showHelp(): void {}
  quit(): void {}
  getCwd(): string {
    return process.cwd()
  }
  async copyText(text: string, label?: string): Promise<boolean> {
    this.copied = { text, label }
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

function createContext(state: AppState, app: AppController): ScreenContext {
  return {
    state,
    width: 120,
    height: 40,
    theme: THEME,
    app,
  }
}

describe("search-first main screen", () => {
  test("renders home search results and agent activity", () => {
    const app = new TestApp()
    const state = createState()
    state.promptBuffer = "oauth"
    state.homeSearch = {
      ...state.homeSearch,
      hydrated: true,
      results: [
        {
          id: "report-1",
          kind: "report",
          title: "Suspicious OAuth grants",
          subtitle: "report high",
          preview: "Broad delegated scopes were granted to a new app.",
          copyText: "Copy me",
          keywords: ["oauth"],
          target: { screen: "hunt-report-history", selectedIndex: 0 },
        },
      ],
    }
    state.agentActivity = {
      events: [
        {
          id: "evt-1",
          timestamp: "2026-03-31T12:00:00Z",
          kind: "status",
          title: "Running Elastic query",
          actor: "claude",
        },
      ],
      updatedAt: "2026-03-31T12:00:00Z",
      error: null,
    }

    const output = stripAnsi(createMainScreen([]).render(createContext(state, app)))

    expect(output).toContain("Search Results")
    expect(output).toContain("Suspicious OAuth grants")
    expect(output).toContain("Agent Activity")
    expect(output).toContain("Agent Watch")
    expect(output).toContain("Running Elastic query")
  })

  test("copies the selected home search result", async () => {
    const app = new TestApp()
    const state = createState()
    state.promptBuffer = "oauth"
    state.homeSearch = {
      ...state.homeSearch,
      hydrated: true,
      results: [
        {
          id: "report-1",
          kind: "report",
          title: "Suspicious OAuth grants",
          subtitle: "report high",
          preview: "Broad delegated scopes were granted to a new app.",
          copyText: "Copy me",
          keywords: ["oauth"],
          target: null,
        },
      ],
    }

    const screen = createMainScreen([])
    screen.handleInput("y", createContext(state, app))
    await Bun.sleep(0)

    expect(app.copied).toEqual({ text: "Copy me", label: "Suspicious OAuth grants" })
  })
})
