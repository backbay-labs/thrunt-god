/**
 * TUI App - Interactive Terminal User Interface for THRUNT GOD
 *
 * Thin coordinator: lifecycle, input routing, screen registry.
 * All screen rendering/input is delegated to screen modules.
 */

import * as path from "node:path"
import { VERSION, init, shutdown, isInitialized } from "../index"
import { Telemetry } from "../telemetry"
import { Health } from "../health"
import { MCP } from "../mcp"
import { Config } from "../config"
import { ThruntPlanningWatcher } from "../thrunt-bridge"
import { listConnectors } from "../thrunt-bridge/connector"
import { analyzeHuntmap } from "../thrunt-bridge/huntmap"
import { listPacks } from "../thrunt-bridge/pack"
import { executeQueryStream } from "../thrunt-bridge/runtime"
import { Verifier } from "../verifier"
import { THEME, ESC, AGENTS } from "./theme"
import { renderStatusBar } from "./components/status-bar"
import { renderGateOverlay } from "./components/gate-overlay"
import { createLogState, appendLine } from "./components/streaming-log"
import { getInvestigationCounts, isInvestigationStale } from "./investigation"
import { readAgentBridgeEvents } from "./agent-bridge"
import { readReportHistory } from "./report-export"
import { buildSearchCatalog, rankSearchResults } from "./search"
import { getSurfaceMeta } from "./surfaces"
import type {
  Screen,
  ScreenContext,
  AppState,
  InputMode,
  SupportedInputMode,
  Command,
  AppController,
  DispatchResultInfo,
  RunRecord,
  InteractiveSurfaceFocus,
} from "./types"
import {
  createInitialDispatchSheetState,
  createInitialAgentActivityState,
  createInitialExternalExecutionSheetState,
  createInitialHuntState,
  createInitialHomeSearchState,
  createInitialInteractiveSessionState,
  createInitialRunListState,
  createInitialThruntPhasesState,
  createInitialThruntEvidenceState,
  createInitialThruntDetectionsState,
  createInitialThruntPacksState,
  createInitialThruntConnectorsState,
  createInitialThruntExecutionState,
  toSupportedInputMode,
  type RuntimeInfo,
} from "./types"
import {
  canRunAttach,
  createManagedRun,
  executeManagedRun,
  getRunAttachDisabledReason,
  getRunExternalDisabledReason,
  isRecoverableExternalFailure,
  isRunTerminal,
  supportsAttachToolchain,
  updateRunRecord,
  getFailureMessage,
} from "./runs"
import { createAttachRunSession } from "./pty"
import {
  createEmbeddedInteractiveSession,
  InteractiveTerminalBuffer,
  sanitizeInteractiveOutput,
  type EmbeddedInteractiveSessionPlan,
  type InteractivePtyRuntime,
} from "./pty-runtime"
import { getAvailableExternalAdapters, getExternalAdapter, toExternalAdapterOptions } from "./external/registry"
import { createExternalRunSession } from "./external/session"
import {
  createRecoverableExternalFailureRun,
  describeExternalExitCode,
  ExternalRunHeartbeatTimeoutError,
  ExternalLaunchStartupTimeoutError,
  ExternalRunSurfaceClosedError,
  isRecoverableExternalLaunchError,
} from "./external/state"
import type { ExternalRunSessionPlan, ExternalRunStatusPayload } from "./external/types"

// Screen imports
import { createMainScreen } from "./screens/main"
import { getRecommendedSandboxIndex, setupScreen } from "./screens/setup"
import { integrationsScreen } from "./screens/integrations"
import { securityScreen } from "./screens/security"
import { auditScreen } from "./screens/audit"
import { policyScreen } from "./screens/policy"

// Hunt screen imports
import { huntWatchScreen } from "./screens/hunt-watch"
import { huntScanScreen } from "./screens/hunt-scan"
import { huntTimelineScreen } from "./screens/hunt-timeline"
import { huntRuleBuilderScreen } from "./screens/hunt-rule-builder"
import { huntQueryScreen } from "./screens/hunt-query"
import { huntDiffScreen } from "./screens/hunt-diff"
import { huntReportScreen } from "./screens/hunt-report"
import { huntReportHistoryScreen } from "./screens/hunt-report-history"
import { huntMitreScreen } from "./screens/hunt-mitre"
import { huntPlaybookScreen } from "./screens/hunt-playbook"
import { huntPhasesScreen } from "./screens/hunt-phases"
import { huntEvidenceScreen } from "./screens/hunt-evidence"
import { huntDetectionsScreen } from "./screens/hunt-detections"
import { huntConnectorsScreen } from "./screens/hunt-connectors"
import { huntPacksScreen } from "./screens/hunt-packs"

const INTERACTIVE_ACTIVITY_LIMIT = 8

function stripInteractiveControlSequences(rawChunk: string): string {
  return rawChunk
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, " ")
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, " ")
    .replace(/\x1b[@-_]/g, " ")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
}

function extractInteractiveActivityLines(rawChunk: string): string[] {
  return stripInteractiveControlSequences(rawChunk)
    .replace(/\u00a0/g, " ")
    .split(/[\r\n]+/)
    .map((line) => line.replace(/\b\d+[A-Z]\b/g, "").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 4)
    .filter((line) => /[\p{L}\p{N}]/u.test(line))
    .filter((line) => !/^(hi|ok|yes|no)$/iu.test(line))
    .filter((line) => !line.includes("~/"))
    .filter((line) => !/^\d+[A-Z]/.test(line))
}

function mergeInteractiveActivityLines(existing: string[], incoming: string[]): string[] {
  const merged = [...existing]
  for (const line of incoming) {
    if (merged.at(-1) === line) {
      continue
    }
    const priorIndex = merged.indexOf(line)
    if (priorIndex >= 0) {
      merged.splice(priorIndex, 1)
    }
    merged.push(line)
  }
  return merged.slice(-INTERACTIVE_ACTIVITY_LIMIT)
}

function createInitialExternalState() {
  return {
    kind: "none",
    adapterId: null,
    ref: null,
    status: "idle" as const,
    error: null,
  }
}

// =============================================================================
// TUI APP
// =============================================================================

function resolveRuntimeInfo(): RuntimeInfo {
  const scriptPath = process.env.THRUNT_TUI_RUNTIME_SCRIPT ?? Bun.main ?? process.argv[1] ?? null
  const envSource = process.env.THRUNT_TUI_RUNTIME_SOURCE

  if (
    envSource === "override" ||
    envSource === "installed-bundle" ||
    envSource === "embedded-bundle" ||
    envSource === "repo-source" ||
    envSource === "direct"
  ) {
    return {
      source: envSource,
      scriptPath,
      bunVersion: Bun.version ?? null,
    }
  }

  if (scriptPath?.includes("/apps/terminal/src/cli/index.ts")) {
    return { source: "repo-source", scriptPath, bunVersion: Bun.version ?? null }
  }

  return { source: "direct", scriptPath, bunVersion: Bun.version ?? null }
}

export class TUIApp implements AppController {
  private state: AppState
  private refreshTimer: ReturnType<typeof setInterval> | null = null
  private animationTimer: ReturnType<typeof setInterval> | null = null
  private thruntWatcher: ThruntPlanningWatcher | null = null
  private width: number = 80
  private height: number = 24
  private cwd: string
  private homeDataRefreshInFlight = false
  private lastHomeDataRefreshAt = 0
  private agentActivityRefreshInFlight = false
  private lastAgentActivityRefreshAt = 0
  private canceledRunIds = new Set<string>()
  private attachedSession: { exited: Promise<number>; terminate: () => void } | null = null
  private interactiveRuntime: InteractivePtyRuntime | null = null
  private interactiveRuntimeCleanup: (() => Promise<void>) | null = null
  private interactiveRuntimeRunId: string | null = null
  private interactiveRuntimeStartedAt = 0
  private interactiveRuntimeCancelRequested = false
  private interactiveTranscriptBuffer: InteractiveTerminalBuffer | null = null
  private externalSessionCleanup = new Map<string, () => Promise<void>>()
  private exitPromise: Promise<void>
  private resolveExitPromise: (() => void) | null = null
  private exitSignaled = false
  private readonly inputListener = (key: string) => this.handleInput(key)
  private readonly resizeListener = () => {
    this.updateTerminalSize()
    if (!this.state.ptyHandoffActive) {
      this.render()
    }
  }

  private commands: Command[]
  private screens: Map<SupportedInputMode, Screen>

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd
    this.exitPromise = new Promise((resolve) => {
      this.resolveExitPromise = resolve
    })
    this.state = {
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
      runtimeInfo: resolveRuntimeInfo(),
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

    // Build commands list (including hunt commands)
    this.commands = [
      { key: "g", label: "gates", description: "run quality gates", stage: "supported", action: () => this.runGates() },
      { key: "W", label: "watch", description: "live hunt stream", stage: "supported", action: () => this.setScreen("hunt-watch") },
      { key: "T", label: "timeline", description: "timeline replay", stage: "supported", action: () => this.setScreen("hunt-timeline") },
      { key: "Q", label: "query", description: "hunt query REPL", stage: "supported", action: () => this.setScreen("hunt-query") },
      { key: "E", label: "evidence", description: "evidence report", stage: "supported", action: () => this.setScreen("hunt-report") },
      { key: "H", label: "history", description: "exported report index", stage: "supported", action: () => this.setScreen("hunt-report-history") },
      { key: "C", label: "connectors", description: "connector status", stage: "supported", action: () => this.setScreen("hunt-connectors") },
      { key: "K", label: "packs", description: "hunt packs", stage: "supported", action: () => this.setScreen("hunt-packs") },
      { key: "R", label: "rules", description: "correlation rule builder", stage: "experimental", action: () => this.setScreen("hunt-rule-builder") },
      { key: "D", label: "diff", description: "scan change detection", stage: "experimental", action: () => this.setScreen("hunt-diff") },
      { key: "M", label: "mitre", description: "MITRE ATT&CK heatmap", stage: "experimental", action: () => this.setScreen("hunt-mitre") },
      { key: "P", label: "playbook", description: "playbook runner", stage: "experimental", action: () => this.setScreen("hunt-playbook") },
      { key: "i", label: "integrations", description: "system status", stage: "supported", action: () => this.setScreen("integrations") },
      { key: "?", label: "help", description: "keyboard shortcuts", stage: "supported", action: () => this.showHelp() },
      { key: "q", label: "quit", description: "exit thrunt-god", stage: "supported", action: () => this.quit() },
    ]

    // Build screen registry
    const mainScreen = createMainScreen(this.commands)
    this.screens = new Map<SupportedInputMode, Screen>([
      ["main", mainScreen],
      ["commands", mainScreen], // commands overlay shares the main screen
      ["setup", setupScreen],
      ["integrations", integrationsScreen],
      ["security", securityScreen],
      ["audit", auditScreen],
      ["policy", policyScreen],
      ["hunt-watch", huntWatchScreen],
      ["hunt-scan", huntScanScreen],
      ["hunt-timeline", huntTimelineScreen],
      ["hunt-rule-builder", huntRuleBuilderScreen],
      ["hunt-query", huntQueryScreen],
      ["hunt-diff", huntDiffScreen],
      ["hunt-report", huntReportScreen],
      ["hunt-report-history", huntReportHistoryScreen],
      ["hunt-mitre", huntMitreScreen],
      ["hunt-playbook", huntPlaybookScreen],
      ["hunt-phases", huntPhasesScreen],
      ["hunt-evidence", huntEvidenceScreen],
      ["hunt-detections", huntDetectionsScreen],
      ["hunt-connectors", huntConnectorsScreen],
      ["hunt-packs", huntPacksScreen],
    ])
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  async start(): Promise<void> {
    if (!isInitialized()) {
      await init({
        telemetryDir: `${this.cwd}/.thrunt-god/runs`,
      })
    }

    this.updateTerminalSize()
    this.setupInput()

    process.stdout.write(ESC.altScreen + ESC.hideCursor)

    await this.checkFirstRun()

    this.animationTimer = setInterval(() => {
      this.state.animationFrame++
      if (this.state.inputMode === "main" || this.state.inputMode === "setup") {
        this.render()
      }
    }, 80)

    if (this.state.inputMode === "setup") {
      this.render()
      return
    }

    this.startBackgroundServices()
    await this.refresh()
    this.render()
  }

  async run(): Promise<void> {
    await this.start()
    await this.exitPromise
  }

  private startBackgroundServices(): void {
    this.startMcpServer()
    this.runHealthcheck()
    this.refreshTimer = setInterval(() => this.refresh(), 2000)
    void this.refreshHomeData(true)
    void this.refreshAgentActivity(true)

    // Start .planning/ watcher for THRUNT bridge
    this.thruntWatcher = new ThruntPlanningWatcher(
      path.join(this.cwd, ".planning"),
      (ctx) => {
        this.state.thruntContext = ctx
        this.render()
      },
    )
    this.thruntWatcher.start()
  }

  private async startMcpServer(): Promise<void> {
    try {
      await MCP.start({ cwd: this.cwd, projectId: "default" })
      this.render()
    } catch {
      // MCP server failed to start - not critical
    }
  }

  private async refreshHomeData(force = false): Promise<void> {
    const now = Date.now()
    if (this.homeDataRefreshInFlight) {
      return
    }
    if (!force && now - this.lastHomeDataRefreshAt < 15_000) {
      return
    }

    this.homeDataRefreshInFlight = true
    this.lastHomeDataRefreshAt = now
    this.state.homeSearch = {
      ...this.state.homeSearch,
      loading: true,
      error: null,
    }
    try {
      const [reportHistoryEntries, connectors, packs, phases] = await Promise.all([
        readReportHistory(this.cwd).catch(() => this.state.hunt.reportHistory.entries),
        listConnectors().catch(() => this.state.thruntConnectors.connectors),
        listPacks().catch(() => this.state.thruntPacks.packs),
        analyzeHuntmap().catch(() => this.state.thruntPhases.analysis),
      ])

      this.state.hunt.reportHistory.entries = reportHistoryEntries
      this.state.thruntConnectors.connectors = connectors
      this.state.thruntPacks.packs = packs
      this.state.thruntPhases.analysis = phases
      this.recomputeHomeSearchResults()
      this.state.homeSearch = {
        ...this.state.homeSearch,
        hydrated: true,
        loading: false,
        error: null,
      }
    } catch (error) {
      this.state.homeSearch = {
        ...this.state.homeSearch,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }
    } finally {
      this.homeDataRefreshInFlight = false
    }
  }

  private async refreshAgentActivity(force = false): Promise<void> {
    const now = Date.now()
    if (this.agentActivityRefreshInFlight) {
      return
    }
    if (!force && now - this.lastAgentActivityRefreshAt < 2_000) {
      return
    }

    this.agentActivityRefreshInFlight = true
    this.lastAgentActivityRefreshAt = now
    try {
      const events = await readAgentBridgeEvents(this.cwd, 12)
      this.state.agentActivity = {
        events,
        updatedAt: events[0]?.timestamp ?? this.state.agentActivity.updatedAt,
        error: null,
      }
      this.recomputeHomeSearchResults()
    } catch (error) {
      this.state.agentActivity = {
        ...this.state.agentActivity,
        error: error instanceof Error ? error.message : String(error),
      }
    } finally {
      this.agentActivityRefreshInFlight = false
    }
  }

  runHealthcheck(): void {
    this.state.healthChecking = true
    this.render()

    Health.checkAll({ timeout: 2000 })
      .then((health) => {
        this.state.health = health
      })
      .catch(() => {
        // Healthcheck failed
      })
      .finally(() => {
        this.state.healthChecking = false
        this.render()
      })
  }

  private async checkFirstRun(): Promise<void> {
    if (await Config.exists(this.cwd)) return

    this.state.inputMode = "setup"
    this.state.setupStep = "detecting"
    this.render()

    const detection = await Config.detect(this.cwd)
    this.state.setupDetection = detection
    this.state.setupStep = "review"
    this.state.setupSandboxIndex = getRecommendedSandboxIndex(
      detection.recommended_sandbox,
      detection.git_available,
    )
    this.render()
  }

  private async cleanup(): Promise<void> {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
      this.refreshTimer = null
    }

    if (this.animationTimer) {
      clearInterval(this.animationTimer)
      this.animationTimer = null
    }

    this.thruntWatcher?.stop()
    this.thruntWatcher = null

    if (this._activeQueryHandle) {
      this._activeQueryHandle.kill()
      this._activeQueryHandle = null
    }

    try {
      await MCP.stop()
    } catch {
      // Ignore MCP shutdown errors
    }

    this.detachTerminalListeners()
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }
    process.stdin.pause()
    this.attachedSession?.terminate()
    this.attachedSession = null
    this.interactiveRuntime?.kill()
    this.interactiveRuntime = null
    await this.interactiveRuntimeCleanup?.().catch(() => {})
    this.interactiveRuntimeCleanup = null
    this.interactiveRuntimeRunId = null
    this.interactiveRuntimeStartedAt = 0
    this.interactiveRuntimeCancelRequested = false
    this.interactiveTranscriptBuffer = null
    this.resetInteractiveSessionState()
    await Promise.allSettled(
      [...this.externalSessionCleanup.values()].map(async (cleanup) => cleanup()),
    )
    this.externalSessionCleanup.clear()
    this.state.attachedRunId = null
    this.state.pendingAttachRunId = null
    this.state.externalSheet = createInitialExternalExecutionSheetState()
    this.state.ptyHandoffActive = false

    process.stdout.write(ESC.showCursor + ESC.mainScreen)

    if (isInitialized()) {
      await shutdown()
    }
  }

  private signalExit(): void {
    if (this.exitSignaled) {
      return
    }

    this.exitSignaled = true
    this.resolveExitPromise?.()
  }

  private updateTerminalSize(): void {
    this.width = process.stdout.columns || 80
    this.height = process.stdout.rows || 24
    if (this.interactiveRuntime) {
      this.syncInteractiveViewport()
    }
  }

  private setupInput(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()
    process.stdin.setEncoding("utf8")
    this.attachTerminalListeners()
  }

  private attachTerminalListeners(): void {
    process.stdin.off("data", this.inputListener)
    process.stdout.off("resize", this.resizeListener)
    process.stdin.on("data", this.inputListener)
    process.stdout.on("resize", this.resizeListener)
  }

  private detachTerminalListeners(): void {
    process.stdin.off("data", this.inputListener)
    process.stdout.off("resize", this.resizeListener)
  }

  // ===========================================================================
  // INPUT HANDLING
  // ===========================================================================

  private handleInput(key: string): void {
    if (this.state.ptyHandoffActive) {
      return
    }

    // Ctrl+C always quits
    if (key === "\x03") {
      this.quit()
      return
    }

    // Gate overlay toggle (Shift+G from main screen when gate results exist)
    if (key === "G" && this.state.inputMode === "main" && this.state.thruntGateResults) {
      this._showGateOverlay = !this._showGateOverlay
      this.render()
      return
    }
    if (key === "\x1b" && this._showGateOverlay) {
      this._showGateOverlay = false
      this.render()
      return
    }

    const screen = this.screens.get(this.getRenderableInputMode(this.state.inputMode))
    if (screen) {
      const ctx = this.createContext()
      screen.handleInput(key, ctx)
    }
  }

  // ===========================================================================
  // RENDERING
  // ===========================================================================

  render(): void {
    let output = ESC.moveTo(1, 1)

    this.recomputeHomeSearchResults()

    const ctx = this.createContext()
    const screen = this.screens.get(this.getRenderableInputMode(this.state.inputMode))
    let screenContent = screen ? screen.render(ctx) : ""

    // Gate overlay (centered, replaces screen rows)
    if (this._showGateOverlay && this.state.thruntGateResults) {
      const overlayLines = renderGateOverlay(this.state.thruntGateResults, this.width, THEME)
      const startRow = Math.max(0, Math.floor((this.height - overlayLines.length) / 2))
      const screenLines = screenContent.split("\n")
      for (let i = 0; i < overlayLines.length && (startRow + i) < screenLines.length; i++) {
        screenLines[startRow + i] = overlayLines[i]
      }
      screenContent = screenLines.join("\n")
    }

    // Apply background + status bar
    const clearToEol = "\x1b[K"
    const lines = screenContent.split("\n")

    // Inject status bar at the end if the screen doesn't have one
    // (Hunt screens manage their own, existing screens had it in renderStatusBar)
    const statusBar = this.buildStatusBar()

    const paddedLines = lines.map((line) => {
      return THEME.bg + line + clearToEol
    })

    // Add status bar as the last line
    if (paddedLines.length < this.height) {
      // Pad to fill screen minus the single status bar row
      while (paddedLines.length < this.height - 1) {
        paddedLines.push(THEME.bg + clearToEol)
      }
      paddedLines.push(THEME.bg + statusBar + clearToEol)
    }

    output += paddedLines.join("\n")
    output += THEME.bg + ESC.clearToEndOfScreen
    process.stdout.write(output)
  }

  private buildStatusBar(): string {
    const surface = getSurfaceMeta(this.state.inputMode)
    const investigation = this.state.hunt.investigation
    const investigationCounts = getInvestigationCounts(investigation)

    return renderStatusBar(
      {
        version: VERSION,
        cwd: this.cwd,
        currentScreenLabel: surface.label,
        currentScreenStage: surface.stage,
        healthChecking: this.state.healthChecking,
        health: this.state.health,
        activeRuns: this.state.activeRuns,
        agentId: AGENTS[this.state.agentIndex].id,
        investigation:
          investigation.origin || investigationCounts.events > 0 || investigationCounts.findings > 0
            ? {
                origin: investigation.origin ?? "manual",
                events: investigationCounts.events,
                findings: investigationCounts.findings,
                stale: isInvestigationStale(investigation),
              }
            : null,
        huntWatch: this.state.hunt.watch.running ? {
          events: this.state.hunt.watch.stats?.events_processed ?? 0,
          alerts: this.state.hunt.watch.stats?.alerts_fired ?? 0,
        } : null,
        huntScan: this.state.hunt.scan.loading ? { status: "scanning" } : null,
        lastExportedReport: this.state.hunt.reportHistory.entries[0]
          ? {
              title: this.state.hunt.reportHistory.entries[0].title,
              severity: this.state.hunt.reportHistory.entries[0].severity,
            }
          : null,
        thruntPhase: this.state.thruntContext ? {
          number: this.state.thruntContext.phase.number ?? "?",
          plan: `${this.state.thruntContext.plan.current ?? "?"}/${this.state.thruntContext.plan.total ?? "?"}`,
          progress: this.state.thruntContext.progressPercent ?? 0,
        } : null,
        gateResults: this.state.thruntGateResults ? {
          passed: this.state.thruntGateResults.results.filter(r => r.passed).length,
          failed: this.state.thruntGateResults.results.filter(r => !r.passed).length,
          score: this.state.thruntGateResults.score,
        } : null,
      },
      this.width,
      THEME,
    )
  }

  private createContext(): ScreenContext {
    return {
      state: this.state,
      width: this.width,
      height: this.height - 1, // Reserve 1 line for the shared status bar
      theme: THEME,
      app: this,
    }
  }

  private getRenderableInputMode(mode: InputMode): SupportedInputMode {
    return toSupportedInputMode(mode)
  }

  private recomputeHomeSearchResults(): void {
    const catalog = buildSearchCatalog({
      historyEntries: this.state.hunt.reportHistory.entries,
      investigation: this.state.hunt.investigation,
      phases: this.state.thruntPhases.analysis,
      packs: this.state.thruntPacks.packs,
      connectors: this.state.thruntConnectors.connectors,
    })
    const ranked = rankSearchResults(this.state.promptBuffer, catalog, 8)
    this.state.homeSearch.results = ranked.map(({ score: _score, ...result }) => result)
    if (this.state.homeSearch.selectedIndex >= this.state.homeSearch.results.length) {
      this.state.homeSearch.selectedIndex = Math.max(0, this.state.homeSearch.results.length - 1)
    }
  }

  // ===========================================================================
  // APP CONTROLLER INTERFACE
  // ===========================================================================

  setScreen(mode: InputMode): void {
    const oldScreen = this.screens.get(this.getRenderableInputMode(this.state.inputMode))
    const ctx = this.createContext()

    if (oldScreen?.onExit) {
      oldScreen.onExit(ctx)
    }

    this.state.inputMode = mode
    if (mode === "main") {
      this.state.homeFocus = "prompt"
      this.state.homePromptTraceStartFrame = this.state.animationFrame
    } else if (mode === "interactive-run") {
      this.syncInteractiveViewport()
    }

    const newScreen = this.screens.get(this.getRenderableInputMode(mode))
    if (newScreen?.onEnter) {
      newScreen.onEnter(ctx)
    }

    this.render()
  }

  launchDispatchSheet(): void {
    if (!this.state.dispatchSheet.open) {
      return
    }

    const { prompt, action, agentIndex, mode } = this.state.dispatchSheet
    if ((mode === "attach" || mode === "external") && action !== "dispatch") {
      this.state.dispatchSheet = {
        ...this.state.dispatchSheet,
        error: `${mode} mode is only available for dispatch runs.`,
      }
      this.render()
      return
    }

    const agent = AGENTS[agentIndex]
    if ((mode === "attach" || mode === "external") && !supportsAttachToolchain(agent.id)) {
      this.state.dispatchSheet = {
        ...this.state.dispatchSheet,
        error: `${agent.name} does not expose an interactive ${mode} session yet.`,
      }
      this.render()
      return
    }

    // Detect query execution: if prompt starts with "query:" extract connector and query
    const queryMatch = prompt.match(/^query:\s*(\S+)\s+(.+)$/i)
    if (queryMatch) {
      const [, connector, queryText] = queryMatch
      this.state.dispatchSheet = createInitialDispatchSheetState()
      this.state.promptBuffer = ""
      this.executeThruntQuery(connector, queryText)
      return
    }

    if (mode === "external") {
      void this.launchExternalDispatchSheet(prompt, action, agentIndex, agent.name, agent.id)
      return
    }

    const run = createManagedRun({
      prompt,
      action,
      agentId: agent.id,
      agentLabel: agent.name,
      mode,
    })

    this.state.agentIndex = agentIndex
    this.state.dispatchSheet = createInitialDispatchSheetState()
    this.state.promptBuffer = ""
    this.replaceRun(run)
    this.state.statusMessage =
      mode === "attach"
        ? `${THEME.accent}⠋${THEME.reset} Attach run staged via ${agent.name}`
        : `${THEME.accent}⠋${THEME.reset} ${action === "dispatch" ? "Managed run launched" : "Managed speculation launched"} via ${agent.name}`
    this.syncManagedRunState()
    this.openRun(run.id)

    if (mode === "attach") {
      this.beginAttachRun(run.id)
      return
    }

    void this.launchManagedRun(run)
  }

  private async launchExternalDispatchSheet(
    prompt: string,
    action: "dispatch" | "speculate",
    agentIndex: number,
    agentLabel: string,
    agentId: string,
  ): Promise<void> {
    this.state.dispatchSheet = {
      ...this.state.dispatchSheet,
      error: null,
    }
    this.state.statusMessage = `${THEME.accent}⠋${THEME.reset} Checking external terminal adapters`
    this.render()

    try {
      const adapters = await getAvailableExternalAdapters()
      if (adapters.length === 0) {
        this.state.dispatchSheet = {
          ...this.state.dispatchSheet,
          error: "No supported external terminal adapters are available on this machine.",
        }
        this.state.statusMessage = `${THEME.warning}!${THEME.reset} No supported external adapters are available`
        this.render()
        return
      }

      const run = createManagedRun({
        prompt,
        action,
        agentId,
        agentLabel,
        mode: "external",
      })

      this.state.agentIndex = agentIndex
      this.state.dispatchSheet = createInitialDispatchSheetState()
      this.state.promptBuffer = ""
      this.replaceRun(run)
      this.state.statusMessage = `${THEME.accent}⠋${THEME.reset} External run staged via ${agentLabel}`
      this.syncManagedRunState()
      this.openRun(run.id)
      this.state.externalSheet = {
        runId: run.id,
        adapters: toExternalAdapterOptions(adapters),
        selectedIndex: 0,
        loading: false,
        error: null,
      }
      this.render()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.state.dispatchSheet = {
        ...this.state.dispatchSheet,
        error: message,
      }
      this.state.statusMessage = `${THEME.error}✗${THEME.reset} External adapter probe failed`
      this.render()
    }
  }

  closeDispatchSheet(): void {
    this.state.dispatchSheet = createInitialDispatchSheetState()
    this.state.inputMode = "main"
    this.state.homeFocus = "prompt"
    this.state.homePromptTraceStartFrame = this.state.animationFrame
    this.render()
  }

  openRun(runId: string): void {
    const run = this.state.runs.entries.find((entry) => entry.id === runId)
    if (!run) {
      return
    }

    this.state.activeRunId = runId
    this.state.runs.selectedRunId = runId
    const lastEventIndex = Math.max(0, run.events.length - 1)
    this.state.runDetailEvents = { offset: Math.max(0, lastEventIndex - 5), selected: lastEventIndex }
    this.setScreen("run-detail")
  }

  beginAttachRun(runId: string): void {
    const run = this.state.runs.entries.find((entry) => entry.id === runId)
    if (!run) {
      return
    }

    const reason = getRunAttachDisabledReason(run)
    if (reason) {
      this.state.statusMessage = `${THEME.warning}!${THEME.reset} ${reason}`
      this.render()
      return
    }

    this.state.pendingAttachRunId = runId
    this.render()
  }

  confirmAttachRun(): void {
    const runId = this.state.pendingAttachRunId
    if (!runId) {
      return
    }

    const run = this.state.runs.entries.find((entry) => entry.id === runId)
    if (!run || !canRunAttach(run)) {
      this.cancelAttachRun()
      return
    }

    this.state.pendingAttachRunId = null
    if (this.shouldUseEmbeddedInteractive(run)) {
      void this.launchEmbeddedInteractiveRun(run.id)
      return
    }

    void this.launchAttachRun(run.id)
  }

  cancelAttachRun(): void {
    this.state.pendingAttachRunId = null
    this.render()
  }

  beginExternalRun(runId: string): void {
    void this.beginExternalRunFlow(runId)
  }

  confirmExternalRun(): void {
    const runId = this.state.externalSheet.runId
    if (!runId || this.state.externalSheet.loading) {
      return
    }

    const adapter = this.state.externalSheet.adapters[this.state.externalSheet.selectedIndex]
    if (!adapter) {
      this.state.externalSheet = {
        ...this.state.externalSheet,
        error: this.state.externalSheet.error ?? "Select an external adapter first.",
      }
      this.render()
      return
    }

    this.state.externalSheet = createInitialExternalExecutionSheetState()
    void this.launchExternalRun(runId, adapter.id)
  }

  cancelExternalRun(): void {
    this.state.externalSheet = createInitialExternalExecutionSheetState()
    this.render()
  }

  private async beginExternalRunFlow(runId: string): Promise<void> {
    const run = this.state.runs.entries.find((entry) => entry.id === runId)
    if (!run) {
      return
    }

    const currentAdapter = run.external.adapterId ? getExternalAdapter(run.external.adapterId) : null
    if (run.external.status === "running" && run.external.ref && currentAdapter?.focus) {
      try {
        await currentAdapter.focus(run.external.ref)
        this.state.statusMessage = `${THEME.success}✓${THEME.reset} Reopened ${run.agentLabel} in ${currentAdapter.label}`
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.state.statusMessage = `${THEME.error}✗${THEME.reset} ${message}`
      }
      this.render()
      return
    }
    if (run.external.status === "running") {
      this.state.statusMessage = `${THEME.warning}!${THEME.reset} ${currentAdapter?.label ?? "This external adapter"} does not support reopen from the TUI yet.`
      this.render()
      return
    }

    const reason = getRunExternalDisabledReason(run)
    if (reason) {
      this.state.statusMessage = `${THEME.warning}!${THEME.reset} ${reason}`
      this.render()
      return
    }

    this.state.externalSheet = {
      runId,
      adapters: [],
      selectedIndex: 0,
      loading: true,
      error: null,
    }
    this.render()

    try {
      const adapters = await getAvailableExternalAdapters()
      if (this.state.externalSheet.runId !== runId) {
        return
      }

      if (adapters.length === 0) {
        this.state.externalSheet = {
          runId,
          adapters: [],
          selectedIndex: 0,
          loading: false,
          error: "No supported external terminal adapters are available on this machine.",
        }
        this.render()
        return
      }

      this.state.externalSheet = {
        runId,
        adapters: toExternalAdapterOptions(adapters),
        selectedIndex: 0,
        loading: false,
        error: null,
      }
      this.render()
    } catch (error) {
      if (this.state.externalSheet.runId !== runId) {
        return
      }

      const message = error instanceof Error ? error.message : String(error)
      this.state.externalSheet = {
        runId,
        adapters: [],
        selectedIndex: 0,
        loading: false,
        error: message,
      }
      this.render()
    }
  }

  launchRunInMode(runId: string, mode: "managed" | "attach" | "external"): void {
    const run = this.state.runs.entries.find((entry) => entry.id === runId)
    if (!run || (isRunTerminal(run.phase) && !isRecoverableExternalFailure(run))) {
      return
    }

    if ((mode === "attach" || mode === "external") && !supportsAttachToolchain(run.agentId)) {
      this.state.statusMessage = `${THEME.warning}!${THEME.reset} ${run.agentLabel} does not expose an interactive ${mode} session yet.`
      this.render()
      return
    }

    const nextRun = updateRunRecord(run, {
      mode,
      phase: "launching",
      routing: null,
      workcellId: null,
      worktreePath: null,
      ptySessionId: null,
      execution: null,
      verification: null,
      result: null,
      completedAt: null,
      attached: false,
      canAttach: mode === "attach",
      attachState: "detached",
      external: {
        ...createInitialExternalState(),
      },
      error: null,
    })
    this.replaceRun(nextRun)
    this.state.externalSheet = createInitialExternalExecutionSheetState()
    this.state.statusMessage =
      mode === "attach"
        ? `${THEME.accent}⠋${THEME.reset} Attach fallback staged`
        : mode === "external"
          ? `${THEME.accent}⠋${THEME.reset} External fallback staged`
        : `${THEME.accent}⠋${THEME.reset} Managed fallback staged`
    this.render()

    if (mode === "attach") {
      this.beginAttachRun(runId)
      return
    }

    if (mode === "external") {
      void this.beginExternalRunFlow(runId)
      return
    }

    void this.launchManagedRun(nextRun)
  }

  relaunchRunInMode(runId: string, mode: "attach" | "external"): void {
    const run = this.state.runs.entries.find((entry) => entry.id === runId)
    if (!run || run.action !== "dispatch" || !isRunTerminal(run.phase)) {
      return
    }

    if (!supportsAttachToolchain(run.agentId)) {
      this.state.statusMessage = `${THEME.warning}!${THEME.reset} ${run.agentLabel} does not expose an interactive ${mode} session yet.`
      this.render()
      return
    }

    const nextRun = createManagedRun({
      prompt: run.prompt,
      action: run.action,
      agentId: run.agentId,
      agentLabel: run.agentLabel,
      mode,
    })

    this.replaceRun(nextRun)
    this.state.statusMessage =
      mode === "attach"
        ? `${THEME.accent}⠋${THEME.reset} Attach relaunch staged from ${run.agentLabel}`
        : `${THEME.accent}⠋${THEME.reset} External relaunch staged from ${run.agentLabel}`
    this.syncManagedRunState()
    this.openRun(nextRun.id)

    if (mode === "attach") {
      this.beginAttachRun(nextRun.id)
      return
    }

    void this.beginExternalRunFlow(nextRun.id)
  }

  cancelRun(runId: string): void {
    const run = this.state.runs.entries.find((entry) => entry.id === runId)
    if (!run || isRunTerminal(run.phase)) {
      return
    }

    this.canceledRunIds.add(runId)
    this.replaceRun({
      ...run,
      phase: "canceled",
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      events: [
        ...run.events,
        {
          timestamp: new Date().toISOString(),
          kind: "warning",
          message: "Run canceled from the TUI",
        },
      ],
    })
    this.state.statusMessage = `${THEME.warning}!${THEME.reset} Run ${run.title} canceled from the TUI`
    this.syncManagedRunState()
    this.render()
  }

  getCwd(): string {
    return this.cwd
  }

  async copyText(text: string, label = "selection"): Promise<boolean> {
    const candidates = [
      Bun.which("pbcopy") ? ["pbcopy"] : null,
      Bun.which("wl-copy") ? ["wl-copy"] : null,
      Bun.which("xclip") ? ["xclip", "-selection", "clipboard"] : null,
    ].filter((value): value is string[] => Array.isArray(value))

    for (const command of candidates) {
      try {
        const proc = Bun.spawn(command, {
          stdin: "pipe",
          stdout: "ignore",
          stderr: "ignore",
        })
        if (!proc.stdin) {
          continue
        }
        proc.stdin.write(text)
        proc.stdin.end()
        const exitCode = await proc.exited
        if (exitCode === 0) {
          this.state.statusMessage = `${THEME.success}Copied${THEME.reset} ${THEME.white}${label}${THEME.reset}`
          this.render()
          return true
        }
      } catch {
        // Try the next clipboard backend.
      }
    }

    this.state.statusMessage = `${THEME.warning}Clipboard unavailable${THEME.reset} ${THEME.dim}for ${label}${THEME.reset}`
    this.render()
    return false
  }

  interactiveSendInput(input: string): void {
    if (!this.interactiveRuntime || this.state.interactiveSession.focus !== "pty") {
      return
    }

    this.interactiveRuntime.write(input)
  }

  interactiveSendStagedTask(): void {
    if (!this.interactiveRuntime) {
      return
    }

    const text = this.state.interactiveSession.stagedTask.text.trim()
    if (!text) {
      this.state.interactiveSession.error = "Stage a task before sending it to the interactive session."
      this.render()
      return
    }

    this.interactiveRuntime.write(`${text}\r`)
    this.state.interactiveSession = {
      ...this.state.interactiveSession,
      stagedTask: {
        ...this.state.interactiveSession.stagedTask,
        sent: true,
        editable: false,
      },
      focus: "pty",
      returnFocus: "pty",
      phase: "running",
      error: null,
    }

    const run = this.state.runs.entries.find((entry) => entry.id === this.state.interactiveSession.runId)
    if (run) {
      this.replaceRun(updateRunRecord(run, { interactivePhase: "running" }, { kind: "status", message: "Staged task sent to interactive session" }))
      this.appendInteractiveSystemLine(run.id, `› staged task sent: ${text}`)
    }
    this.render()
  }

  interactiveUpdateStagedTask(text: string): void {
    this.state.interactiveSession = {
      ...this.state.interactiveSession,
      stagedTask: {
        ...this.state.interactiveSession.stagedTask,
        text,
      },
      error: null,
    }
    this.render()
  }

  interactiveSetFocus(focus: InteractiveSurfaceFocus): void {
    this.state.interactiveSession = {
      ...this.state.interactiveSession,
      focus,
      returnFocus: focus === "controls" ? this.state.interactiveSession.returnFocus : focus,
      error: null,
    }
    this.render()
  }

  interactiveToggleControls(): void {
    const session = this.state.interactiveSession
    this.state.interactiveSession = {
      ...session,
      focus: session.focus === "controls" ? session.returnFocus : "controls",
      returnFocus: session.focus === "controls" ? session.returnFocus : session.focus,
      error: null,
    }
    this.render()
  }

  interactiveReturnToRunDetail(): void {
    if (this.state.interactiveSession.runId) {
      this.openRun(this.state.interactiveSession.runId)
      return
    }
    this.setScreen("run-detail")
  }

  interactiveCancelSession(): void {
    if (!this.interactiveRuntime || !this.interactiveRuntimeRunId) {
      return
    }

    this.interactiveRuntimeCancelRequested = true
    this.state.interactiveSession = {
      ...this.state.interactiveSession,
      phase: "returning",
      error: null,
    }
    const run = this.state.runs.entries.find((entry) => entry.id === this.interactiveRuntimeRunId)
    if (run) {
      this.replaceRun(updateRunRecord(run, { interactivePhase: "returning" }, { kind: "warning", message: "Canceling embedded interactive session" }))
    }
    this.interactiveRuntime.kill()
    this.render()
  }

  interactiveScrollViewport(delta: number): void {
    const maxOffset = Math.max(
      0,
      this.state.interactiveSession.scrollback.length - Math.max(1, this.state.interactiveSession.viewport.rows),
    )
    const nextOffset = Math.max(0, Math.min(maxOffset, this.state.interactiveSession.viewport.scrollOffset + delta))
    this.state.interactiveSession = {
      ...this.state.interactiveSession,
      viewport: {
        ...this.state.interactiveSession.viewport,
        scrollOffset: nextOffset,
        autoFollow: nextOffset === 0,
      },
    }
    this.render()
  }

  // ===========================================================================
  // DATA REFRESH
  // ===========================================================================

  private async refresh(): Promise<void> {
    try {
      const active = Telemetry.getActive()
      this.state.activeRuns = Math.max(active.length, this.getManagedActiveRunCount())

      this.state.lastRefresh = new Date()
      await Promise.all([
        this.refreshHomeData(),
        this.refreshAgentActivity(),
      ])

      if (this.state.inputMode === "main" && !this.state.isRunning) {
        this.render()
      }
    } catch {
      // Ignore refresh errors
    }
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  private getManagedActiveRunCount(): number {
    return this.state.runs.entries.filter((entry) => !isRunTerminal(entry.phase)).length
  }

  private syncManagedRunState(): void {
    const activeRunCount = this.getManagedActiveRunCount()
    this.state.isRunning = activeRunCount > 0
    this.state.activeRuns = activeRunCount
  }

  private replaceRun(nextRun: RunRecord): void {
    const entries = [...this.state.runs.entries]
    const index = entries.findIndex((entry) => entry.id === nextRun.id)

    if (index >= 0) {
      entries[index] = nextRun
    } else {
      entries.unshift(nextRun)
    }

    entries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    this.state.runs.entries = entries

    if (!this.state.activeRunId) {
      this.state.activeRunId = nextRun.id
    }
    if (!this.state.runs.selectedRunId) {
      this.state.runs.selectedRunId = nextRun.id
    }

    if (this.state.activeRunId === nextRun.id) {
      const lastEventIndex = Math.max(0, nextRun.events.length - 1)
      this.state.runDetailEvents = { offset: Math.max(0, lastEventIndex - 5), selected: lastEventIndex }
    }
  }

  private shouldUseEmbeddedInteractive(run: RunRecord): boolean {
    const override = process.env.THRUNT_ATTACH_MODE?.trim().toLowerCase()
    if (override === "raw") {
      return false
    }
    if (override === "embedded") {
      return supportsAttachToolchain(run.agentId)
    }
    return supportsAttachToolchain(run.agentId)
  }

  private resetInteractiveSessionState(): void {
    this.state.interactiveSession = createInitialInteractiveSessionState()
  }

  private syncInteractiveViewport(): void {
    const cols = Math.max(32, this.width - 10)
    const rows = Math.max(8, this.height - 16)
    this.state.interactiveSession.viewport = {
      ...this.state.interactiveSession.viewport,
      cols,
      rows,
    }
    this.interactiveRuntime?.resize(cols, rows)
    this.interactiveTranscriptBuffer?.resize(cols, rows)
  }

  private appendInteractiveOutput(runId: string, chunk: string): void {
    const run = this.state.runs.entries.find((entry) => entry.id === runId)
    if (!run) {
      return
    }

    if (!this.interactiveTranscriptBuffer) {
      const { cols, rows } = this.state.interactiveSession.viewport
      this.interactiveTranscriptBuffer = new InteractiveTerminalBuffer(cols, rows)
    }
    this.interactiveTranscriptBuffer.feed(chunk)
    const scrollback = this.interactiveTranscriptBuffer.snapshot(1200)
    if (scrollback.length === 0) {
      const nextLines = sanitizeInteractiveOutput(chunk)
      if (nextLines.length === 0) {
        return
      }
      scrollback.push(...nextLines)
    }
    const activityLines = extractInteractiveActivityLines(chunk)
    const nextActivityLines =
      activityLines.length > 0
        ? mergeInteractiveActivityLines(this.state.interactiveSession.activityLines, activityLines)
        : this.state.interactiveSession.activityLines

    this.state.interactiveSession = {
      ...this.state.interactiveSession,
      scrollback,
      activityLines: nextActivityLines,
      lastOutputAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
      phase: this.state.interactiveSession.stagedTask.sent ? "running" : this.state.interactiveSession.phase,
    }

    const nextRun = updateRunRecord(run, {
      ptyTail: scrollback.slice(-6),
      interactivePhase: this.state.interactiveSession.phase,
    })
    this.replaceRun(nextRun)
    if (this.state.interactiveSession.viewport.autoFollow) {
      this.state.interactiveSession.viewport.scrollOffset = 0
    }
    if (this.state.inputMode === "interactive-run" && this.state.activeRunId === runId) {
      this.render()
    }
  }

  private appendInteractiveSystemLine(runId: string, line: string): void {
    if (!line.trim()) {
      return
    }

    if (!this.interactiveTranscriptBuffer) {
      const { cols, rows } = this.state.interactiveSession.viewport
      this.interactiveTranscriptBuffer = new InteractiveTerminalBuffer(cols, rows)
    }
    this.interactiveTranscriptBuffer.feed(`${line}\n`)
    const scrollback = this.interactiveTranscriptBuffer.snapshot(1200)

    this.state.interactiveSession = {
      ...this.state.interactiveSession,
      scrollback,
      activityLines: mergeInteractiveActivityLines(this.state.interactiveSession.activityLines, [line]),
      lastOutputAt: new Date().toISOString(),
      lastHeartbeatAt: new Date().toISOString(),
    }

    const run = this.state.runs.entries.find((entry) => entry.id === runId)
    if (run) {
      this.replaceRun(updateRunRecord(run, { ptyTail: scrollback.slice(-6) }))
    }
    if (this.state.interactiveSession.viewport.autoFollow) {
      this.state.interactiveSession.viewport.scrollOffset = 0
    }
    if (this.state.inputMode === "interactive-run" && this.state.activeRunId === runId) {
      this.render()
    }
  }

  private async finalizeEmbeddedInteractiveRun(
    runId: string,
    plan: EmbeddedInteractiveSessionPlan,
    exitCode: number | null,
  ): Promise<void> {
    const currentRun = this.state.runs.entries.find((entry) => entry.id === runId)
    if (!currentRun) {
      return
    }

    const canceled = this.interactiveRuntimeCancelRequested
    const success = !canceled && exitCode === 0
    const error = canceled
      ? "Interactive session canceled from embedded surface"
      : exitCode === 0 || exitCode === null
        ? null
        : `Interactive session exited with code ${exitCode}`
    const nextPhase = canceled ? "canceled" : success ? "completed" : "failed"
    const result: DispatchResultInfo = {
      success,
      taskId: plan.workcell.id,
      agent: currentRun.agentLabel,
      action: currentRun.action,
      routing: plan.routing,
      execution: success ? { success: true } : { success: false, error: error ?? undefined },
      error: error ?? undefined,
      duration: Math.max(0, Date.now() - this.interactiveRuntimeStartedAt),
    }

    const finishedRun = updateRunRecord(
      currentRun,
      {
        phase: nextPhase,
        routing: plan.routing,
        workcellId: plan.workcell.id,
        worktreePath: plan.workcell.directory,
        ptySessionId: null,
        interactiveSessionId: null,
        interactiveSurface: "none",
        interactivePhase: null,
        attachState: "detached",
        attached: false,
        execution: result.execution ?? null,
        result,
        error,
        completedAt: new Date().toISOString(),
      },
      {
        kind: canceled ? "warning" : success ? "status" : "error",
        message: canceled
          ? "Interactive session canceled"
          : success
            ? "Interactive session completed"
            : `Run failed: ${error ?? "interactive session failed"}`,
      },
    )

    this.replaceRun(finishedRun)
    this.state.lastResult = result
    this.state.statusMessage = canceled
      ? `${THEME.warning}!${THEME.reset} ${finishedRun.agentLabel} interactive session canceled`
      : success
        ? `${THEME.success}✓${THEME.reset} ${finishedRun.agentLabel} interactive session completed`
        : `${THEME.error}✗${THEME.reset} ${finishedRun.agentLabel} interactive session failed`
    this.interactiveRuntime = null
    this.interactiveRuntimeRunId = null
    this.interactiveRuntimeStartedAt = 0
    this.interactiveRuntimeCancelRequested = false
    this.interactiveTranscriptBuffer = null
    const cleanup = this.interactiveRuntimeCleanup
    this.interactiveRuntimeCleanup = null
    this.resetInteractiveSessionState()
    this.syncManagedRunState()
    await cleanup?.().catch(() => {})
    if (this.state.inputMode === "interactive-run") {
      this.openRun(runId)
    } else {
      this.render()
    }
  }

  private async launchEmbeddedInteractiveRun(runId: string): Promise<void> {
    const originalRun = this.state.runs.entries.find((entry) => entry.id === runId)
    if (!originalRun) {
      return
    }

    if (this.interactiveRuntime && this.interactiveRuntimeRunId !== runId) {
      this.state.statusMessage = `${THEME.warning}!${THEME.reset} Only one embedded interactive session can be active at a time.`
      this.render()
      return
    }

    let plan: EmbeddedInteractiveSessionPlan | null = null
    try {
      const preparingRun = updateRunRecord(
        originalRun,
        {
          phase: "executing",
          attachState: "attaching",
          attached: false,
          error: null,
        },
        { kind: "status", message: "Preparing embedded interactive session" },
      )
      this.replaceRun(preparingRun)
      this.state.statusMessage = `${THEME.accent}⠋${THEME.reset} Preparing interactive session`
      this.render()

      plan = await createEmbeddedInteractiveSession(preparingRun, {
        cwd: this.cwd,
        projectId: "default",
      })

      this.interactiveRuntime = plan.runtime
      this.interactiveRuntimeCleanup = plan.cleanup
      this.interactiveRuntimeRunId = runId
      this.interactiveRuntimeStartedAt = Date.now()
      this.interactiveRuntimeCancelRequested = false

      const runningRun = updateRunRecord(
        this.state.runs.entries.find((entry) => entry.id === runId) ?? preparingRun,
        {
          phase: "executing",
          routing: plan.routing,
          workcellId: plan.workcell.id,
          worktreePath: plan.workcell.directory,
          ptySessionId: plan.sessionId,
          interactiveSessionId: plan.sessionId,
          interactiveSurface: "embedded",
          interactivePhase: plan.launchConsumesPrompt ? "running" : "awaiting_first_input",
          attachState: "attached",
          attached: true,
        },
        { kind: "status", message: "Embedded interactive session opened" },
      )
      this.replaceRun(runningRun)
      const autoSendStagedTask = !plan.launchConsumesPrompt && Boolean(runningRun.prompt.trim())

      this.state.interactiveSession = {
        runId,
        sessionId: plan.sessionId,
        toolchain: runningRun.agentId,
        focus: plan.launchConsumesPrompt || autoSendStagedTask ? "pty" : "staged_task",
        returnFocus: plan.launchConsumesPrompt || autoSendStagedTask ? "pty" : "staged_task",
        phase: plan.launchConsumesPrompt || autoSendStagedTask ? "running" : "awaiting_first_input",
        launchConsumesPrompt: plan.launchConsumesPrompt,
        stagedTask: {
          text: runningRun.prompt,
          sent: plan.launchConsumesPrompt || autoSendStagedTask,
          editable: autoSendStagedTask ? false : plan.stagedTaskEditable,
        },
        viewport: this.state.interactiveSession.viewport,
        scrollback: [],
        activityLines: [],
        lastOutputAt: null,
        lastHeartbeatAt: null,
        error: null,
      }
      this.interactiveTranscriptBuffer = new InteractiveTerminalBuffer(
        this.state.interactiveSession.viewport.cols,
        this.state.interactiveSession.viewport.rows,
      )
      this.syncInteractiveViewport()
      this.state.statusMessage = `${THEME.success}✓${THEME.reset} Embedded interactive session ready`
      this.state.activeRunId = runId
      this.state.runs.selectedRunId = runId
      this.setScreen("interactive-run")

      if (autoSendStagedTask) {
        plan.runtime.write(`${runningRun.prompt.trim()}\r`)
        this.replaceRun(
          updateRunRecord(
            this.state.runs.entries.find((entry) => entry.id === runId) ?? runningRun,
            { interactivePhase: "running" },
            { kind: "status", message: "Staged task sent to interactive session" },
          ),
        )
        this.appendInteractiveSystemLine(runId, `› staged task sent: ${runningRun.prompt.trim()}`)
      }

      plan.runtime.onOutput((chunk) => {
        this.appendInteractiveOutput(runId, chunk)
      })
      plan.runtime.onExit((code) => {
        void this.finalizeEmbeddedInteractiveRun(runId, plan!, code)
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failedRun = updateRunRecord(
        this.state.runs.entries.find((entry) => entry.id === runId) ?? originalRun,
        {
          phase: "failed",
          attachState: "detached",
          attached: false,
          interactiveSessionId: null,
          interactiveSurface: "none",
          interactivePhase: null,
          error: message,
          completedAt: new Date().toISOString(),
          execution: { success: false, error: message },
          result: {
            success: false,
            taskId: plan?.workcell.id ?? "",
            agent: originalRun.agentLabel,
            action: originalRun.action,
            routing: plan?.routing,
            execution: { success: false, error: message },
            error: message,
            duration: 0,
          },
        },
        { kind: "error", message: `Run failed: ${message}` },
      )
      this.replaceRun(failedRun)
      this.state.lastResult = failedRun.result
      this.state.statusMessage = `${THEME.error}✗${THEME.reset} Embedded interactive session failed`
      this.interactiveTranscriptBuffer = null
      this.resetInteractiveSessionState()
      this.syncManagedRunState()
      await plan?.cleanup().catch(() => {})
      this.render()
    }
  }

  private prepareTerminalForPtyHandoff(): void {
    this.state.ptyHandoffActive = true
    this.detachTerminalListeners()
    process.stdout.write(ESC.showCursor + ESC.mainScreen + ESC.clearScreen + "\x1b[3J" + ESC.moveTo(1, 1))
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false)
    }
  }

  private restoreTerminalAfterPtyHandoff(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
    }
    this.attachTerminalListeners()
    this.state.ptyHandoffActive = false
    process.stdout.write(ESC.altScreen + ESC.hideCursor)
    this.updateTerminalSize()
  }

  private openDispatchSheet(action: "dispatch" | "speculate"): void {
    const prompt = this.state.promptBuffer.trim()
    if (!prompt) {
      return
    }

    this.state.dispatchSheet = {
      open: true,
      prompt,
      action,
      mode: "managed",
      agentIndex: this.state.agentIndex,
      focusedField: 0,
      error: null,
    }
    this.state.inputMode = "dispatch-sheet"
    this.render()
  }

  private finishRun(run: RunRecord, result: DispatchResultInfo): void {
    const nextPhase = result.success
      ? result.verification
        ? "review_ready"
        : "completed"
      : "failed"
    const nextRun: RunRecord = {
      ...run,
      phase: nextPhase,
      updatedAt: new Date().toISOString(),
      routing: result.routing ?? null,
      execution: result.execution ?? null,
      verification: result.verification ?? null,
      result,
      error: result.success ? null : getFailureMessage(result),
      completedAt:
        nextPhase === "review_ready" || nextPhase === "completed" || nextPhase === "failed"
          ? new Date().toISOString()
          : null,
      workcellId: result.taskId || null,
      events: [
        ...run.events,
        {
          timestamp: new Date().toISOString(),
          kind: result.success ? "status" : "error",
          message: result.success
            ? nextPhase === "review_ready"
              ? "Run ready for review"
              : "Run completed"
            : `Run failed: ${getFailureMessage(result)}`,
        },
      ],
    }

    this.replaceRun(nextRun)
    this.state.lastResult = result
    this.state.statusMessage = result.success
      ? `${THEME.success}✓${THEME.reset} ${run.agentLabel} ${nextPhase === "review_ready" ? "ready for review" : "completed"}`
      : `${THEME.error}✗${THEME.reset} ${run.agentLabel} failed`
    this.syncManagedRunState()
    this.render()
  }

  private async launchAttachRun(runId: string): Promise<void> {
    const originalRun = this.state.runs.entries.find((entry) => entry.id === runId)
    if (!originalRun) {
      return
    }

    let sessionPlan: Awaited<ReturnType<typeof createAttachRunSession>> | null = null
    let terminalPrepared = false
    const startedAt = Date.now()

    try {
      const preparingRun = updateRunRecord(
        originalRun,
        {
          attachState: "attaching",
          attached: false,
          error: null,
        },
        { kind: "status", message: "Preparing attach session" },
      )
      this.replaceRun(preparingRun)
      this.state.statusMessage = `${THEME.accent}⠋${THEME.reset} Preparing attach session`
      this.syncManagedRunState()
      this.render()

      sessionPlan = await createAttachRunSession(preparingRun, {
        cwd: this.cwd,
        projectId: "default",
      })

      const attachedRun = updateRunRecord(
        this.state.runs.entries.find((entry) => entry.id === runId) ?? preparingRun,
        {
          phase: "executing",
          routing: sessionPlan.routing,
          workcellId: sessionPlan.workcell.id,
          worktreePath: sessionPlan.workcell.directory,
          ptySessionId: sessionPlan.ptySessionId,
          attached: true,
          attachState: "attached",
        },
        { kind: "status", message: "Terminal attached to interactive session" },
      )
      this.replaceRun(attachedRun)
      this.state.attachedRunId = runId
      this.prepareTerminalForPtyHandoff()
      terminalPrepared = true
      this.attachedSession = sessionPlan.start()

      const exitCode = await this.attachedSession.exited
      const returningRun = updateRunRecord(
        this.state.runs.entries.find((entry) => entry.id === runId) ?? attachedRun,
        {
          attached: false,
          attachState: "returning",
        },
        { kind: "status", message: "Returning control to THRUNT GOD" },
      )
      this.replaceRun(returningRun)
      this.state.attachedRunId = null
      this.attachedSession = null
      this.restoreTerminalAfterPtyHandoff()
      terminalPrepared = false

      const success = exitCode === 0
      const finishedRun = updateRunRecord(
        this.state.runs.entries.find((entry) => entry.id === runId) ?? returningRun,
        {
          phase: success ? "completed" : "failed",
          result: {
            success,
            taskId: sessionPlan.workcell.id,
            agent: returningRun.agentLabel,
            action: returningRun.action,
            routing: sessionPlan.routing,
            execution: success ? { success: true } : { success: false, error: `Interactive session exited with code ${exitCode}` },
            error: success ? undefined : `Interactive session exited with code ${exitCode}`,
            duration: Date.now() - startedAt,
          },
          execution: success ? { success: true } : { success: false, error: `Interactive session exited with code ${exitCode}` },
          error: success ? null : `Interactive session exited with code ${exitCode}`,
          completedAt: new Date().toISOString(),
          attached: false,
          attachState: "detached",
        },
        {
          kind: success ? "status" : "error",
          message: success ? "Interactive session completed" : `Run failed: Interactive session exited with code ${exitCode}`,
        },
      )
      this.replaceRun(finishedRun)
      this.state.lastResult = finishedRun.result
      this.state.statusMessage = success
        ? `${THEME.success}✓${THEME.reset} ${finishedRun.agentLabel} returned from attach`
        : `${THEME.error}✗${THEME.reset} ${finishedRun.agentLabel} attach session failed`
      this.syncManagedRunState()
      this.openRun(runId)
    } catch (error) {
      if (terminalPrepared) {
        this.restoreTerminalAfterPtyHandoff()
      }
      this.attachedSession?.terminate()
      this.attachedSession = null
      this.state.attachedRunId = null

      const message = error instanceof Error ? error.message : String(error)
      const failedRun = updateRunRecord(
        this.state.runs.entries.find((entry) => entry.id === runId) ?? originalRun,
        {
          phase: "failed",
          attached: false,
          attachState: "detached",
          error: message,
          completedAt: new Date().toISOString(),
          result: {
            success: false,
            taskId: sessionPlan?.workcell.id ?? "",
            agent: originalRun.agentLabel,
            action: originalRun.action,
            routing: sessionPlan?.routing,
            execution: { success: false, error: message },
            error: message,
            duration: Date.now() - startedAt,
          },
          execution: { success: false, error: message },
        },
        { kind: "error", message: `Run failed: ${message}` },
      )
      this.replaceRun(failedRun)
      this.state.lastResult = failedRun.result
      this.state.statusMessage = `${THEME.error}✗${THEME.reset} Attach failed`
      this.syncManagedRunState()
      this.render()
    } finally {
      await sessionPlan?.cleanup().catch(() => {})
    }
  }

  private async waitForExternalExit(
    statusPath: string,
    startupTimeoutMs: number,
    livenessTimeoutMs: number,
    surfaceAlive?: () => Promise<boolean>,
    surfaceClosedMessage = "External terminal window closed",
  ): Promise<number> {
    const deadline = Date.now() + startupTimeoutMs
    let lastLiveAt: number | null = null
    for (;;) {
      const file = Bun.file(statusPath)
      if (await file.exists()) {
        const payload = await file.json().catch(() => null) as ExternalRunStatusPayload | null
        if (
          payload?.state === "starting" ||
          payload?.state === "running" ||
          typeof payload?.startedAt === "string"
        ) {
          const lastSeenAt = payload?.heartbeatAt ?? payload?.startedAt ?? null
          if (typeof lastSeenAt === "string") {
            const lastSeenMs = Date.parse(lastSeenAt)
            if (Number.isFinite(lastSeenMs)) {
              lastLiveAt = lastSeenMs
            }
          }
        }
        if (payload?.state === "finished" && typeof payload.exitCode === "number") {
          return payload.exitCode
        }
      }

      if (lastLiveAt === null && Date.now() >= deadline) {
        throw new ExternalLaunchStartupTimeoutError()
      }
      if (lastLiveAt !== null && surfaceAlive) {
        const alive = await surfaceAlive().catch(() => true)
        if (!alive) {
          throw new ExternalRunSurfaceClosedError(surfaceClosedMessage)
        }
      }
      if (lastLiveAt !== null && Date.now() - lastLiveAt >= livenessTimeoutMs) {
        throw new ExternalRunHeartbeatTimeoutError()
      }

      await Bun.sleep(400)
    }
  }

  private async finalizeExternalRun(
    runId: string,
    sessionPlan: ExternalRunSessionPlan,
    startedAt: number,
    surfaceAlive?: () => Promise<boolean>,
    surfaceClosedMessage?: string,
  ): Promise<void> {
    try {
      const exitCode = await this.waitForExternalExit(
        sessionPlan.statusPath,
        sessionPlan.startupTimeoutMs,
        sessionPlan.livenessTimeoutMs,
        surfaceAlive,
        surfaceClosedMessage,
      )
      const currentRun = this.state.runs.entries.find((entry) => entry.id === runId)
      if (!currentRun) {
        return
      }

      const success = exitCode === 0
      const exitMessage = describeExternalExitCode(exitCode)
      const finishedRun = updateRunRecord(
        currentRun,
        {
          phase: success ? "completed" : "failed",
          completedAt: new Date().toISOString(),
          error: success ? null : exitMessage,
          execution: success ? { success: true } : { success: false, error: exitMessage },
          result: {
            success,
            taskId: sessionPlan.workcell.id,
            agent: currentRun.agentLabel,
            action: currentRun.action,
            routing: sessionPlan.routing,
            execution: success ? { success: true } : { success: false, error: exitMessage },
            error: success ? undefined : exitMessage,
            duration: Date.now() - startedAt,
          },
          external: {
            ...currentRun.external,
            status: success ? "idle" : "failed",
            error: success ? null : exitMessage,
          },
        },
        {
          kind: success ? "status" : "error",
          message: success ? "External session completed" : `Run failed: ${exitMessage}`,
        },
      )
      this.replaceRun(finishedRun)
      this.state.lastResult = finishedRun.result
      this.state.statusMessage = success
        ? `${THEME.success}✓${THEME.reset} ${finishedRun.agentLabel} completed in external terminal`
        : `${THEME.error}✗${THEME.reset} ${finishedRun.agentLabel} external session failed`
      this.syncManagedRunState()
      this.render()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const currentRun = this.state.runs.entries.find((entry) => entry.id === runId)
      if (currentRun) {
        const failedRun = isRecoverableExternalLaunchError(error)
          ? createRecoverableExternalFailureRun(
              currentRun,
              currentRun.external.adapterId ?? "external",
              message,
            )
          : updateRunRecord(
              currentRun,
              {
                phase: "failed",
                completedAt: new Date().toISOString(),
                error: message,
                execution: { success: false, error: message },
                result: {
                  success: false,
                  taskId: sessionPlan.workcell.id,
                  agent: currentRun.agentLabel,
                  action: currentRun.action,
                  routing: sessionPlan.routing,
                  execution: { success: false, error: message },
                  error: message,
                  duration: Date.now() - startedAt,
                },
                external: {
                  ...currentRun.external,
                  status: "failed",
                  error: message,
                },
              },
              { kind: "error", message: `External launch failed: ${message}` },
            )
        this.replaceRun(failedRun)
        this.state.lastResult = failedRun.result
        this.state.statusMessage = isRecoverableExternalLaunchError(error)
          ? `${THEME.warning}!${THEME.reset} ${failedRun.agentLabel} external launch did not start; retry or fall back`
          : `${THEME.error}✗${THEME.reset} ${failedRun.agentLabel} external session failed`
        this.syncManagedRunState()
        this.render()
      }
    } finally {
      const cleanup = this.externalSessionCleanup.get(runId)
      this.externalSessionCleanup.delete(runId)
      await cleanup?.().catch(() => {})
    }
  }

  private async launchExternalRun(runId: string, adapterId: string): Promise<void> {
    const originalRun = this.state.runs.entries.find((entry) => entry.id === runId)
    if (!originalRun) {
      return
    }

    const adapter = getExternalAdapter(adapterId)
    if (!adapter) {
      this.state.statusMessage = `${THEME.error}✗${THEME.reset} Unknown external adapter: ${adapterId}`
      this.render()
      return
    }

    const startedAt = Date.now()
    let sessionPlan: ExternalRunSessionPlan | null = null

    try {
      const launchingRun = updateRunRecord(
        originalRun,
        {
          external: {
            kind: adapter.id,
            adapterId: adapter.id,
            ref: null,
            status: "launching",
            error: null,
          },
          error: null,
        },
        { kind: "status", message: `Opening ${adapter.label}` },
      )
      this.replaceRun(launchingRun)
      this.state.statusMessage = `${THEME.accent}⠋${THEME.reset} Opening ${adapter.label}`
      this.render()

      sessionPlan = await createExternalRunSession(launchingRun, {
        cwd: this.cwd,
        projectId: "default",
      })

      const launchResult = await adapter.launch(sessionPlan)
      this.externalSessionCleanup.set(runId, sessionPlan.cleanup)

      const runningRun = updateRunRecord(
        this.state.runs.entries.find((entry) => entry.id === runId) ?? launchingRun,
        {
          phase: "executing",
          routing: sessionPlan.routing,
          workcellId: sessionPlan.workcell.id,
          worktreePath: sessionPlan.workcell.directory,
          ptySessionId: sessionPlan.ptySessionId,
          external: {
            kind: adapter.id,
            adapterId: adapter.id,
            ref: launchResult.ref,
            status: "running",
            error: null,
          },
        },
        { kind: "status", message: `${adapter.label} opened for interactive execution` },
      )
      this.replaceRun(runningRun)
      this.state.statusMessage = `${THEME.success}✓${THEME.reset} ${adapter.label} opened`
      this.syncManagedRunState()
      this.render()

      const surfaceAlive =
        adapter.isAlive && launchResult.ref ? () => adapter.isAlive!(launchResult.ref!) : undefined
      const surfaceClosedMessage =
        adapter.id === "terminal-app" ? "External terminal window closed" : `${adapter.label} surface closed`

      void this.finalizeExternalRun(runId, sessionPlan, startedAt, surfaceAlive, surfaceClosedMessage)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failedRun = createRecoverableExternalFailureRun(
        this.state.runs.entries.find((entry) => entry.id === runId) ?? originalRun,
        adapter.id,
        message,
      )
      this.replaceRun(failedRun)
      this.state.statusMessage = `${THEME.warning}!${THEME.reset} External launch failed; retry or fall back`
      this.render()
      await sessionPlan?.cleanup().catch(() => {})
    }
  }

  // ===========================================================================
  // THRUNT QUERY EXECUTION
  // ===========================================================================

  private _activeQueryHandle: { kill(): void } | null = null
  private _showGateOverlay = false

  private executeThruntQuery(connector: string, query: string): void {
    // Set up execution state
    this.state.thruntExecution = {
      running: true,
      connector,
      query,
      log: createLogState(1000),
      error: null,
      completedAt: null,
    }
    this.state.statusMessage = `${THEME.accent}*${THEME.reset} Executing query on ${connector}...`
    this.render()

    // Track stream completion for gate triggering
    let streamDone = false

    const handle = executeQueryStream(
      connector,
      query,
      (data: unknown) => {
        // Format each NDJSON chunk as a log line
        const text = typeof data === "object" && data !== null
          ? JSON.stringify(data, null, 0)
          : String(data)
        this.state.thruntExecution.log = appendLine(
          this.state.thruntExecution.log,
          { text, plainLength: text.length },
        )
        this.render()
      },
      (error: string) => {
        this.state.thruntExecution.error = error
        this.state.thruntExecution.running = false
        this.state.thruntExecution.completedAt = new Date().toISOString()
        this.state.statusMessage = `${THEME.error}x${THEME.reset} Query execution error: ${error}`
        this.render()
      },
    )

    // Store handle for potential kill
    this._activeQueryHandle = handle

    // Shared cleanup to prevent timer leaks
    let checkCompletion: ReturnType<typeof setInterval>
    let stableTimer: ReturnType<typeof setInterval>
    const clearAllTimers = () => {
      clearInterval(checkCompletion)
      clearInterval(stableTimer)
    }

    // Monitor process completion by polling for error/stopped state
    checkCompletion = setInterval(() => {
      if (this.state.thruntExecution.error || !this.state.thruntExecution.running) {
        clearAllTimers()
        if (!streamDone) {
          streamDone = true
          this.onQueryExecutionComplete()
        }
      }
    }, 500)

    // Stability guard: if no new lines arrive for 3 seconds after at least one, consider done
    let lastLineCount = 0
    let stableChecks = 0
    stableTimer = setInterval(() => {
      const currentCount = this.state.thruntExecution.log.lines.length
      if (currentCount > 0 && currentCount === lastLineCount) {
        stableChecks++
        if (stableChecks >= 6) { // 3 seconds of stability
          clearAllTimers()
          if (!streamDone) {
            streamDone = true
            this.state.thruntExecution.running = false
            this.state.thruntExecution.completedAt = new Date().toISOString()
            this.onQueryExecutionComplete()
          }
        }
      } else {
        stableChecks = 0
        lastLineCount = currentCount
      }
    }, 500)
  }

  private async onQueryExecutionComplete(): Promise<void> {
    this.state.statusMessage = `${THEME.accent}*${THEME.reset} Running verification gates...`
    this.render()

    try {
      // Create synthetic WorkcellInfo for THRUNT gate context
      const workcell: import("../types").WorkcellInfo = {
        id: "thrunt-execution",
        name: "thrunt-query",
        directory: this.cwd,
        branch: "main",
        status: "warm",
        projectId: "thrunt",
        createdAt: Date.now(),
        useCount: 0,
      }

      const gateResults = await Verifier.run(workcell, {
        gates: ["evidence-integrity", "receipt-completeness"],
        failFast: false,
        timeout: 60000,
      })

      this.state.thruntGateResults = {
        results: gateResults.results.map(r => ({
          gate: r.gate,
          passed: r.passed,
          output: r.output,
          diagnostics: r.diagnostics?.map(d => ({
            severity: d.severity,
            message: d.message,
            file: d.file,
          })),
        })),
        allPassed: gateResults.allPassed,
        score: gateResults.score,
        ranAt: new Date().toISOString(),
      }

      if (gateResults.allPassed) {
        this.state.statusMessage = `${THEME.success}v${THEME.reset} Query complete, gates passed`
      } else {
        this.state.statusMessage = `${THEME.warning}!${THEME.reset} Query complete, gate issues found`
      }
    } catch (err) {
      this.state.statusMessage = `${THEME.warning}!${THEME.reset} Query complete, gate check error`
    }

    // Auto-navigate to evidence screen
    this.setScreen("hunt-evidence")
    this.render()
  }

  private async launchManagedRun(run: RunRecord): Promise<void> {
    try {
      const { executeTool } = await import("../tools")
      await executeManagedRun(run, {
        cwd: this.cwd,
        projectId: "default",
        executeTool,
        shouldAbort: () => this.canceledRunIds.has(run.id),
        onUpdate: (nextRun) => {
          this.replaceRun(nextRun)
          if (nextRun.result) {
            this.state.lastResult = nextRun.result
          }
          if (isRunTerminal(nextRun.phase)) {
            this.canceledRunIds.delete(nextRun.id)
            this.state.statusMessage =
              nextRun.phase === "canceled"
                ? `${THEME.warning}!${THEME.reset} ${nextRun.title} canceled`
                : nextRun.result?.success
                  ? `${THEME.success}✓${THEME.reset} ${nextRun.agentLabel} ${nextRun.phase === "review_ready" ? "ready for review" : "completed"}`
                  : `${THEME.error}✗${THEME.reset} ${nextRun.agentLabel} failed`
          }
          this.syncManagedRunState()
          this.render()
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.finishRun(run, {
        success: false,
        taskId: "",
        agent: run.agentLabel,
        action: run.action,
        error: message,
        duration: 0,
      })
    }
  }

  async submitPrompt(action: "dispatch" | "speculate"): Promise<void> {
    const prompt = this.state.promptBuffer.trim()
    if (!prompt) return
    this.openDispatchSheet(action)
  }

  async runGates(): Promise<void> {
    this.state.statusMessage = `${THEME.accent}⠋${THEME.reset} Running quality gates...`
    this.render()

    try {
      const { executeTool } = await import("../tools")
      const context = { cwd: this.cwd, projectId: "default" }
      const result = (await executeTool("gate", { directory: this.cwd }, context)) as {
        success: boolean
        score: number
      }

      if (result.success) {
        this.state.statusMessage = `${THEME.success}✓${THEME.reset} All gates passed (${result.score}/100)`
      } else {
        this.state.statusMessage = `${THEME.error}✗${THEME.reset} Gates failed (${result.score}/100)`
      }
    } catch (err) {
      this.state.statusMessage = `${THEME.error}✗${THEME.reset} Error: ${err}`
    }

    this.render()

    setTimeout(() => {
      this.state.statusMessage = ""
      this.render()
    }, 5000)
  }

  async showRuns(): Promise<void> {
    const selectedRunId = this.state.activeRunId ?? this.state.runs.selectedRunId
    const selectedRun = selectedRunId
      ? this.state.runs.entries.find((entry) => entry.id === selectedRunId) ?? null
      : null

    if (selectedRun) {
      this.state.runs.selectedRunId = selectedRun.id
      this.state.runs.filter =
        selectedRun.phase === "review_ready"
          ? "review_ready"
          : isRunTerminal(selectedRun.phase)
            ? "all"
            : "active"
    }

    this.setScreen("runs")
  }

  async showHelp(): Promise<void> {
    await this.cleanup()

    console.log("")
    console.log(THEME.secondary + THEME.bold + "  ⟨ THRUNT GOD Grimoire ⟩" + THEME.reset)
    console.log(THEME.dim + "  " + "═".repeat(40) + THEME.reset)
    console.log("")
    console.log(THEME.white + THEME.bold + "  Invocations" + THEME.reset)
    console.log("")
    console.log(`  ${THEME.secondary}↑/↓${THEME.reset}  ${THEME.muted}or${THEME.reset}  ${THEME.secondary}j/k${THEME.reset}     Navigate`)
    console.log(`  ${THEME.secondary}Enter${THEME.reset}  ${THEME.muted}or${THEME.reset}  ${THEME.secondary}Space${THEME.reset}   Select`)
    console.log(`  ${THEME.secondary}Type${THEME.reset}                Search hunts, reports, packs, connectors, and findings`)
    console.log(`  ${THEME.secondary}Enter${THEME.reset}               Open the selected search result`)
    console.log(`  ${THEME.secondary}Tab${THEME.reset}                 Switch between search and results`)
    console.log(`  ${THEME.secondary}c / y${THEME.reset}               Copy the selected search result`)
    console.log(`  ${THEME.secondary}Esc${THEME.reset}                 Clear search or return focus to the search bar`)
    console.log(`  ${THEME.secondary}g${THEME.reset}                   Gates`)
    console.log(`  ${THEME.secondary}i${THEME.reset}                   Integrations`)
    console.log(`  ${THEME.secondary}Ctrl+N${THEME.reset}              Cycle agents`)
    console.log(`  ${THEME.secondary}Ctrl+S${THEME.reset}              Security overview`)
    console.log(`  ${THEME.secondary}Ctrl+P${THEME.reset}              Command palette`)
    console.log("")
    console.log(THEME.white + THEME.bold + "  Hunt Commands" + THEME.reset)
    console.log("")
    console.log(`  ${THEME.secondary}W${THEME.reset}                   Watch (live stream) ${THEME.success}[beta]${THEME.reset}`)
    console.log(`  ${THEME.secondary}T${THEME.reset}                   Timeline replay ${THEME.success}[beta]${THEME.reset}`)
    console.log(`  ${THEME.secondary}R${THEME.reset}                   Rule builder ${THEME.warning}[exp]${THEME.reset}`)
    console.log(`  ${THEME.secondary}Q${THEME.reset}                   Query REPL ${THEME.success}[beta]${THEME.reset}`)
    console.log(`  ${THEME.secondary}D${THEME.reset}                   Diff (scan changes) ${THEME.warning}[exp]${THEME.reset}`)
    console.log(`  ${THEME.secondary}E${THEME.reset}                   Evidence report ${THEME.success}[beta]${THEME.reset}`)
    console.log(`  ${THEME.secondary}H${THEME.reset}                   Export history ${THEME.success}[beta]${THEME.reset}`)
    console.log(`  ${THEME.secondary}C${THEME.reset}                   Connectors ${THEME.success}[beta]${THEME.reset}`)
    console.log(`  ${THEME.secondary}K${THEME.reset}                   Packs ${THEME.success}[beta]${THEME.reset}`)
    console.log(`  ${THEME.secondary}M${THEME.reset}                   MITRE ATT&CK map ${THEME.warning}[exp]${THEME.reset}`)
    console.log(`  ${THEME.secondary}P${THEME.reset}                   Playbook runner ${THEME.warning}[exp]${THEME.reset}`)
    console.log("")
    console.log(THEME.dim + "  Press any key to return..." + THEME.reset)

    await this.waitForKey()
    await this.start()
  }

  async quit(): Promise<void> {
    // Call onExit on current screen
    const screen = this.screens.get(this.getRenderableInputMode(this.state.inputMode))
    if (screen?.onExit) {
      screen.onExit(this.createContext())
    }

    await this.cleanup()
    this.signalExit()
  }

  private waitForKey(): Promise<void> {
    return new Promise((resolve) => {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true)
      }
      process.stdin.resume()
      process.stdin.once("data", () => {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false)
        }
        resolve()
      })
    })
  }
}

/**
 * Launch the TUI app
 */
export async function launchTUI(cwd?: string): Promise<void> {
  const app = new TUIApp(cwd)
  await app.run()
}
