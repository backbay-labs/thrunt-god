---
phase: 68
slug: entity-note-schema-att-ck-ontology-scaffold
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 68 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | apps/obsidian/package.json (test script) |
| **Quick run command** | `cd apps/obsidian && npx vitest run` |
| **Full suite command** | `cd apps/obsidian && npx vitest run` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/obsidian && npx vitest run`
- **After every plan wave:** Run `cd apps/obsidian && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 68-01-01 | 01 | 1 | ONTO-02 | unit | `cd apps/obsidian && npx vitest run` | ❌ W0 | ⬜ pending |
| 68-01-02 | 01 | 1 | ONTO-02 | unit | `cd apps/obsidian && npx vitest run` | ❌ W0 | ⬜ pending |
| 68-02-01 | 02 | 1 | ONTO-01 | unit | `cd apps/obsidian && npx vitest run` | ❌ W0 | ⬜ pending |
| 68-02-02 | 02 | 1 | ONTO-01 | unit | `cd apps/obsidian && npx vitest run` | ❌ W0 | ⬜ pending |
| 68-03-01 | 03 | 2 | ONTO-03 | unit | `cd apps/obsidian && npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/entity-schema.test.ts` — tests for entity type registry, template generation, frontmatter validation
- [ ] `src/__tests__/scaffold.test.ts` — tests for ATT&CK scaffold generation, file naming, idempotency

*Existing infrastructure (vitest, test directory) covers framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dataview queries return results | ONTO-01 | Requires Obsidian runtime with Dataview plugin | Install plugin in test vault, create scaffold, verify Dataview queries |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
