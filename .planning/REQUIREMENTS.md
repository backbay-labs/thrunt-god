# Requirements: THRUNT GOD

**Defined:** 2026-03-30
**Core Value:** Hunters can move from signal intake to executable hunts, evidence-grade receipts, publishable findings, promotable detections, and data-backed hunt recommendations inside one consistent workflow surface.

## v1.6 Requirements

Requirements for the Live Connector Integrations milestone. Each maps to roadmap phases.

### Connector Adapters

- [x] **CONN-01**: User can run SQL queries against OpenSearch via new adapter using `/_plugins/_sql` with basic auth
- [x] **CONN-02**: User can run Advanced Hunting queries against Defender XDR via new adapter with dedicated OAuth scope and `{Schema, Results}` normalizer
- [x] **CONN-03**: Elastic adapter reports `status:'partial'` when ES|QL 10K-row ceiling is hit instead of silently truncating
- [x] **CONN-04**: Sentinel adapter detects `PartialError` in HTTP 200 responses and reports `status:'partial'` instead of silent data loss
- [ ] **CONN-05**: User can run EQL sequence queries against Elasticsearch via `/_eql/search` as a second query surface
- [ ] **CONN-06**: Splunk adapter falls back to async job mode (create-job + poll) for queries exceeding export endpoint timeout
- [ ] **CONN-07**: OpenSearch adapter supports AWS SigV4 authentication for Amazon OpenSearch Service managed clusters

### Test Infrastructure

- [x] **TEST-01**: Docker-compose provisions Splunk 9.4, Elasticsearch 9.3, and OpenSearch containers with seed security event data
- [x] **TEST-02**: Integration tests skip gracefully via `skipIfNoDocker()` when Docker is unavailable; `npm test` remains unit-only
- [x] **TEST-03**: `test:integration` scripts orchestrate full Docker lifecycle (up, run tests, down)

### Integration Tests

- [ ] **INTG-01**: Splunk integration test executes real SPL query against Docker container, validates bearer token bootstrap and host/user entity extraction
- [ ] **INTG-02**: Elastic integration test executes real ES|QL query against Docker container, validates API key auth, dotted-column parsing, and `is_partial` behavior
- [ ] **INTG-03**: OpenSearch integration test executes real ES|QL query against Docker container, validates shared `normalizeElasticRows()` against live response

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Differentiator Screens

- **DIFF-01**: MITRE ATT&CK heatmap rewired to detection data
- **DIFF-02**: Evidence integrity aggregate dashboard
- **DIFF-03**: Score-based pack/connector/hypothesis recommendations

### Ecosystem

- **ECO-01**: Live connector ecosystem (standalone npm packages)
- **ECO-02**: Analyst feedback submission from TUI

### Advanced Connector Features

- **ADV-01**: Defender XDR via Microsoft Graph Security API (forward path)
- **ADV-02**: Elastic Query DSL with search_after + PIT pagination
- **ADV-03**: Multi-workspace Sentinel fan-out

## Out of Scope

| Feature | Reason |
|---------|--------|
| Standalone npm connector packages | Bundled into thrunt-god for v1.6; tracked as ECO-01 |
| Defender XDR via Graph API | Microsoft's forward path but different OAuth scope; tracked as ADV-01 |
| Elastic Query DSL pagination | High complexity; tracked as ADV-02 |
| Multi-workspace Sentinel fan-out | Coordinator-level feature; tracked as ADV-03 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONN-01 | Phase 27 | Complete |
| CONN-02 | Phase 27 | Complete |
| CONN-03 | Phase 27 | Complete |
| CONN-04 | Phase 27 | Complete |
| CONN-05 | Phase 30 | Pending |
| CONN-06 | Phase 29 | Pending |
| CONN-07 | Phase 30 | Pending |
| TEST-01 | Phase 28 | Complete |
| TEST-02 | Phase 28 | Complete |
| TEST-03 | Phase 28 | Complete |
| INTG-01 | Phase 29 | Pending |
| INTG-02 | Phase 30 | Pending |
| INTG-03 | Phase 30 | Pending |

**Coverage:**
- v1.6 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-03-30*
*Last updated: 2026-03-30 after v1.6 roadmap creation*
