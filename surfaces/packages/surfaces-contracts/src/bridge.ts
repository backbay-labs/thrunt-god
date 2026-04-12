/**
 * Bridge API contracts — typed request/response for surface-bridge HTTP + WS.
 */

import type {
  CertificationBaselineChurnSummary,
  CaseSummary,
  CaseProgress,
  CaseViewModel,
  CertificationBaselineRecord,
  CertificationCampaignDetail,
  CertificationCampaignSummary,
  CertificationDriftTrendSummary,
  CertificationFreshnessSummary,
  CertificationPrerequisiteReport,
  CertificationStatusSummary,
  CertificationVendorHistorySummary,
  FindingSummary,
  HypothesisSummary,
  LastExecutionSummary,
  QueryLogSummary,
  ReceiptSummary,
  RuntimePreviewSummary,
} from './case.ts';

// --- Bridge configuration ---

export interface BridgeConfig {
  port: number;
  host: string;
  /** Path to the project root containing .planning/ */
  projectRoot: string;
  /** Enable mock mode (no real .planning/ required) */
  mockMode: boolean;
  /** Optional explicit path to thrunt-tools.cjs or executable wrapper */
  toolsPath?: string | null;
}

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  port: 7483,
  host: '127.0.0.1',
  projectRoot: '.',
  mockMode: false,
  toolsPath: null,
};

// --- HTTP API routes ---

export type BridgeRoute =
  | 'GET /api/health'
  | 'GET /api/case'
  | 'GET /api/case/progress'
  | 'GET /api/case/hypotheses'
  | 'GET /api/case/queries'
  | 'GET /api/case/receipts'
  | 'GET /api/case/findings'
  | 'GET /api/case/view'
  | 'POST /api/case/open'
  | 'POST /api/evidence/attach'
  | 'POST /api/execute/pack'
  | 'POST /api/execute/target'
  | 'POST /api/execute/next'
  | 'POST /api/certification/capture'
  | 'POST /api/certification/prerequisites'
  | 'GET /api/certification/campaigns'
  | 'GET /api/certification/history'
  | 'GET /api/certification/drift-trends'
  | 'GET /api/certification/baselines'
  | 'GET /api/certification/freshness'
  | 'GET /api/certification/churn'
  | 'GET /api/certification/campaigns/:campaignId'
  | 'POST /api/certification/campaigns/:campaignId/replay'
  | 'POST /api/certification/campaigns/:campaignId/runtime/preview'
  | 'POST /api/certification/campaigns/:campaignId/runtime/execute'
  | 'POST /api/certification/campaigns/:campaignId/submit'
  | 'POST /api/certification/campaigns/:campaignId/review'
  | 'POST /api/certification/campaigns/:campaignId/promote';

// --- Request types ---

export interface OpenCaseRequest {
  /** Signal text to seed the case */
  signal: string;
  /** Hunt mode */
  mode?: 'case' | 'patrol' | 'program';
  /** Operator name */
  owner?: string;
  /** Vendor context from browser extension */
  vendorContext?: VendorContext;
}

export interface ExecutePackRequest {
  packId?: string;
  target?: string;
  parameters?: Record<string, unknown>;
  dryRun?: boolean;
  vendorContext?: VendorContext;
}

export interface ExecuteTargetRequest {
  connectorId: string;
  query: string;
  dataset?: string;
  timeWindowMinutes?: number;
  dryRun?: boolean;
}

export interface CertificationCaptureRequest {
  vendorId: string;
  pageUrl: string;
  pageTitle: string;
  rawHtml: string;
  tenantLabel?: string;
  environmentLabel?: string;
  operator?: string;
  reviewer?: string | null;
  notes?: string[];
  extraction: {
    detect: boolean;
    context: Record<string, unknown>;
    query: Record<string, unknown> | null;
    table: Record<string, unknown> | null;
    entities: Array<Record<string, unknown>>;
    supportedActions: string[];
  };
}

export interface CertificationPrerequisiteRequest {
  vendorId: string;
  tenantLabel?: string | null;
  environmentLabel?: string | null;
  operator?: string | null;
  reviewer?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  notes?: string[];
  persistBlockedCampaign?: boolean;
}

export interface ExecuteNextRequest {
  /** Empty — bridge determines next recommended step */
}

// --- Response types ---

export interface BridgeHealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  mockMode: boolean;
  projectRoot: string;
  planningExists: boolean;
  caseOpen: boolean;
  uptime: number;
  wsClients: number;
  activeCaseId: string | null;
  lastFileWatcherEvent: string | null;
  subprocessAvailable: boolean;
}

export interface BridgeErrorResponse {
  error: string;
  code: string;
  class: 'auth' | 'timeout' | 'subprocess' | 'file-system' | 'validation';
}

export interface CaseResponse {
  case: CaseSummary;
}

export interface OpenCaseResponse extends CaseResponse {
  created: boolean;
  message: string;
  command?: string[];
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

export interface ProgressResponse {
  progress: CaseProgress;
}

export interface HypothesesResponse {
  hypotheses: HypothesisSummary[];
}

export interface QueriesResponse {
  queries: QueryLogSummary[];
  total: number;
}

export interface ReceiptsResponse {
  receipts: ReceiptSummary[];
  total: number;
}

export interface FindingsResponse {
  findings: FindingSummary[];
}

export interface CaseViewResponse {
  view: CaseViewModel;
}

export interface AttachEvidenceResponse {
  success: boolean;
  attachmentId: string;
  message: string;
  artifactKind?: 'query' | 'receipt' | 'evidence';
  classification?: 'query_candidate' | 'receipt_candidate' | 'plain_evidence' | 'ambiguous';
  createdArtifacts?: Array<{ type: 'query' | 'receipt' | 'evidence'; id: string }>;
  reason?: string | null;
  view?: CaseViewModel | null;
}

export interface CertificationCaptureResponse {
  success: boolean;
  campaignId: string;
  snapshotId: string;
  message: string;
  campaignPath: string;
  snapshotPath: string;
  metadataPath: string;
  redactionCount: number;
  campaign: CertificationCampaignDetail | null;
  certification?: CertificationStatusSummary | null;
}

export interface CertificationCampaignListResponse {
  campaigns: CertificationCampaignSummary[];
}

export interface CertificationPrerequisiteResponse {
  success: boolean;
  message: string;
  report: CertificationPrerequisiteReport;
  campaign: CertificationCampaignDetail | null;
}

export interface CertificationCampaignResponse {
  campaign: CertificationCampaignDetail;
}

export interface CertificationCampaignHistoryResponse {
  history: CertificationVendorHistorySummary[];
}

export interface CertificationDriftTrendResponse {
  trends: CertificationDriftTrendSummary[];
}

export interface CertificationBaselineListResponse {
  baselines: CertificationBaselineRecord[];
}

export interface CertificationFreshnessResponse {
  freshness: CertificationFreshnessSummary[];
}

export interface CertificationBaselineChurnResponse {
  churn: CertificationBaselineChurnSummary[];
}

export interface CertificationCampaignReplayRequest {
  comparedAgainst?: 'captured' | 'approved_baseline';
}

export interface CertificationCampaignRuntimeRequest {
  packId?: string;
  target?: string;
  parameters?: Record<string, unknown>;
}

export interface CertificationCampaignRuntimeResponse {
  success: boolean;
  message: string;
  campaign: CertificationCampaignDetail;
  execution: ExecuteResponse;
}

export interface CertificationCampaignSubmitRequest {
  submittedBy: string;
  notes?: string;
}

export interface CertificationCampaignReviewRequest {
  reviewer: string;
  decision: 'approve' | 'reject' | 'request_follow_up' | 'inconclusive';
  notes?: string;
  followUpItems?: string[];
}

export interface CertificationCampaignPromotionRequest {
  reviewer: string;
  decision: 'approve' | 'reject';
  target: 'baseline' | 'fixture_candidate' | 'regression_input';
  notes?: string;
}

export interface CertificationCampaignMutationResponse {
  success: boolean;
  message: string;
  campaign: CertificationCampaignDetail;
}

export interface ExecuteResponse {
  success: boolean;
  executionId: string;
  message: string;
  /** Present for dry-run */
  preview?: string;
  command?: string[];
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  mutation?: {
    kind: string;
    mutated: boolean;
    fallback: boolean;
    toolsPath: string | null;
    diagnostics: string[];
  };
  previewState?: RuntimePreviewSummary | null;
  executionState?: LastExecutionSummary | null;
  createdArtifacts?: Array<{ type: 'query' | 'receipt' | 'evidence'; id: string; path?: string }>;
  resolvedPackId?: string | null;
  view?: CaseViewModel | null;
}

// --- WebSocket event types ---

export type BridgeEvent =
  | { type: 'case:updated'; data: CaseSummary }
  | { type: 'progress:updated'; data: CaseProgress }
  | { type: 'query:added'; data: QueryLogSummary }
  | { type: 'receipt:added'; data: ReceiptSummary }
  | { type: 'finding:added'; data: FindingSummary }
  | { type: 'evidence:attached'; data: { attachmentId: string; surfaceId: string } }
  | { type: 'execution:started'; data: { executionId: string; description: string } }
  | { type: 'execution:completed'; data: { executionId: string; success: boolean } }
  | { type: 'bridge:heartbeat'; data: { ts: string } }
  | { type: 'bridge:error'; data: { code: string; message: string } };

// --- Vendor context (from browser extension) ---

export interface VendorContext {
  vendorId: string;
  consoleName: string;
  pageUrl: string;
  pageTitle: string;
  /** Vendor-specific extracted context */
  extracted: Record<string, unknown>;
  /** Timestamp of context capture */
  capturedAt: string;
}
