# Vendor Integration Matrix

| Platform | Surface Type | Native App | Browser Adapter | Companion | Auth Assumptions | Known Blockers | Deep Integration Path |
|----------|-------------|------------|-----------------|-----------|------------------|----------------|----------------------|
| **Splunk** | Native app + Browser | Yes — app shell with dashboard XML | Yes — SPL extraction, table scraping | N/A | Splunk session via browser | Splunk REST API auth for write operations | Custom search commands, modular inputs, alert actions |
| **Elastic / Kibana** | Native plugin + Browser | Yes — Kibana plugin skeleton | Yes — ES|QL/EQL extraction, Discover table | N/A | Kibana session via browser | Plugin must match exact Kibana version | Saved objects, alerting integration, Lens visualization |
| **Microsoft Sentinel** | Companion + Browser | No | Yes — KQL extraction from Logs blade | Yes — Workbook/Playbook templates | Azure AD session via browser | No embeddable plugin model in Azure Portal | Azure Function bridge, custom Data Connector, Playbook integration |
| **Okta** | Companion + Browser | No | Yes — entity extraction from System Log | Yes — API query helpers | Okta session via browser | No admin console plugin framework | Okta Workflows integration, System Log streaming |
| **M365 Defender** | Companion + Browser | No | Yes — KQL from Advanced Hunting | Yes — query templates, incident correlation | M365 session via browser | No embeddable plugin model | Microsoft Graph Security API integration |
| **CrowdStrike Falcon** | Companion + Browser | No | Yes — Event Search extraction | Yes — detection query helpers | Falcon session via browser | Marketplace apps require partner enrollment | Falcon Store app, Real-Time Response integration |
| **AWS Console** | Companion + Browser | No | Yes — CloudTrail table extraction | Yes — CloudTrail/Athena query helpers | AWS session via browser | No console plugin model | CloudTrail Lake queries, EventBridge integration |
| **GCP Console** | Companion + Browser | No | Yes — Cloud Logging filter extraction | Yes — Logging query helpers, SA enrichment | GCP session via browser | No console plugin model | Cloud Functions bridge, Chronicle SIEM integration |
| **Jira** | Browser only | No | Yes — issue context extraction | N/A | Atlassian session | Limited DOM stability | Forge app for ticket-to-case linking |
| **Confluence** | Browser only | No | Yes — page context attachment | N/A | Atlassian session | Limited DOM stability | Forge app for knowledge base integration |
| **ServiceNow** | Browser only | No | Yes — incident context extraction | N/A | ServiceNow session | Complex SPA DOM | Scoped app for incident-to-case linking |

## Current Scaffold Status

| Component | Status | Runnable | Tests |
|-----------|--------|----------|-------|
| Surface Bridge | Scaffold complete | Yes (mock + real) | 13 tests |
| Browser Extension | Scaffold complete | Yes (load unpacked) | 3 tests |
| Splunk App | Shell complete | Yes (install in Splunk) | 1 test |
| Elastic/Kibana Plugin | Shell complete | No (requires matching Kibana) | 1 test |
| Sentinel Companion | Scaffold complete | Yes (template generation) | Smoke tests |
| Okta Companion | Scaffold complete | Yes (query helpers) | Smoke tests |
| M365 Defender Companion | Scaffold complete | Yes (query helpers) | Smoke tests |
| CrowdStrike Companion | Scaffold complete | Yes (query helpers) | Smoke tests |
| AWS Companion | Scaffold complete | Yes (query helpers) | Smoke tests |
| GCP Companion | Scaffold complete | Yes (query helpers) | Smoke tests |
| Shared Packages (8) | Complete | Yes | Tests per package |

## What "Native App" vs "Companion" vs "Browser Adapter" Means

**Native App**: A package that installs into the vendor platform using its official extension/plugin mechanism. Provides in-platform UI panels, search integration, or workflow hooks.

**Companion Package**: A TypeScript package that provides vendor-specific API helpers, query templates, and deployment skeletons. Does NOT install into the vendor platform directly. Used by the bridge or other surfaces.

**Browser Adapter**: A content script in the browser extension that extracts structured data from the vendor's web console DOM. Works with any vendor that has a web UI, regardless of plugin support.
