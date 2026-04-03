# Active Incident Workflow Design

**Version:** 1.0
**Date:** 2026-04-02
**Status:** Draft
**Depends on:** FINAL-DESIGN.md (v1 MVP features must ship first)

---

## Problem Statement

The hunter review (REVIEW-HUNTER.md) delivered a clear verdict: the THRUNT God extension is "designed for presenting, not doing a hunt." The v1 MVP -- sidebar, template viewer, diagnostics, status bar -- proves the visualization thesis but leaves hunters context-switching between the extension (viewing), the CLI (executing), and communication tools (reporting) during live incidents.

At 3am during a P1 credential-spray investigation, a hunter needs to:

1. Receive an IOC from a senior analyst and immediately see where it appears across all loaded query data
2. Copy a formatted finding summary into the war room Slack channel in one click
3. Know how much SLA time remains without checking a separate dashboard
4. Run the next hunt phase without switching to a terminal window

Each of these workflows currently requires leaving VS Code or performing manual steps that waste 2-5 minutes per occurrence. Over a 4-hour incident with 20+ such context switches, the cumulative cost is 40-100 minutes of lost investigation time.

The four features in this document close the gap between "investigation viewer" and "investigation workbench."

---

## Architecture Overview

### CLI <-> Extension <-> Webview Data Flow

```
+-----------------------------------------------------------------------+
|                            VS Code Extension Host                     |
|                                                                       |
|  +--------------+     +----------------+     +------------------+     |
|  | IOC Registry |---->| HuntDataStore  |---->| Webview Bridge   |---->|--- Webview Panels
|  | (ephemeral)  |     | (existing)     |     | (existing)       |     |    (Template Viewer,
|  +--------------+     +--------+-------+     +------------------+     |     Evidence Board,
|         ^                      |                                      |     Hunt Overview)
|         |                      v                                      |
|  +--------------+     +----------------+     +------------------+     |
|  | IOC Quick    |     | SLA Timer      |     | CLI Bridge       |     |
|  | Entry Panel  |     | Manager        |     | (new)            |     |
|  +--------------+     +--------+-------+     +--------+---------+     |
|         |                      |                      |               |
|         v                      v                      v               |
|  +--------------+     +----------------+     +------------------+     |
|  | Text Editor  |     | Status Bar     |     | Output Channel   |     |
|  | Decorations  |     | Item (existing)|     | (new dedicated)  |     |
|  | (highlights) |     +----------------+     +--------+---------+     |
|  +--------------+                                     |               |
|                                                       |               |
+-------------------------------------------------------|---------------+
                                                        |
                        +-------------------------------v---------------+
                        |            THRUNT CLI (child_process)         |
                        |                                               |
                        |  thrunt-tools.cjs <command> [args]            |
                        |    --cwd <workspace>                          |
                        |    --json (structured output)                 |
                        |    --progress (streaming, future)             |
                        |                                               |
                        |  Writes artifacts to .hunt/ filesystem        |
                        |    -> ArtifactWatcher detects changes         |
                        |      -> Store re-parses                       |
                        |        -> UI updates                          |
                        +-----------------------------------------------+
```

### New Modules (Extension Host)

| Module | File | Responsibility |
|--------|------|----------------|
| IOC Registry | `src/iocRegistry.ts` | Tracks active IOCs, matches against loaded queries, emits highlight events |
| IOC Decorations | `src/iocDecorations.ts` | TextEditorDecorationType instances for IOC highlighting in editors |
| War Room Formatter | `src/warRoomCopy.ts` | Generates paste-ready summaries from store data |
| SLA Timer | `src/slaTimer.ts` | Manages countdown timers, drives status bar updates |
| CLI Bridge | `src/cliBridge.ts` | Spawns CLI processes, streams output, handles lifecycle |

### New Shared Types

| File | Types |
|------|-------|
| `shared/ioc.ts` | `IOCEntry`, `IOCType`, `IOCMatchResult`, `IOCHighlightMessage` |
| `shared/sla.ts` | `SLATimerConfig`, `SLATimerState`, `SLAPhase` |
| `shared/cli-bridge.ts` | `CLIRunRequest`, `CLIRunProgress`, `CLIRunResult` |

---

## Feature 1: IOC Quick-Entry

### Why

During a live incident, IOCs arrive from multiple channels: a senior analyst pastes an IP in chat, a SIEM alert fires with a hash, a threat intel feed flags a domain. The hunter needs to instantly correlate each IOC against all loaded query data. Today this requires manual `Ctrl+F` across multiple open files -- a process that takes 30-60 seconds per IOC and provides no cross-query visibility.

### User Interaction Flow

**Step 1: Invoke IOC entry**

The hunter uses one of three entry points:
- Command palette: `THRUNT: Add IOC` (command ID `thrunt-god.addIoc`)
- Keyboard chord: `Ctrl+Shift+I` (suggested, not default)
- Sidebar toolbar button: `$(search)` icon in the hunt tree title bar

**Step 2: Paste IOC value**

A `vscode.window.showInputBox` appears with:
- Title: "Add IOC to Investigation"
- Prompt: "Paste an IP address, domain, hash, email, or URL"
- Placeholder: "185.220.101.42 or evil.example.com or d41d8cd98f00..."
- `ignoreFocusOut: true` (stays open when clicking elsewhere)

Validation runs on each keystroke (via `validateInput`). The extension auto-detects IOC type:

```typescript
type IOCType = 'ipv4' | 'ipv6' | 'domain' | 'md5' | 'sha1' | 'sha256' | 'email' | 'url' | 'unknown';

function classifyIOC(value: string): IOCType {
  const trimmed = value.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed)) return 'ipv4';
  if (/^[0-9a-fA-F:]{2,39}$/.test(trimmed) && trimmed.includes(':')) return 'ipv6';
  if (/^[a-fA-F0-9]{32}$/.test(trimmed)) return 'md5';
  if (/^[a-fA-F0-9]{40}$/.test(trimmed)) return 'sha1';
  if (/^[a-fA-F0-9]{64}$/.test(trimmed)) return 'sha256';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return 'email';
  if (/^https?:\/\//.test(trimmed)) return 'url';
  if (/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(trimmed)) return 'domain';
  return 'unknown';
}
```

For `unknown` type, the input box shows a validation message: "Type not recognized -- will search as plain text."

**Step 3: IOC is registered and cross-referenced**

On submission:

1. The IOC is added to the `IOCRegistry` (in-memory, not persisted to disk)
2. The registry searches all loaded queries for matches:
   - Substring match against template text (the `template` field in `DrainTemplate`)
   - Exact match against variable token values if the query has template clustering data
   - Match against entity timelines in queries (the `entityTimelines` field)
3. Match results are computed and stored:

```typescript
interface IOCEntry {
  id: string;                    // UUID v4
  value: string;                 // the raw IOC string
  type: IOCType;
  addedAt: string;               // ISO timestamp
  matchResults: IOCMatchResult[];
}

interface IOCMatchResult {
  queryId: string;
  templateId: string | null;     // null if match is in entity timeline, not a template
  matchContext: string;          // surrounding text (30 chars before/after)
  lineNumber: number | null;     // line in the QRY-*.md file, if determinable
  matchCount: number;            // occurrences in this query
}
```

**Step 4: Visual feedback**

Immediately after registration:

1. **Toast notification:** "IOC added: 185.220.101.42 (IPv4) -- found in 3 queries, 2 receipts"
   - If matches found: "Show Matches" button opens a QuickPick list of matched artifacts
   - If no matches: "No matches found in loaded queries. The IOC will be highlighted if it appears in newly loaded artifacts."

2. **Editor highlighting:** All open editors containing `.hunt/*.md` files are decorated:
   - Every occurrence of the IOC string gets a `TextEditorDecorationType` with:
     - Background: `rgba(255, 165, 0, 0.25)` (semi-transparent orange, dark theme)
     - Background: `rgba(255, 165, 0, 0.15)` (lighter for light theme)
     - Border: `1px solid rgba(255, 165, 0, 0.6)`
     - Hover message: "IOC: 185.220.101.42 (IPv4) -- added 14:32:05Z"

3. **Sidebar badges:** Query and receipt nodes that contain the IOC get a `$(search)` badge appended to their description.

4. **Webview panels:** The store fires a new event type `ioc:added` that existing webview bridges propagate. The Drain Template Viewer highlights template bars whose text or variable tokens contain the IOC.

**Step 5: Managing active IOCs**

- `THRUNT: List IOCs` (command ID `thrunt-god.listIocs`): Opens a QuickPick showing all active IOCs with match counts. Selecting one re-focuses on its matches.
- `THRUNT: Remove IOC` (command ID `thrunt-god.removeIoc`): QuickPick to select and remove. Clears all decorations for that IOC.
- `THRUNT: Clear All IOCs` (command ID `thrunt-god.clearIocs`): Removes all IOCs and decorations.

### VSCode API Surface

| API | Usage |
|-----|-------|
| `vscode.window.showInputBox` | IOC entry with validation |
| `vscode.window.createTextEditorDecorationType` | IOC highlighting in editors |
| `vscode.window.visibleTextEditors` | Apply decorations to all visible editors |
| `vscode.window.onDidChangeVisibleTextEditors` | Apply decorations when new editors open |
| `vscode.workspace.onDidChangeTextDocument` | Re-apply decorations after edits |
| `vscode.window.showInformationMessage` | Toast with match summary |
| `vscode.window.showQuickPick` | IOC list, match navigation, removal |
| `webview.postMessage` | Push IOC highlights to Drain Template Viewer |

### Data Flow

```
User pastes IOC
  -> InputBox validates & classifies
  -> IOCRegistry.add(value, type)
     -> Searches store.getQueries() for matches
        (iterates template text, variable tokens, entity timelines)
     -> Searches store.getReceipts() for matches
        (searches claim, evidence, anomaly observation text)
     -> Stores IOCEntry with IOCMatchResult[]
  -> IOCDecorations.applyAll()
     -> For each visible editor with .hunt/ file:
        Find all occurrences of IOC.value via string search
        Apply TextEditorDecorationType
  -> Store fires { type: 'ioc:added', id, value, matchResults }
     -> Sidebar refreshes badges
     -> Webview bridges send { type: 'ioc-highlight', value, matches }
        -> Template Viewer highlights matching bars/tokens
```

### State Management

| State | Storage | Lifetime |
|-------|---------|----------|
| Active IOCs (IOCEntry[]) | In-memory Map in IOCRegistry | Session only (cleared on extension deactivate) |
| IOC decoration types | In-memory, one per IOC | Session only |
| Match results | Computed on add, recomputed on store change | Derived from store |

IOCs are intentionally not persisted to disk or `workspaceState`. Incident IOCs are transient -- they change rapidly during a live investigation. Persisting them would create stale highlights on the next session. If hunters want persistent IOC tracking, they should add them to a formal threat intel artifact (future feature).

### Edge Cases

1. **Duplicate IOC:** If the same value is already registered, show info message "IOC already tracked" and navigate to existing matches.
2. **Very long IOC:** URLs can be long. Cap at 2048 characters. Reject with validation message if exceeded.
3. **IOC in unopened file:** The decoration system only decorates visible editors. When a new editor opens (`onDidChangeVisibleTextEditors`), all active IOC decorations are re-applied. The sidebar badges are always current because they derive from the match results computed at registration time.
4. **Store updates after IOC registration:** When the store fires `onDidChange` for a query or receipt, the IOC registry re-scans the changed artifact and updates match results. This handles the case where a CLI phase completes and produces new queries that contain the IOC.
5. **Performance with many IOCs:** Decoration application iterates visible editors (typically 1-3) and applies regex matches. With 20 IOCs across 3 editors, this is <10ms. The registry search at registration time iterates all queries/receipts (typically <100 artifacts) with string search -- also <10ms.

---

## Feature 2: War Room Copy

### Why

During active incidents, hunters spend 15-20% of their time formatting findings for communication channels. The workflow is: read a receipt, mentally summarize it, type a Slack message, format it, post it. This happens 10-20 times per incident. A one-click formatted copy eliminates the formatting step entirely, saving 1-2 minutes per copy.

The hunter review specifically called out: "Copy-paste for war room chat. During an active incident, I am constantly copying findings into Slack, Teams, or a ticketing system."

### User Interaction Flow

**Scenario A: Copy a single finding**

1. Hunter right-clicks a receipt node (RCT-*) in the sidebar
2. Context menu shows: "Copy Finding Summary"
3. Formatted text is placed on the clipboard
4. Toast: "Finding summary copied to clipboard"

**Scenario B: Copy hypothesis status**

1. Hunter right-clicks a hypothesis node (HYP-*) in the sidebar
2. Context menu shows: "Copy Hypothesis Summary"
3. Formatted text is placed on the clipboard

**Scenario C: Copy hunt status overview**

1. Command palette: `THRUNT: Copy War Room Summary` (command ID `thrunt-god.copyWarRoomSummary`)
2. QuickPick offers format selection:
   - "Slack/Teams (Markdown)" -- default
   - "Plain Text (email/Jira)"
   - "MITRE ATT&CK Summary"
3. Formatted text placed on clipboard

**Scenario D: Copy from editor context**

1. Hunter has a receipt file open in the editor
2. Right-clicks in the editor (or uses command palette)
3. "THRUNT: Copy Finding Summary" appears (only in RCT-*.md files)
4. Uses the currently open receipt for formatting

### Output Formats

**Finding summary (Slack/Teams markdown):**

```
**RCT-001** | Score: 5/6 (HIGH) | Supports HYP-01

OAuth consent granted to malicious app from Tor exit node (185.220.101.42).
Entity: sarah.chen@acme.corp | Source: M365 Identity | 2026-03-28T14:10:33Z

ATT&CK: T1078 (Valid Accounts), T1098 (Account Manipulation)
Query: QRY-001 (47 events, 4 templates)
```

**Finding summary (plain text):**

```
Receipt: RCT-001
Score: 5/6 (HIGH)
Verdict: Supports HYP-01
Claim: OAuth consent granted to malicious app from Tor exit node (185.220.101.42).
Entity: sarah.chen@acme.corp
Source: M365 Identity
Timestamp: 2026-03-28T14:10:33Z
ATT&CK: T1078, T1098
Related query: QRY-001 (47 events, 4 templates)
```

**Hypothesis summary (Slack/Teams markdown):**

```
**HYP-01**: OAuth consent to malicious application
Status: *Supported* (High confidence)
Evidence: RCT-001 (score 5), RCT-002 (score 5)
Key finding: OAuth consent from Tor exit to app 3fa85f64-5717-4562-b3fc-2c963f66afa6
```

**Hunt overview (Slack/Teams markdown):**

```
**THRUNT Hunt: OAuth Phishing Campaign**
Phase: 3/3 (Evidence Correlation) | Owner: @analyst

Hypotheses:
  - HYP-01: OAuth consent to malicious app -- *Supported* (2 receipts)
  - HYP-02: Email exfiltration via OAuth -- *Supported* (1 receipt)
  - HYP-03: Lateral movement via stolen token -- *Disproved*

Critical findings: 2 receipts with score >= 5
Evidence integrity: 0 errors, 0 warnings

ATT&CK coverage: T1078, T1098, T1566.002
Impacted: sarah.chen@acme.corp, james.wu@acme.corp
Time window: 2026-03-28T08:00Z - 2026-03-28T18:00Z
```

**MITRE ATT&CK summary:**

```
ATT&CK Techniques Observed:
  T1078  Valid Accounts            RCT-001 (score 5), RCT-002 (score 5)
  T1098  Account Manipulation     RCT-001 (score 5)
  T1566  Phishing                 RCT-003 (score 3)

Coverage: 3 techniques across 3 receipts
Gaps: No endpoint or network techniques observed (T1059, T1071 untested)
```

### Implementation: `src/warRoomCopy.ts`

```typescript
interface WarRoomFormatter {
  formatFinding(receipt: Receipt, store: HuntDataStore): WarRoomOutput;
  formatHypothesis(hypothesis: Hypothesis, store: HuntDataStore): WarRoomOutput;
  formatHuntOverview(store: HuntDataStore): WarRoomOutput;
  formatAttackSummary(store: HuntDataStore): WarRoomOutput;
}

interface WarRoomOutput {
  markdown: string;    // Slack/Teams-ready
  plainText: string;   // email/Jira-ready
}
```

The formatter reads data exclusively from `HuntDataStore`. It does not touch the filesystem. All formatting is string interpolation over parsed domain objects.

### VSCode API Surface

| API | Usage |
|-----|-------|
| `vscode.env.clipboard.writeText` | Place formatted text on clipboard |
| `vscode.window.showInformationMessage` | "Copied to clipboard" toast |
| `vscode.window.showQuickPick` | Format selection (markdown / plain text / ATT&CK) |
| `vscode.commands.registerCommand` | Register copy commands |
| `contributes.menus.view/item/context` | Sidebar right-click menu entries |
| `contributes.menus.editor/context` | Editor right-click menu entries |

### Data Flow

```
User triggers copy
  -> Resolve target artifact (from sidebar item, editor document, or store overview)
  -> WarRoomFormatter.format*(artifact, store)
     -> Reads receipt/hypothesis/hunt data from store
     -> Reads cross-references (related queries, hypotheses, ATT&CK mappings)
     -> Builds markdown and plain text strings
  -> vscode.env.clipboard.writeText(output.markdown or output.plainText)
  -> Toast notification
```

### State Management

War Room Copy is stateless. It reads from the store at invocation time and produces a clipboard string. No state is persisted.

The format preference (markdown vs. plain text) could be persisted in `workspaceState` as `thruntGod.warRoomFormat` so the hunter does not need to pick every time. Default: markdown.

### Edge Cases

1. **Receipt without anomaly frame:** Omit score and ATT&CK lines. Show only claim, evidence text, and related queries.
2. **No hypotheses loaded yet:** Hunt overview omits the hypotheses section and shows "Hypotheses not yet defined."
3. **Very long claim text:** Truncate at 280 characters (one Slack message line) with "..." suffix.
4. **Special characters in Slack markdown:** Escape `<`, `>`, `&`, and `*` in user-provided text to prevent Slack formatting issues.
5. **Multi-select in sidebar:** If multiple receipts are selected (VS Code TreeView supports `canSelectMany`), format each sequentially with a separator line (`---`).

---

## Feature 3: SLA Countdown Timer

### Why

SOC teams operate under SLA contracts: P1 incidents require initial triage within 30 minutes, containment within 4 hours, and a written report within 24 hours. Today, hunters track these deadlines in separate tools (ticketing systems, phone timers, wall clocks). Having the countdown visible in the VS Code status bar keeps urgency front-of-mind without context switching.

The hunter review specifically requested: "A configurable timer in the status bar ('23 min remaining') would keep urgency visible without me checking a separate tool."

### User Interaction Flow

**Step 1: Start a timer**

Three entry points:

a. **Command palette:** `THRUNT: Start SLA Timer` (command ID `thrunt-god.startSlaTimer`)
   - QuickPick: "Select SLA phase"
     - "Time to Detect (TTD)" -- default 30 minutes
     - "Time to Contain (TTC)" -- default 4 hours
     - "Time to Report (TTR)" -- default 24 hours
     - "Custom..." -- opens input box for label and duration
   - For preset phases, a second QuickPick allows duration override: "30 minutes (default)", "15 minutes", "1 hour", "Custom..."

b. **From hunt metadata:** When the extension reads `MISSION.md`, if the `## SLA` or `## Response Requirements` section contains structured SLA data, the timer auto-starts:
   ```markdown
   ## SLA
   - **TTD:** 30m (started 2026-03-28T14:00:00Z)
   - **TTC:** 4h
   - **TTR:** 24h
   ```

c. **Status bar click:** When no timer is active, clicking the THRUNT status bar item includes "Start SLA Timer" in the QuickPick options (alongside "Show Hunt Status" and "Show Info").

**Step 2: Timer runs in status bar**

The existing `HuntStatusBar` (in `src/statusBar.ts`) gains a second status bar item dedicated to SLA, positioned immediately after the hunt status item.

Display format: `$(clock) TTD: 23m 15s` (using codicon clock icon)

Color progression:
- Green: >50% time remaining
- Yellow: 25-50% remaining
- Orange: 10-25% remaining
- Red: <10% remaining
- Red pulsing (warningBackground): expired

When expired: `$(clock) TTD: EXPIRED +2m 30s` (shows overage time in red)

**Step 3: Timer transitions**

When a timer expires:
- VS Code notification: "SLA Alert: Time to Detect has expired. Elapsed: 30m 00s."
  - "Start Next Phase" button: Stops TTD, starts TTC
  - "Snooze 5m" button: Extends deadline by 5 minutes
  - "Dismiss" button: Stops the timer
- The status bar item background flashes `statusBarItem.errorBackground`

When the hunter manually advances:
- `THRUNT: Advance SLA Phase` (command ID `thrunt-god.advanceSlaPhase`): Stops current timer, starts next phase timer (TTD -> TTC -> TTR)
- The completed phase is logged in an in-memory SLA record:
  ```typescript
  interface SLARecord {
    phase: SLAPhase;
    startedAt: string;
    deadline: string;
    completedAt: string;
    overageMs: number;  // 0 if completed before deadline
  }
  ```

**Step 4: Timer management**

- `THRUNT: Pause SLA Timer` / `THRUNT: Resume SLA Timer`: Toggles pause state. Useful during shift handoffs or authorized delays. Status bar shows `$(debug-pause) TTD: PAUSED (23m 15s remaining)`.
- `THRUNT: Stop SLA Timer`: Stops and clears the timer entirely.
- `THRUNT: Show SLA Status`: Opens an information message with all SLA phases and their status (active, completed, pending).
- `THRUNT: Copy SLA Status`: Copies current SLA state to clipboard for war room posting.

### VSCode API Surface

| API | Usage |
|-----|-------|
| `vscode.window.createStatusBarItem` | Dedicated SLA timer status bar item |
| `setInterval` / `clearInterval` | 1-second tick for countdown display |
| `vscode.window.showQuickPick` | Phase selection, duration override |
| `vscode.window.showInputBox` | Custom duration entry |
| `vscode.window.showWarningMessage` | Expiration alert with action buttons |
| `vscode.commands.registerCommand` | Timer control commands |
| `vscode.workspace.getConfiguration` | Read default SLA durations from settings |
| `ExtensionContext.workspaceState` | Persist active timer across VS Code restarts |

### Implementation: `src/slaTimer.ts`

```typescript
type SLAPhase = 'ttd' | 'ttc' | 'ttr' | 'custom';

interface SLATimerConfig {
  phase: SLAPhase;
  label: string;              // "Time to Detect", "Custom: Initial Triage"
  durationMs: number;
}

interface SLATimerState {
  config: SLATimerConfig;
  startedAt: number;          // Date.now() when started
  pausedAt: number | null;    // null if running
  accumulatedPauseMs: number;
}

class SLATimerManager implements vscode.Disposable {
  private activeTimer: SLATimerState | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private completedPhases: SLARecord[] = [];
  private readonly _statusBarItem: vscode.StatusBarItem;
  private readonly _onDidChange = new vscode.EventEmitter<SLATimerState | null>();
  readonly onDidChange = this._onDidChange.event;

  // Public API: start, pause, resume, stop, advance, snooze
  // Private: tick() computes remaining = durationMs - (Date.now() - startedAt - accumulatedPauseMs)
  //          updateStatusBar() maps remaining to text + color (green >50%, yellow 25-50%, orange 10-25%, red <10%)
  //          On expiry: notifyExpiry() shows warning with "Start Next Phase" / "Snooze 5m" / "Dismiss"
  // Lifecycle: restoreFromState() on constructor, persistToState() on dispose
}
```

### Data Flow

```
User starts timer
  -> SLATimerManager.start(config)
  -> setInterval(tick, 1000)
     -> Every second: compute remaining, update status bar text + color
     -> If expired: show warning notification with action buttons
  -> Persist to workspaceState on pause, stop, advance, and dispose

Status bar click
  -> Show SLA QuickPick: Pause/Resume, Advance, Stop, Copy Status
```

### State Management

| State | Storage | Lifetime |
|-------|---------|----------|
| Active timer config + start time + pause state | `workspaceState` key `thruntGod.slaTimer` | Survives VS Code restart |
| Completed phase records | In-memory array | Session only |
| Tick interval | In-memory | Session only (re-created from persisted state on restart) |

**Persistence detail:** On extension deactivate, the timer state (start time, pause time, accumulated pause, config) is serialized to `workspaceState`. On next activation, the timer is restored with the correct elapsed time. The 1-second tick interval is re-created. This means if VS Code is closed for 10 minutes and the timer had 15 minutes remaining, it will show 5 minutes remaining on restart.

### Configuration (settings.json)

```json
{
  "thruntGod.sla.defaults": {
    "ttd": 1800000,
    "ttc": 14400000,
    "ttr": 86400000
  },
  "thruntGod.sla.autoStartFromMission": true,
  "thruntGod.sla.warningThresholdPercent": 25,
  "thruntGod.sla.criticalThresholdPercent": 10
}
```

### Edge Cases

1. **Multiple active timers:** Only one SLA timer runs at a time. Starting a new one prompts: "Timer 'TTD' is active (12m remaining). Replace it?" with "Replace" and "Cancel" buttons.
2. **System sleep/hibernate:** The timer uses wall-clock time (`Date.now()`) not interval counting. If the laptop sleeps for 20 minutes and the timer had 15 minutes left, it correctly shows as expired on wake.
3. **Timer precision:** The 1-second interval is intentionally imprecise (it can drift by up to 1 second). For SLA tracking, second-level precision is sufficient. No need for `performance.now()` or high-resolution timers.
4. **Multi-window VS Code:** If the hunter has multiple VS Code windows open in the same workspace, only one has the extension active. Timer is per-workspace, not per-window.
5. **Negative remaining after VS Code restart:** On restore, if remaining is already negative, immediately show the expiry notification with the correct overage time.

---

## Feature 4: CLI Bridge

### Why

The hunter review identified the core friction: "If I have to switch to a terminal to run phases, the extension becomes a viewer, not a workbench." The existing `thrunt-god.runThruntCli` command (in `extension.ts`, lines 622-633) already bridges basic CLI execution, but it:

1. Blocks the extension host during execution (uses `execFile` with no streaming)
2. Shows output only after completion (no live progress)
3. Does not auto-refresh the sidebar when new artifacts land (relies on file watcher, which works but gives no progress indication)
4. Has no structured error handling (shows a generic "command failed" message)

The CLI Bridge replaces this with a proper streaming execution model.

### User Interaction Flow

**Step 1: Invoke a hunt phase**

Entry points:
- Command palette: `THRUNT: Run Hunt Phase` (command ID `thrunt-god.runHuntPhase`)
- Sidebar context menu on a Phase node: "Run Phase" (only shown when `phase.status === 'planned'` or `'pending'`)
- Sidebar toolbar button: `$(play)` icon

**Step 2: Phase selection and confirmation**

If invoked from the command palette (no phase context):
- QuickPick showing all phases from the huntmap:
  ```
  Phase 1: Signal Intake         [Complete]
  Phase 2: Telemetry Collection  [Running]
  Phase 3: Evidence Correlation  [Planned]  <-- selectable
  ```
  Only phases with status `'planned'` or `'pending'` are selectable. Completed and running phases are shown but greyed out.

Confirmation dialog:
```
Run Phase 3: Evidence Correlation?
This will execute the THRUNT CLI with: hunt:run --phase 3

[Run] [Run with Options...] [Cancel]
```

"Run with Options..." opens a second QuickPick for advanced options:
- Wave targeting: "Run all waves" (default), "Wave 1 only", "Wave 2 only"
- Dry run: "Execute queries" (default), "Dry run (no queries)"
- Verbosity: "Normal output", "Verbose (--verbose)", "Debug (--debug)"

**Step 3: Execution with live progress**

The CLI Bridge spawns the CLI as a child process using `child_process.spawn` (NOT `execFile`), enabling streaming stdout/stderr.

A dedicated output channel (`THRUNT God CLI`) shows live output:

```
[14:32:05] $ node thrunt-tools.cjs runtime execute --pack oauth-phishing --phase 3 --cwd /path/to/workspace
[14:32:06] [Phase 3] Starting Evidence Correlation...
[14:32:06] [Plan 03-01] Executing 3 query targets...
[14:32:07] [QRY-001] M365 Identity: OAuth consent events... (47 events)
[14:32:12] [QRY-002] Okta System Log: Auth events... (1,189 events)
[14:32:18] [QRY-003] CrowdStrike: Process events... (0 events, empty)
[14:32:18] [Phase 3] Generating receipts...
[14:32:20] [RCT-001] Created: OAuth consent from Tor exit (score: 5)
[14:32:21] [RCT-002] Created: Credential spray detection (score: 5)
[14:32:22] [Phase 3] Complete. 3 queries, 2 receipts, 1,236 events.
[14:32:22] [THRUNT CLI] Exit code 0.
```

The status bar updates during execution:
- `$(sync~spin) THRUNT: Running Phase 3...` (spinning icon)
- Tooltip shows: "Phase 3: Evidence Correlation -- 2/3 queries complete, 1,236 events so far"

The sidebar Phase node shows `$(sync~spin)` spinning icon while the CLI is running.

**Step 4: Progress tracking**

The CLI Bridge parses structured progress lines from the CLI's stdout. The CLI already emits JSON-structured output when invoked with `--raw`. The bridge expects lines matching this format:

```typescript
interface CLIProgressLine {
  type: 'progress';
  phase: number;
  plan: string;
  queriesComplete: number;
  queriesTotal: number;
  eventsTotal: number;
  receiptsGenerated: number;
  elapsedMs: number;
}
```

If the CLI does not emit structured progress (older CLI versions or non-hunt commands), the bridge falls back to line-by-line output display without progress parsing.

**Step 5: Completion and auto-refresh**

When the CLI process exits:

- **Exit 0 (success):**
  - Output channel: `[THRUNT CLI] Command completed successfully.`
  - Toast: "Phase 3 complete: 3 queries, 2 receipts, 1,236 events" with "Open Results" button
  - "Open Results" reveals the Phase 3 node in the sidebar (expanded) so the hunter can see new artifacts
  - The ArtifactWatcher (already in place) detects new QRY-*.md and RCT-*.md files and triggers store updates. The sidebar, template viewer, and diagnostics all refresh automatically.

- **Exit non-zero (failure):**
  - Output channel: `[THRUNT CLI] Command failed (exit 1).`
  - The bridge parses stderr for known error patterns and produces diagnostics:
    - "Connector not configured" -> diagnostic on MISSION.md with quick-fix "Run Runtime Doctor"
    - "Query timeout" -> diagnostic on the specific QRY-*.md with the timeout details
    - "Authentication failed" -> diagnostic with "Check connector credentials" message
  - Toast: "Phase 3 failed. See THRUNT God CLI output for details." with "Show Output" button

**Step 6: Re-run and manual CLI commands**

- `THRUNT: Re-run Last Phase` (command ID `thrunt-god.rerunLastPhase`): Re-executes the most recent phase command. Useful after fixing a connector issue.
- `THRUNT: Run CLI Command` (command ID `thrunt-god.runThruntCli`): The existing freeform CLI command input, now using the streaming bridge instead of blocking `execFile`.

### Implementation: `src/cliBridge.ts`

```typescript
interface CLIRunRequest {
  command: string[];          // e.g. ['runtime', 'execute', '--pack', 'oauth-phishing']
  cwd: string;                // workspace root
  phase?: number;             // for progress tracking
}

interface CLIRunProgress {
  queriesComplete: number;
  queriesTotal: number;
  eventsTotal: number;
  receiptsGenerated: number;
  elapsedMs: number;
  currentQuery: string | null;
}

type CLIRunStatus = 'idle' | 'running' | 'success' | 'failed' | 'cancelled';

class CLIBridge implements vscode.Disposable {
  private activeProcess: ChildProcess | null = null;
  readonly onDidProgress: vscode.Event<CLIRunProgress>;   // fires on structured progress lines
  readonly onDidComplete: vscode.Event<{ status: CLIRunStatus; exitCode: number | null }>;
  readonly onDidOutput: vscode.Event<string>;              // fires on every stdout/stderr line

  get isRunning(): boolean { return this.activeProcess !== null; }

  /**
   * Spawn CLI via child_process.spawn (not execFile) with stdio: ['ignore', 'pipe', 'pipe'].
   * Streams stdout line-by-line to output channel. Each line is tried as JSON.parse():
   *   - If parsed with type === 'progress': emit onDidProgress
   *   - Otherwise: display as plain text
   * On close: emit onDidComplete. On error: emit onDidComplete with status 'failed'.
   * If already running: prompt user to cancel or wait.
   */
  async run(request: CLIRunRequest): Promise<{ exitCode: number | null }> { /* ... */ }

  /**
   * SIGTERM, then SIGKILL after 5 seconds if still alive.
   */
  cancel(): void { /* ... */ }

  dispose(): void { this.cancel(); /* dispose emitters */ }
}
```

### VSCode API Surface

| API | Usage |
|-----|-------|
| `child_process.spawn` | Streaming CLI execution (replaces `execFile`) |
| `vscode.window.createOutputChannel` | Dedicated CLI output channel (already exists as `THRUNT God CLI`) |
| `vscode.window.showQuickPick` | Phase selection, execution options |
| `vscode.window.showWarningMessage` | Confirmation dialog, busy warning |
| `vscode.window.showInformationMessage` | Completion toast with action buttons |
| `vscode.commands.registerCommand` | Phase run, re-run, cancel commands |
| `vscode.window.withProgress` | Progress notification (alternative to status bar for long operations) |
| `contributes.menus.view/item/context` | "Run Phase" on Phase nodes |
| `vscode.languages.createDiagnosticCollection` | CLI error diagnostics |

### Data Flow

```
User selects "Run Phase 3"
  -> CLIBridge.run({ command: ['runtime', 'execute', '--pack', ...], cwd, phase: 3 })
  -> spawn('node', ['thrunt-tools.cjs', ...])
     -> stdout lines stream to Output Channel
     -> JSON progress lines parsed -> onDidProgress fires
        -> Status bar tooltip updates with progress counts
        -> Sidebar Phase node shows spinning icon
     -> stderr lines stream to Output Channel
  -> Process exits
     -> onDidComplete fires
     -> Exit 0: toast + sidebar reveal
     -> Exit non-0: error toast + diagnostic creation
  -> ArtifactWatcher detects new .md files (independent of CLI Bridge)
     -> Store re-parses
     -> Sidebar, Template Viewer, Diagnostics all update
```

### State Management

| State | Storage | Lifetime |
|-------|---------|----------|
| Active CLI process handle | In-memory in CLIBridge | Process lifetime |
| Last run command + args | `workspaceState` key `thruntGod.lastCliCommand` (already exists) | Persisted |
| CLI output history | Output channel buffer | Session (VS Code manages) |
| Progress tracking state | In-memory, derived from stdout parsing | Process lifetime |

### Integration with Existing `runThruntCli`

The existing `runThruntCliCommand` function in `extension.ts` (lines 410-458) uses `execFileAsync` (blocking). The migration path:

1. Replace `execFileAsync` calls with `CLIBridge.run()` in the `thrunt-god.runThruntCli` command handler
2. The new `thrunt-god.runHuntPhase` command uses `CLIBridge.run()` with phase-specific arguments
3. Keep `runThruntCli` (the private helper function) for short synchronous commands like `state json` and `runtime doctor` where streaming is unnecessary
4. The `CLIBridge` becomes a singleton owned by `activate()` and passed to command handlers

### Edge Cases

1. **CLI not found:** The existing `resolveThruntCliPath` (extension.ts, lines 361-376) throws if the CLI binary is not found. The bridge catches this and shows a diagnostic: "THRUNT CLI not found. Install thrunt-god or set THRUNT_TEST_CLI_PATH."
2. **Concurrent execution:** Only one CLI process at a time. Attempting to start a second shows a warning. The `cancel()` method sends SIGTERM, waits 5 seconds, then SIGKILL.
3. **Process hangs:** If the CLI process does not exit within a configurable timeout (default 10 minutes for phase execution), the bridge shows a warning: "CLI process has been running for 10 minutes. Cancel?" with "Cancel" and "Wait" buttons.
4. **Partial artifacts:** If the CLI crashes mid-phase, some QRY-*.md files may be written but not all receipts. The ArtifactWatcher handles this correctly because it processes files independently. The sidebar shows whatever artifacts were produced before the crash.
5. **Large output volume:** The output channel has no size limit in VS Code. For CLI runs producing thousands of lines, this is fine -- VS Code's output channel is virtualised. However, the progress parser should not accumulate all stdout in memory; it processes lines as they arrive and discards them.
6. **VS Code reload during execution:** The child process is killed when the extension deactivates (via `dispose()`). On re-activation, the bridge is in `idle` state. Any partially-written artifacts from the killed process are handled by the file watcher's stability check (mtime/size check in `ArtifactWatcher`).

---

## IPC Protocol Design

The CLI Bridge uses a simple line-based JSON protocol over stdout. This is an evolution of the existing `--raw` flag that the CLI already supports.

### CLI -> Extension (stdout)

Each line is either:
- A JSON object with a `type` field (structured message)
- Plain text (unstructured log output, displayed as-is)

```typescript
// Structured messages from CLI to extension
type CLIMessage =
  | CLIProgressMessage
  | CLIArtifactCreatedMessage
  | CLIErrorMessage
  | CLICompleteMessage;

interface CLIProgressMessage {
  type: 'progress';
  phase: number;
  plan: string;                // "03-01"
  step: string;                // "executing-query" | "generating-receipt" | "validating"
  queriesComplete: number;
  queriesTotal: number;
  eventsTotal: number;
  receiptsGenerated: number;
  elapsedMs: number;
  currentQuery: string | null; // QRY ID being executed
  eta: number | null;          // estimated ms remaining, null if unknown
}

interface CLIArtifactCreatedMessage {
  type: 'artifact-created';
  artifactType: 'query' | 'receipt' | 'evidence-review' | 'findings';
  artifactId: string;          // "QRY-20260328-003"
  filePath: string;            // relative path from workspace root
  summary: string;             // "47 events, 4 templates"
}

interface CLIErrorMessage {
  type: 'error';
  code: string;                // "CONNECTOR_NOT_CONFIGURED" | "QUERY_TIMEOUT" | "AUTH_FAILED"
  message: string;
  connectorId?: string;
  queryId?: string;
  recoverable: boolean;        // true = can retry, false = fatal
}

interface CLICompleteMessage {
  type: 'complete';
  phase: number;
  queriesExecuted: number;
  receiptsGenerated: number;
  totalEvents: number;
  elapsedMs: number;
  nextPhase: number | null;    // null if this was the last phase
}
```

### Extension -> CLI (not implemented in v1)

In v1, the extension does not send messages to the CLI during execution. The CLI runs to completion. Future versions could use stdin for:
- Cancel (SIGTERM is used instead in v1)
- Parameter adjustment mid-phase
- Interactive query refinement

### Backward Compatibility

The CLI Bridge must work with CLI versions that do not emit structured progress. The parsing strategy:

1. Try `JSON.parse(line)` on each stdout line
2. If it parses and has a `type` field matching a known message type, handle it as a structured message
3. If it does not parse or has no `type` field, display it as plain text in the output channel
4. Progress tracking degrades gracefully: the status bar shows `$(sync~spin) Running...` without query counts

### Future: Bidirectional IPC

For v2, the CLI could accept structured input on stdin, enabling:
- `{ type: 'cancel' }` -- graceful cancellation with artifact cleanup
- `{ type: 'set-param', key: 'time_window.end', value: '...' }` -- adjust parameters mid-phase
- `{ type: 'skip-query', queryId: '...' }` -- skip a specific query target

This would use a JSON-lines protocol on both stdin and stdout.

---

## Package.json Contributions

New commands, menu items, and configuration added to `thrunt-god-vscode/package.json`:

### Commands

```json
[
  {
    "command": "thrunt-god.addIoc",
    "title": "THRUNT: Add IOC",
    "icon": "$(search)"
  },
  {
    "command": "thrunt-god.listIocs",
    "title": "THRUNT: List IOCs"
  },
  {
    "command": "thrunt-god.removeIoc",
    "title": "THRUNT: Remove IOC"
  },
  {
    "command": "thrunt-god.clearIocs",
    "title": "THRUNT: Clear All IOCs"
  },
  {
    "command": "thrunt-god.copyWarRoomSummary",
    "title": "THRUNT: Copy War Room Summary",
    "icon": "$(clippy)"
  },
  {
    "command": "thrunt-god.copyFindingSummary",
    "title": "THRUNT: Copy Finding Summary"
  },
  {
    "command": "thrunt-god.copyHypothesisSummary",
    "title": "THRUNT: Copy Hypothesis Summary"
  },
  {
    "command": "thrunt-god.startSlaTimer",
    "title": "THRUNT: Start SLA Timer",
    "icon": "$(clock)"
  },
  {
    "command": "thrunt-god.pauseSlaTimer",
    "title": "THRUNT: Pause SLA Timer"
  },
  {
    "command": "thrunt-god.resumeSlaTimer",
    "title": "THRUNT: Resume SLA Timer"
  },
  {
    "command": "thrunt-god.stopSlaTimer",
    "title": "THRUNT: Stop SLA Timer"
  },
  {
    "command": "thrunt-god.advanceSlaPhase",
    "title": "THRUNT: Advance SLA Phase"
  },
  {
    "command": "thrunt-god.showSlaStatus",
    "title": "THRUNT: Show SLA Status"
  },
  {
    "command": "thrunt-god.copySlaStatus",
    "title": "THRUNT: Copy SLA Status"
  },
  {
    "command": "thrunt-god.runHuntPhase",
    "title": "THRUNT: Run Hunt Phase",
    "icon": "$(play)"
  },
  {
    "command": "thrunt-god.rerunLastPhase",
    "title": "THRUNT: Re-run Last Phase"
  },
  {
    "command": "thrunt-god.cancelCliCommand",
    "title": "THRUNT: Cancel Running Command"
  }
]
```

### Context Menus

```json
{
  "view/item/context": [
    {
      "command": "thrunt-god.copyFindingSummary",
      "when": "view == thruntGod.huntTree && viewItem == receipt",
      "group": "warroom@1"
    },
    {
      "command": "thrunt-god.copyHypothesisSummary",
      "when": "view == thruntGod.huntTree && viewItem == hypothesis",
      "group": "warroom@1"
    },
    {
      "command": "thrunt-god.runHuntPhase",
      "when": "view == thruntGod.huntTree && viewItem == phase",
      "group": "execution@1"
    }
  ],
  "editor/context": [
    {
      "command": "thrunt-god.copyFindingSummary",
      "when": "resourceFilename =~ /^RCT-/",
      "group": "thrunt@1"
    },
    {
      "command": "thrunt-god.addIoc",
      "when": "editorHasSelection",
      "group": "thrunt@2"
    }
  ],
  "view/title": [
    {
      "command": "thrunt-god.addIoc",
      "when": "view == thruntGod.huntTree",
      "group": "navigation@4"
    },
    {
      "command": "thrunt-god.runHuntPhase",
      "when": "view == thruntGod.huntTree && thruntGod.huntDetected",
      "group": "navigation@5"
    }
  ]
}
```

### Configuration

```json
{
  "thruntGod.sla.defaults": {
    "type": "object",
    "default": {
      "ttd": 1800000,
      "ttc": 14400000,
      "ttr": 86400000
    },
    "description": "Default SLA durations in milliseconds"
  },
  "thruntGod.sla.autoStartFromMission": {
    "type": "boolean",
    "default": false,
    "description": "Auto-start SLA timer from MISSION.md SLA section"
  },
  "thruntGod.warRoom.defaultFormat": {
    "type": "string",
    "enum": ["markdown", "plainText", "attack"],
    "default": "markdown",
    "description": "Default War Room Copy output format"
  },
  "thruntGod.cli.timeout": {
    "type": "number",
    "default": 600000,
    "description": "CLI execution timeout in milliseconds (default 10 minutes)"
  }
}
```

---

## Phased Implementation Plan

### Phase A: War Room Copy (3 days)

**Why first:** Zero dependencies on other features. Smallest scope. Immediate value for every hunter on every incident. No new VS Code APIs beyond what the extension already uses (`clipboard`, `commands`, context menus).

**Tasks:**
1. Create `src/warRoomCopy.ts` with `WarRoomFormatter` class
2. Implement `formatFinding`, `formatHypothesis`, `formatHuntOverview`, `formatAttackSummary`
3. Register commands: `copyFindingSummary`, `copyHypothesisSummary`, `copyWarRoomSummary`
4. Add context menu entries in `package.json` for receipt and hypothesis nodes
5. Add editor context menu for RCT-*.md files
6. Unit tests for each format function (input: fixture data, output: expected strings)
7. Handle edge cases: missing anomaly frame, no hypotheses, long claim text

**Estimated effort:** 3 days (1 engineer)
**Risk:** Low. Pure string formatting over existing parsed data.

### Phase B: SLA Countdown Timer (4 days)

**Why second:** Independent of CLI integration. Uses well-understood VS Code APIs (status bar, timers). High value for SOC teams with contractual SLA requirements.

**Tasks:**
1. Create `src/slaTimer.ts` with `SLATimerManager` class
2. Implement timer lifecycle: start, pause, resume, stop, advance, snooze
3. Implement status bar rendering with color progression
4. Implement `workspaceState` persistence and restoration
5. Register commands: `startSlaTimer`, `pauseSlaTimer`, `resumeSlaTimer`, `stopSlaTimer`, `advanceSlaPhase`, `showSlaStatus`, `copySlaStatus`
6. Add SLA configuration schema to `package.json`
7. Integrate "Copy SLA Status" with War Room Formatter
8. Unit tests: timer math (remaining, overage, pause accumulation), state serialization/deserialization, color thresholds

**Estimated effort:** 4 days (1 engineer)
**Risk:** Low. Timer math is straightforward. The only tricky part is state restoration across VS Code restarts, which requires careful handling of `Date.now()` vs. persisted timestamps.

### Phase C: IOC Quick-Entry (5 days)

**Why third:** Requires new VS Code API usage (text editor decorations) that the extension has not used before. Depends on the store's query data being reliably parsed (v1 prerequisite).

**Tasks:**
1. Create `shared/ioc.ts` with IOC type definitions
2. Create `src/iocRegistry.ts` with IOC storage, classification, and matching
3. Create `src/iocDecorations.ts` with decoration type management and application
4. Implement IOC matching against query templates, variable tokens, entity timelines, and receipt text
5. Register commands: `addIoc`, `listIocs`, `removeIoc`, `clearIocs`
6. Wire `onDidChangeVisibleTextEditors` and `onDidChangeTextDocument` for decoration lifecycle
7. Add IOC event to store change protocol for webview propagation
8. Update Drain Template Viewer webview to handle `ioc-highlight` messages
9. Add sidebar badge updates for IOC-matched artifacts
10. Unit tests: IOC classification (each type), matching logic, decoration application
11. Integration test: add IOC, verify decorations appear in a QRY-*.md editor

**Estimated effort:** 5 days (1 engineer)
**Risk:** Medium. Text editor decorations are a well-documented API but require careful lifecycle management (decorations must be re-applied when editors open/close, and disposed when IOCs are removed). The matching logic must handle variable token extraction from template clustering JSON, which requires understanding the specific JSON structure in QRY-*.md files.

### Phase D: CLI Bridge (7 days)

**Why last:** Highest complexity. Requires child process management with streaming, structured output parsing, and integration with the existing artifact watcher pipeline. Also depends on CLI support for structured progress output (which may require CLI-side changes).

**Tasks:**
1. Create `shared/cli-bridge.ts` with IPC message type definitions
2. Create `src/cliBridge.ts` with `CLIBridge` class using `child_process.spawn`
3. Implement streaming stdout/stderr parsing with structured message detection
4. Implement progress tracking and status bar integration
5. Register commands: `runHuntPhase`, `rerunLastPhase`, `cancelCliCommand`
6. Add phase selection QuickPick with execution options
7. Wire completion handler to show toast with "Open Results" action
8. Implement error-to-diagnostic mapping for known CLI error codes
9. Migrate existing `runThruntCliCommand` to use CLIBridge for long-running commands
10. Add context menu "Run Phase" on Phase nodes in sidebar
11. Add timeout handling with user notification
12. Add CLI configuration schema to `package.json`
13. Unit tests: progress line parsing, error mapping, command argument construction
14. Integration test: spawn CLI in test mode, verify output channel receives lines
15. E2E test: run a phase against fixture data, verify sidebar updates

**Estimated effort:** 7 days (1 engineer)
**Risk:** High.
- The CLI must emit structured progress messages for the bridge to show live progress. If the CLI does not support this yet, the bridge degrades to unstructured output display (acceptable but less useful). CLI-side changes may be needed.
- Child process lifecycle management is error-prone: zombie processes, signal handling on Windows, and encoding issues with non-UTF-8 output.
- The interaction between the CLI Bridge (which knows a phase is running) and the ArtifactWatcher (which independently detects new files) must be coordinated to avoid duplicate notifications.

### Total Estimated Effort

| Phase | Feature | Days | Risk |
|-------|---------|------|------|
| A | War Room Copy | 3 | Low |
| B | SLA Countdown Timer | 4 | Low |
| C | IOC Quick-Entry | 5 | Medium |
| D | CLI Bridge | 7 | High |
| **Total** | | **19 days** | |

With one engineer, this is approximately 4 weeks of implementation. With two engineers working in parallel (A+B, then C+D), this compresses to approximately 2.5 weeks.

---

## Dependencies and Risks

### Dependencies

| Feature | Depends On | Nature |
|---------|-----------|--------|
| All features | v1 MVP (sidebar, store, parsers, watcher) | Hard dependency. Store APIs and artifact types must be stable. |
| IOC Quick-Entry | Drain Template Viewer webview | Soft dependency. IOC highlighting in the viewer requires a new webview message type. The IOC feature works without the viewer (editor decorations still function). |
| CLI Bridge | THRUNT CLI binary | Hard dependency. The CLI must be installed and locatable via `resolveThruntCliPath`. |
| CLI Bridge (structured progress) | CLI support for `--progress` flag | Soft dependency. Bridge works without structured progress (degrades to plain output). |
| War Room Copy (ATT&CK summary) | Receipt anomaly frame with `attackMapping` field | Soft dependency. If no ATT&CK mappings exist, the ATT&CK summary format is empty. |
| SLA Timer (auto-start from mission) | MISSION.md `## SLA` section parsing | Soft dependency. Mission parser does not currently extract SLA data. Requires a parser extension. |

### Risks

1. **CLI output format stability:** The CLI Bridge depends on the CLI's stdout format for progress parsing. If the CLI changes its output format, the bridge's `parseProgress` method breaks silently (falls back to unstructured display). Mitigation: version-tag the progress protocol (`"protocol": "thrunt-progress-v1"`).

2. **Decoration performance on large files:** QRY-*.md files with 10,000+ event references could have hundreds of IOC matches. VS Code's decoration API handles this well for up to ~10,000 decorations per editor, but we should add a cap (max 500 decorations per IOC per editor) with a banner: "Showing first 500 matches. Use Ctrl+F for exhaustive search."

3. **SLA timer drift:** JavaScript's `setInterval` is not guaranteed to fire exactly every 1000ms. Over a 4-hour incident, cumulative drift could reach several seconds. Since the timer uses `Date.now()` for elapsed-time calculation (not interval counting), this is cosmetic only -- the displayed time is always correct, just the update frequency may vary.

4. **Extension activation time:** Four new subsystems (IOC registry, SLA timer, war room formatter, CLI bridge) add to `activate()` time. Each is lightweight (no async initialization, no file I/O on startup), so the impact should be <5ms total. The IOC registry and SLA timer restore from `workspaceState`, which is synchronous.

5. **Context value conflicts:** The new context menu entries use `viewItem` conditions (`receipt`, `hypothesis`, `phase`). These must match the `contextValue` strings already assigned in `sidebar.ts`. Currently, sidebar nodes use `contextValue: 'huntTreeItem'` for all nodes and specific values for typed nodes (see `HuntTreeItem` constructor). The new menus need `viewItem == receipt`, `viewItem == hypothesis`, and `viewItem == phase` -- these must be set correctly in the sidebar's tree item construction.

6. **Multi-workspace compatibility:** The SLA timer and IOC registry are per-workspace (tied to `workspaceState`). If a hunter opens multiple workspaces in separate windows, each has independent state. This is the correct behavior but should be documented.

---

## Testing Strategy

### Unit Tests

| Module | Test File | Key Test Cases |
|--------|-----------|----------------|
| IOC Classification | `test/unit/iocRegistry.test.cjs` | IPv4, IPv6, MD5, SHA1, SHA256, email, URL, domain, unknown; edge cases (localhost, internal IPs, punycode domains) |
| IOC Matching | `test/unit/iocRegistry.test.cjs` | Match in template text, match in variable tokens, match in entity timeline, no match, partial match, case sensitivity |
| War Room Formatter | `test/unit/warRoomCopy.test.cjs` | Each format function with fixture receipts/hypotheses; missing fields; special character escaping; truncation |
| SLA Timer Math | `test/unit/slaTimer.test.cjs` | Remaining time calculation; pause/resume accumulation; overage calculation; color threshold mapping; state serialization roundtrip |
| CLI Progress Parsing | `test/unit/cliBridge.test.cjs` | Valid progress JSON; malformed JSON; plain text lines; mixed output; error message parsing |

### Integration Tests

| Test | Description |
|------|-------------|
| IOC + Template Viewer | Add IOC, open template viewer, verify highlight message received |
| CLI Bridge + Watcher | Run CLI command, verify new artifacts appear in store |
| SLA + War Room | Start timer, copy SLA status, verify clipboard content |

### E2E Tests (VS Code Test Runner)

| Test | Description |
|------|-------------|
| IOC workflow | Invoke `addIoc` command, enter value, verify decorations in editor |
| Copy finding | Right-click receipt in sidebar, verify clipboard |
| Run phase | Invoke `runHuntPhase`, select phase, verify output channel |

---

## Relationship to Existing Code

### Files Modified

| File | Changes |
|------|---------|
| `src/extension.ts` | Import new modules; register new commands in `activate()`; pass `CLIBridge` instance to command handlers; migrate `runThruntCliCommand` |
| `src/statusBar.ts` | Extend to show SLA timer item (or keep SLA as separate item managed by `slaTimer.ts`) |
| `src/sidebar.ts` | Add IOC badge support to `buildQueryNode` and `buildReceiptNode`; add `contextValue` for `phase`, `hypothesis`, `receipt` nodes if not already set |
| `src/store.ts` | Add `ioc:added` event type to `ArtifactChangeEvent`; add method to search artifact text for a substring |
| `src/types.ts` | Add `IOCEntry`, `IOCMatchResult` types (or import from `shared/ioc.ts`) |
| `src/drainViewer.ts` | Handle `ioc-highlight` webview message; highlight template bars containing IOC |
| `package.json` | Add new commands, menu items, configuration, activation events |

### Files Created

| File | Purpose |
|------|---------|
| `src/iocRegistry.ts` | IOC storage, classification, matching |
| `src/iocDecorations.ts` | Text editor decoration lifecycle |
| `src/warRoomCopy.ts` | Format findings for clipboard |
| `src/slaTimer.ts` | SLA countdown timer manager |
| `src/cliBridge.ts` | Streaming CLI process bridge |
| `shared/ioc.ts` | IOC type definitions |
| `shared/sla.ts` | SLA type definitions |
| `shared/cli-bridge.ts` | CLI bridge message types |
| `test/unit/iocRegistry.test.cjs` | IOC tests |
| `test/unit/warRoomCopy.test.cjs` | War Room Copy tests |
| `test/unit/slaTimer.test.cjs` | SLA timer tests |
| `test/unit/cliBridge.test.cjs` | CLI bridge tests |

### Patterns Followed

All new modules follow existing patterns in the codebase:

- **Disposable pattern:** Every new class implements `vscode.Disposable` and registers subscriptions via `context.subscriptions.push()` (see `statusBar.ts`, `diagnostics.ts`)
- **Store subscription:** New modules that need reactive updates subscribe to `store.onDidChange` (see `HuntStatusBar`, `EvidenceIntegrityDiagnostics`)
- **Event emitters:** New modules expose events via `vscode.EventEmitter` (see `HuntDataStore._onDidChange`, `ArtifactWatcher._onDidChange`)
- **Command registration:** Commands registered in `activate()` with `vscode.commands.registerCommand` (see extension.ts pattern throughout)
- **Test structure:** Unit tests in `test/unit/*.test.cjs` using Node.js built-in test runner with VS Code mock from `test/_setup/vscode-mock.cjs`
- **CLI resolution:** Reuses `resolveThruntCliPath` from `extension.ts`
- **Output channel:** Reuses the existing `THRUNT God CLI` output channel for CLI bridge output
