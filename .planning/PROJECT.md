# THRUNT GOD

## What This Is

A threat-hunting orchestration system for agentic IDEs (Claude Code, OpenCode, Gemini, Codex, Copilot, Cursor, Windsurf). Provides a command-driven interface to move threat hunters from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations — all within a consistent workflow surface. Ships with live connectors for Splunk, Elasticsearch, OpenSearch, Microsoft Sentinel, and Defender XDR with Docker-based integration tests.

## Core Value

Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- v1.0 Query Runtime & Connector SDK (Phases 1-6) — shipped 2026-03-25
- v1.1 Hunt Packs & Technique Packs (Phases 7-11) — shipped 2026-03-25
- v1.2 Evidence Integrity & Provenance (Phases 12-16) — shipped 2026-03-27
- v1.3 Detection Promotion Pipeline (Phases 17-19) — shipped 2026-03-27
- v1.4 Hunt Learning & Recommendation Engine (Phases 20-22) — shipped 2026-03-27
- v1.5 TUI Operator Console (Phases 23-26) — shipped 2026-03-30
- v1.6 Live Connector Integrations (Phases 27-30) — shipped 2026-03-30
- v2.0 Developer Experience & CI (Phases 31-37) — shipped 2026-03-30
- v2.1 Advanced Hunt Features (Phases 38-44) — shipped 2026-03-31
- v2.2 Connector Ecosystem (Phases 45-49) — shipped 2026-03-31
- v3.0 Hunt Program Intelligence (Phases 50-57) — shipped 2026-04-08
- v3.1 Sidebar Automation & Operations (Phases 58-62) — shipped 2026-04-09
- ✓ v3.2 Obsidian Workspace Companion (Phases 63-64) — shipped 2026-04-11
- ✓ v3.3 Zero-Friction Distribution (Phases 65-67) — shipped 2026-04-11
- ✓ v4.0 Obsidian Knowledge Weapon (Phases 68-78) — shipped 2026-04-12

### Active

<!-- Current scope. Building toward these. -->

- v5.0 Obsidian Intelligence Platform — Comprehensive milestone: polish UX (sidebar redesign, command consolidation, onboarding), deepen intelligence (living entity dossiers, ATT&CK institutional memory, computed confidence), live canvas (Canvas API integration, reactive nodes), live hunt companion (filesystem watcher, bidirectional MCP event bridge, prior-hunt suggester), hunt journal + playbook distillation (structured reasoning capture, reusable tradecraft).

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Windows PTY support — Bun.Terminal is POSIX-only
- Live NATS event streaming — no supporting infrastructure
- Defender XDR via Graph API — Microsoft's forward path but different OAuth scope; v1.6 uses direct API
- Cross-language query translation (SPL to ES|QL) — too error-prone; retargeting via packs only

## Current Milestone: v5.0 Obsidian Intelligence Platform

**Goal:** Graduate from knowledge weapon to intelligence platform — polish the UX, deepen entity intelligence, make canvas alive, add live hunt companion with bidirectional MCP, and capture analyst reasoning in structured journals that distill into reusable playbooks.

**Target features:**
- UX foundation: sidebar progressive disclosure, command consolidation (19→~10), modal polish, onboarding, hotkeys
- Living entity dossiers: verdict lifecycle, cross-hunt aggregation, related infrastructure, schema versioning
- ATT&CK institutional memory: hunt linkbacks, false positive registry, coverage decay, detection linkbacks
- Computed confidence: multi-factor model with decay, provenance chains
- Live Canvas: Canvas API adapter, reactive nodes, live hunt canvas, interactive dashboard
- Live hunt companion: filesystem watcher, bidirectional MCP event bridge, prior-hunt suggester
- Hunt journal: structured reasoning capture with inline tags, playbook distillation

**Next step:** Run `$gsd-new-milestone` to define the next roadmap slice.

**Last shipped milestone (v4.0):**
- Obsidian plugin transformed from vault-native workspace companion into intelligence preparation and knowledge compounding surface
- 8 entity types with typed frontmatter, ~161 ATT&CK technique stubs, entity folder bootstrap
- Agent artifact ingestion: receipt/query parsers, entity extraction, sighting dedup, ingestion log
- MCP bridge with 11 tools: technique enrichment, coverage analysis, decision/learning logging, knowledge graph search
- Hyper copy: 5 export profiles, wiki-link context assembly, provenance markers, quick export commands
- Canvas kill chain generator with 4 templates, cross-hunt intelligence queries, hunt comparison, knowledge dashboard
- 369 tests passing, 12,193 LOC TypeScript across 25+ source files

## Context

- Core runtime is 29K+ lines of CommonJS across 41+ modules in thrunt-god/bin/lib/
- 10 connectors in registry (5 SIEM live: Splunk, Elastic, Sentinel, OpenSearch, Defender XDR)
- 2,800+ tests passing, 8 CI workflows, Docker integration tests for 3 platforms
- Plugin ecosystem with connector-sdk, manifest discovery, contract testing, scaffolding CLI
- Hunt replay engine with per-language query rewriters and multi-tenant dispatch
- Pack system with 5 technique packs, 5 domain packs, 1 family pack, MITRE ATT&CK v15.1 data
- VS Code extension v0.3.0 with 6 investigative webviews + 3 operational webviews (MCP control panel, command deck, runbook panel), automation sidebar, CLI bridge with structured progress
- @thrunt/mcp-hunt-intel MCP server with 10 tools + 4 prompts: ATT&CK lookup, detection coverage, knowledge graph, Navigator layers
- Program/case hierarchy with cross-case intelligence (SQLite+FTS5), 1378 bundled SigmaHQ detection rules
- Knowledge graph in program.db with entity/relation storage, decision logging, STIX auto-population
- Shipped v3.0: 8 phases, 17 plans, 214 new tests, 34 requirements satisfied
- Shipped v3.1: 5 phases, 14 plans, 168 new tests, 26 requirements satisfied (432 total tests)
- Shipped v3.2: 2 phases, 10 plans, 84 tests, 28 requirements satisfied — Obsidian plugin with 16 TypeScript source files (2,024 LOC)
- Shipped v3.3: 3 phases, 9 plans, 21 tasks — Obsidian distribution now works across CLI install, GitHub release assets, and community-directory submission readiness
- Shipped v4.0: 11 phases, 23 plans, 369 tests — Obsidian plugin at 12,193 LOC across 25+ TypeScript source files
- Obsidian plugin at `apps/obsidian/` is now an intelligence preparation and knowledge compounding surface with entity schema, ATT&CK ontology, agent ingestion, MCP bridge, hyper copy, canvas visualization, and cross-hunt intelligence
- `release.yml` now builds and uploads Obsidian plugin assets and enforces version alignment across root/package/manifest metadata
- Root `manifest.json` and `versions.json` are synced from `apps/obsidian/` through `npm run sync:obsidian-submission` for community-directory maintenance

## Constraints

- **Runtime**: Node.js >= 20.0.0, Bun for TUI/PTY
- **Architecture**: Connectors implement connector SDK interfaces; adapters are stateless factory functions
- **Testing**: Docker-based integration tests for Splunk/Elastic/OpenSearch; mock fixtures for Sentinel/Defender XDR (SaaS-only)
- **Packaging**: Bundled in thrunt-god until v2.2 extracts SDK; then plugin-based discovery

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Subprocess bridge pattern | File-locking safety; TUI cannot require() CJS | Good |
| Zod schemas co-located per domain module | Knowledge proximity over centralization | Good |
| Multi-surface per connector | Hunters need flexibility across query languages per platform | Good |
| Docker-based connector tests | Mock/prod divergence risk too high for security tooling | Good |
| Bundled packaging | Simpler install; standalone packages deferred to v2.2 | Good |
| OpenSearch uses /_plugins/_sql not ES|QL | Research discovered OpenSearch has no ES|QL; JDBC format with shim | Good |
| Defender XDR separate from Sentinel | Incompatible {Schema,Results} vs {tables} response shapes | Good |
| status_override first-non-null-wins | Conservative for analyst safety in multi-page queries | Good |
| SigV4 via existing signAwsRequest | Reuses infrastructure from AWS CloudTrail adapter | Good |
| v2.0 before v2.1/v2.2 | CI + DX tooling unblocks velocity for advanced features and ecosystem | Good |
| SDK exports before thrunt init | Standalone adapter files can't call internal functions without exports | Good |
| Entity-level replay diffing | More reliable than event diffing (events lack stable IDs across windows) | Good |
| Pack-based source retargeting | Cross-language query translation too error-prone | Good |
| Plugin manifest (thrunt-connector.json) | Separate from package.json for clarity; follows Terraform/Grafana precedent | Good |
| Unified MCP server (Option C) | Single @thrunt/mcp-hunt-intel for ATT&CK + detections + knowledge graph; native CLI for case memory | Planned |
| Dual SQLite (per-program + global) | Case data in .planning/, ATT&CK/Sigma intel in ~/.thrunt/intel.db | Planned |
| Bundled SigmaHQ + custom paths | Ship core rules, support SIGMA_PATHS/SPLUNK_PATHS env vars for custom rules | Planned |
| Global case search with program filter | Past work findable regardless of which program it was under | Planned |
| Knowledge graph in same DB | Entities reference techniques/detections by ID; co-location enables joins | Planned |
| MCP stdio + optional HTTP | stdio for CLI, HTTP wrapper for VS Code extension direct calls | Planned |
| Automation sidebar (separate from Investigation) | Mental model: top = evidence, bottom = execution | Good |
| MCP subprocess-only in VSCode | No @modelcontextprotocol/sdk import; spawn with --health/--list-tools/--run-tool flags | Good |
| Runbooks as YAML in .planning/runbooks/ | Tree for discovery, webview for execution; 5 step types (cli, mcp, open, note, confirm) | Good |
| Command deck with curated 10 built-in | Not every CLI command; parameterized templates for custom commands | Good |
| ExecutionLogger with .run-history.json | File-based persistence with atomic writes; avoids workspaceState size limits | Good |
| Obsidian plugin two-phase strategy | Structural plumbing first, visible value second — earns trust before features | Good |
| CLI handoff cut from Obsidian plugin | Obsidian is knowledge tool, not process launcher; security risk from shell injection | Good |
| vitest for Obsidian plugin testing | Pure modules testable without Obsidian runtime; VaultAdapter stub pattern | Good |
| Frontmatter additive, never required | Phase 1 files work in Phase 2; backward-compatible template evolution | Good |
| getViewModel() async in Phase 64 | Breaking change managed — all call sites documented and updated | Good |
| Same Obsidian bundle for CLI install and community release | One artifact contract avoids channel drift and duplicate QA surfaces | Good |
| macOS vault autodiscovery first | Existing install note targets local Obsidian users and `obsidian.json` gives a stable first implementation path | Good |
| Root submission metadata sync | Community-facing `manifest.json` and `versions.json` stay derived from `apps/obsidian/` instead of becoming a second source of truth | Good |

| Vault IS the knowledge graph | Don't build custom graph renderers; structure vault so Obsidian's native graph/Dataview/Canvas visualize for free | Planned |
| Agents populate, analysts curate | Plugin ingests agent output automatically; analysts link, annotate, promote | Planned |
| Prepare, don't orchestrate | Obsidian prepares context for agents (hyper copy, export templates); terminal runs them | Planned |
| MCP enriches, vault owns | MCP server provides intelligence lookups; vault files are source of truth; MCP unavailability degrades enrichment, not core | Planned |
| Entity notes as typed frontmatter | IOCs, TTPs, actors, tools, infra, datasources — each with canonical folder and YAML schema | Planned |

---
*Last updated: 2026-04-12 after v5.0 milestone start*
