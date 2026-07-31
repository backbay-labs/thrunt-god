# Phase Two Assumptions

## Artifact Parsing

1. **HYPOTHESES.md uses markdown sections, not YAML.** Each hypothesis is `### HYP-NN: title` followed by key-value fields as `- **Key:** Value`. Active/Parked/Disproved are separated by `## Active Hypotheses`, `## Parked Hypotheses`, `## Disproved Hypotheses` headings.

2. **FINDINGS.md has an `## Executive Summary`, a `## Hypothesis Verdicts` table, and an `## Attack Timeline` table.** The verdicts table has `| Hypothesis | Verdict | Confidence | Evidence |` columns.

3. **EVIDENCE_REVIEW.md has a `## Publishability Verdict` line, a `## Evidence Quality Checks` table, and a `## Sequential Evidence Anti-Patterns` table.** Items with Status != "Pass" or "Clear" are blockers.

4. **Frontmatter list fields use YAML multiline syntax** (indented `- item` lines under the key). The naive colon-split parser in phase one misses these. Phase two adds YAML-aware frontmatter parsing.

5. **HUNTMAP.md phases use a checkbox list format.** `- [x] **Phase N: Name**` for complete, `- [ ] **Phase N: Name**` for incomplete. Phase details are under `### Phase N:` headings with `**Goal**:`, `**Plans**:` fields.

6. **STATE.md frontmatter uses nested YAML** for `progress:` with sub-fields `total_phases`, `completed_phases`, `percent`. The body has `Phase: N of M` and `Plan: N of M` lines.

## Bridge Architecture

7. **File watcher uses Bun's `fs.watch`.** Debounced at 500ms. Watches the entire `.planning/` tree recursively. On change, invalidates cached projections and broadcasts via WebSocket.

8. **Evidence writes go to `.planning/EVIDENCE/` as timestamped markdown files.** This is a new directory that THRUNT's existing tools don't manage. Format is a THRUNT-compatible frontmatter + markdown body. The bridge does not write into QUERIES/ or RECEIPTS/ — those are owned by the runtime.

9. **Execute-next resolves `thrunt-tools.cjs` relative to the installed `thrunt-god` package.** It shells out using `Bun.spawn` with `--raw` flag, matching the pattern from `apps/terminal/src/thrunt-bridge/executor.ts`.

10. **thrunt-tools.cjs path resolution** follows the same logic as the TUI: check `node_modules/.bin/thrunt-tools` in project root, then global install, then bundled path.

## Auth / Trust

11. **Bridge generates a random session nonce on startup.** The extension must send this nonce in a `X-Bridge-Token` header to be accepted. The nonce is printed to stdout on bridge start and stored in a local file at `.planning/.bridge-token`.

12. **Origin checking validates `chrome-extension://` origins** for the browser extension. Localhost fetch without the token header is rejected for write operations. Read operations require the token too, but `/api/health` is public.

## Extension

13. **Side panel polls the bridge** instead of relying solely on push. Poll interval is 5 seconds for case view. WebSocket provides supplemental real-time updates for evidence attachment and execution events.

14. **Content script adapters for Okta, Sentinel, and AWS are best-effort DOM extraction.** Selectors will break as vendor UIs change. The adapters degrade gracefully — returning null for unextractable fields rather than throwing.

15. **The cross-console demo case uses the existing `oauth-session-hijack` example** from `thrunt-god/examples/`. The bridge is pointed at that directory to demonstrate real artifact-backed operation.
