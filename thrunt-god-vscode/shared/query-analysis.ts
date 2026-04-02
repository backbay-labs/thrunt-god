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

export interface QueryAnalysisViewModel {
  queries: QueryAnalysisQuery[];
  comparisonMode: 'side-by-side' | 'matrix';
  sortBy: 'count' | 'deviation' | 'novelty' | 'recency';
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
  | { type: 'blur' };
