export interface DrainViewerCluster {
  templateId: string;
  template: string;
  count: number;
  percentage: number;
  color: string;
  isPinned: boolean;
  matchedIocs: string[];
  detailLines: string[];
  sampleEventText: string | null;
  eventIds: string[];
  relatedReceiptIds: string[];
}

export interface DrainViewerPinnedTemplate {
  queryId: string;
  queryTitle: string;
  templateId: string;
  template: string;
  count: number;
  percentage: number;
}

export interface DrainViewerViewModel {
  query: {
    queryId: string;
    title: string;
    connectorId: string;
    dataset: string;
    eventCount: number;
    templateCount: number;
    entityCount: number;
    timeWindow: { start: string; end: string } | null;
  };
  activeIocs: string[];
  clusters: DrainViewerCluster[];
  pinnedTemplates: DrainViewerPinnedTemplate[];
  emptyMessage: string | null;
}

export interface DrainViewerBootData {
  queryId: string | null;
}

export type HostToDrainWebviewMessage =
  | { type: 'init'; viewModel: DrainViewerViewModel; isDark: boolean }
  | { type: 'update'; viewModel: DrainViewerViewModel }
  | { type: 'theme'; isDark: boolean }
  | { type: 'stale'; affectedIds: string[] };

export type DrainWebviewToHostMessage =
  | { type: 'webview:ready' }
  | { type: 'template:pin'; queryId: string; templateId: string }
  | { type: 'template:unpin'; queryId: string; templateId: string }
  | { type: 'navigate'; queryId: string; templateId?: string | null }
  | { type: 'blur' };
