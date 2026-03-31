/**
 * TUI Types - Core type definitions for the screen-based architecture.
 */

import type { ThemeColors } from "./theme"
import type { HealthSummary } from "../health"
import type { DetectionResult } from "../config"
import type { ThruntHuntContext } from "../thrunt-bridge/types"
import type { EvidenceAuditResult } from "../thrunt-bridge/evidence"
import type { DetectionCandidate } from "../thrunt-bridge/detection"
import type { PackListEntry, PackShowResult } from "../thrunt-bridge/pack"
import type { ConnectorEntry, RuntimeDoctorResult } from "../thrunt-bridge/connector"
import type { HuntmapAnalysis, HuntmapPhaseDetail } from "../thrunt-bridge/huntmap"
import type {
  TimelineEvent,
  Alert,
  ScanPathResult,
  ScanDiff,
  HuntReport,
  WatchStats,
  RuleCondition,
} from "../hunt/types"
import type { ListViewport } from "./components/scrollable-list"
import type { TreeViewport } from "./components/tree-view"
import type { FormState } from "./components/form"
import type { LogState } from "./components/streaming-log"
import type { GridSelection } from "./components/grid"
import type { ReportHistoryEntry } from "./report-export"
import type { ExternalRunState, ExternalTerminalAdapterOption } from "./external/types"
import type { SearchResult as HomeSearchResult } from "./search"
import type { AgentBridgeEvent } from "./agent-bridge"

// =============================================================================
// SCREEN SYSTEM
// =============================================================================

/**
 * Context passed to every screen method.
 * Provides access to shared state, dimensions, and theme.
 */
export interface ScreenContext {
  state: AppState
  width: number
  height: number
  theme: ThemeColors
  /** Reference to the app for triggering actions */
  app: AppController
}

/**
 * Screen interface - each screen implements render + input handling.
 */
export interface Screen {
  /** Render the screen content as a single string */
  render(ctx: ScreenContext): string
  /** Handle a keypress. Return true if the key was consumed. */
  handleInput(key: string, ctx: ScreenContext): boolean
  /** Called when this screen becomes active */
  onEnter?(ctx: ScreenContext): void
  /** Called when this screen is being left */
  onExit?(ctx: ScreenContext): void
}

/**
 * Minimal interface for screens to call back into the app.
 */
export interface AppController {
  /** Navigate to a different screen */
  setScreen(mode: InputMode): void
  /** Launch the current dispatch sheet selection. Legacy transition plumbing outside the supported TUI surface graph. */
  launchDispatchSheet(): void
  /** Close the dispatch confirmation sheet */
  closeDispatchSheet(): void
  /** Open a managed run in the run-detail surface */
  openRun(runId: string): void
  /** Open the attach confirmation for a run */
  beginAttachRun(runId: string): void
  /** Confirm attach for the pending run */
  confirmAttachRun(): void
  /** Cancel the pending attach confirmation */
  cancelAttachRun(): void
  /** Load available external terminal adapters for a run */
  beginExternalRun(runId: string): void
  /** Confirm external execution for the pending run */
  confirmExternalRun(): void
  /** Cancel the pending external execution sheet */
  cancelExternalRun(): void
  /** Fall back to another launch mode for a staged run */
  launchRunInMode(runId: string, mode: "managed" | "attach" | "external"): void
  /** Relaunch a completed managed run in another interactive mode */
  relaunchRunInMode(runId: string, mode: "attach" | "external"): void
  /** Mark a managed run as canceled from the TUI */
  cancelRun(runId: string): void
  /** Trigger a re-render */
  render(): void
  /** Run healthcheck */
  runHealthcheck(): void
  /** Submit a prompt */
  submitPrompt(action: "dispatch" | "speculate"): void
  /** Run quality gates */
  runGates(): void
  /** Show the managed runs surface. Legacy transition plumbing outside the supported TUI surface graph. */
  showRuns(): void
  /** Show help (exits TUI) */
  showHelp(): void
  /** Quit the app */
  quit(): void
  /** Get CWD */
  getCwd(): string
  /** Copy text to the system clipboard when available */
  copyText?(text: string, label?: string): Promise<boolean>
  /** Refresh the home search results */
  refreshHomeSearch?(force?: boolean): void
  /** Open the currently selected home search result */
  openSelectedHomeSearchResult?(): void
  /** Copy the currently selected home search result */
  copySelectedHomeSearchResult?(): void
  /** Send raw input to the embedded interactive PTY */
  interactiveSendInput?(input: string): void
  /** Send the staged task into the embedded interactive PTY */
  interactiveSendStagedTask?(): void
  /** Update the staged task text */
  interactiveUpdateStagedTask?(text: string): void
  /** Switch the embedded interactive focus target */
  interactiveSetFocus?(focus: InteractiveSurfaceFocus): void
  /** Toggle the embedded interactive controls overlay */
  interactiveToggleControls?(): void
  /** Return from the embedded interactive surface to run detail */
  interactiveReturnToRunDetail?(): void
  /** Cancel the embedded interactive session */
  interactiveCancelSession?(): void
  /** Scroll the embedded interactive viewport */
  interactiveScrollViewport?(delta: number): void
}

// =============================================================================
// COMMANDS
// =============================================================================

export interface Command {
  key: string
  label: string
  description: string
  stage?: ScreenStage
  action: () => Promise<void> | void
}

// =============================================================================
// INPUT MODES
// =============================================================================

export type SupportedInputMode =
  | "main"
  | "commands"
  | "integrations"
  | "security"
  | "audit"
  | "policy"
  | "setup"
  // Hunt screens
  | "hunt-watch"
  | "hunt-scan"
  | "hunt-timeline"
  | "hunt-rule-builder"
  | "hunt-query"
  | "hunt-diff"
  | "hunt-report"
  | "hunt-report-history"
  | "hunt-mitre"
  | "hunt-playbook"
  // THRUNT observation screens
  | "hunt-phases"
  | "hunt-evidence"
  | "hunt-detections"
  | "hunt-packs"
  | "hunt-connectors"

export type LegacyInputMode =
  | "dispatch-sheet"
  | "runs"
  | "interactive-run"
  | "run-detail"
  | "result"

export type InputMode = SupportedInputMode | LegacyInputMode

export const LEGACY_INPUT_MODES = [
  "dispatch-sheet",
  "runs",
  "interactive-run",
  "run-detail",
  "result",
] as const satisfies readonly LegacyInputMode[]

export function isLegacyInputMode(mode: InputMode): mode is LegacyInputMode {
  return LEGACY_INPUT_MODES.includes(mode as LegacyInputMode)
}

export function toSupportedInputMode(mode: InputMode): SupportedInputMode {
  return isLegacyInputMode(mode) ? "main" : mode
}

export type ScreenStage = "supported" | "experimental"
export type HomeFocus = "prompt" | "results" | "actions" | "nav"

// =============================================================================
// DISPATCH RESULT
// =============================================================================

export type DispatchExecutionMode = "managed" | "attach" | "external"

export type RunPhase =
  | "draft"
  | "launching"
  | "routing"
  | "executing"
  | "verifying"
  | "review_ready"
  | "completed"
  | "failed"
  | "canceled"

export type RunAttachState = "detached" | "attaching" | "attached" | "returning"
export type InteractiveSurfacePhase =
  | "connecting"
  | "ready"
  | "awaiting_first_input"
  | "running"
  | "returning"
  | "failed"
export type InteractiveSurfaceFocus = "pty" | "controls" | "staged_task"
export type InteractiveSurfaceKind = "none" | "embedded" | "tmux" | "external"

export interface RunEvent {
  timestamp: string
  kind: "status" | "log" | "warning" | "error"
  message: string
}

export interface RunRecord {
  id: string
  title: string
  prompt: string
  action: "dispatch" | "speculate"
  agentId: string
  agentLabel: string
  mode: DispatchExecutionMode
  phase: RunPhase
  createdAt: string
  updatedAt: string
  workcellId: string | null
  worktreePath: string | null
  routing: DispatchResultInfo["routing"] | null
  execution: DispatchResultInfo["execution"] | null
  verification: DispatchResultInfo["verification"] | null
  result: DispatchResultInfo | null
  error: string | null
  completedAt: string | null
  attached: boolean
  attachState: RunAttachState
  ptySessionId: string | null
  canAttach: boolean
  interactiveSessionId: string | null
  interactiveSurface: InteractiveSurfaceKind
  interactivePhase: InteractiveSurfacePhase | null
  external: ExternalRunState
  ptyTail: string[]
  events: RunEvent[]
}

export type RunListFilter = "active" | "review_ready" | "all"

export interface RunListState {
  entries: RunRecord[]
  selectedRunId: string | null
  filter: RunListFilter
  list: ListViewport
}

export interface DispatchSheetState {
  open: boolean
  prompt: string
  action: "dispatch" | "speculate"
  mode: DispatchExecutionMode
  agentIndex: number
  focusedField: 0 | 1 | 2 | 3
  error: string | null
}

export interface ExternalExecutionSheetState {
  runId: string | null
  adapters: ExternalTerminalAdapterOption[]
  selectedIndex: number
  loading: boolean
  error: string | null
}

export interface InteractiveViewportState {
  cols: number
  rows: number
  scrollOffset: number
  autoFollow: boolean
}

export interface InteractiveSessionState {
  runId: string | null
  sessionId: string | null
  toolchain: string | null
  focus: InteractiveSurfaceFocus
  returnFocus: InteractiveSurfaceFocus
  phase: InteractiveSurfacePhase
  launchConsumesPrompt: boolean
  stagedTask: {
    text: string
    sent: boolean
    editable: boolean
  }
  viewport: InteractiveViewportState
  scrollback: string[]
  activityLines: string[]
  lastOutputAt: string | null
  lastHeartbeatAt: string | null
  error: string | null
}

export interface DispatchResultInfo {
  success: boolean
  taskId: string
  agent: string
  action: "dispatch" | "speculate"
  routing?: { toolchain: string; strategy: string; gates: string[] }
  execution?: {
    success: boolean
    error?: string
    model?: string
    tokens?: { input: number; output: number }
    cost?: number
  }
  verification?: {
    allPassed: boolean
    criticalPassed: boolean
    score: number
    summary: string
    results: Array<{ gate: string; passed: boolean }>
  }
  error?: string
  duration: number
}

export interface RuntimeInfo {
  source: "override" | "installed-bundle" | "embedded-bundle" | "repo-source" | "direct"
  scriptPath: string | null
  bunVersion: string | null
}


// =============================================================================
// HUNT STATE
// =============================================================================

export interface HuntWatchState {
  log: LogState
  running: boolean
  filter: "all" | "allow" | "deny" | "audit"
  stats: WatchStats | null
  lastAlert: Alert | null
  error: string | null
  alertFadeTimer: ReturnType<typeof setTimeout> | null
}

export interface HuntScanState {
  results: ScanPathResult[]
  tree: TreeViewport
  loading: boolean
  error: string | null
  selectedDetail: string | null
}

export interface HuntTimelineState {
  events: TimelineEvent[]
  list: ListViewport
  expandedIndex: number | null
  sourceFilters: { tetragon: boolean; hubble: boolean; receipt: boolean; spine: boolean }
  loading: boolean
  error: string | null
}

export interface HuntRuleBuilderState {
  form: FormState
  conditions: RuleCondition[]
  conditionList: ListViewport
  dryRunResults: Alert[]
  dryRunning: boolean
  saving: boolean
  error: string | null
  statusMessage: string | null
}

export interface HuntQueryState {
  mode: "nl" | "structured"
  nlInput: string
  structuredForm: FormState
  results: TimelineEvent[]
  resultList: ListViewport
  loading: boolean
  error: string | null
}

export interface HuntDiffState {
  current: ScanPathResult[]
  previous: ScanPathResult[]
  diff: ScanDiff | null
  list: ListViewport
  expandedServer: string | null
  loading: boolean
  error: string | null
}

export interface HuntReportState {
  report: HuntReport | null
  list: ListViewport
  expandedEvidence: number | null
  error: string | null
  statusMessage: string | null
  returnScreen: InputMode
}

export interface HuntReportHistoryState {
  entries: ReportHistoryEntry[]
  list: ListViewport
  loading: boolean
  error: string | null
  statusMessage: string | null
}

export interface HuntInvestigationState {
  origin: "watch" | "scan" | "timeline" | "query" | "report" | null
  title: string
  summary: string | null
  query: string | null
  events: TimelineEvent[]
  findings: string[]
  updatedAt: string | null
}

export interface HuntMitreState {
  grid: GridSelection
  matrix: number[][]
  tactics: string[]
  techniques: string[]
  events: TimelineEvent[]
  drilldownEvents: TimelineEvent[]
  drilldownList: ListViewport
  loading: boolean
  error: string | null
}

export interface HuntPlaybookState {
  steps: import("../hunt/types").PlaybookStep[]
  selectedStep: number
  detailList: ListViewport
  running: boolean
  error: string | null
  report: HuntReport | null
}

// =============================================================================
// THRUNT OBSERVATION SCREEN STATE
// =============================================================================

export interface ThruntPhasesState {
  analysis: HuntmapAnalysis | null
  selectedPhaseIndex: number
  phaseDetail: HuntmapPhaseDetail | null
  detailLoading: boolean
  list: ListViewport
  loading: boolean
  error: string | null
}

export interface ThruntEvidenceState {
  results: EvidenceAuditResult[]
  tree: TreeViewport
  loading: boolean
  error: string | null
}

export interface ThruntDetectionsState {
  candidates: DetectionCandidate[]
  list: ListViewport
  loading: boolean
  error: string | null
}

export interface ThruntPacksState {
  packs: PackListEntry[]
  selectedPackDetail: PackShowResult | null
  tree: TreeViewport
  detailLoading: boolean
  loading: boolean
  error: string | null
}

export interface ThruntConnectorsState {
  connectors: ConnectorEntry[]
  doctor: RuntimeDoctorResult | null
  list: ListViewport
  loading: boolean
  error: string | null
}

export interface ThruntGateResults {
  results: Array<{ gate: string; passed: boolean; output: string; diagnostics?: Array<{ severity: string; message: string; file?: string }> }>
  allPassed: boolean
  score: number
  ranAt: string
}

export interface ThruntExecutionState {
  running: boolean
  connector: string | null
  query: string | null
  log: LogState
  error: string | null
  completedAt: string | null
}

export interface HuntState {
  investigation: HuntInvestigationState
  watch: HuntWatchState
  scan: HuntScanState
  timeline: HuntTimelineState
  ruleBuilder: HuntRuleBuilderState
  query: HuntQueryState
  diff: HuntDiffState
  report: HuntReportState
  reportHistory: HuntReportHistoryState
  mitre: HuntMitreState
  playbook: HuntPlaybookState
}

export interface HomeSearchState {
  results: HomeSearchResult[]
  selectedIndex: number
  loading: boolean
  hydrated: boolean
  error: string | null
  lastCopiedId: string | null
  copiedAt: string | null
}

export interface AgentActivityState {
  events: AgentBridgeEvent[]
  updatedAt: string | null
  error: string | null
}

// =============================================================================
// APP STATE
// =============================================================================

export interface AppState {
  // Input
  promptBuffer: string
  agentIndex: number
  homeActionIndex: number
  homeFocus: HomeFocus
  homePromptTraceStartFrame: number
  homeActionsTraceStartFrame: number

  // UI mode
  inputMode: InputMode
  commandIndex: number

  // Status
  statusMessage: string
  isRunning: boolean
  activeRuns: number
  lastRefresh: Date

  // Health
  health: HealthSummary | null
  healthChecking: boolean

  // Animation
  animationFrame: number

  // Runtime
  runtimeInfo: RuntimeInfo | null

  // Dispatch sheet and managed runs
  dispatchSheet: DispatchSheetState
  externalSheet: ExternalExecutionSheetState
  runs: RunListState
  interactiveSession: InteractiveSessionState
  activeRunId: string | null
  pendingAttachRunId: string | null
  attachedRunId: string | null
  ptyHandoffActive: boolean
  runDetailEvents: ListViewport

  // Last dispatch result
  lastResult: DispatchResultInfo | null

  // Setup wizard
  setupDetection: DetectionResult | null
  setupStep: "detecting" | "review" | "done"
  setupSandboxIndex: number

  // Hunt
  hunt: HuntState
  homeSearch: HomeSearchState
  agentActivity: AgentActivityState

  // THRUNT bridge state
  thruntContext: ThruntHuntContext | null
  thruntPhases: ThruntPhasesState
  thruntEvidence: ThruntEvidenceState
  thruntDetections: ThruntDetectionsState
  thruntPacks: ThruntPacksState
  thruntConnectors: ThruntConnectorsState

  // THRUNT execution and verification
  thruntGateResults: ThruntGateResults | null
  thruntExecution: ThruntExecutionState
}

// =============================================================================
// FACTORY
// =============================================================================

export function createInitialHuntState(): HuntState {
  return {
    investigation: {
      origin: null,
      title: "",
      summary: null,
      query: null,
      events: [],
      findings: [],
      updatedAt: null,
    },
    watch: {
      log: { lines: [], maxLines: 1000, viewport: 0, paused: false },
      running: false,
      filter: "all",
      stats: null,
      lastAlert: null,
      error: null,
      alertFadeTimer: null,
    },
    scan: {
      results: [],
      tree: { offset: 0, selected: 0, expandedKeys: new Set() },
      loading: false,
      error: null,
      selectedDetail: null,
    },
    timeline: {
      events: [],
      list: { offset: 0, selected: 0 },
      expandedIndex: null,
      sourceFilters: { tetragon: true, hubble: true, receipt: true, spine: true },
      loading: false,
      error: null,
    },
    ruleBuilder: {
      form: {
        fields: [
          { type: "text", label: "Name", value: "", placeholder: "rule-name" },
          { type: "select", label: "Severity", options: ["low", "medium", "high", "critical"], selectedIndex: 1 },
          { type: "text", label: "Window (s)", value: "300", placeholder: "300" },
          { type: "text", label: "Description", value: "", placeholder: "Rule description" },
        ],
        focusedIndex: 0,
      },
      conditions: [],
      conditionList: { offset: 0, selected: 0 },
      dryRunResults: [],
      dryRunning: false,
      saving: false,
      error: null,
      statusMessage: null,
    },
    query: {
      mode: "nl",
      nlInput: "",
      structuredForm: {
        fields: [
          { type: "select", label: "Source", options: ["any", "tetragon", "hubble", "receipt", "spine"], selectedIndex: 0 },
          { type: "select", label: "Verdict", options: ["any", "allow", "deny", "audit"], selectedIndex: 0 },
          { type: "text", label: "Since", value: "", placeholder: "1h, 24h, 7d" },
          { type: "text", label: "Limit", value: "50", placeholder: "50" },
        ],
        focusedIndex: 0,
      },
      results: [],
      resultList: { offset: 0, selected: 0 },
      loading: false,
      error: null,
    },
    diff: {
      current: [],
      previous: [],
      diff: null,
      list: { offset: 0, selected: 0 },
      expandedServer: null,
      loading: false,
      error: null,
    },
    report: {
      report: null,
      list: { offset: 0, selected: 0 },
      expandedEvidence: null,
      error: null,
      statusMessage: null,
      returnScreen: "main",
    },
    reportHistory: {
      entries: [],
      list: { offset: 0, selected: 0 },
      loading: false,
      error: null,
      statusMessage: null,
    },
    mitre: {
      grid: { row: 0, col: 0 },
      matrix: [],
      tactics: [],
      techniques: [],
      events: [],
      drilldownEvents: [],
      drilldownList: { offset: 0, selected: 0 },
      loading: false,
      error: null,
    },
    playbook: {
      steps: [],
      selectedStep: 0,
      detailList: { offset: 0, selected: 0 },
      running: false,
      error: null,
      report: null,
    },
  }
}

export function createInitialHomeSearchState(): HomeSearchState {
  return {
    results: [],
    selectedIndex: 0,
    loading: false,
    hydrated: false,
    error: null,
    lastCopiedId: null,
    copiedAt: null,
  }
}

export function createInitialAgentActivityState(): AgentActivityState {
  return {
    events: [],
    updatedAt: null,
    error: null,
  }
}

export function createInitialDispatchSheetState(): DispatchSheetState {
  return {
    open: false,
    prompt: "",
    action: "dispatch",
    mode: "managed",
    agentIndex: 0,
    focusedField: 0,
    error: null,
  }
}

export function createInitialExternalExecutionSheetState(): ExternalExecutionSheetState {
  return {
    runId: null,
    adapters: [],
    selectedIndex: 0,
    loading: false,
    error: null,
  }
}

export function createInitialInteractiveSessionState(): InteractiveSessionState {
  return {
    runId: null,
    sessionId: null,
    toolchain: null,
    focus: "staged_task",
    returnFocus: "pty",
    phase: "connecting",
    launchConsumesPrompt: false,
    stagedTask: {
      text: "",
      sent: false,
      editable: true,
    },
    viewport: {
      cols: 0,
      rows: 0,
      scrollOffset: 0,
      autoFollow: true,
    },
    scrollback: [],
    activityLines: [],
    lastOutputAt: null,
    lastHeartbeatAt: null,
    error: null,
  }
}

export function createInitialRunListState(): RunListState {
  return {
    entries: [],
    selectedRunId: null,
    filter: "active",
    list: { offset: 0, selected: 0 },
  }
}

export function createInitialThruntPhasesState(): ThruntPhasesState {
  return {
    analysis: null,
    selectedPhaseIndex: 0,
    phaseDetail: null,
    detailLoading: false,
    list: { offset: 0, selected: 0 },
    loading: false,
    error: null,
  }
}

export function createInitialThruntEvidenceState(): ThruntEvidenceState {
  return {
    results: [],
    tree: { offset: 0, selected: 0, expandedKeys: new Set() },
    loading: false,
    error: null,
  }
}

export function createInitialThruntDetectionsState(): ThruntDetectionsState {
  return {
    candidates: [],
    list: { offset: 0, selected: 0 },
    loading: false,
    error: null,
  }
}

export function createInitialThruntPacksState(): ThruntPacksState {
  return {
    packs: [],
    selectedPackDetail: null,
    tree: { offset: 0, selected: 0, expandedKeys: new Set() },
    detailLoading: false,
    loading: false,
    error: null,
  }
}

export function createInitialThruntConnectorsState(): ThruntConnectorsState {
  return {
    connectors: [],
    doctor: null,
    list: { offset: 0, selected: 0 },
    loading: false,
    error: null,
  }
}

export function createInitialThruntExecutionState(): ThruntExecutionState {
  return {
    running: false,
    connector: null,
    query: null,
    log: { lines: [], maxLines: 1000, viewport: 0, paused: false },
    error: null,
    completedAt: null,
  }
}
