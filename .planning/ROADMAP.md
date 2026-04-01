# Roadmap: Patent-Inspired Log Intelligence

## Overview

This roadmap delivers three capabilities -- template clustering, dataset-aware defaults, and anomaly framing -- into thrunt-god's zero-dependency connector architecture. The work starts with dataset defaults (smallest change, unblocks everything by establishing per-kind behavior), proceeds to the Drain parser and reduce stage (core template mining capability), and finishes with anomaly framing and validation (builds on both prior workstreams). Six phases, each delivering a coherent, independently verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Dataset-Aware Query Defaults** - DATASET_DEFAULTS table with per-kind pagination/execution defaults injected into createQuerySpec (completed 2026-03-31)
- [x] **Phase 2: Event Deduplication** - Event-level dedup function with by_id and by_content_hash strategies in aggregation.cjs (completed 2026-03-31)
- [x] **Phase 3: Drain Parser** - Standalone drain.cjs module implementing the Drain log template mining algorithm with security-specific masking (completed 2026-03-31)
- [x] **Phase 4: Reduce Stage** - Reduce stage wired into the connector lifecycle between normalize and emit, with evidence integration (completed 2026-04-01)
- [x] **Phase 5: Anomaly Framing and Pack Progressions** - Sequential prediction reference doc and expected_progressions field in hunt packs (completed 2026-03-31)
- [ ] **Phase 6: Validator Enhancement and Test Suite** - Sequential evidence integrity check in findings-validator plus comprehensive test coverage

## Phase Details

### Phase 1: Dataset-Aware Query Defaults
**Goal**: Queries automatically use intelligent pagination and execution defaults based on dataset kind, so hunters get appropriate result volumes without manual tuning
**Depends on**: Nothing (first phase)
**Requirements**: DSET-01, DSET-02, DSET-03, DSET-04, DSET-05, DSET-06, DSET-07, DSET-08
**Success Criteria** (what must be TRUE):
  1. A QuerySpec with `dataset.kind = 'identity'` and no explicit pagination gets limit=200, max_pages=10, timeout=30s
  2. A QuerySpec with `dataset.kind = 'endpoint'` and no explicit pagination gets limit=1000, max_pages=5, timeout=60s
  3. A QuerySpec with explicit `pagination.limit = 42` keeps that value regardless of dataset kind
  4. `getDatasetDefaults('alerts')` returns the correct defaults object for introspection
  5. All 1,850+ existing tests pass without modification (or with minimal default-adjustment updates)
**Plans:** 2/2 plans complete

Plans:
- [ ] 01-01-PLAN.md -- DATASET_DEFAULTS table and createQuerySpec injection
- [ ] 01-02-PLAN.md -- getDatasetDefaults export and backward compatibility verification

### Phase 2: Event Deduplication
**Goal**: Duplicate events from pagination overlaps or multi-source collection are eliminated before analysis, reducing noise
**Depends on**: Phase 1
**Requirements**: DEDUP-01, DEDUP-02, DEDUP-03
**Success Criteria** (what must be TRUE):
  1. `deduplicateEvents(events, { strategy: 'by_id' })` removes events with duplicate `event.id` values, keeping the first occurrence
  2. `deduplicateEvents(events, { strategy: 'by_content_hash' })` removes events where connector_id + title + summary + timestamp_minute match, even if IDs differ
  3. The function handles edge cases (null events, missing fields, empty arrays) without throwing
**Plans:** 1/1 plans complete

Plans:
- [ ] 02-01-PLAN.md -- deduplicateEvents function with both strategies, tests, and runtime re-export

### Phase 3: Drain Parser
**Goal**: A standalone Drain log template mining algorithm exists as a zero-dependency CommonJS module that can cluster security events into structural templates
**Depends on**: Nothing (independent of Phases 1-2, but sequenced after for resource focus)
**Requirements**: DRAIN-01, DRAIN-02, DRAIN-03, DRAIN-04, DRAIN-05, DRAIN-06, DRAIN-07, DRAIN-08
**Success Criteria** (what must be TRUE):
  1. `createDrainParser()` returns a parser that clusters "Failed password for admin from 192.168.1.50" and "Failed password for root from 10.0.0.1" into the same template with wildcards for user and IP
  2. Pre-masking correctly replaces IPs, UUIDs, hashes, timestamps, emails, and file paths before tokenization (12+ patterns)
  3. `parser.match(content)` returns a cluster match without modifying the parser's learned state
  4. `parser.toJSON()` followed by `DrainParser.fromJSON(state)` produces a parser that matches identically to the original
  5. Template IDs are content-hash-based (same template text always produces the same ID across runs)
**Plans:** 2/2 plans complete

Plans:
- [ ] 03-01-PLAN.md -- Core Drain algorithm (Node, LogCluster, DrainParser, tree search, similarity, merging)
- [ ] 03-02-PLAN.md -- Pre-masking engine, match mode, serialization, and introspection APIs

### Phase 4: Reduce Stage
**Goal**: Every connector query automatically produces template metadata alongside raw events, and evidence documents reflect template counts
**Depends on**: Phase 3 (requires drain.cjs)
**Requirements**: RDCE-01, RDCE-02, RDCE-03, RDCE-04, RDCE-05, RDCE-06, RDCE-07, EVID-01, EVID-02
**Success Criteria** (what must be TRUE):
  1. After `executeQuerySpec()` completes, `envelope.metadata.templates` contains algorithm, config, cluster_count, and clusters array with template_id, template string, count, sample_event_id, and capped event_ids
  2. A reduce stage failure (e.g., malformed events) produces a warning in the envelope but does not change the query status from 'ok'
  3. Passing `options.reduce = false` skips template extraction entirely (no metadata.templates field)
  4. Query log documents include template count in the result summary line
  5. Receipt documents include template count in the evidence section
**Plans:** 2/2 plans complete

Plans:
- [ ] 04-01-PLAN.md -- reduceEvents function in drain.cjs, LIFECYCLE_STAGES update, and reduce stage wiring in executeQuerySpec
- [ ] 04-02-PLAN.md -- Evidence integration (query log and receipt template counts) and runtime re-export

### Phase 5: Anomaly Framing and Pack Progressions
**Goal**: Agents have structured instructions for sequential prediction reasoning, and hunt packs declare expected attack progressions
**Depends on**: Nothing (independent of Phases 1-4, but sequenced after because it builds conceptually on template/default capabilities)
**Requirements**: ANOM-01, ANOM-02, ANOM-03, ANOM-04, ANOM-05, PACK-01, PACK-02, PACK-03, PACK-04
**Success Criteria** (what must be TRUE):
  1. `references/anomaly-framing.md` exists and defines the five-step sequential prediction pattern (entity selection, baseline, prediction, deviation scoring, receipt documentation)
  2. The anomaly framing doc includes a composite scoring rubric with explicit increase/decrease severity factors and score-to-classification mapping
  3. The pack template schema accepts an optional `expected_progressions` array field
  4. `domain.identity-abuse`, `domain.ransomware-precursors`, and `family.oauth-phishing-session-hijack` packs each contain at least one progression definition
  5. The anomaly framing doc includes a common mistakes section with concrete wrong/right example pairs
**Plans:** 2/2 plans complete

Plans:
- [x] 05-01-PLAN.md -- Anomaly framing reference document (five-step sequential prediction pattern, scoring rubric, integration points, common mistakes)
- [x] 05-02-PLAN.md -- Pack schema extension and progression definitions for identity-abuse, ransomware-precursors, and oauth-phishing-session-hijack

### Phase 6: Validator Enhancement and Test Suite
**Goal**: The findings validator catches unsupported sequential claims, and comprehensive tests verify all new capabilities
**Depends on**: Phases 1-5 (validates and tests everything)
**Requirements**: VALR-01, VALR-02, VALR-03, TEST-01, TEST-02, TEST-03, TEST-04, TEST-05
**Success Criteria** (what must be TRUE):
  1. The findings-validator includes a "Sequential Evidence Integrity" step that checks for entity timelines, documented baselines, documented predictions, and deviation scores
  2. EVIDENCE_REVIEW anti-patterns include post-hoc rationalization, missing baseline, and score inflation
  3. Drain algorithm unit tests cover tokenization, tree search, template merging, masking, serialization, and match mode
  4. Reduce stage integration tests verify template metadata appears in ResultEnvelope after executeQuerySpec
  5. The full test suite (existing 1,850+ tests plus all new tests) passes cleanly
**Plans:** 3 plans

Plans:
- [ ] 06-01-PLAN.md -- Comprehensive Drain parser unit tests (tokenization, tree search, template merging, masking, serialization, match mode, introspection, configuration)
- [ ] 06-02-PLAN.md -- Sequential Evidence Integrity validator step and EVIDENCE_REVIEW anti-patterns
- [ ] 06-03-PLAN.md -- Reduce stage integration tests via executeQuerySpec and full test suite regression verification

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Dataset-Aware Query Defaults | 0/2 | Complete    | 2026-03-31 |
| 2. Event Deduplication | 0/1 | Complete    | 2026-03-31 |
| 3. Drain Parser | 0/2 | Complete    | 2026-03-31 |
| 4. Reduce Stage | 2/2 | Complete    | 2026-04-01 |
| 5. Anomaly Framing and Pack Progressions | 0/2 | Complete    | 2026-04-01 |
| 6. Validator Enhancement and Test Suite | 0/3 | Not started | - |
