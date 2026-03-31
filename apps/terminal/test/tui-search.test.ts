import { describe, expect, test } from "bun:test"
import {
  DEFAULT_SUGGESTIONS,
  buildConnectorResults,
  buildPhaseResults,
  buildReportHistoryResults,
  buildSearchCatalog,
  rankSearchResults,
} from "../src/tui/search"

describe("tui search catalog", () => {
  test("builds history and connector results with copy text and targets", () => {
    const historyResults = buildReportHistoryResults([
      {
        version: 1,
        reportId: "report-1",
        title: "Suspicious OAuth grants",
        severity: "high",
        summary: "Broad delegated scopes were granted to a new app.",
        exportedAt: "2026-03-31T10:00:00Z",
        reportCreatedAt: "2026-03-31T09:45:00Z",
        investigationOrigin: "query",
        markdownPath: "/tmp/oauth.md",
        jsonPath: "/tmp/oauth.json",
        merkleRoot: "abc123",
        evidenceCount: 3,
        trace: { receiptIds: [], auditEventIds: [], sessionIds: [], eventSources: ["receipt"] },
        traceability: {
          auditStatus: "degraded",
          exportAuditEventId: "evt-1",
        },
      },
    ])

    const connectorResults = buildConnectorResults([
      {
        id: "elastic",
        name: "Elastic",
        auth_types: ["api_key"],
        supported_datasets: ["events"],
        supported_languages: ["esql"],
        pagination_modes: ["cursor"],
      },
    ])

    expect(historyResults[0]?.target?.screen).toBe("hunt-report-history")
    expect(historyResults[0]?.copyText).toContain("Suspicious OAuth grants")
    expect(connectorResults[0]?.target?.screen).toBe("hunt-connectors")
    expect(connectorResults[0]?.preview).toContain("events")
  })

  test("ranks exact and prefix matches above weaker matches", () => {
    const results = rankSearchResults("oauth", [
      {
        id: "1",
        kind: "suggestion",
        title: "OAuth abuse starter",
        subtitle: "starter query",
        preview: "Find suspicious OAuth grants.",
        copyText: "hunt oauth",
        keywords: ["oauth", "cloud"],
        target: null,
      },
      {
        id: "2",
        kind: "suggestion",
        title: "PowerShell starter",
        subtitle: "starter query",
        preview: "Investigate suspicious scripts mentioning oauth in notes.",
        copyText: "hunt powershell",
        keywords: ["powershell"],
        target: null,
      },
    ])

    expect(results).toHaveLength(2)
    expect(results[0]?.id).toBe("1")
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0)
  })

  test("combines suggestions and phase data into a single catalog", () => {
    const catalog = buildSearchCatalog({
      suggestions: DEFAULT_SUGGESTIONS.slice(0, 1),
      phases: {
        milestones: [],
        phases: [
          {
            number: "72.1",
            name: "Search-first shell",
            goal: "Turn the home prompt into a search surface.",
            depends_on: null,
            plan_count: 2,
            summary_count: 0,
            has_context: true,
            has_research: true,
            disk_status: "planned",
            roadmap_complete: false,
          },
        ],
        phase_count: 1,
        completed_phases: 0,
        total_plans: 2,
        total_summaries: 0,
        progress_percent: 10,
        current_phase: "72.1",
        next_phase: null,
        missing_phase_details: null,
      },
    })

    const phaseResults = buildPhaseResults({
      milestones: [],
      phases: [
        {
          number: "72.1",
          name: "Search-first shell",
          goal: "Turn the home prompt into a search surface.",
          depends_on: null,
          plan_count: 2,
          summary_count: 0,
          has_context: true,
          has_research: true,
          disk_status: "planned",
          roadmap_complete: false,
        },
      ],
      phase_count: 1,
      completed_phases: 0,
      total_plans: 2,
      total_summaries: 0,
      progress_percent: 10,
      current_phase: "72.1",
      next_phase: null,
      missing_phase_details: null,
    })

    expect(catalog).toHaveLength(2)
    expect(phaseResults[0]?.copyText).toContain("Phase 72.1")
  })
})
