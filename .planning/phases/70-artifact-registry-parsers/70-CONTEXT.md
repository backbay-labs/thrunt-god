# Phase 70: Artifact Registry + Parsers - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase extends the plugin to recognize agent-produced artifacts (RECEIPTS/, QUERIES/, evidence reviews, cases) and provides pure-function parsers for receipts and query logs. It does NOT build sidebar timeline views (Phase 71), ingestion commands (Phase 71), or MCP enrichment (Phase 73).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase with clear requirements:
- Receipt parser: pure function `(markdown: string) => ReceiptSnapshot` extracting claim, claim_status, evidence summary, related_hypotheses, technique references from receipt frontmatter and body
- Query log parser: pure function `(markdown: string) => QuerySnapshot` extracting intent, dataset, result_status, related_receipts, entity references (IPs, domains, hashes via regex)
- Extended artifact recognition: workspace service detects RECEIPTS/RCT-*.md, QUERIES/QRY-*.md, EVIDENCE_REVIEW.md, SUCCESS_CRITERIA.md, environment/ENVIRONMENT.md, cases/*/MISSION.md
- Follow existing parser patterns from `parsers/state.ts` and `parsers/hypotheses.ts`
- All parsers gracefully degrade on malformed input (return defaults, never throw)
- Reference: actual receipt and query log formats at `thrunt-god/templates/receipt.md` and `thrunt-god/templates/query-log.md`

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `parsers/state.ts` — exact pattern to follow for receipt/query parsers (pure function, section extraction)
- `parsers/hypotheses.ts` — markdown table parsing pattern
- `parsers/index.ts` — re-export pattern
- `VaultAdapter.listFolders()`, `VaultAdapter.listFiles()` — for detecting artifact directories

### Established Patterns
- Pure parser functions: `(markdown: string) => Snapshot`
- Graceful degradation: malformed → default/empty, never throw
- Types in `types.ts`, parsers in `parsers/` directory
- Vitest for unit testing with fixture markdown strings

### Integration Points
- `parsers/` — add `receipt.ts` and `query-log.ts`
- `parsers/index.ts` — re-export new parsers
- `types.ts` — add `ReceiptSnapshot`, `QuerySnapshot`, `ExtendedArtifactInfo`
- `workspace.ts` — add extended artifact detection methods

</code_context>

<specifics>
## Specific Ideas

- Use the actual receipt template at `thrunt-god/templates/receipt.md` as the reference for frontmatter fields
- Use the actual query log template at `thrunt-god/templates/query-log.md` as the reference
- Entity extraction regex patterns: IPv4 (`\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}`), domain, MD5/SHA1/SHA256 hashes

</specifics>

<deferred>
## Deferred Ideas

- Receipt timeline sidebar view (Phase 71)
- Entity extraction and ingestion into entity notes (Phase 71)
- Ingestion audit log (Phase 71)

</deferred>
