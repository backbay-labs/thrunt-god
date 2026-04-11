# Milestones

## v3.3 Zero-Friction Distribution (Shipped: 2026-04-11)

**Phases completed:** 3 phases, 9 plans, 21 tasks

**Key accomplishments:**
- Added a standalone `npx thrunt-god@latest --obsidian` install path with canonical bundle staging and macOS vault linking.
- Unified the Obsidian installer and release workflow behind one shared asset contract.
- Extended GitHub releases to publish `main.js`, `manifest.json`, `styles.css`, and `versions.json`.
- Aligned the Obsidian package and public docs with community review and onboarding expectations.
- Added root metadata sync plus a documented `obsidianmd/obsidian-releases` submission handoff.

---

## v3.2 Obsidian Workspace Companion (Shipped: 2026-04-11)

**Phases completed:** 2 phases, 10 plans, 0 tasks

**Key accomplishments:**
- (none recorded)

---

## v3.1 Sidebar Automation & Operations (Shipped: 2026-04-09)

**Phases completed:** 5 phases, 14 plans, 0 tasks

**Key accomplishments:**
- (none recorded)

---

## v3.0 Hunt Program Intelligence (Shipped: 2026-04-08)

**Phases completed:** 15 phases, 30 plans, 0 tasks

**Key accomplishments:**
- (none recorded)

---

## v2.2 Connector Ecosystem (Shipped: 2026-03-31)

**Phases:** 45-49
**Goal:** Extract connector SDK into standalone package, define plugin manifest format, enable third-party connector development.
**Research:** connector-plugin-sdk-spec.md
**Requirements:** ECO-01 through ECO-05

---

## v2.1 Advanced Hunt Features (Shipped: 2026-03-31)

**Phases:** 38-44
**Goal:** Ship hunt replay engine for retroactive hunting and multi-tenant coordination for MSSP/enterprise fan-out.
**Research:** hunt-replay-spec.md, multi-tenant-coordination-spec.md
**Requirements:** REPLAY-01 through REPLAY-04, TENANT-01 through TENANT-03
**Estimated LOC:** ~4,500

---

## v2.0 Developer Experience & CI (Shipped: 2026-03-30)

**Phases:** 31-37
**Goal:** Ship CI/CD pipeline, connector scaffolding CLI, and pack authoring tools.
**Research:** cicd-pipeline-spec.md, thrunt-init-spec.md, pack-authoring-cli-spec.md
**Requirements:** CI-01, CI-02, SDK-01, INIT-01, PACK-01 through PACK-03
**Estimated LOC:** ~5,000

---

## v1.6 Live Connector Integrations (Shipped: 2026-03-30)

**Phases completed:** 4 phases, 6 plans, 0 tasks

**Key accomplishments:**
- 5 SIEM connectors shipped with multi-surface query support
- Docker integration tests for Splunk 9.4, Elastic 9.3.2, OpenSearch 2.19.1
- Partial-result detection (Elastic is_partial, Sentinel PartialError)
- Splunk async job fallback on 504 timeout

---
