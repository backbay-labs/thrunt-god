# THRUNT Surfaces Browser Extension

Universal browser extension for threat hunting operators. Operates across SIEM and cloud consoles to capture evidence, monitor hunt progress, and interact with active THRUNT cases.

## Supported Consoles

| Vendor | Adapter | Capture Actions |
|--------|---------|-----------------|
| Splunk | Query, Table, Entity | clip_query, clip_table, clip_entity |
| Elastic / Kibana | Query, Table, Entity | clip_query, clip_table, clip_entity |
| Microsoft Sentinel | Query, Entity | clip_query, clip_entity |
| Okta | Entity | clip_entity |
| M365 Defender | Query, Table, Entity | clip_query, clip_table, clip_entity |
| CrowdStrike Falcon | Query, Entity | clip_query, clip_entity |
| AWS Console | Table, Entity | clip_table, clip_entity |
| GCP Console | Query, Entity | clip_query, clip_entity |
| Jira | Entity | clip_entity |
| Confluence | Page context | attach_page_context |
| ServiceNow | Entity | clip_entity |

## Architecture

```
┌─────────────────────────────────────────────┐
│  Side Panel                                  │
│  - Case summary, phase progress              │
│  - Hypothesis status                         │
│  - Evidence counts                           │
│  - Capture action buttons                    │
│  - Recommended next action                   │
└────────────────┬────────────────────────────┘
                 │ chrome.runtime messages
┌────────────────┴────────────────────────────┐
│  Background Service Worker                   │
│  - Bridge health polling                     │
│  - Message routing                           │
│  - Evidence attachment                       │
│  - Context menu integration                  │
└────────────────┬────────────────────────────┘
                 │ HTTP + WebSocket
┌────────────────┴────────────────────────────┐
│  Surface Bridge (localhost:7483)             │
│  - Case state API                           │
│  - Evidence attachment API                  │
│  - Hunt execution API (mock mode)           │
└─────────────────────────────────────────────┘

Content Scripts (per-vendor):
  - Detect vendor console
  - Extract queries, tables, entities
  - Forward captures to background worker
```

## Development

```bash
# Install dependencies
cd surfaces && bun install

# Build extension
cd apps/browser-extension && bun run build

# Load in Chrome
# 1. Open chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select the apps/browser-extension directory

# Run tests
bun test
```

## Mock Mode

When the surface bridge is unavailable, the extension automatically falls back to mock data. This allows UI development and testing without a running bridge or real vendor sessions.

## Content Script Adapters

Each adapter follows the `SiteAdapter` interface and provides vendor-specific DOM extraction logic. Selectors are best-effort and may need updates as vendor UIs change.

To add a new adapter:
1. Create `src/content/<vendor>.ts`
2. Implement the `SiteAdapter` interface
3. Add a content script entry in `manifest.json`
4. Add a build entrypoint in `scripts/build.ts`
