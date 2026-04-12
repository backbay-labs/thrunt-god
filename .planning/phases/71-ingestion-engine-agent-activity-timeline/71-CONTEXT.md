# Phase 71: Ingestion Engine + Agent Activity Timeline - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase builds the ingestion command that extracts entities from agent output and populates entity notes, plus the receipt timeline sidebar view. It does NOT build MCP connectivity (Phase 72), enrichment (Phase 73), or hyper copy (Phase 74-75).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — requirements are specific:
- "Ingest agent output" command: scans RECEIPTS/ and QUERIES/, uses parsers from Phase 70 to extract structured data, then creates/updates entity notes in entity folders from Phase 68
- Entity extraction: IPs, domains, hashes from query log entity refs; technique IDs from receipt technique refs; these are already parsed by Phase 70 parsers
- Entity note creation: use entity-schema.ts templates from Phase 68, populate frontmatter and Sightings section
- Idempotency: deduplicate sightings by receipt_id or query_id + entity value combo — check if sighting already exists before appending
- INGESTION_LOG.md: append-only log under planningDir recording each run
- Receipt timeline: sidebar section showing receipts grouped by hypothesis, color-coded by claim_status (validated=green, pending=orange, rejected=red), clickable to open source file
- Timeline uses parsed receipt data from Phase 70's parseReceipt

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `parseReceipt` from `parsers/receipt.ts` — extracts ReceiptSnapshot with claim_status, related_hypotheses, technique_refs
- `parseQueryLog` from `parsers/query-log.ts` — extracts QuerySnapshot with entity_refs (ips, domains, hashes)
- `ENTITY_TYPES` and `ENTITY_FOLDERS` from `entity-schema.ts` — canonical folder paths and templates
- `VaultAdapter.listFiles()`, `readFile()`, `createFile()`, `fileExists()` — all vault I/O
- `getEntityFolder()` from `paths.ts` — entity path resolution
- `workspace.ts` ExtendedArtifacts detection — already scans RECEIPTS/ and QUERIES/

### Established Patterns
- Commands registered in main.ts via `this.addCommand()`
- Pure modules for logic, thin vault adapter wiring in workspace service
- Collapsible sidebar sections (from Phase 69-70)
- ViewModel pattern for sidebar data

### Integration Points
- `main.ts` — register "Ingest agent output" command
- `workspace.ts` — add ingestion methods, receipt timeline data to ViewModel
- `view.ts` — add receipt timeline rendering section
- `types.ts` — add ReceiptTimelineEntry, IngestionResult types

</code_context>

<specifics>
## Specific Ideas

- Receipt timeline entries should show: receipt_id, claim_status badge, technique reference, truncated claim text
- Group by related_hypotheses[0] if available, "Ungrouped" otherwise
- Ingestion creates entity notes like `entities/iocs/192.168.1.100.md` with the IOC entity template

</specifics>

<deferred>
## Deferred Ideas

- MCP enrichment of entity notes (Phase 73)
- Hyper copy context assembly (Phase 74-75)
- Canvas visualization (Phase 76-77)

</deferred>
