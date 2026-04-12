---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Obsidian Knowledge Weapon
current_plan: null
status: defining_requirements
stopped_at: null
last_updated: "2026-04-11T22:00:00Z"
last_activity: 2026-04-11 -- Milestone v4.0 started
progress:
  total_phases: 67
  completed_phases: 67
  total_plans: null
  completed_plans: null
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-11)

**Core value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.
**Current focus:** v4.0 Obsidian Knowledge Weapon — defining requirements

## Current Milestone

v4.0 Obsidian Knowledge Weapon — Transform the Obsidian plugin into the intelligence preparation and knowledge compounding surface for threat hunting.

**Status:** Defining requirements
**Phase:** Not started (defining requirements)

## Recently Completed

- v3.3 shipped: Phases 65-67, 9 plans, 21 tasks
- Obsidian distribution now works across CLI install, GitHub release assets, and community-directory submission materials

## Active Follow-up

- After the first real `obsidianmd/obsidian-releases` merge, run one live install smoke-test from Obsidian's Community Plugins browser.

## Accumulated Context

### Decisions

- The Obsidian CLI installer and release workflow now ship the same canonical bundle contract.
- macOS vault autodiscovery shipped first; cross-platform discovery remains future scope.
- Root community-submission metadata is synced from `apps/obsidian/` instead of being maintained by hand.
- v4.0 milestone shaped via 4-agent debate (knowledge graph architect, agent integration strategist, threat hunter practitioner, product contrarian). Key synthesis: vault IS the knowledge graph; agents populate, analysts curate; prepare context for agents, don't orchestrate; MCP enriches, vault owns.
- Full milestone spec at apps/obsidian/MILESTONES-v2.md with acceptance criteria for all 5 sub-milestones (M3-M7).

### Blockers/Concerns

None.
