---
phase: 86
slug: live-hunt-canvas-reactive-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 86 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | apps/obsidian/vitest.config.ts |
| **Quick run command** | `cd apps/obsidian && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd apps/obsidian && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/obsidian && npx vitest run --reporter=verbose`
- **After every plan wave:** Run `cd apps/obsidian && npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 86-01-01 | 01 | 1 | CANVAS-09, CANVAS-10 | unit | `cd apps/obsidian && npx vitest run src/__tests__/live-canvas.test.ts` | yes | pending |
| 86-01-02 | 01 | 1 | CANVAS-09 | unit | `cd apps/obsidian && npx vitest run src/__tests__/live-canvas.test.ts` | yes | pending |
| 86-02-01 | 02 | 2 | CANVAS-09, CANVAS-10 | unit | `cd apps/obsidian && npx vitest run` | yes | pending |
| 86-02-02 | 02 | 2 | CANVAS-10 | unit | `cd apps/obsidian && npx vitest run` | yes | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live canvas auto-populates during ingestion | CANVAS-09 | Runtime event chain | Run ingestion, verify new nodes appear on live canvas |
| Dashboard updates after verdict change | CANVAS-10 | Reactive event chain | Change entity verdict, verify dashboard canvas updates |
| Node positions persist across updates | CANVAS-09 | Visual layout | Move nodes, trigger update, verify positions unchanged |
| Removed entities grayed out on dashboard | CANVAS-10 | Visual verification | Delete an entity file, trigger dashboard refresh, verify node turns gray |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
