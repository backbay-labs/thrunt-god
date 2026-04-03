export interface QueryAnalysisTemplate {
  templateId: string;
  template: string;
  count: number;
  percentage: number;
}

export interface QueryAnalysisQuery {
  queryId: string;
  title: string;
  templates: QueryAnalysisTemplate[];
  eventCount: number;
}

// --- Comparison types (2-query selection) ---

export interface ComparisonTemplate {
  templateId: string;
  template: string;
  countA: number;
  percentageA: number;
  countB: number;
  percentageB: number;
  presence: 'both' | 'a-only' | 'b-only';
}

export interface ComparisonData {
  queryA: { queryId: string; title: string; eventCount: number };
  queryB: { queryId: string; title: string; eventCount: number };
  templates: ComparisonTemplate[];
}

// --- Heatmap types (3+-query selection) ---

export interface HeatmapCell {
  queryId: string;
  count: number;
}

export interface HeatmapRow {
  templateId: string;
  template: string;
  cells: HeatmapCell[];
  totalCount: number;
}

export interface HeatmapData {
  queryIds: string[];
  queryTitles: string[];
  rows: HeatmapRow[];
}

// --- Receipt Inspector types ---

export interface ReceiptInspectorItem {
  receiptId: string;
  claim: string;
  claimStatus: string;
  confidence: string;
  relatedQueries: string[];
  hasAnomalyFrame: boolean;
  deviationScore: number | null;
  deviationCategory: string | null;
  baseScore: number | null;
  modifiers: Array<{ factor: string; value: string; contribution: number }>;
  baseline: string | null;
  prediction: string | null;
  observation: string | null;
  attackMapping: string[];
}

export interface ReceiptInspectorData {
  receipts: ReceiptInspectorItem[];
  selectedReceiptId: string | null;
}

// --- ViewModel ---

export interface QueryAnalysisViewModel {
  queries: QueryAnalysisQuery[];
  selectedQueryIds: string[];
  comparisonMode: 'side-by-side' | 'matrix';
  sortBy: 'count' | 'deviation' | 'novelty' | 'recency';
  comparison: ComparisonData | null;
  heatmap: HeatmapData | null;
  receiptInspector: ReceiptInspectorData | null;
  availableSorts: Array<{ key: string; available: boolean; tooltip: string }>;
}

export interface QueryAnalysisBootData {
  surfaceId: 'query-analysis';
}

export type HostToQueryAnalysisMessage =
  | { type: 'init'; viewModel: QueryAnalysisViewModel; isDark: boolean }
  | { type: 'update'; viewModel: QueryAnalysisViewModel }
  | { type: 'theme'; isDark: boolean };

export type QueryAnalysisToHostMessage =
  | { type: 'webview:ready' }
  | { type: 'query:select'; queryId: string }
  | { type: 'sort:change'; sortBy: 'count' | 'deviation' | 'novelty' | 'recency' }
  | { type: 'mode:change'; mode: 'side-by-side' | 'matrix' }
  | { type: 'receipt:select'; receiptId: string }
  | { type: 'inspector:open'; receiptId?: string }
  | { type: 'inspector:close' }
  | { type: 'blur' };
