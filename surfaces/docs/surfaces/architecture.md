# THRUNT Surfaces — Multi-Surface Architecture

## Overview

THRUNT Surfaces is a multi-surface workspace that extends the THRUNT threat hunting platform beyond the CLI and VS Code extension into every console a security operator touches: SIEM dashboards, identity platforms, cloud consoles, and ticket systems.

The core principle: **one shared brain, many surfaces**. All surfaces talk to the same THRUNT case model, hunt runtime, receipts, and evidence artifacts. No surface embeds its own copy of hunt logic.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Operator's Browser                            │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Side Panel   │  │ Content      │  │ Content Scripts        │  │
│  │ (Case UI)    │  │ Script:      │  │ per vendor console     │  │
│  │              │◄─┤ Splunk       │  │ (Elastic, Sentinel,    │  │
│  │              │  │              │  │  Okta, AWS, GCP, etc.) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬────────────┘  │
│         │                 │                      │               │
│  ┌──────┴─────────────────┴──────────────────────┴───────────┐  │
│  │  Background Service Worker                                 │  │
│  │  - Bridge health polling                                   │  │
│  │  - Message routing                                         │  │
│  │  - Evidence auto-attachment                                │  │
│  └──────────────────────────┬────────────────────────────────┘  │
└─────────────────────────────┼────────────────────────────────────┘
                              │ HTTP + WebSocket (localhost)
┌─────────────────────────────┼────────────────────────────────────┐
│  Surface Bridge              │                                    │
│  ┌──────────────────────────┴────────────────────────────────┐  │
│  │  Bun HTTP Server (port 7483)                               │  │
│  │  - REST API for case state, evidence, execution            │  │
│  │  - WebSocket for real-time updates                         │  │
│  │  - CORS enabled for extension access                       │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                              │                                    │
│  ┌──────────────┐  ┌────────┴────────┐  ┌───────────────────┐  │
│  │ Mock Provider │  │ Artifact        │  │ Runtime Executor   │  │
│  │ (dev mode)    │  │ Provider        │  │ (thrunt-tools.cjs) │  │
│  └──────────────┘  │ (.planning/)    │  └───────────────────┘  │
│                     └─────────────────┘                          │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  .planning/ Artifacts                                            │
│  MISSION.md │ STATE.md │ HUNTMAP.md │ QUERIES/ │ RECEIPTS/      │
│  FINDINGS.md │ HYPOTHESES.md │ config.json │ phases/            │
└──────────────────────────────────────────────────────────────────┘
```

## Layer Responsibilities

### Surface Bridge

The bridge is the single gateway between external surfaces and THRUNT state. It:

- **Reads** `.planning/` artifacts on demand with in-memory caching
- **Exposes** a typed REST API for all case data operations
- **Broadcasts** real-time updates via WebSocket when artifacts change
- **Delegates** mutation operations (run pack, advance phase) to `thrunt-tools.cjs`
- **Supports** mock mode with realistic fixture data for development

The bridge does NOT maintain its own database or duplicate hunt logic.

### Browser Extension

The extension is the **universal operator shell** — it works across every vendor console. It:

- **Detects** which vendor console is active via site adapters
- **Extracts** queries, tables, and entities from vendor-specific DOM
- **Renders** a persistent side panel with case state, progress, and actions
- **Routes** all data through the background worker to the bridge
- **Falls back** to mock data when the bridge is unavailable

### Site Adapters

Each adapter isolates vendor-specific DOM knowledge:

- URL pattern matching to detect the vendor
- DOM selectors for query extraction, table scraping, and entity identification
- Page type classification (search, dashboard, alert_detail, etc.)

Adapters are designed to be updated independently as vendor UIs change.

### Native / Companion Apps

Vendor integrations fall into three categories:

1. **Native apps** (Splunk, Elastic/Kibana) — real plugin shells that install into the platform
2. **Companion packages** (Sentinel, Okta, M365, CrowdStrike, AWS, GCP) — SDK helpers and templates
3. **Browser adapter only** — the extension itself is the integration surface

All vendor apps share the same contracts and SDK. None embed hunt logic.

## Shared Packages

| Package | Purpose |
|---------|---------|
| `surfaces-contracts` | TypeScript types for case model, bridge API, evidence, adapters |
| `surfaces-sdk` | HTTP + WebSocket client for the bridge |
| `surfaces-ui` | Framework-agnostic UI primitives (view model projections) |
| `surfaces-site-adapters` | Site adapter registry and per-vendor implementations |
| `surfaces-state` | Artifact-to-UI projection helpers |
| `surfaces-artifacts` | `.planning/` file reading and parsing utilities |
| `surfaces-auth` | Minimal session/auth abstraction |
| `surfaces-mocks` | Fixture data for development and testing |

## Data Flow: Evidence Capture

```
1. Operator views a supported vendor console page
2. Content script adapter extracts context, queries, entities, or tables
3. Operator clicks "Clip to THRUNT" in side panel
4. Background worker receives capture message
5. Background worker POSTs to bridge /api/evidence/attach
6. Bridge classifies the clip as query, receipt, or evidence
7. Bridge writes canonical artifacts into `QUERIES/`, `RECEIPTS/`, or `EVIDENCE/`
8. THRUNT audit logic consumes those artifacts through existing scanners and audit paths
9. Bridge broadcasts the resulting artifact event via authenticated WebSocket
10. Side panel refreshes canonical artifact lists, readiness, and blockers
```

## Data Flow: Case View

```
1. Side panel sends 'request:case_view' to background
2. Background worker GETs /api/case/view from bridge
3. Bridge reads the active case artifacts plus shared program config
4. Bridge assembles CaseViewModel projection
5. Response flows back through background to side panel
6. Side panel renders case card, progress bar, hypotheses, etc.
```

## Design Decisions

1. **localhost-only bridge with local token auth** — The bridge still binds to localhost only, but phase three adds handshake-issued session tokens for HTTP and WebSocket access.

2. **File-based source of truth** — The bridge reads `.planning/` on demand rather than maintaining a database. This ensures surfaces always see the same state as the CLI and VS Code extension.

3. **Fixture-first validation** — Okta, Sentinel, and AWS extraction is validated against realistic local browser fixtures. Live vendor consoles remain manual dogfooding, not the automated truth source.

4. **Content script per vendor** — Separate content scripts avoid loading unnecessary code on non-target pages. The manifest declares specific URL matches.

5. **Bridge runtime depth over bridge-owned execution** — Phase four keeps preview and execution inside THRUNT’s `pack` and `runtime` commands. The bridge does not become a second execution engine.

6. **Canonical artifacts over sidecar notes** — Browser clips now canonicalize into `QUERIES/`, `RECEIPTS/`, or `EVIDENCE/` depending on structure quality. The operator shell reflects those canonical artifacts instead of keeping browser-only notes.

7. **Certification status is explicit** — Fixture validation, live capture replay, and blocked live status are now separate machine-readable states under `.planning/certification/`.

8. **Live certification is campaign-based** — Phase five promotes certification from flat vendor status into inspectable campaign bundles with replay diffs, runtime attachments, review notes, and explicit promotion state under `.planning/certification/campaigns/`.

9. **Phase six adds a certification ledger, not a new subsystem** — Campaign history, drift trends, prerequisite reports, and baseline inventory are generated into `.planning/certification/` as inspectable JSON and Markdown. The ledger is derived from campaign bundles and THRUNT runtime results rather than maintained in a separate service.

10. **Phase seven makes certification operational over time** — Freshness, baseline churn, and review-ledger artifacts are now derived from the same campaign history. Operational posture comes from campaign bundles, reviewer decisions, and baseline promotions, not from separate monitoring state.
