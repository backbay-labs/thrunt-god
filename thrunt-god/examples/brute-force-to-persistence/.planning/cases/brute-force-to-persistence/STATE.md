---
title: "Meridian Brute Force to Persistence"
status: closed
opened_at: "2026-03-29"
closed_at: "2026-03-29"
last_activity: "2026-03-29 - Evidence review passed, findings published"
technique_ids:
  - T1110.003
  - T1078
  - T1078.001
  - T1111
  - T1098.005
  - T1098
  - T1213.002
  - T1530
  - T1119
---

# Hunt State

## Mission Reference

See: .planning/cases/brute-force-to-persistence/MISSION.md (updated 2026-03-29)

**Active signal:** Okta brute force alert -- credential compromise confirmed, hunt closed
**Current focus:** Complete -- findings published

## Current Position

Phase: 4 of 4 (Evidence Synthesis)
Plan: 1 of 1 in current phase
Status: Closed
Last activity: 2026-03-29 - Evidence review passed, findings published

Progress: [##########] 100%

## Hunt Context

### Current Scope

- 2026-03-27T14:00:00Z -- 2026-03-29T16:00:00Z (48-hour window)
- david.park@meridian.io (compromised), 14 other targeted accounts (not compromised)
- meridian.io Okta tenant, Meridian M365 tenant

### Data Sources In Play

- Okta System Log (identity -- authentication, MFA, admin events)
- M365 Unified Audit Log (cloud -- SharePoint file operations)
- Microsoft Defender for Endpoint (endpoint -- not needed, no endpoint IOCs)

### Confidence

High -- attack chain fully reconstructed from spray through persistence. One gap: file exfiltration vs. access-only cannot be confirmed without DLP/CASB.

### Blockers

- None (hunt complete)

## Session Continuity

Last session: 2026-03-29 16:45
Stopped at: FINDINGS.md and EVIDENCE_REVIEW.md published
Resume file: None
