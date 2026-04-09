---
title: "OAuth Phishing Campaign - acme.corp M365"
status: closed
opened_at: "2026-03-28"
closed_at: "2026-03-28"
last_activity: "2026-03-28 - Completed evidence review and findings"
technique_ids: [T1566, T1078, T1098]
---

# Hunt State

## Mission Reference

See: .planning/cases/oauth-session-hijack/MISSION.md (updated 2026-03-28)

**Active signal:** Defender alert — Unusual OAuth app consent (sarah.chen@acme.corp)
**Current focus:** Case closed — all phases complete

## Current Position

Phase: 3 of 3 (Evidence Correlation)
Plan: 1 of 1 in current phase
Status: Closed
Last activity: 2026-03-28 - Completed evidence review and findings

Progress: [##########] 100%

## Hunt Context

### Current Scope

- 2026-03-25T00:00:00Z — 2026-03-28T12:00:00Z (72h)
- sarah.chen@acme.corp (compromised), james.wu@acme.corp (targeted, not compromised), maria.garcia@acme.corp (targeted, not compromised)
- acme.corp M365 tenant + Okta IdP

### Data Sources In Play

- M365 Identity (Entra ID audit logs via Graph API)
- M365 Email (Exchange Online unified audit log)
- Defender for Office 365 (alerts)
- Okta (system log via Okta API)

### Confidence

High — all three hypotheses resolved with receipts. Pack progression pattern confirmed through two of three steps. Lateral movement disproved within the 72h window.

### Blockers

_(none — case closed)_

## Session Continuity

Last session: 2026-03-28 16:45
Stopped at: Evidence review complete, findings published
Resume file: None
