# Browser Extension — Design & Development Guide

## Overview

The THRUNT Surfaces browser extension is the universal operator shell. It provides a consistent hunt interface across every vendor console through:

1. **Side Panel** — Persistent case view with progress, hypotheses, evidence counts, and actions
2. **Content Scripts** — Per-vendor adapters that extract queries, tables, and entities from the DOM
3. **Background Worker** — Message router and bridge client
4. **Context Menu** — Right-click "Clip to THRUNT" on any text selection

## Manifest V3

The extension uses Chrome Manifest V3:
- Service worker for background (not persistent background page)
- Side Panel API for the case sidebar (not popup)
- Content scripts declared per-vendor in manifest.json
- Minimal permissions: `sidePanel`, `activeTab`, `storage`, `contextMenus`

## Site Adapter Architecture

Each vendor console gets a dedicated content script with a site adapter:

```typescript
interface SiteAdapter {
  id: string;
  displayName: string;
  urlPatterns: string[];
  detect(): boolean;
  extractContext(): VendorPageContext;
  extractQuery(): ExtractedQuery | null;
  extractTable(): ExtractedTable | null;
  extractEntities(): ExtractedEntity[];
  supportedActions(): CaptureAction[];
}
```

Adapters are loaded only on matching URLs (via manifest.json `matches` patterns). This avoids loading unnecessary code on unrelated pages.

### Adding a New Adapter

1. Create `src/content/<vendor>.ts`
2. Implement the `SiteAdapter` interface with vendor-specific DOM selectors
3. Call `initializeAdapter(adapter)` at the bottom of the file
4. Add a content script entry in `manifest.json`
5. Add a build entrypoint in `scripts/build.ts`

### DOM Selector Stability

Vendor console DOMs change frequently. Adapters use best-effort selectors with graceful degradation:
- If a selector fails, the extraction method returns `null` (not an error)
- The side panel shows available actions based on what the adapter can actually extract
- Adapters should prefer semantic anchors, table labels, and stable text patterns over one-shot CSS classes
- Adapters now return extraction quality metadata so partial and unsupported pages can be reported honestly

## Message Flow

```
Content Script (vendor page)
    │
    │ chrome.runtime.sendMessage
    ▼
Background Service Worker
    │
    │ fetch() to bridge API
    ▼
Surface Bridge (localhost:7483)
    │
    │ Read active case artifacts + mutate THRUNT via CLI
    ▼
Case Data Response
    │
    │ chrome.runtime.sendMessage
    ▼
Side Panel (case UI)
```

## Runtime Behavior

For development or dogfooding:

1. The background worker falls back to mock data when the bridge is unreachable
2. Bridge auth uses a local handshake token for HTTP and WebSocket calls
3. The background worker retries after stale-token or bridge-restart events
4. Content scripts are regression-tested against fixture pages for Okta, Sentinel, and AWS
5. The side panel can open a case from detected vendor context when no active case exists
6. `Preview Runtime` resolves the real THRUNT runtime path and shows readiness blockers before execution
7. `Run Preview` executes the previously previewed runtime path through the bridge
8. Dev mode can capture sanitized live snapshots for certification replay
9. Dev mode surfaces raw extraction diagnostics directly in the side panel
10. Dev mode now shows recent certification campaign summaries for the active vendor when campaign data exists
11. Dev mode also surfaces vendor history summary, drift-trend summary, and the current active baseline when those ledger artifacts exist
12. Phase seven adds active-vendor freshness and baseline-churn summaries to the same diagnostics path so reviewers can see staleness and instability without leaving the extension shell

## Building

```bash
cd surfaces/apps/browser-extension
bun run build
```

This produces `dist/` with:
- `background.js` — Service worker
- `sidepanel.js` — Side panel script
- `content-<vendor>.js` — One content script per vendor

## Loading in Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `apps/browser-extension/` directory
5. The extension icon appears in the toolbar
6. Click it to open the side panel

## Capture Actions

| Action | Description | Triggers |
|--------|-------------|----------|
| `clip_query` | Extracts the current query from the vendor's search bar | Side panel button, context menu |
| `clip_table` | Extracts visible table data from search results | Side panel button |
| `clip_entity` | Extracts selected entities (IPs, users, hashes) | Side panel button, context menu |
| `clip_screenshot_metadata` | Captures page metadata (not actual screenshot) | Context menu |
| `attach_page_context` | Attaches full page context to the case | Side panel button |
| `capture_live_snapshot` | Saves a sanitized live-session snapshot for certification replay | Side panel button in dev mode |

## Canonicalization

- Query clips can become canonical THRUNT query artifacts.
- Structured result and entity clips can become canonical THRUNT receipt artifacts.
- Ambiguous or incomplete clips remain evidence with recorded canonicalization reasons.
- The side panel now shows recent canonical queries, receipts, and evidence separately so the operator shell reflects real THRUNT state rather than transient browser-only captures.
- The active console card and diagnostics payload now surface the latest campaign status for the detected vendor when available.
- The diagnostics payload now includes vendor-level certification history, drift trend, and active-baseline state so reviewer workflows can stay inside the existing extension shell during dogfooding.
- The active console card now also surfaces freshness and baseline churn for the detected vendor when those derived ledger artifacts exist.
