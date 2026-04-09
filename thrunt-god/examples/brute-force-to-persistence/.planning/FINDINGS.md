# Findings: Meridian Identity Abuse Program

## Executive Summary

The Meridian program root is a consistent, read-only wrapper around one closed child case. Program-level evidence confirms that the workspace parses cleanly, the child case remains published and discoverable, and the program rollup accurately mirrors the closed case's ATT&CK technique set.

## Hypothesis Verdicts

| Hypothesis | Verdict | Confidence | Evidence |
|------------|---------|------------|----------|
| HYP-01 | Supported | High | RCT-20260409-101 |
| HYP-02 | Supported | High | RCT-20260409-102 |
| HYP-03 | Supported | High | RCT-20260409-103 |

## Impacted Scope

- **Program root:** `.planning/` singleton artifacts
- **Child cases:** `cases/brute-force-to-persistence`
- **Published outputs:** `published/FINDINGS.md`
- **Technique rollup:** 9 unique ATT&CK techniques preserved at program scope

## Attack Timeline

| Time (UTC) | Event | Source | Evidence |
|------------|-------|--------|----------|
| 2026-03-29 | Program workspace created around Meridian identity-abuse scenario | Program root | QRY-20260409-101 |
| 2026-03-29 | Child case closed with published findings | Child case | RCT-20260409-102 |
| 2026-04-09T14:19:00Z | Program technique rollup reconciled against child case evidence corpus | Program closeout audit | RCT-20260409-103 |
