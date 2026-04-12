# Phase 77: Cross-Hunt Intelligence + Knowledge Dashboard - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Final phase of v4.0. Builds cross-hunt analytical queries, hunt comparison command, and knowledge dashboard canvas. This completes the Obsidian Knowledge Weapon milestone.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation at Claude's discretion — requirements are clear:

1. **Cross-hunt intelligence queries**: Update CROSS_HUNT_INTEL.md (or KNOWLEDGE_BASE.md) with Dataview queries for recurring IOCs (seen in 2+ hunts via hunt_refs frontmatter), TTP coverage gaps (hunt_count: 0, grouped by tactic), and actor convergence (hunts sharing 3+ IOCs). Can be embedded Dataview queries or command-generated markdown tables.

2. **Compare hunts command**: Given two hunt workspace paths (planning dirs), scan entity folders in both, identify shared entities (same file name), divergent findings, and combined technique coverage. Output as a markdown comparison report.

3. **Knowledge dashboard canvas**: Generate a `.canvas` file showing hunts by recency (larger = more recent), top entities by sighting count, hunt-to-entity connections. Uses canvas generator from Phase 76.

- All query logic as pure functions for testability
- Comparison command should use a modal to pick the two workspaces
- Dashboard canvas uses the canvas generator patterns from Phase 76

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Canvas generator from Phase 76 (generateKillChainCanvas pattern)
- Dataview query templates from KNOWLEDGE_BASE.md (Phase 69)
- Entity folder scanning from workspace.ts
- VaultAdapter for file reads across workspaces
- ENTITY_TYPES and entity frontmatter schemas

### Integration Points
- New `cross-hunt.ts` — pure module for query generation and hunt comparison
- `canvas-generator.ts` — add dashboard layout generator
- `main.ts` — register compare-hunts and generate-dashboard commands
- `workspace.ts` — add cross-hunt methods

</code_context>

<specifics>
## Specific Ideas

- Cross-hunt queries can leverage Dataview if installed, or fall back to plugin-generated markdown
- Hunt comparison should be a clean markdown table showing shared/unique entities
- Dashboard canvas should have a central "Program" node with radial hunt nodes

</specifics>

<deferred>
## Deferred Ideas

None — this is the final phase of v4.0.

</deferred>
