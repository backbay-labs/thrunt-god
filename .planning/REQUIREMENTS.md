# Requirements: THRUNT GOD

**Defined:** 2026-03-29
**Core Value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.

## v1.5 Requirements

Requirements for the TUI Operator Console milestone. Each maps to roadmap phases.

### Bridge & Integration

- [x] **BRIDGE-01**: TUI can execute thrunt-tools.cjs commands via subprocess and receive typed JSON results
- [x] **BRIDGE-02**: TUI handles the `@file:` large-output protocol for payloads >50KB
- [x] **BRIDGE-03**: TUI translates .planning/ file state into typed ThruntHuntContext via state adapter
- [x] **BRIDGE-04**: TUI reactively updates when .planning/ files change via fs.watch with debounce
- [x] **BRIDGE-05**: TUI provides typed domain modules for state, runtime, pack, evidence, detection, scoring, and recommend commands
- [x] **BRIDGE-06**: TUI can stream subprocess stdout for live query result display

### Hunt Screens

- [x] **HUNT-01**: Operator sees hunt status dashboard with phase, plan, progress, and blockers from STATE.md
- [x] **HUNT-02**: Operator can navigate phases from HUNTMAP and drill into plan details
- [x] **HUNT-03**: Operator can trigger query execution from the console and see results
- [x] **HUNT-04**: Operator can inspect evidence manifests and verify chain-of-custody integrity
- [x] **HUNT-05**: Operator can view detection candidates with promotion scores
- [x] **HUNT-06**: Operator can see connector configuration status and health
- [x] **HUNT-07**: Operator can browse available hunt packs and view pack details

### Verification Gates

- [x] **GATE-01**: Gate framework runs evidence integrity verification (manifest hash checks) after agent execution
- [x] **GATE-02**: Gate framework runs receipt completeness verification (query-to-receipt-to-evidence chain) after agent execution

### Rebrand & Cleanup

- [ ] **BRAND-01**: All ClawdStrike references renamed to THRUNT GOD across source and config
- [ ] **BRAND-02**: Theme and logo updated from ClawdStrike gothic to THRUNT GOD identity
- [ ] **BRAND-03**: Environment variables renamed from CLAWDSTRIKE_* to THRUNT_*
- [x] **BRAND-04**: Hushd security daemon module and all integration points removed
- [x] **BRAND-05**: Beads work graph module replaced with .planning/ state
- [x] **BRAND-06**: Speculate/voting module removed
- [x] **BRAND-07**: Desktop-agent module removed

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Differentiator Screens

- **DIFF-01**: MITRE ATT&CK heatmap rewired to detection data
- **DIFF-02**: Evidence integrity aggregate dashboard
- **DIFF-03**: Score-based pack/connector/hypothesis recommendations
- **DIFF-04**: Inline plan and summary viewer
- **DIFF-05**: Hunt telemetry dashboard with execution metrics
- **DIFF-06**: Multi-workstream switcher UI

### Ecosystem

- **ECO-01**: Live connector ecosystem (standalone npm packages)
- **ECO-02**: Analyst feedback submission from TUI
- **ECO-03**: .thrunt declarative playbook execution

## Out of Scope

| Feature | Reason |
|---------|--------|
| TUI-side .planning/ file writing | All writes must go through subprocess to respect withPlanningLock() |
| Hushd security daemon | ClawdStrike-specific; not relevant to THRUNT |
| Speculate/voting system | THRUNT orchestration handles parallelism |
| Live NATS event streaming | No supporting infrastructure in THRUNT |
| Beads work graph | Replaced by .planning/ state |
| Windows PTY support | Bun.Terminal is POSIX-only; defer to future |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BRIDGE-01 | Phase 23 | Complete |
| BRIDGE-02 | Phase 23 | Complete |
| BRIDGE-03 | Phase 23 | Complete |
| BRIDGE-04 | Phase 23 | Complete |
| BRIDGE-05 | Phase 24 | Complete |
| BRIDGE-06 | Phase 23 | Complete |
| HUNT-01 | Phase 24 | Complete |
| HUNT-02 | Phase 24 | Complete |
| HUNT-03 | Phase 25 | Complete |
| HUNT-04 | Phase 24 | Complete |
| HUNT-05 | Phase 24 | Complete |
| HUNT-06 | Phase 24 | Complete |
| HUNT-07 | Phase 24 | Complete |
| GATE-01 | Phase 25 | Complete |
| GATE-02 | Phase 25 | Complete |
| BRAND-01 | Phase 26 | Pending |
| BRAND-02 | Phase 26 | Pending |
| BRAND-03 | Phase 26 | Pending |
| BRAND-04 | Phase 26 | Complete |
| BRAND-05 | Phase 26 | Complete |
| BRAND-06 | Phase 26 | Complete |
| BRAND-07 | Phase 26 | Complete |

**Coverage:**
- v1.5 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0

---
*Requirements defined: 2026-03-29*
*Last updated: 2026-03-29 after roadmap creation*
