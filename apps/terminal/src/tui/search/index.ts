import type { ConnectorEntry } from "../../thrunt-bridge/connector"
import type { HuntmapAnalysis } from "../../thrunt-bridge/huntmap"
import type { PackListEntry } from "../../thrunt-bridge/pack"
import type { HuntInvestigationState } from "../types"
import type { ReportHistoryEntry } from "../report-export"

export type SearchResultKind =
  | "suggestion"
  | "report"
  | "finding"
  | "event"
  | "phase"
  | "pack"
  | "connector"

export interface SearchResultTarget {
  screen: string
  selectedIndex?: number
  nlQuery?: string
}

export interface SearchResult {
  id: string
  kind: SearchResultKind
  title: string
  subtitle: string
  preview: string
  copyText: string
  keywords: string[]
  target: SearchResultTarget | null
}

export interface SearchSuggestion {
  id: string
  title: string
  subtitle: string
  preview: string
  copyText: string
  keywords?: string[]
  target?: SearchResultTarget | null
}

export interface SearchCatalogInput {
  historyEntries?: ReportHistoryEntry[]
  investigation?: HuntInvestigationState | null
  phases?: HuntmapAnalysis | null
  packs?: PackListEntry[]
  connectors?: ConnectorEntry[]
  suggestions?: SearchSuggestion[]
}

export interface RankedSearchResult extends SearchResult {
  score: number
}

export type HomeSearchSources = SearchCatalogInput
export type HomeSearchResult = SearchResult

export const DEFAULT_SUGGESTIONS: SearchSuggestion[] = [
  {
    id: "suggest-query-failed-logins",
    title: "Failed logins in the last 24h",
    subtitle: "starter query",
    preview: "Find concentrated authentication failures and pivot into hosts or identities with repeated denials.",
    copyText: "Investigate failed logins in the last 24 hours. Summarize the identities, hosts, source IPs, and any spikes worth pivoting on.",
    keywords: ["auth", "identity", "failed login", "investigate", "starter"],
    target: {
      screen: "hunt-query",
      nlQuery: "failed logins in the last 24 hours",
    },
  },
  {
    id: "suggest-query-oauth",
    title: "Suspicious OAuth consent grants",
    subtitle: "starter query",
    preview: "Look for recent risky app grants, token misuse, or broad delegated permissions tied to unexpected principals.",
    copyText: "Hunt for suspicious OAuth consent grants or token abuse. Focus on new applications, broad delegated scopes, and unusual principals.",
    keywords: ["oauth", "consent", "token", "cloud", "identity"],
    target: {
      screen: "hunt-query",
      nlQuery: "suspicious oauth consent grants or token abuse",
    },
  },
  {
    id: "suggest-query-powershell",
    title: "Suspicious PowerShell activity",
    subtitle: "starter query",
    preview: "Pivot around encoded commands, network downloads, or unusual parent-child chains that point to post-exploitation.",
    copyText: "Hunt for suspicious PowerShell activity. Look for encoded commands, downloads, child process chains, and user or host clustering.",
    keywords: ["powershell", "execution", "process", "post-exploitation"],
    target: {
      screen: "hunt-query",
      nlQuery: "suspicious powershell activity",
    },
  },
  {
    id: "suggest-brief-watch",
    title: "Pasteable live watch brief",
    subtitle: "agent prompt",
    preview: "Create a concise prompt you can paste into Claude or Codex to analyze the current watch stream and propose next pivots.",
    copyText:
      "Review the current live hunt/watch context. Summarize the highest-signal alerts, notable denies or audits, likely pivots, and the next three concrete hunt steps.",
    keywords: ["watch", "brief", "agent", "summary", "prompt"],
    target: null,
  },
]

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
}

function containsAllTokens(text: string, tokens: string[]): boolean {
  return tokens.every((token) => text.includes(token))
}

function subsequenceScore(text: string, query: string): number {
  if (!query) {
    return 0
  }

  let matches = 0
  let pointer = 0
  for (const ch of text) {
    if (pointer < query.length && ch === query[pointer]) {
      pointer += 1
      matches += 1
    }
  }

  return pointer === query.length ? matches : 0
}

export function scoreSearchResult(query: string, result: SearchResult): number {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) {
    return 0
  }

  const tokens = tokenize(normalizedQuery)
  const title = normalize(result.title)
  const subtitle = normalize(result.subtitle)
  const preview = normalize(result.preview)
  const keywords = result.keywords.map(normalize).join(" ")
  const haystack = [title, subtitle, preview, keywords].filter(Boolean).join(" ")

  let score = 0
  if (title === normalizedQuery) {
    score += 150
  }
  if (title.startsWith(normalizedQuery)) {
    score += 90
  }
  if (haystack.includes(normalizedQuery)) {
    score += 50
  }
  if (tokens.length > 0 && containsAllTokens(haystack, tokens)) {
    score += 30 + tokens.length * 6
  }

  const titleSubsequence = subsequenceScore(title, normalizedQuery)
  if (titleSubsequence > 0) {
    score += 20 + titleSubsequence
  }

  const previewSubsequence = subsequenceScore(preview, normalizedQuery)
  if (previewSubsequence > 0) {
    score += 8 + Math.min(previewSubsequence, 12)
  }

  return score
}

export function rankSearchResults(
  query: string,
  catalog: SearchResult[],
  limit = 8,
): RankedSearchResult[] {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) {
    return catalog.slice(0, limit).map((result) => ({ ...result, score: 0 }))
  }

  return catalog
    .map((result) => ({ ...result, score: scoreSearchResult(normalizedQuery, result) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, limit)
}

export function buildSuggestionResults(
  suggestions: SearchSuggestion[] = DEFAULT_SUGGESTIONS,
): SearchResult[] {
  return suggestions.map((suggestion) => ({
    id: suggestion.id,
    kind: "suggestion",
    title: suggestion.title,
    subtitle: suggestion.subtitle,
    preview: suggestion.preview,
    copyText: suggestion.copyText,
    keywords: suggestion.keywords ?? [],
    target: suggestion.target ?? null,
  }))
}

export function buildReportHistoryResults(entries: ReportHistoryEntry[] = []): SearchResult[] {
  return entries.map((entry, index) => ({
    id: `report-${entry.reportId}-${index}`,
    kind: "report",
    title: entry.title,
    subtitle: `report ${entry.severity} • ${entry.exportedAt.slice(0, 10)}`,
    preview: entry.summary,
    copyText: `${entry.title}\nSeverity: ${entry.severity}\nSummary: ${entry.summary}\nMarkdown: ${entry.markdownPath}\nJSON: ${entry.jsonPath}`,
    keywords: [
      entry.severity,
      entry.investigationOrigin ?? "investigation",
      ...(entry.trace.eventSources ?? []),
      ...entry.trace.receiptIds,
      ...entry.trace.auditEventIds,
      ...entry.trace.sessionIds,
    ],
    target: {
      screen: "hunt-report-history",
      selectedIndex: index,
    },
  }))
}

export function buildInvestigationResults(
  investigation: HuntInvestigationState | null | undefined,
): SearchResult[] {
  if (!investigation) {
    return []
  }

  const findings = investigation.findings.map((finding, index) => ({
    id: `finding-${index}`,
    kind: "finding" as const,
    title: finding,
    subtitle: `${investigation.origin ?? "investigation"} finding`,
    preview: investigation.summary ?? "Current investigation finding",
    copyText: `${finding}\n\nContext: ${investigation.summary ?? "No summary available."}`,
    keywords: [investigation.origin ?? "investigation", investigation.title],
    target: {
      screen: "hunt-report",
    },
  }))

  const events = investigation.events.slice(-8).map((event, index) => ({
    id: `event-${index}-${event.timestamp}`,
    kind: "event" as const,
    title: event.summary,
    subtitle: `${event.verdict} • ${event.source}`,
    preview: `${event.timestamp} ${event.summary}`,
    copyText: `${event.timestamp} ${event.source} ${event.verdict}\n${event.summary}`,
    keywords: [event.verdict, event.source, investigation.origin ?? "investigation"],
    target: {
      screen: "hunt-timeline",
    },
  }))

  return [...findings, ...events]
}

export function buildPhaseResults(analysis: HuntmapAnalysis | null | undefined): SearchResult[] {
  if (!analysis) {
    return []
  }

  return analysis.phases.map((phase, index) => ({
    id: `phase-${phase.number}`,
    kind: "phase",
    title: `Phase ${phase.number} ${phase.name}`,
    subtitle: `${phase.disk_status} • ${phase.plan_count} plan(s)`,
    preview: phase.goal ?? "No phase goal recorded.",
    copyText: `Phase ${phase.number}: ${phase.name}\nGoal: ${phase.goal ?? "n/a"}\nDepends on: ${phase.depends_on ?? "n/a"}\nPlans: ${phase.plan_count}\nStatus: ${phase.disk_status}`,
    keywords: [phase.number, phase.name, phase.disk_status, phase.depends_on ?? ""],
    target: {
      screen: "hunt-phases",
      selectedIndex: index,
    },
  }))
}

export function buildPackResults(packs: PackListEntry[] = []): SearchResult[] {
  return packs.map((pack, index) => ({
    id: `pack-${pack.id}`,
    kind: "pack",
    title: pack.title || pack.id,
    subtitle: `${pack.kind} • ${pack.stability}`,
    preview: `Source: ${pack.source} • Connectors: ${pack.required_connectors.join(", ") || "none"}`,
    copyText:
      `${pack.title || pack.id}\nKind: ${pack.kind}\nStability: ${pack.stability}\nSource: ${pack.source}\n` +
      `Connectors: ${pack.required_connectors.join(", ") || "none"}\nDatasets: ${pack.supported_datasets.join(", ") || "none"}`,
    keywords: [pack.id, pack.kind, pack.stability, pack.source, ...pack.required_connectors, ...pack.supported_datasets],
    target: {
      screen: "hunt-packs",
      selectedIndex: index,
    },
  }))
}

export function buildConnectorResults(connectors: ConnectorEntry[] = []): SearchResult[] {
  return connectors.map((connector, index) => ({
    id: `connector-${connector.id}`,
    kind: "connector",
    title: connector.name || connector.id,
    subtitle: `${connector.id} • ${connector.supported_languages.join(", ") || "no query languages"}`,
    preview:
      `Auth: ${connector.auth_types.join(", ") || "none"} • ` +
      `Datasets: ${connector.supported_datasets.join(", ") || "none"}`,
    copyText:
      `${connector.name || connector.id}\nID: ${connector.id}\nAuth: ${connector.auth_types.join(", ") || "none"}\n` +
      `Datasets: ${connector.supported_datasets.join(", ") || "none"}\nLanguages: ${connector.supported_languages.join(", ") || "none"}\n` +
      `Pagination: ${connector.pagination_modes.join(", ") || "none"}`,
    keywords: [
      connector.id,
      connector.name,
      ...connector.auth_types,
      ...connector.supported_datasets,
      ...connector.supported_languages,
    ],
    target: {
      screen: "hunt-connectors",
      selectedIndex: index,
    },
  }))
}

export function buildSearchCatalog(input: SearchCatalogInput): SearchResult[] {
  return [
    ...buildSuggestionResults(input.suggestions),
    ...buildReportHistoryResults(input.historyEntries),
    ...buildInvestigationResults(input.investigation),
    ...buildPhaseResults(input.phases),
    ...buildPackResults(input.packs),
    ...buildConnectorResults(input.connectors),
  ]
}

export function searchHome(
  query: string,
  input: SearchCatalogInput,
  limit = 8,
): RankedSearchResult[] {
  return rankSearchResults(query, buildSearchCatalog(input), limit)
}
