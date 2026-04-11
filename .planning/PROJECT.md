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

### Active

<!-- Current scope. Building toward these. -->

v3.2 Obsidian Workspace Companion (Phases 63+)

## Current Milestone: v3.2 Obsidian Workspace Companion

**Goal:** Ship a vault-native Obsidian plugin that surfaces THRUNT hunt state from markdown files, with a two-phase approach: structural foundation (module decomposition, honest workspace detection, testable architecture) then live hunt dashboard (STATE.md/HYPOTHESES.md parsing, hypothesis scoreboard, meaningful status bar).

**Target features:**
- Testable module architecture (artifacts.ts, paths.ts, vault-adapter.ts, workspace.ts, types.ts)
- Three-state workspace detection (healthy/partial/missing)
- Commands for all 5 core artifacts
- STATE.md parsing with phase, blockers, next actions
- HYPOTHESES.md parsing with hypothesis scoreboard
- Phase directory awareness
- Live status bar with hunt state
- Compact hunt status card replacing hero marketing copy
- Frontmatter-friendly templates with wiki-links

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Windows PTY support — Bun.Terminal is POSIX-only
- Live NATS event streaming — no supporting infrastructure
- Defender XDR via Graph API — Microsoft's forward path but different OAuth scope; v1.6 uses direct API
- Cross-language query translation (SPL to ES|QL) — too error-prone; retargeting via packs only

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

---
*Last updated: 2026-04-11 after v3.2 milestone start*
