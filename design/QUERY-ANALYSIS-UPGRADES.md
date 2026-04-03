# Phase 15: Query Analysis Upgrades -- Design Specification

**Version:** 1.0
**Date:** 2026-04-02
**Status:** Ready for planning
**Depends on:** Phase 12 (shared design system), Phase 14 (evidence board patterns)
**Surface:** `webview/query-analysis/index.tsx` (stub created Phase 12-03)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Feature 1: Template Comparison View](#2-feature-1-template-comparison-view)
3. [Feature 2: Heatmap Grid](#3-feature-2-heatmap-grid)
4. [Feature 3: Receipt QA Inspector](#4-feature-3-receipt-qa-inspector)
5. [Feature 4: Sort/Filter Controls](#5-feature-4-sortfilter-controls)
6. [Component Hierarchy](#6-component-hierarchy)
7. [Store Derivation Functions](#7-store-derivation-functions)
8. [Message Protocol Additions](#8-message-protocol-additions)
9. [CSS Token Additions](#9-css-token-additions)
10. [Keyboard Navigation Plan](#10-keyboard-navigation-plan)
11. [Performance Strategy](#11-performance-strategy)
12. [Accessibility](#12-accessibility)
13. [Implementation Plan](#13-implementation-plan)

---

## 1. Overview

### What This Phase Delivers

Phase 15 transforms the Query Analysis webview from a Phase 12 stub into a multi-query
comparative analysis surface. The Drain Template Viewer (existing) stays as the single-query
deep-dive tool. The Query Analysis surface is its complement: it answers cross-query questions.

**The four features address distinct hunter questions:**

| Feature | Hunter Question |
|---------|----------------|
| Template Comparison | "Did this template appear in both queries? What changed?" |
| Heatmap Grid | "Across all my queries, which templates dominate and which are absent?" |
| Receipt QA Inspector | "Is this receipt's anomaly framing solid, or did I inflate the score?" |
| Sort/Filter Controls | "Show me only the novel templates sorted by deviation score." |

### Relationship to Existing Surfaces

```
                    +-------------------------------+
                    | Drain Template Viewer         |
                    | Single-query deep dive        |
                    | (drainViewer.ts, existing)     |
                    +------+---------+--------------+
                           |         |
              "Compare"    |         |  "QA Inspector"
              context      |         |  context action
              action       |         |
                    +------v---------v--------------+
                    | Query Analysis Surface         |
                    | Multi-query comparison,        |
                    | heatmap, receipt QA, sort/filter|
                    | (queryAnalysisPanel.ts, new)    |
                    +--------------------------------+
```

The Drain Template Viewer gains two new context actions:
- **"Compare Templates..."** -- opens Query Analysis in comparison mode with the current query pre-selected as Query A
- **"Inspect Receipt..."** -- opens Query Analysis in receipt QA mode with the linked receipt pre-selected

### Data Sources

All data is derived from `HuntDataStore`:
- `store.getQueries()` -- all parsed Query artifacts with Drain template metadata
- `store.getReceipts()` -- all parsed Receipt artifacts with anomaly framing
- `store.getReceiptsForQuery(queryId)` -- cross-index: receipts linked to a query
- `store.receiptToHypotheses` -- cross-index: receipts linked to hypotheses
- `store.queryToPhase` -- cross-index: queries mapped to hunt phases

No new data sources are needed. All features derive from existing store state.

---

## 2. Feature 1: Template Comparison View

### 2.1 Purpose

Side-by-side comparison of Drain templates across two queries. The hunter selects
Query A and Query B; the view aligns templates vertically and highlights differences.

### 2.2 Layout

```
+------------------------------------------------------------------------+
| Query Analysis: Template Comparison                          [x]       |
|                                                                        |
| [Sort: Count v] [Filter: All v] [Search templates...        ]         |
|                                                                        |
| +--- Query A: QRY-20260329-001 [v] --+  +--- Query B: QRY-20260329-005 [v] --+
| |                                     |  |                                     |
| | SHARED TEMPLATES                    |  |                                     |
| | +----------------------------------+|  |+-----------------------------------+|
| | | Auth failed <EMAIL> from <IP>    ||  || Auth failed <EMAIL> from <IP>     ||
| | | 1,189 events (95.3%)       [bar] ||  || 12 events (8.1%)            [bar] ||
| | | delta: -1,177 (-99.0%)           ||  ||                                   ||
| | +----------------------------------+|  |+-----------------------------------+|
| |                                     |  |                                     |
| | +----------------------------------+|  |+-----------------------------------+|
| | | Process created <*>              ||  || Process created <*>               ||
| | | 43 events (3.4%)           [bar] ||  || 89 events (59.7%)           [bar] ||
| | | delta: +46 (+107.0%)             ||  ||                                   ||
| | +----------------------------------+|  |+-----------------------------------+|
| |                                     |  |                                     |
| | A-ONLY TEMPLATES               [2] |  | B-ONLY TEMPLATES               [1] |
| | +----------------------------------+|  |+-----------------------------------+|
| | | MFA challenge <EMAIL>            ||  || Token refresh <UUID>              ||
| | | 15 events (1.2%)           [bar] ||  || 47 events (31.5%)           [bar] ||
| | | [blue accent left border]        ||  || [orange accent right border]      ||
| | +----------------------------------+|  |+-----------------------------------+|
| |                                     |  |                                     |
| | STRUCTURAL VARIANTS            [1] |  |                                     |
| | +----------------------------------+|  |+-----------------------------------+|
| | | Auth <*> for <EMAIL> -- <*>      ||  || Auth succeeded for <EMAIL>...     ||
| | | similarity: 0.82 (structural)    ||  || similarity: 0.82 (structural)     ||
| | +----------------------------------+|  |+-----------------------------------+|
| +-------------------------------------+  +-------------------------------------+
|                                                                        |
| COMPARISON SUMMARY                                                     |
| +--------------------------------------------------------------------+ |
| | Shared: 2 templates | A-only: 2 | B-only: 1 | Variants: 1        | |
| | Cluster similarity: 0.67 (moderate overlap)                        | |
| +--------------------------------------------------------------------+ |
+------------------------------------------------------------------------+
```

### 2.3 Template Matching Algorithm

Templates across queries are matched using three tiers:

1. **Exact ID match:** Same `templateId` in both queries. These are definitively the same template.
2. **Structural variant detection:** For unmatched templates, compute pairwise similarity using tokenized
   comparison. Split each template string by whitespace, compare tokens position-by-position:
   - If both tokens are identical literal text, score = 1.0
   - If both tokens are mask placeholders (`<IP>`, `<EMAIL>`, `<*>`, etc.), score = 1.0
   - Otherwise, score = 0.0
   - Similarity = sum of position scores / max(length_a, length_b)
   - Threshold: similarity >= 0.7 flags a structural variant pair.
3. **Unmatched:** Templates in neither tier 1 nor tier 2 are classified as A-only or B-only.

This algorithm runs in the extension host (not the webview) within `deriveQueryAnalysis()`.

### 2.4 Delta Calculation

For shared templates, the delta is computed as:

```typescript
interface TemplateDelta {
  countDelta: number;        // countB - countA (positive = increased)
  percentageDelta: number;   // percentageB - percentageA
  direction: 'increased' | 'decreased' | 'unchanged';
}
```

Delta magnitude is visually encoded:
- **> +50%**: red upward arrow (escalation signal)
- **> -50%**: green downward arrow (de-escalation)
- **-50% to +50%**: neutral gray arrow
- **0**: no arrow, plain text "unchanged"

### 2.5 Cluster Similarity Score

A single metric summarizing how similar two queries' template distributions are:

```
similarity = |intersection_set| / |union_set|
```

Where `intersection_set` = templates present in both (by ID match), `union_set` = all unique template
IDs across both queries. This is the Jaccard similarity coefficient.

Display: "Cluster similarity: 0.67 (moderate overlap)"

| Range | Label |
|-------|-------|
| 0.0 -- 0.2 | Disjoint |
| 0.2 -- 0.5 | Low overlap |
| 0.5 -- 0.7 | Moderate overlap |
| 0.7 -- 0.9 | High overlap |
| 0.9 -- 1.0 | Near-identical |

### 2.6 Query Selector

Two dropdown selectors at the top of each column. Populated from `store.getQueries()`.

Display format: `QRY-20260329-001: M365 Identity (312 events, 4 templates)`

Default selection:
- Query A: the query with the most templates
- Query B: the second-most-templates query (or the most recent if only 1 has templates)

If fewer than 2 queries have template data, show an empty state:
"At least 2 queries with template data are needed for comparison. Run more hunt queries to populate this view."

---

## 3. Feature 2: Heatmap Grid

### 3.1 Purpose

A matrix visualization showing template presence/frequency across all queries in the hunt.
Rows = templates, Columns = queries. Cell color = event count within that template+query intersection.

### 3.2 Layout

```
+------------------------------------------------------------------------+
| Query Analysis: Template Heatmap                             [x]       |
|                                                                        |
| [Sort: Count v] [Filter: All v] [Search templates...        ]         |
|                                                                        |
| +--------------------------------------------------------------------+ |
| |              | QRY-001 | QRY-002 | QRY-003 | QRY-004 | QRY-005   | |
| |              | M365 Id | Okta    | CS Endpt| M365 Id | Okta      | |
| +--------------+---------+---------+---------+---------+------------+ |
| | Auth failed  |  1,189  |    --   |    --   |   12    |    --     | |
| | <EMAIL>      |  [dark] | [empty] | [empty] |  [med]  | [empty]  | |
| +--------------+---------+---------+---------+---------+------------+ |
| | Process      |    43   |    --   |   201   |   89    |    --     | |
| | created <*>  |  [med]  | [empty] |  [dark] |  [med]  | [empty]  | |
| +--------------+---------+---------+---------+---------+------------+ |
| | MFA          |    15   |    3    |    --   |    --   |    --     | |
| | challenge    | [light] | [faint] | [empty] | [empty] | [empty]  | |
| +--------------+---------+---------+---------+---------+------------+ |
| | Token        |    --   |    --   |    --   |   47    |    --     | |
| | refresh      | [empty] | [empty] | [empty] |  [med]  | [empty]  | |
| +--------------+---------+---------+---------+---------+------------+ |
|                                                                        |
| Legend: [faint] 1-10  [light] 11-50  [med] 51-200  [dark] 200+       |
| Zero cells shown as "--" (absence is evidence)                         |
+------------------------------------------------------------------------+
```

### 3.3 Cell Color Scale

Single-hue sequential scale using the `--hunt-accent` token:

```css
/* Cell color intensity by normalized count */
--hunt-heatmap-0: transparent;
--hunt-heatmap-1: color-mix(in srgb, var(--hunt-accent) 12%, transparent);
--hunt-heatmap-2: color-mix(in srgb, var(--hunt-accent) 28%, transparent);
--hunt-heatmap-3: color-mix(in srgb, var(--hunt-accent) 48%, transparent);
--hunt-heatmap-4: color-mix(in srgb, var(--hunt-accent) 72%, transparent);
--hunt-heatmap-5: var(--hunt-accent);
```

Normalization: counts are bucketed relative to the maximum count across the entire matrix.
Bucket boundaries: 0, 1-10%, 10-25%, 25-50%, 50-75%, 75-100% of max count.

### 3.4 Cell Interaction

**Hover:** Tooltip showing:
```
Template: Auth failed for <EMAIL> from <IP>
Query: QRY-20260329-001 (M365 Identity)
Count: 1,189 events
% of query: 95.3%
Time window: 14:00:00Z -- 14:15:00Z
```

**Click:** Sends `cell:select` message to host. Host opens the Drain Template Viewer for that
query and selects the clicked template. If Drain Viewer is already open, it switches to the
clicked query.

**Right-click:** Context menu with "Compare with..." which opens Template Comparison with the
clicked cell's query as Query A, prompting to select Query B.

### 3.5 Row/Column Ordering

Rows (templates) are sorted by the active sort mode (see Feature 4).

Columns (queries) are sorted by execution timestamp (`executedAt` from query frontmatter),
oldest to newest (left to right). This creates a natural temporal flow, letting the hunter
see how template frequency evolves over the course of the hunt.

### 3.6 Zero Cells

Zero cells display a dash character (`--`) in muted text. They are never blank.
VISUALIZATION-SPEC.md principle: "absence of evidence is itself evidence."

### 3.7 Scrolling

- Horizontal: the template label column (first column) is sticky (`position: sticky; left: 0`)
  so template names remain visible when scrolling horizontally through many queries.
- Vertical: standard overflow-y scroll. Row headers stay in view via the sticky column.
- The header row with query IDs is sticky (`position: sticky; top: 0`).

### 3.8 Density Limits

At 50+ queries, column widths shrink to a minimum of 48px. At this point, cell text
(count numbers) is hidden and only the color fill is visible. Hover tooltip still shows
the full count. This keeps the matrix readable at hunt scale.

At 500+ templates, only the top 100 by total count across all queries are rendered initially.
A "Show all (523 templates)" toggle at the bottom loads the remainder into a virtualized
list (see Performance Strategy).

---

## 4. Feature 3: Receipt QA Inspector

### 4.1 Purpose

A modal-style panel that shows the anomaly framing breakdown for a selected receipt.
Hunters use this to audit their own scoring -- checking for inflated scores, missing
baselines, or predictions that don't match observations.

### 4.2 Layout

```
+------------------------------------------------------------------------+
| RECEIPT QA INSPECTOR                                         [close]   |
|                                                                        |
| +--- Receipt List ----------+  +--- Anomaly Framing Breakdown -------+|
| |                            |  |                                     ||
| | [RCT-20260329-001]  5 [!] |  | RECEIPT: RCT-20260329-001          ||
| | [RCT-20260329-002]  3     |  | Claim: supports HYP-01             ||
| | [RCT-20260329-003]  4     |  | Status: ok                         ||
| |                            |  |                                     ||
| | Filter: [All v]           |  | DEVIATION SCORE                     ||
| |                            |  | +----------------------------------+||
| |                            |  | |         +----+                   |||
| |                            |  | |    5    | 5  |  HIGH             |||
| |                            |  | |         +----+                   |||
| |                            |  | +----------------------------------+||
| |                            |  |                                     ||
| |                            |  | SCORE BREAKDOWN                     ||
| |                            |  | +----------------------------------+||
| |                            |  | | Category: EXPECTED_MALICIOUS     |||
| |                            |  | | Base score: 3                    |||
| |                            |  | | +------+--------+------+        |||
| |                            |  | | |Factor|Value   |  +/- |        |||
| |                            |  | | +------+--------+------+        |||
| |                            |  | | |No CT |Missing | +1   |        |||
| |                            |  | | |Tor   |Exit    | +1   |        |||
| |                            |  | | +------+--------+------+        |||
| |                            |  | | Total: 3 + 2 = 5                |||
| |                            |  | +----------------------------------+||
| |                            |  |                                     ||
| |                            |  | PREDICTION VS ACTUAL                ||
| |                            |  | +----------------------------------+||
| |                            |  | | Predicted benign:                |||
| |                            |  | |   Sign-in from SF office IP      |||
| |                            |  | |                                   |||
| |                            |  | | Predicted malicious:             |||
| |                            |  | |   OAuth consent from unknown IP  |||
| |                            |  | |                                   |||
| |                            |  | | Actual observation:              |||
| |                            |  | |   OAuth consent from Tor exit    |||
| |                            |  | |   node at 14:10:33Z              |||
| |                            |  | +----------------------------------+||
| |                            |  |                                     ||
| |                            |  | BASELINE                            ||
| |                            |  | +----------------------------------+||
| |                            |  | | Normal behavior: 0-2 OAuth       |||
| |                            |  | | consents per week. Current: 47   |||
| |                            |  | | in 15 minutes.                   |||
| |                            |  | +----------------------------------+||
| |                            |  |                                     ||
| |                            |  | DIAGNOSTICS                         ||
| |                            |  | +----------------------------------+||
| |                            |  | | [!] Missing prediction: no       |||
| |                            |  | |     predicted outcomes documented |||
| |                            |  | | [ok] Baseline present            |||
| |                            |  | | [ok] Score matches factors       |||
| |                            |  | +----------------------------------+||
| |                            |  |                                     ||
| |                            |  | LINKED EVIDENCE                     ||
| |                            |  | Hypotheses: HYP-01, HYP-02        ||
| |                            |  | Queries: QRY-20260329-001          ||
| |                            |  | [ Open Receipt ] [ Open Query ]   ||
| +----------------------------+  +-------------------------------------+|
+------------------------------------------------------------------------+
```

### 4.3 Receipt List (Left Panel)

Displays all receipts in the hunt, sorted by deviation score (highest first).

Each row shows:
- Receipt ID (abbreviated: `RCT-001`)
- Deviation score as a colored badge (using existing deviation score badge colors from UX-SPEC)
- `[!]` icon if any diagnostics are flagged (from `EvidenceIntegrityDiagnostics`)
- Claim status icon: checkmark (supports), X (contradicts), dash (context/inconclusive)

Filter dropdown:
- **All** (default)
- **By hypothesis** -- submenu with HYP-01, HYP-02, etc.
- **By score range** -- 1-2 (low), 3-4 (medium), 5-6 (high)
- **Flagged only** -- receipts with at least one diagnostic warning/error

### 4.4 Anomaly Framing Breakdown (Right Panel)

The right panel renders when a receipt is selected from the list. Sections:

**1. Score Card**
Large number display of the total deviation score with color coding:
- 1-2: gray (`--hunt-text-muted`)
- 3: yellow (`--hunt-warning`)
- 4: orange (interpolated)
- 5-6: red (`--hunt-danger`)

**2. Score Breakdown Table**
Factor-by-factor audit:
- Category row (EXPECTED_BENIGN, EXPECTED_MALICIOUS, AMBIGUOUS, NOVEL)
- Base score value
- Modifier rows: factor name, observed value, contribution (+1 or -1)
- Total calculation: `base + sum(modifiers) = total`

If `totalScore !== baseScore + sum(modifier contributions)`, display a
score inconsistency warning (yellow banner).

**3. Prediction vs Actual**
Side-by-side or stacked display:
- Predicted benign outcome (from `anomalyFrame.prediction`)
- Predicted malicious outcome
- Actual observation (from `anomalyFrame.observation`)

Text highlighting: if the observation contains keywords from the malicious prediction,
those keywords get a red underline. If it matches benign prediction keywords, green underline.
This visual link helps the hunter see prediction accuracy at a glance.

**4. Baseline Section**
Renders the `anomalyFrame.baseline` text. If baseline is empty, shows:
"No baseline documented. Deviation score is evaluated without a reference point."
(same message as the `EvidenceIntegrityDiagnostics` warning for missing baselines).

**5. Diagnostics Summary**
Pulls diagnostic results from the same checks used by `EvidenceIntegrityDiagnostics`:
- Unsupported claim (error)
- Causality without evidence (error)
- Missing baseline (warning)
- Missing prediction (warning)
- Score inflation (warning)
- Post-hoc rationalization (info)
- Temporal gap (info)

Each check shows a status icon: `[ok]` green checkmark, `[!]` yellow warning, `[x]` red error.

**6. Linked Evidence**
List of related hypotheses and queries with clickable links.
"Open Receipt" and "Open Query" buttons send `navigate` messages to the host.

### 4.5 Receipt with No Anomaly Frame

If the selected receipt has `anomalyFrame: null`, the right panel shows:

```
This receipt has no anomaly framing section.

Anomaly framing is optional but recommended for all receipts that
make evidentiary claims. It documents the prediction, baseline, and
deviation scoring that supports the claim.

[ Open Receipt to Add Framing ]
```

### 4.6 Entry Points

The Receipt QA Inspector opens from:
1. **Command palette:** `THRUNT: Open Receipt QA Inspector`
2. **Drain Template Viewer context action:** "Inspect Receipt..." on a template that has linked receipts
3. **Sidebar context menu:** Right-click a RCT-* node, select "QA Inspector"
4. **Evidence Board click:** Click a receipt node in the graph, hold Shift to open in QA Inspector

---

## 5. Feature 4: Sort/Filter Controls

### 5.1 Purpose

A persistent toolbar at the top of the Query Analysis surface providing sort, filter,
and search controls that apply uniformly to all three views (comparison, heatmap, receipt list).

### 5.2 Toolbar Layout

```
+------------------------------------------------------------------------+
| [Mode: Comparison | Heatmap | Inspector]                               |
| [Sort: Count v] [Filter: All v] [Search templates...            ] [x]  |
+------------------------------------------------------------------------+
```

### 5.3 Mode Toggle

Three-button pill group (reusing `hunt-eb-mode-toggle` pattern from Evidence Board):
- **Comparison** -- Template Comparison View (Feature 1)
- **Heatmap** -- Heatmap Grid (Feature 2)
- **Inspector** -- Receipt QA Inspector (Feature 3)

Active mode is highlighted with accent fill. Mode state is preserved in webview state
via `vscode.setState()` / `vscode.getState()` for panel restoration.

### 5.4 Sort Options

Horizontal pill group below the mode toggle:

| Sort | Behavior | Data Source |
|------|----------|-------------|
| **Count** (default) | Templates sorted by total event count across all queries (descending) | `sum(template.count for each query)` |
| **Deviation** | Templates sorted by the highest deviation score of any linked receipt (descending) | `max(receipt.anomalyFrame.deviationScore.totalScore)` for receipts linked to queries containing that template |
| **Novelty** | Templates that appear in later queries but not earlier ones rank first | Compare template presence across queries sorted by `executedAt`; templates absent in first N queries but present in later ones get higher novelty |
| **Recency** | Templates from the most recently executed queries rank first | `max(query.executedAt)` for queries containing that template |

**Unavailable sorts:** If no receipts have deviation scores, the "Deviation" pill is disabled
(grayed out) with a tooltip: "No receipts with deviation scores available."

Sort state is communicated to the host via `sort:change` message and persisted.

### 5.5 Filter Options

Dropdown with grouped options:

**By Query:**
- "All queries" (default)
- Individual query checkboxes (multi-select)

**By Template Cluster:**
- "All templates" (default)
- Filter to templates containing specific mask tokens: `<IP>`, `<EMAIL>`, `<UUID>`, `<*>`

**By Anomaly Score Threshold:**
- "Any score"
- ">= 3 (Medium+)"
- ">= 4 (High+)"
- ">= 5 (Critical)"

Filters combine with AND logic. The active filter state is shown as chips below the toolbar:
`Queries: QRY-001, QRY-003 | Score: >= 4 | Token: <IP>`

Clicking the `[x]` on a chip removes that filter.

### 5.6 Search

Full-text search across template pattern strings:
- Substring match, case-insensitive
- Typing `failed` highlights/filters to templates containing "failed"
- Typing `<IP>` finds all templates with IP variability tokens
- Typing a template ID (e.g., `T1` or hex string) matches by template ID
- Debounced at 150ms to avoid excessive re-renders
- Results are a narrowed view of the current sort/filter state

Search applies across all modes:
- **Comparison:** filters both columns to matching templates
- **Heatmap:** filters rows to matching templates, columns remain
- **Inspector:** no effect (search is template-focused, not receipt-focused)

---

## 6. Component Hierarchy

### 6.1 Preact Component Tree

```
<QueryAnalysisApp>
  |
  +-- <ModeToggle mode={mode} onChange={setMode} />
  |     Reuses hunt-eb-mode-toggle CSS pattern (3 pills)
  |
  +-- <Toolbar>
  |     +-- <SortPills sortBy={sortBy} onSort={setSortBy} available={sortAvailability} />
  |     +-- <FilterDropdown filters={filters} onChange={setFilters} queries={queries} />
  |     +-- <SearchInput value={search} onChange={setSearch} />
  |     +-- <ActiveFilterChips filters={filters} onRemove={removeFilter} />
  |
  +-- {mode === 'comparison' && <ComparisonView>}
  |     +-- <QuerySelector label="Query A" value={queryA} onChange={setQueryA} queries={queries} />
  |     +-- <QuerySelector label="Query B" value={queryB} onChange={setQueryB} queries={queries} />
  |     +-- <TemplateRowList>
  |     |     +-- <SectionHeader title="Shared Templates" count={shared.length} />
  |     |     +-- <ComparisonRow template={t} queryA={dataA} queryB={dataB} delta={delta} />
  |     |     +-- ...
  |     |     +-- <SectionHeader title="A-Only Templates" count={aOnly.length} />
  |     |     +-- <ComparisonRow template={t} queryA={dataA} queryB={null} side="left" />
  |     |     +-- ...
  |     |     +-- <SectionHeader title="B-Only Templates" count={bOnly.length} />
  |     |     +-- <ComparisonRow template={t} queryA={null} queryB={dataB} side="right" />
  |     |     +-- ...
  |     |     +-- <SectionHeader title="Structural Variants" count={variants.length} />
  |     |     +-- <VariantRow pairA={tA} pairB={tB} similarity={score} />
  |     +-- <ComparisonSummary shared={n} aOnly={n} bOnly={n} variants={n} similarity={score} />
  |
  +-- {mode === 'heatmap' && <HeatmapView>}
  |     +-- <HeatmapGrid>
  |     |     +-- <HeatmapHeader queries={sortedQueries} />
  |     |     +-- <HeatmapRow template={t} cells={cells} />
  |     |     +-- ...
  |     |     +-- <ShowAllToggle total={total} visible={visible} onToggle={toggle} />
  |     +-- <HeatmapLegend />
  |     +-- <HeatmapTooltip cell={hoveredCell} />
  |
  +-- {mode === 'inspector' && <InspectorView>}
        +-- <ReceiptList>
        |     +-- <ReceiptFilterDropdown filter={rFilter} onChange={setRFilter} />
        |     +-- <ReceiptRow receipt={r} isSelected={selected} onClick={select} />
        |     +-- ...
        +-- <ReceiptDetail receipt={selectedReceipt}>
              +-- <ScoreCard score={totalScore} />
              +-- <ScoreBreakdown category={cat} baseScore={base} modifiers={mods} total={total} />
              +-- <PredictionVsActual prediction={pred} observation={obs} />
              +-- <BaselineSection baseline={baseline} />
              +-- <DiagnosticsSummary checks={checks} />
              +-- <LinkedEvidence hypotheses={hyps} queries={qrys} onNavigate={nav} />
```

### 6.2 Component Reuse from Shared Library

| Shared Component | Used In | Purpose |
|-----------------|---------|---------|
| `Panel` | ComparisonSummary, ScoreCard, BaselineSection | Section chrome |
| `Badge` | ReceiptRow (score badge), VariantRow (similarity badge) | Status indicators |
| `GhostButton` | LinkedEvidence ("Open Receipt", "Open Query") | Navigation actions |
| `StatCard` | ComparisonSummary (shared/aOnly/bOnly counts) | Metric display |

### 6.3 New Components (Query Analysis Specific)

| Component | Responsibility |
|-----------|---------------|
| `ModeToggle` | Three-mode pill toggle (comparison/heatmap/inspector) |
| `SortPills` | Horizontal pill group for sort options with disabled state |
| `FilterDropdown` | Multi-section dropdown with checkboxes and grouped options |
| `SearchInput` | Debounced text input with clear button |
| `ActiveFilterChips` | Removable chip badges showing active filter state |
| `QuerySelector` | Dropdown to select a query, showing query metadata |
| `ComparisonRow` | Side-by-side template row with bar, count, delta |
| `VariantRow` | Structural variant pair with similarity score |
| `ComparisonSummary` | Summary statistics bar with Jaccard similarity |
| `HeatmapGrid` | Table-based heatmap with sticky headers |
| `HeatmapRow` | Single template row with colored cells |
| `HeatmapHeader` | Sticky header row with query labels |
| `HeatmapCell` | Individual matrix cell with color and tooltip |
| `HeatmapLegend` | Color scale legend strip |
| `HeatmapTooltip` | Positioned tooltip on cell hover |
| `ShowAllToggle` | "Show all N templates" expandable trigger |
| `ReceiptList` | Scrollable list of receipts with filter |
| `ReceiptRow` | Single receipt with score badge and diagnostic icon |
| `ReceiptDetail` | Full anomaly framing breakdown panel |
| `ScoreCard` | Large score number with color coding |
| `ScoreBreakdown` | Factor table with category, base, modifiers, total |
| `PredictionVsActual` | Stacked prediction vs observation display |
| `BaselineSection` | Baseline text or "missing" empty state |
| `DiagnosticsSummary` | Check list with ok/warning/error icons |
| `LinkedEvidence` | Hypothesis and query links with navigation buttons |

---

## 7. Store Derivation Functions

### 7.1 New Method: `deriveQueryAnalysis()`

Added to `HuntDataStore`. Called by the panel host on init and store change events.

```typescript
deriveQueryAnalysis(options: {
  sortBy: 'count' | 'deviation' | 'novelty' | 'recency';
  filterQueries: string[] | null;
  filterTokens: string[] | null;
  filterScoreThreshold: number | null;
  searchText: string | null;
}): QueryAnalysisViewModel
```

**Implementation steps:**

1. **Collect all query templates:**
   ```typescript
   const queryTemplates: Map<string, Map<string, { count: number; percentage: number }>> = new Map();
   // Map<queryId, Map<templateId, { count, percentage }>>
   ```

2. **Build template union:** Collect all unique template IDs across all queries.

3. **Apply filters:**
   - If `filterQueries` is set, exclude queries not in the list.
   - If `filterTokens` is set, exclude templates not containing those tokens.
   - If `filterScoreThreshold` is set, only include templates from queries that have linked
     receipts with `deviationScore.totalScore >= threshold`.
   - If `searchText` is set, filter templates by substring match on template text.

4. **Sort templates:** Apply the selected sort order using the data collected.

5. **Build heatmap cells:** For each (template, query) pair, produce a cell with count or zero.

6. **Return extended ViewModel** (see Message Protocol section).

### 7.2 New Method: `deriveTemplateComparison(queryIdA, queryIdB)`

Computes the comparison-specific data: shared templates, A-only, B-only, structural variants,
deltas, and Jaccard similarity.

```typescript
deriveTemplateComparison(queryIdA: string, queryIdB: string): TemplateComparisonData
```

**Implementation:**

1. Load templates for both queries.
2. Build `Set<templateId>` for each.
3. Compute intersection (shared), setA - intersection (A-only), setB - intersection (B-only).
4. For unmatched templates, compute pairwise structural similarity.
5. Compute deltas for shared templates.
6. Compute Jaccard similarity coefficient.

### 7.3 New Method: `deriveReceiptInspector(receiptId?)`

Builds the receipt inspector data from the store.

```typescript
deriveReceiptInspector(receiptId?: string): ReceiptInspectorData
```

**Implementation:**

1. Get all receipts from store, sorted by deviation score descending.
2. For the selected receipt (if any), extract anomaly framing fields.
3. Run the same diagnostic checks as `EvidenceIntegrityDiagnostics.checkReceipt()` but return
   structured results instead of VS Code Diagnostic objects.
4. Resolve linked hypotheses and queries.

### 7.4 Template Similarity Function

Shared utility used by `deriveTemplateComparison()`:

```typescript
function computeTemplateSimilarity(templateA: string, templateB: string): number {
  const tokensA = templateA.split(/\s+/);
  const tokensB = templateB.split(/\s+/);
  const maxLen = Math.max(tokensA.length, tokensB.length);
  if (maxLen === 0) return 1.0;

  let matches = 0;
  const minLen = Math.min(tokensA.length, tokensB.length);
  for (let i = 0; i < minLen; i++) {
    if (tokensA[i] === tokensB[i]) {
      matches++;
    } else if (isMaskToken(tokensA[i]) && isMaskToken(tokensB[i])) {
      matches++;
    }
  }
  return matches / maxLen;
}

function isMaskToken(token: string): boolean {
  return /^<[A-Z_*]+>$/.test(token);
}
```

### 7.5 Novelty Score Computation

Templates are scored for novelty based on their first appearance across chronologically
ordered queries:

```typescript
function computeNoveltyScore(
  templateId: string,
  queryTemplates: Map<string, Map<string, { count: number }>>,
  queriesByTime: string[]   // query IDs sorted by executedAt ascending
): number {
  const firstAppearanceIndex = queriesByTime.findIndex(
    qId => queryTemplates.get(qId)?.has(templateId)
  );
  if (firstAppearanceIndex === -1) return 0;
  // Higher novelty = appeared later in the hunt
  return firstAppearanceIndex / Math.max(1, queriesByTime.length - 1);
}
```

Templates that appear only in the latest queries get novelty score close to 1.0.
Templates present from the first query get 0.0.

---

## 8. Message Protocol Additions

### 8.1 Updated `shared/query-analysis.ts`

The existing stub contract is extended significantly:

```typescript
// --- Template data flowing from host to webview ---

export interface QATemplate {
  templateId: string;
  template: string;              // template pattern text
  totalCount: number;            // sum across all queries
  queryCounts: Record<string, number>;  // queryId -> count in that query
  maxDeviationScore: number | null;     // max score from linked receipts
  noveltyScore: number;                 // 0.0 to 1.0
  firstSeenQueryId: string;             // earliest query containing this template
}

export interface QAQuery {
  queryId: string;
  title: string;
  connectorId: string;
  dataset: string;
  eventCount: number;
  templateCount: number;
  executedAt: string;
  timeWindow: { start: string; end: string } | null;
}

// --- Comparison-specific data ---

export interface QATemplateDelta {
  templateId: string;
  countA: number;
  countB: number;
  percentageA: number;
  percentageB: number;
  countDelta: number;
  percentageDelta: number;
  direction: 'increased' | 'decreased' | 'unchanged';
}

export interface QAStructuralVariant {
  templateIdA: string;
  templateA: string;
  countA: number;
  templateIdB: string;
  templateB: string;
  countB: number;
  similarity: number;
}

export interface QAComparisonData {
  queryIdA: string;
  queryIdB: string;
  shared: QATemplateDelta[];
  aOnly: QATemplate[];
  bOnly: QATemplate[];
  structuralVariants: QAStructuralVariant[];
  jaccardSimilarity: number;
  similarityLabel: string;       // "Moderate overlap", etc.
}

// --- Heatmap-specific data ---

export interface QAHeatmapCell {
  templateId: string;
  queryId: string;
  count: number;                 // 0 = absent
  percentage: number;            // percentage within that query
  intensityBucket: 0 | 1 | 2 | 3 | 4 | 5;  // pre-computed color bucket
}

// --- Receipt inspector data ---

export interface QADiagnosticCheck {
  name: string;                  // "Missing baseline", "Score inflation", etc.
  status: 'ok' | 'warning' | 'error' | 'info';
  message: string;
}

export interface QAReceiptSummary {
  receiptId: string;
  claimStatus: string;
  deviationScore: number | null;
  hasDiagnostics: boolean;
  relatedHypotheses: string[];
}

export interface QAReceiptDetail {
  receiptId: string;
  claim: string;
  claimStatus: string;
  resultStatus: string;
  anomalyFrame: {
    baseline: string;
    prediction: string;
    observation: string;
    deviationScore: {
      category: string;
      baseScore: number;
      modifiers: Array<{ factor: string; value: string; contribution: number }>;
      totalScore: number;
    };
    attackMapping: string[];
  } | null;
  diagnostics: QADiagnosticCheck[];
  relatedHypotheses: string[];
  relatedQueries: string[];
}

// --- Composite ViewModel ---

export type QAMode = 'comparison' | 'heatmap' | 'inspector';
export type QASortBy = 'count' | 'deviation' | 'novelty' | 'recency';

export interface QAFilterState {
  queries: string[] | null;      // null = all
  tokens: string[] | null;       // null = all
  scoreThreshold: number | null; // null = any
}

export interface QueryAnalysisViewModel {
  // Global
  mode: QAMode;
  sortBy: QASortBy;
  filters: QAFilterState;
  searchText: string;
  queries: QAQuery[];
  templates: QATemplate[];       // sorted, filtered
  sortAvailability: Record<QASortBy, boolean>;

  // Comparison mode
  comparison: QAComparisonData | null;

  // Heatmap mode
  heatmapCells: QAHeatmapCell[];

  // Inspector mode
  receiptList: QAReceiptSummary[];
  selectedReceipt: QAReceiptDetail | null;

  // Empty states
  emptyMessage: string | null;
}

// --- Boot data ---

export interface QueryAnalysisBootData {
  surfaceId: 'query-analysis';
  initialMode?: QAMode;
  initialQueryA?: string;
  initialQueryB?: string;
  initialReceiptId?: string;
}

// --- Host -> Webview messages ---

export type HostToQueryAnalysisMessage =
  | { type: 'init'; viewModel: QueryAnalysisViewModel; isDark: boolean }
  | { type: 'update'; viewModel: QueryAnalysisViewModel }
  | { type: 'theme'; isDark: boolean }
  | { type: 'stale'; affectedIds: string[] };

// --- Webview -> Host messages ---

export type QueryAnalysisToHostMessage =
  | { type: 'webview:ready' }
  | { type: 'mode:change'; mode: QAMode }
  | { type: 'sort:change'; sortBy: QASortBy }
  | { type: 'filter:change'; filters: QAFilterState }
  | { type: 'search:change'; text: string }
  | { type: 'comparison:selectA'; queryId: string }
  | { type: 'comparison:selectB'; queryId: string }
  | { type: 'heatmap:cellSelect'; templateId: string; queryId: string }
  | { type: 'heatmap:cellCompare'; templateId: string; queryId: string }
  | { type: 'inspector:selectReceipt'; receiptId: string }
  | { type: 'navigate'; target: string; artifactType?: string }
  | { type: 'blur' };
```

### 8.2 Message Flow Diagrams

**Initialization:**
```
Webview                    Extension Host
  |                              |
  |--- webview:ready ----------->|
  |                              | deriveQueryAnalysis(defaults)
  |<--- init { viewModel } ------|
  |                              |
```

**Sort change:**
```
Webview                    Extension Host
  |                              |
  |--- sort:change { 'novelty' }->|
  |                              | re-derive with new sortBy
  |<--- update { viewModel } ----|
  |                              |
```

**Comparison query selection:**
```
Webview                    Extension Host
  |                              |
  |--- comparison:selectB ------>|
  |    { queryId: 'QRY-005' }   | deriveTemplateComparison(A, B)
  |                              | merge into ViewModel
  |<--- update { viewModel } ----|
  |                              |
```

**Heatmap cell click -> open Drain Viewer:**
```
Webview                    Extension Host
  |                              |
  |--- heatmap:cellSelect ------>|
  |    { templateId, queryId }   | DrainTemplatePanel.createOrShow(queryId)
  |                              | select template in Drain Viewer
  |                              |
```

**Receipt inspector -> navigate to artifact:**
```
Webview                    Extension Host
  |                              |
  |--- navigate ----------------->|
  |    { target: 'RCT-001',      | vscode.workspace.openTextDocument
  |      artifactType: 'receipt' }| vscode.window.showTextDocument
  |                              |
```

---

## 9. CSS Token Additions

### 9.1 New Tokens in `webview/shared/tokens.css`

All new classes use the `hunt-qa-` prefix (Query Analysis namespace).

```css
/* ==========================================================================
   Component Styles -- Query Analysis Toolbar
   ========================================================================== */

.hunt-qa-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--hunt-panel-border);
  margin-bottom: 16px;
}

.hunt-qa-sort-pills {
  display: inline-flex;
  gap: 2px;
  background: var(--hunt-surface);
  border-radius: 999px;
  padding: 2px;
  border: 1px solid var(--hunt-panel-border);
}

.hunt-qa-sort-pill {
  padding: 5px 12px;
  border-radius: 999px;
  border: none;
  background: transparent;
  color: var(--hunt-text-muted);
  font-size: 11px;
  font-family: inherit;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}

.hunt-qa-sort-pill--active {
  background: var(--hunt-accent);
  color: var(--hunt-bg);
}

.hunt-qa-sort-pill--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.hunt-qa-sort-pill:focus-visible {
  outline: 2px solid var(--hunt-accent);
  outline-offset: 2px;
}

.hunt-qa-search {
  flex: 1;
  min-width: 200px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--hunt-panel-border);
  background: var(--hunt-surface);
  color: var(--hunt-text);
  font-size: 13px;
  font-family: inherit;
}

.hunt-qa-search:focus {
  outline: 2px solid var(--hunt-accent);
  outline-offset: -2px;
  border-color: var(--hunt-accent);
}

.hunt-qa-search::placeholder {
  color: var(--hunt-text-muted);
}

.hunt-qa-filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.hunt-qa-filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  background: color-mix(in srgb, var(--hunt-accent) 14%, transparent);
  color: var(--hunt-text);
  border: none;
  cursor: pointer;
}

.hunt-qa-filter-chip__remove {
  font-size: 10px;
  opacity: 0.6;
}

.hunt-qa-filter-chip:hover .hunt-qa-filter-chip__remove {
  opacity: 1;
}

/* ==========================================================================
   Component Styles -- Query Analysis Comparison
   ========================================================================== */

.hunt-qa-comparison {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.hunt-qa-comparison-column {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hunt-qa-comparison-header {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hunt-text-muted);
  padding-bottom: 8px;
  border-bottom: 1px solid var(--hunt-panel-border);
}

.hunt-qa-comparison-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--hunt-surface);
  cursor: pointer;
  transition: transform 120ms ease;
}

.hunt-qa-comparison-row:hover {
  transform: translateY(-1px);
}

.hunt-qa-comparison-row:focus-visible {
  outline: 2px solid var(--hunt-accent);
  outline-offset: -2px;
}

.hunt-qa-comparison-row--a-only {
  border-left: 3px solid var(--hunt-accent);
}

.hunt-qa-comparison-row--b-only {
  border-right: 3px solid var(--hunt-warning);
}

.hunt-qa-comparison-row--variant {
  border-left: 3px dashed var(--hunt-text-muted);
}

.hunt-qa-delta {
  font-size: 12px;
  font-weight: 600;
}

.hunt-qa-delta--increased { color: var(--hunt-danger); }
.hunt-qa-delta--decreased { color: var(--hunt-success); }
.hunt-qa-delta--unchanged { color: var(--hunt-text-muted); }

.hunt-qa-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--hunt-surface-strong);
  overflow: hidden;
  flex: 1;
}

.hunt-qa-bar__fill {
  height: 100%;
  border-radius: 3px;
  background: var(--hunt-accent);
  transition: width 300ms ease;
}

.hunt-qa-comparison-summary {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px;
  border-radius: 12px;
  background: var(--hunt-surface);
  border: 1px solid var(--hunt-panel-border);
  margin-top: 12px;
}

/* ==========================================================================
   Component Styles -- Query Analysis Heatmap
   ========================================================================== */

.hunt-qa-heatmap {
  width: 100%;
  overflow: auto;
  max-height: 70vh;
}

.hunt-qa-heatmap table {
  border-collapse: separate;
  border-spacing: 2px;
  width: 100%;
  min-width: 400px;
}

.hunt-qa-heatmap th {
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--hunt-text-muted);
  padding: 6px 4px;
  text-align: center;
  position: sticky;
  top: 0;
  background: var(--hunt-bg);
  z-index: 10;
}

.hunt-qa-heatmap th.hunt-qa-heatmap__row-label {
  text-align: left;
  font-weight: 600;
  color: var(--hunt-text);
  position: sticky;
  left: 0;
  z-index: 20;
  background: var(--hunt-bg);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hunt-qa-heatmap__cell {
  width: 48px;
  height: 36px;
  min-width: 48px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: transform 120ms ease;
  position: relative;
}

.hunt-qa-heatmap__cell:hover {
  transform: scale(1.15);
  z-index: 10;
}

.hunt-qa-heatmap__cell:focus-visible {
  outline: 2px solid var(--hunt-accent);
  outline-offset: 2px;
}

.hunt-qa-heatmap__cell--0 { background: transparent; color: var(--hunt-text-muted); }
.hunt-qa-heatmap__cell--1 { background: color-mix(in srgb, var(--hunt-accent) 12%, transparent); }
.hunt-qa-heatmap__cell--2 { background: color-mix(in srgb, var(--hunt-accent) 28%, transparent); }
.hunt-qa-heatmap__cell--3 { background: color-mix(in srgb, var(--hunt-accent) 48%, transparent); }
.hunt-qa-heatmap__cell--4 { background: color-mix(in srgb, var(--hunt-accent) 72%, transparent); color: var(--hunt-bg); }
.hunt-qa-heatmap__cell--5 { background: var(--hunt-accent); color: var(--hunt-bg); }

.hunt-qa-heatmap__zero {
  font-size: 10px;
  color: var(--hunt-text-muted);
  opacity: 0.5;
}

.hunt-qa-heatmap__legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 10px;
  color: var(--hunt-text-muted);
}

.hunt-qa-heatmap__legend-swatch {
  width: 16px;
  height: 12px;
  border-radius: 2px;
}

.hunt-qa-show-all {
  text-align: center;
  padding: 10px;
  font-size: 12px;
  color: var(--hunt-accent);
  cursor: pointer;
  border: none;
  background: none;
  width: 100%;
}

.hunt-qa-show-all:hover {
  text-decoration: underline;
}

/* ==========================================================================
   Component Styles -- Query Analysis Receipt Inspector
   ========================================================================== */

.hunt-qa-inspector {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  min-height: 400px;
}

@media (max-width: 700px) {
  .hunt-qa-inspector {
    grid-template-columns: 1fr;
  }
}

.hunt-qa-receipt-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 70vh;
  overflow-y: auto;
  border-right: 1px solid var(--hunt-panel-border);
  padding-right: 12px;
}

.hunt-qa-receipt-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 120ms ease;
  border: none;
  background: none;
  color: inherit;
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  width: 100%;
}

.hunt-qa-receipt-row:hover {
  background: var(--hunt-surface);
}

.hunt-qa-receipt-row--selected {
  background: var(--hunt-surface-strong);
  font-weight: 600;
}

.hunt-qa-receipt-row:focus-visible {
  outline: 2px solid var(--hunt-accent);
  outline-offset: -2px;
}

.hunt-qa-receipt-row__id {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hunt-qa-receipt-row__flag {
  color: var(--hunt-warning);
  font-weight: 700;
}

.hunt-qa-score-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border-radius: 16px;
  background: var(--hunt-surface);
  margin-bottom: 16px;
}

.hunt-qa-score-card__number {
  font-size: 48px;
  font-weight: 700;
  line-height: 1;
}

.hunt-qa-score-card__number--low { color: var(--hunt-text-muted); }
.hunt-qa-score-card__number--medium { color: var(--hunt-warning); }
.hunt-qa-score-card__number--high { color: var(--hunt-danger); }

.hunt-qa-score-card__label {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hunt-text-muted);
}

.hunt-qa-breakdown-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.hunt-qa-breakdown-table th {
  text-align: left;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hunt-text-muted);
  padding: 6px 8px;
  border-bottom: 1px solid var(--hunt-panel-border);
}

.hunt-qa-breakdown-table td {
  padding: 6px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--hunt-panel-border) 50%, transparent);
}

.hunt-qa-breakdown-table__total {
  font-weight: 600;
  border-top: 2px solid var(--hunt-panel-border);
}

.hunt-qa-prediction-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 12px;
  background: var(--hunt-surface);
}

.hunt-qa-prediction-label {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-weight: 600;
}

.hunt-qa-prediction-label--benign { color: var(--hunt-success); }
.hunt-qa-prediction-label--malicious { color: var(--hunt-danger); }
.hunt-qa-prediction-label--actual { color: var(--hunt-accent); }

.hunt-qa-prediction-text {
  font-size: 13px;
  line-height: 1.5;
  padding: 8px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--hunt-surface-strong) 50%, var(--hunt-bg));
}

.hunt-qa-diagnostic-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hunt-qa-diagnostic-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.4;
}

.hunt-qa-diagnostic-item--ok {
  color: var(--hunt-success);
}

.hunt-qa-diagnostic-item--warning {
  color: var(--hunt-warning);
  background: color-mix(in srgb, var(--hunt-warning) 6%, transparent);
}

.hunt-qa-diagnostic-item--error {
  color: var(--hunt-danger);
  background: color-mix(in srgb, var(--hunt-danger) 6%, transparent);
}

.hunt-qa-diagnostic-item--info {
  color: var(--hunt-text-muted);
}

.hunt-qa-score-inconsistency {
  padding: 8px 14px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--hunt-warning) 12%, transparent);
  border: 1px solid var(--hunt-warning);
  font-size: 12px;
  color: var(--hunt-text);
  margin-bottom: 12px;
}

/* ==========================================================================
   Component Styles -- Query Analysis Section Headings
   ========================================================================== */

.hunt-qa-section-heading {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--hunt-text-muted);
  margin: 18px 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.hunt-qa-section-heading__count {
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 10px;
  background: color-mix(in srgb, var(--hunt-text-muted) 14%, transparent);
}

/* ==========================================================================
   Component Styles -- Query Analysis Empty State
   ========================================================================== */

.hunt-qa-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 24px;
  text-align: center;
  color: var(--hunt-text-muted);
}

.hunt-qa-empty__icon {
  font-size: 36px;
  opacity: 0.4;
}

.hunt-qa-empty__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--hunt-text);
}

.hunt-qa-empty__description {
  font-size: 13px;
  max-width: 400px;
  line-height: 1.5;
}

/* ==========================================================================
   Component Styles -- Query Selector
   ========================================================================== */

.hunt-qa-query-selector {
  width: 100%;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--hunt-panel-border);
  background: var(--hunt-surface);
  color: var(--hunt-text);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}

.hunt-qa-query-selector:focus-visible {
  outline: 2px solid var(--hunt-accent);
  outline-offset: -2px;
}

/* ==========================================================================
   Component Styles -- Query Analysis Tooltip
   ========================================================================== */

.hunt-qa-tooltip {
  position: fixed;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--hunt-surface-strong);
  border: 1px solid var(--hunt-panel-border);
  box-shadow: var(--hunt-shadow);
  font-size: 12px;
  line-height: 1.5;
  color: var(--hunt-text);
  pointer-events: none;
  z-index: 100;
  max-width: 300px;
}

.hunt-qa-tooltip__row {
  display: flex;
  gap: 8px;
}

.hunt-qa-tooltip__label {
  color: var(--hunt-text-muted);
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.08em;
  min-width: 60px;
}
```

### 9.2 Token Variable Additions

No new `--hunt-*` custom property variables are needed. The existing token set covers all
required semantics:
- `--hunt-accent` for heatmap scale and active states
- `--hunt-success`, `--hunt-danger`, `--hunt-warning` for delta/score coloring
- `--hunt-surface`, `--hunt-surface-strong` for backgrounds
- `--hunt-panel-border` for borders
- `--hunt-text`, `--hunt-text-muted` for text

The heatmap cell color buckets are computed inline using `color-mix()` from `--hunt-accent`,
consistent with the established pattern.

---

## 10. Keyboard Navigation Plan

### 10.1 Global Panel Navigation

| Key | Action |
|-----|--------|
| `Tab` | Cycle through top-level regions: mode toggle -> toolbar -> content area |
| `Escape` | Close tooltip, clear search, or blur panel (sends `blur` message) |

### 10.2 Mode Toggle

Reuses the Evidence Board `hunt-eb-mode-toggle` pattern:
| Key | Action |
|-----|--------|
| `ArrowLeft` / `ArrowRight` | Move between mode pills |
| `Enter` / `Space` | Activate selected mode |

Implemented via `useRovingTabindex(modeToggleRef, '.hunt-qa-mode-pill')`.

### 10.3 Sort Pills

Same roving tabindex pattern:
| Key | Action |
|-----|--------|
| `ArrowLeft` / `ArrowRight` | Move between sort pills |
| `Enter` / `Space` | Activate selected sort |

Implemented via `useRovingTabindex(sortPillsRef, '.hunt-qa-sort-pill')`.

### 10.4 Comparison View

Template rows are keyboard-navigable:
| Key | Action |
|-----|--------|
| `ArrowDown` / `ArrowUp` | Move between template rows |
| `Enter` | Open selected template in Drain Viewer |
| `Home` / `End` | Jump to first/last template row |

Implemented via `useRovingTabindex(comparisonRef, '.hunt-qa-comparison-row')`.

### 10.5 Heatmap Grid

The heatmap uses a 2D roving tabindex. This is a new hook, `useGridNavigation`:

| Key | Action |
|-----|--------|
| `ArrowRight` | Move to next cell in row |
| `ArrowLeft` | Move to previous cell in row |
| `ArrowDown` | Move to same column in next row |
| `ArrowUp` | Move to same column in previous row |
| `Home` | Move to first cell in row |
| `End` | Move to last cell in row |
| `Enter` | Activate cell (open Drain Viewer for that query+template) |

Implementation: A new `useGridNavigation` hook that wraps the roving tabindex
pattern for 2D grid traversal. This hook is specific to the Query Analysis surface
and lives in `webview/query-analysis/hooks/useGridNavigation.ts` (not in shared/
since no other surface needs 2D grid nav).

### 10.6 Receipt Inspector

Receipt list: standard roving tabindex
| Key | Action |
|-----|--------|
| `ArrowDown` / `ArrowUp` | Move between receipt rows |
| `Enter` | Select receipt to show detail |
| `Home` / `End` | Jump to first/last receipt |

Receipt detail: standard tab order through sections and buttons.

### 10.7 Search Input

| Key | Action |
|-----|--------|
| `Escape` | Clear search text and blur search input |
| `/` (from any non-input context) | Focus search input |

The `/` shortcut is implemented as a document-level keydown listener that checks
`event.target` is not an input/textarea before focusing.

---

## 11. Performance Strategy

### 11.1 Problem Statement

A hunt with 50+ queries and 500+ templates produces:
- Heatmap: 25,000+ cells (50 queries x 500 templates)
- Comparison: up to 500 template rows with delta calculations
- Inspector: up to 50+ receipts with full anomaly framing
- Structural variant detection: O(n^2) pairwise comparisons on unmatched templates

### 11.2 Extension Host Optimizations

**Derive function memoization:**
The `deriveQueryAnalysis()` method caches its result and returns the cached value if the
store has not changed since the last derivation. Cache invalidation is triggered by
`store.onDidChange`.

```typescript
private _qaCache: { version: number; options: string; result: QueryAnalysisViewModel } | null = null;
private _qaVersion = 0;

deriveQueryAnalysis(options: QADeriveOptions): QueryAnalysisViewModel {
  const optionsKey = JSON.stringify(options);
  if (this._qaCache && this._qaCache.version === this._qaVersion && this._qaCache.options === optionsKey) {
    return this._qaCache.result;
  }
  const result = this._computeQueryAnalysis(options);
  this._qaCache = { version: this._qaVersion, options: optionsKey, result };
  return result;
}
```

Cache version is incremented on every store change event.

**Structural variant detection budget:**
Pairwise comparison is O(n^2) but bounded:
- Only unmatched templates are compared (typically < 20% of total)
- If unmatched count > 100, skip variant detection and show a note:
  "Too many unmatched templates for structural variant detection (N templates).
  Narrow your query selection."
- Each similarity computation is O(max_tokens) where max_tokens rarely exceeds 20.

**Heatmap cell precomputation:**
Intensity buckets are computed once in the host when building the ViewModel. The webview
receives pre-bucketed values (0-5) and maps them directly to CSS classes without any
computation.

### 11.3 Webview Optimizations

**Virtualized heatmap rows:**
When template count exceeds 100, only the visible rows plus a 20-row buffer above and
below the viewport are rendered. Implemented with a lightweight scroll-position-based
approach (no external virtualization library):

```typescript
function useVirtualRows(totalRows: number, rowHeight: number, containerRef: RefObject<HTMLElement>) {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      const scrollTop = container.scrollTop;
      const viewHeight = container.clientHeight;
      const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 20);
      const end = Math.min(totalRows, Math.ceil((scrollTop + viewHeight) / rowHeight) + 20);
      setVisibleRange({ start, end });
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener('scroll', onScroll);
  }, [totalRows, rowHeight, containerRef]);

  return visibleRange;
}
```

**Memoized components:**
- `ComparisonRow` is memoized: only re-renders when its template data changes.
- `HeatmapRow` is memoized: only re-renders when its cell data changes.
- `ReceiptRow` is memoized: only re-renders when the receipt or selection state changes.

**Debounced search:**
Search input is debounced at 150ms. The raw input state updates immediately (controlled
component), but the `search:change` message to the host is throttled.

**Lazy mode rendering:**
Only the active mode's component tree is mounted. Inactive modes are unmounted entirely
(the `{mode === 'x' && ...}` pattern), not hidden. This ensures zero overhead from
inactive views.

### 11.4 Bundle Size Budget

Target: < 80 KB for `webview-query-analysis.js` (ESM, unminified).
This is comparable to the evidence board bundle (65 KB). The query analysis surface uses
no external visualization libraries (no d3, no Observable Plot). All rendering is
plain Preact + CSS.

---

## 12. Accessibility

### 12.1 ARIA Roles and Labels

| Component | ARIA Role | ARIA Label |
|-----------|-----------|------------|
| Mode toggle container | `role="tablist"` | `aria-label="Analysis mode"` |
| Mode toggle button | `role="tab"` | `aria-selected="true/false"` |
| Sort pills container | `role="toolbar"` | `aria-label="Sort templates"` |
| Sort pill button | `role="radio"` | `aria-checked="true/false"` |
| Search input | `role="searchbox"` | `aria-label="Search template patterns"` |
| Comparison template list | `role="list"` | `aria-label="Template comparison"` |
| Comparison row | `role="listitem"` | -- |
| Heatmap grid | `role="grid"` | `aria-label="Template frequency matrix"` |
| Heatmap row | `role="row"` | -- |
| Heatmap cell | `role="gridcell"` | `aria-label="{template} in {query}: {count} events"` |
| Receipt list | `role="listbox"` | `aria-label="Receipts"` |
| Receipt row | `role="option"` | `aria-selected="true/false"` |
| Score card | `role="status"` | `aria-label="Deviation score: {n}"` |
| Diagnostic item | -- | `aria-label="{status}: {message}"` |

### 12.2 Color Independence

Every color-encoded element has a secondary non-color indicator:

| Color Encoding | Non-Color Fallback |
|---------------|-------------------|
| Heatmap cell intensity | Count number displayed in cell (hidden only at > 50 queries when cells shrink) |
| Delta direction colors (red/green) | Arrow direction icon (up/down/neutral) |
| Score badge colors | Numeric score always shown alongside badge |
| Diagnostic status colors | Icon prefix: checkmark (ok), triangle-exclamation (warning), circle-x (error) |
| A-only / B-only borders | Text label "A-only" / "B-only" in the section header |
| Receipt claim status | Icon: checkmark / X / dash |

### 12.3 Focus Management

- When mode changes, focus moves to the first interactive element in the new mode's content area.
- When a receipt is selected in the inspector list, focus moves to the detail panel header.
- Tooltips are `aria-hidden="true"` (decorative; all critical info is in `aria-label` attributes).
- Filter dropdown uses `aria-expanded` and `aria-controls`.

### 12.4 Screen Reader Announcements

Sort and filter changes are announced via a visually hidden live region:

```html
<div aria-live="polite" aria-atomic="true" class="sr-only">
  {announcement}
</div>
```

Examples:
- "Sorted by deviation score, 47 templates"
- "Filtered to 3 queries, 12 templates"
- "Search: 'failed', 5 matches"

### 12.5 Reduced Motion

All transitions respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  .hunt-qa-comparison-row,
  .hunt-qa-heatmap__cell,
  .hunt-qa-bar__fill {
    transition: none;
  }
}
```

---

## 13. Implementation Plan

### 13.1 Sub-Phase Overview

| Sub-Phase | Feature | Scope | Estimated Effort |
|-----------|---------|-------|-----------------|
| 15-01 | Foundation & Sort/Filter Controls | Message contract, panel provider, toolbar components, store derive stub | 1-2 hours |
| 15-02 | Template Comparison View | Side-by-side comparison layout, matching algorithm, delta display | 2-3 hours |
| 15-03 | Heatmap Grid | Matrix rendering, cell interactions, virtualized rows, legend | 2-3 hours |
| 15-04 | Receipt QA Inspector | Receipt list, anomaly framing breakdown, diagnostics integration | 2-3 hours |
| 15-05 | Polish & Integration | Cross-surface navigation, Drain Viewer context actions, empty states, keyboard navigation refinement | 1-2 hours |

**Total estimated effort:** 8-13 hours

### 13.2 Sub-Phase 15-01: Foundation & Sort/Filter Controls

**Objective:** Replace the stub webview with the shell for all three modes, wire the panel
provider and message bridge, implement the toolbar components.

**Tasks:**

1. **Extend `shared/query-analysis.ts`** with the full message contract defined in Section 8.
   Replace the existing stub types with the complete `QueryAnalysisViewModel`, `QATemplate`,
   `QAQuery`, `QAComparisonData`, `QAHeatmapCell`, `QAReceiptSummary`, `QAReceiptDetail`,
   and all message union types.

2. **Create `src/queryAnalysisPanel.ts`** following the `DrainTemplatePanel` pattern:
   - `QueryAnalysisPanel` class with `createOrShow()` static factory
   - Singleton panel (one at a time)
   - Subscribes to `store.onDidChange` for reactive updates
   - Handles all `QueryAnalysisToHostMessage` variants
   - Supports `QueryAnalysisBootData` for initial mode/query/receipt targeting
   - Register `thruntGod.openQueryAnalysis` command in `package.json`

3. **Add `deriveQueryAnalysis()` to `src/store.ts`** as a stub returning empty data.
   The stub returns valid structure with empty arrays/nulls so the webview renders empty states.
   Full implementation deferred to 15-02/15-03/15-04 as each mode's data needs are built.

4. **Add Query Analysis CSS to `webview/shared/tokens.css`:** All `hunt-qa-*` classes from
   Section 9. Add them as a new labeled section following the Evidence Board section.

5. **Replace `webview/query-analysis/index.tsx`** stub with the shell app:
   - `QueryAnalysisApp` component with mode toggle, toolbar, and placeholder content areas
   - `ModeToggle` component (reusing `hunt-eb-mode-toggle` pattern)
   - `SortPills`, `FilterDropdown`, `SearchInput`, `ActiveFilterChips` components
   - Wire `useHostMessage`, `useTheme`, `createVsCodeApi`
   - Mode state management with `useState`
   - Sort/filter/search state communicated to host via messages

6. **Register command in `src/extension.ts`:** Add `thruntGod.openQueryAnalysis` alongside
   existing panel commands.

**Verification:**
- `npm run build` succeeds with 4 webview bundles (drain, hunt-overview, evidence-board, query-analysis)
- Opening the Query Analysis panel shows mode toggle with three pills
- Switching modes shows placeholder content
- Sort pills toggle active state
- Search input accepts text and sends debounced messages
- `tsc --noEmit` passes clean

### 13.3 Sub-Phase 15-02: Template Comparison View

**Objective:** Implement the side-by-side comparison layout with template matching, delta
calculations, and structural variant detection.

**Tasks:**

1. **Implement `deriveTemplateComparison()` in `src/store.ts`:**
   - Template matching (exact ID, structural variant, unmatched)
   - `computeTemplateSimilarity()` utility
   - Delta calculation for shared templates
   - Jaccard similarity coefficient
   - Wire into `deriveQueryAnalysis()` when mode is `comparison`

2. **Implement comparison components in `webview/query-analysis/`:**
   - `QuerySelector` dropdown with query metadata
   - `ComparisonRow` with bar chart, count, percentage, delta indicator
   - `VariantRow` with similarity badge
   - `SectionHeader` with count badge
   - `ComparisonSummary` with StatCards and similarity score

3. **Wire comparison messages:**
   - `comparison:selectA` / `comparison:selectB` -> re-derive and update
   - Handle default query selection (most templates, second-most templates)

4. **Implement comparison-specific sorting and filtering:**
   - Sort applies to template row ordering within each section
   - Filter applies to which templates are shown
   - Search applies to template text matching

**Verification:**
- Select two queries and see shared/A-only/B-only/variant sections
- Delta indicators show correct direction and color
- Similarity score matches manual calculation
- Structural variants detected for templates with > 0.7 similarity
- Sort changes re-order template rows
- Search filters template rows

### 13.4 Sub-Phase 15-03: Heatmap Grid

**Objective:** Implement the matrix visualization with cell interactions, sticky headers,
virtualized rendering, and legend.

**Tasks:**

1. **Implement heatmap data in `deriveQueryAnalysis()`:**
   - Build `QAHeatmapCell[]` from all query/template combinations
   - Compute intensity buckets (0-5) based on count normalization
   - Sort columns by `executedAt`, rows by active sort mode

2. **Implement heatmap components:**
   - `HeatmapGrid` table with sticky row/column headers
   - `HeatmapRow` with cells mapped to CSS intensity classes
   - `HeatmapCell` with hover tooltip trigger
   - `HeatmapHeader` with query labels and connector info
   - `HeatmapLegend` color scale strip
   - `HeatmapTooltip` positioned tooltip component
   - `ShowAllToggle` for truncated template lists

3. **Implement `useVirtualRows` hook** for template row virtualization when count > 100.

4. **Implement `useGridNavigation` hook** for 2D keyboard traversal of the heatmap.

5. **Wire heatmap interactions:**
   - `heatmap:cellSelect` -> open Drain Viewer for that query+template
   - `heatmap:cellCompare` -> switch to comparison mode with that query as Query A
   - Zero cells display `--` in muted text

**Verification:**
- Matrix renders with correct row/column ordering
- Cell colors match count intensity
- Sticky headers remain visible during horizontal/vertical scroll
- Hover tooltip shows correct template/query/count data
- Click cell opens Drain Template Viewer
- Keyboard navigation moves through cells in 2D
- Show all toggle expands truncated rows
- Performance: smooth scroll at 200+ template rows

### 13.5 Sub-Phase 15-04: Receipt QA Inspector

**Objective:** Implement the receipt list, anomaly framing breakdown, and diagnostics integration.

**Tasks:**

1. **Implement `deriveReceiptInspector()` in `src/store.ts`:**
   - Build receipt summary list from all receipts, sorted by deviation score
   - For selected receipt, extract anomaly framing breakdown
   - Run diagnostic checks (reusing logic from `EvidenceIntegrityDiagnostics`)
   - Extract into a shared `checkReceiptStructured()` function that returns
     `QADiagnosticCheck[]` instead of `vscode.Diagnostic[]`

2. **Implement inspector components:**
   - `ReceiptList` with filter dropdown and `useRovingTabindex`
   - `ReceiptRow` with score badge, claim status icon, diagnostic flag
   - `ReceiptDetail` container with section layout
   - `ScoreCard` with large number and color coding
   - `ScoreBreakdown` table with category, base score, modifiers, total
   - `PredictionVsActual` with labeled sections and text highlighting
   - `BaselineSection` with content or empty state
   - `DiagnosticsSummary` with check list and status icons
   - `LinkedEvidence` with hypothesis/query links and navigation buttons
   - Score inconsistency warning banner

3. **Wire inspector messages:**
   - `inspector:selectReceipt` -> update selected receipt detail
   - `navigate` -> open receipt or query artifact in editor
   - Receipt filter -> re-derive receipt list

4. **Handle receipt with no anomaly frame:** Empty state with "Open Receipt to Add Framing" action.

**Verification:**
- Receipt list shows all receipts sorted by deviation score
- Selecting a receipt populates the detail panel
- Score breakdown table matches receipt data
- Prediction vs actual sections render correctly
- Diagnostic checks match `EvidenceIntegrityDiagnostics` results
- Navigation buttons open correct artifacts
- Filter by hypothesis/score/flagged works
- Empty anomaly frame state displays correctly

### 13.6 Sub-Phase 15-05: Polish & Integration

**Objective:** Wire cross-surface navigation, add Drain Viewer context actions, polish
empty states, and refine keyboard navigation.

**Tasks:**

1. **Add Drain Viewer context actions:**
   - In `src/drainViewer.ts`, add new message handler for `template:compare` that opens
     the Query Analysis panel in comparison mode with the current query as Query A
   - Add `template:inspectReceipt` message that opens Query Analysis in inspector mode
     with the linked receipt pre-selected

2. **Add sidebar context menu integration:**
   - Add "Open in Query Analysis" context menu option to QRY-* sidebar nodes
   - Add "QA Inspector" context menu option to RCT-* sidebar nodes

3. **Implement empty states for all modes:**
   - Comparison: "At least 2 queries with template data are needed"
   - Heatmap: "No queries with template data available"
   - Inspector: "No receipts available in this hunt"

4. **Add live region announcements** for sort/filter/search changes.

5. **Add `prefers-reduced-motion` CSS** for all animated transitions.

6. **Test keyboard navigation** across all modes and fix tab order issues.

7. **Update `package.json` contribution points:**
   - Add `thruntGod.openQueryAnalysis` command
   - Add keybinding (optional: `Ctrl+Shift+Q` for query analysis)

**Verification:**
- From Drain Viewer, "Compare Templates..." opens comparison with correct query
- From sidebar, context menus open correct modes
- Empty states display for all three modes when data is missing
- Screen reader announcements fire on sort/filter/search
- Keyboard navigation works end-to-end in all modes
- `prefers-reduced-motion` disables transitions
- Full build passes, bundle size within budget

---

## Appendix A: Data Flow Summary

```
.hunt/QUERIES/QRY-*.md
.hunt/RECEIPTS/RCT-*.md
.hunt/HYPOTHESES.md
.hunt/EVIDENCE_REVIEW.md
       |
       v
  ArtifactWatcher (debounce 300ms)
       |
       v
  HuntDataStore
    .getQueries()
    .getReceipts()
    .getReceiptsForQuery()
    .getEvidenceReview()
       |
       v
  deriveQueryAnalysis(options)
  deriveTemplateComparison(queryA, queryB)
  deriveReceiptInspector(receiptId)
       |
       v
  QueryAnalysisPanel
    postMessage({ type: 'init', viewModel })
    postMessage({ type: 'update', viewModel })
       |
       v
  Webview (Preact)
    useHostMessage -> update state
    ModeToggle / Toolbar / ComparisonView / HeatmapView / InspectorView
```

## Appendix B: File Manifest

Files created or modified in Phase 15:

| Path | Action | Sub-Phase |
|------|--------|-----------|
| `shared/query-analysis.ts` | **Replace** stub with full contract | 15-01 |
| `src/queryAnalysisPanel.ts` | **Create** panel provider | 15-01 |
| `src/store.ts` | **Modify** add 3 derive methods + cache | 15-01 through 15-04 |
| `src/diagnostics.ts` | **Modify** extract `checkReceiptStructured()` | 15-04 |
| `webview/shared/tokens.css` | **Modify** add `hunt-qa-*` classes | 15-01 |
| `webview/query-analysis/index.tsx` | **Replace** stub with full app | 15-01 through 15-05 |
| `webview/query-analysis/hooks/useGridNavigation.ts` | **Create** 2D grid nav hook | 15-03 |
| `src/extension.ts` | **Modify** register command | 15-01 |
| `src/drainViewer.ts` | **Modify** add context actions | 15-05 |
| `package.json` | **Modify** add command contribution | 15-01 |

## Appendix C: Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Structural variant detection O(n^2) at scale | Budget cap: skip if unmatched > 100, show user message |
| Heatmap scroll performance at 500+ rows | Virtual row rendering, only mount visible + 20-row buffer |
| Large ViewModel serialization over postMessage | Memoize derive result, only send deltas when possible |
| Webview bundle size growth | No new dependencies; all rendering is Preact + CSS |
| Cross-panel coordination (Drain Viewer + Query Analysis) | Both use `store.onDidChange`; no direct panel-to-panel messaging |
| Search debounce UX | 150ms debounce is responsive enough; show loading indicator if derive takes > 200ms |
