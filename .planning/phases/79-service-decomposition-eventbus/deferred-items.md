# Deferred Items - Phase 79

## Pre-existing: Sightings Counting Regex Bug

**Discovered during:** Plan 79-01, Task 1 (entity-utils extraction)
**Location:** `apps/obsidian/src/workspace.ts` line 1343 (and now `apps/obsidian/src/entity-utils.ts`)
**Issue:** The regex `/^## Sightings\s*$([\s\S]*?)(?=^## |\n$|$)/m` always captures an empty string because the lazy quantifier `([\s\S]*?)` combined with multiline `$` in the lookahead `(?=...|$)` causes the match to terminate immediately after `## Sightings`.
**Impact:** `sightingsCount` is always 0 for all entity notes. This affects `generateKnowledgeDashboard` top entities sorting (all tied at 0).
**Fix suggestion:** Replace with `/## Sightings\s*\n([\s\S]*?)(?=\n## |\n\n|$)/` (non-multiline, explicit newline anchoring).
**Scope:** Out of scope for Plan 79-01 (pure extraction, not behavioral changes). Should be addressed in a future bugfix task.
