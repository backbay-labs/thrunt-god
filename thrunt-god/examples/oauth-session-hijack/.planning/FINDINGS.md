# Findings: acme.corp OAuth Abuse Response Program

## Executive Summary

The acme.corp OAuth-abuse program root is a consistent, read-only wrapper around one closed child case. Program-level evidence confirms that the workspace parses cleanly, the child case remains published and discoverable, and the program rollup accurately mirrors the closed case's three-technique ATT&CK chain.

## Hypothesis Verdicts

| Hypothesis | Verdict | Confidence | Evidence |
|------------|---------|------------|----------|
| HYP-01 | Supported | High | RCT-20260409-201 |
| HYP-02 | Supported | High | RCT-20260409-202 |
| HYP-03 | Supported | High | RCT-20260409-203 |

## Impacted Scope

- **Program root:** `.planning/` singleton artifacts
- **Child cases:** `cases/oauth-session-hijack`
- **Published outputs:** `published/FINDINGS.md`
- **Technique rollup:** 3 unique ATT&CK techniques preserved at program scope

## Attack Timeline

| Time (UTC) | Event | Source | Evidence |
|------------|-------|--------|----------|
| 2026-03-28 | Program workspace created around OAuth-abuse scenario | Program root | QRY-20260409-201 |
| 2026-03-28 | Child case closed with published findings | Child case | RCT-20260409-202 |
| 2026-04-09T14:32:00Z | Program technique rollup reconciled against child case evidence corpus | Program closeout audit | RCT-20260409-203 |
