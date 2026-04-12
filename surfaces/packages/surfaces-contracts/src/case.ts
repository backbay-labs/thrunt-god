/**
 * Shared case model projection — one model for all surfaces.
 *
 * Derived from: MISSION.md, STATE.md, HUNTMAP.md, QUERIES/, RECEIPTS/, FINDINGS.md
 */

// --- Case identity (from MISSION.md) ---

export interface CaseSummary {
  /** Workspace path that owns this case */
  caseRoot: string;
  /** Case title from MISSION.md H1 or frontmatter */
  title: string;
  /** Hunt mode: 'case', 'patrol', 'program' */
  mode: string;
  /** ISO date string */
  opened: string;
  /** Operator name */
  owner: string;
  /** 'Open' | 'Closed' */
  status: string;
  /** Signal section text */
  signal: string;
  /** Desired outcome section text */
  desiredOutcome: string;
  /** Scope section text */
  scope: string;
  /** Working theory section text */
  workingTheory: string;
}

// --- Phase model (from HUNTMAP.md + STATE.md) ---

export interface PhaseSummary {
  number: number;
  name: string;
  goal: string;
  status: 'planned' | 'running' | 'complete';
  dependsOn: string;
  planCount: number;
  completedPlans: number;
}

export interface CaseProgress {
  /** Current milestone (e.g. 'v4.0') */
  milestone: string;
  /** Current milestone name */
  milestoneName: string;
  /** Active phase number */
  currentPhase: number;
  /** Total phases in milestone */
  totalPhases: number;
  /** Current plan within phase */
  currentPlan: number;
  /** Total plans in current phase */
  totalPlansInPhase: number;
  /** Overall progress 0-100 */
  percent: number;
  /** Phase-level summaries */
  phases: PhaseSummary[];
  /** Last activity description */
  lastActivity: string;
  /** ISO timestamp of last update */
  lastUpdated: string;
}

// --- Hypothesis model ---

export interface HypothesisSummary {
  id: string;
  assertion: string;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Supported' | 'Disproved' | 'Inconclusive' | 'Open';
  confidence: 'High' | 'Medium' | 'Low';
}

// --- Evidence models (from QUERIES/, RECEIPTS/) ---

export interface QueryLogSummary {
  queryId: string;
  connectorId: string;
  dataset: string;
  executedAt: string;
  title: string;
  intent: string;
  eventCount: number;
  entityCount: number;
  templateCount: number;
  relatedHypotheses: string[];
  relatedReceipts: string[];
}

export interface ReceiptSummary {
  receiptId: string;
  connectorId: string;
  dataset: string;
  createdAt: string;
  resultStatus: string;
  claimStatus: 'supports' | 'contradicts' | 'inconclusive' | 'context';
  claim: string;
  relatedHypotheses: string[];
  relatedQueries: string[];
  confidence: string;
}

export interface FindingSummary {
  title: string;
  severity: string;
  confidence: string;
  relatedHypotheses: string[];
  recommendation: string;
}

export interface RuntimePreviewTargetSummary {
  name: string;
  connectorId: string;
  dataset: string;
  language: string;
  profile: string;
  timeWindow: string;
  querySummary: string;
  readinessStatus: string;
  ready: boolean;
  blockers: string[];
}

export interface RuntimePreviewSummary {
  packId: string;
  packTitle: string;
  targetName: string | null;
  generatedAt: string;
  ready: boolean;
  blockers: string[];
  targets: RuntimePreviewTargetSummary[];
}

export interface LastExecutionSummary {
  executionId: string;
  mode: 'pack' | 'target' | 'next';
  packId: string | null;
  targetName: string | null;
  connectorId: string | null;
  status: 'ok' | 'partial' | 'error';
  completedAt: string;
  message: string;
  queryIds: string[];
  receiptIds: string[];
  artifactPaths: string[];
}

export type CertificationStatus =
  | 'fixture-certified'
  | 'live-certified'
  | 'live-blocked'
  | 'drift-detected'
  | 'review-required'
  | 'failed-capture';

export interface CertificationStatusSummary {
  vendorId: string;
  status: CertificationStatus;
  source: 'fixture' | 'live' | 'combined';
  generatedAt: string;
  summary: string;
}

export type CertificationCampaignStatus =
  | 'live-certified'
  | 'drift-detected'
  | 'live-blocked'
  | 'review-required'
  | 'failed-capture';

export type CertificationCampaignReviewState =
  | 'blocked'
  | 'failed_capture'
  | 'review_required'
  | 'ready_for_review'
  | 'approved'
  | 'rejected'
  | 'follow_up_requested'
  | 'inconclusive';

export type CertificationDriftClassification =
  | 'benign_ui_drift'
  | 'selector_parser_break'
  | 'semantic_extraction_drift'
  | 'auth_session_degradation'
  | 'privilege_visibility_difference'
  | 'unknown';

export interface CertificationDiffItem {
  path: string;
  expected: unknown;
  actual: unknown;
  change: 'missing' | 'mismatch' | 'extra';
}

export interface CertificationReviewerNote {
  reviewer: string;
  recordedAt: string;
  action:
    | 'submit_for_review'
    | 'approve_certification'
    | 'reject_certification'
    | 'approve_promotion'
    | 'reject_promotion'
    | 'request_follow_up'
    | 'mark_inconclusive'
    | 'note';
  note: string;
  followUpItems?: string[];
  linkedBaselinePath?: string | null;
}

export interface CertificationReplaySummary {
  comparedAt: string;
  comparedAgainst: 'captured' | 'approved_baseline';
  snapshotPath: string;
  metadataPath: string;
  pass: boolean;
  gaps: string[];
  diff: CertificationDiffItem[];
  driftClassification: CertificationDriftClassification | null;
  blocksCertification: boolean;
  suspectFiles: string[];
  approvedExpected: Record<string, unknown> | null;
  actual: Record<string, unknown> | null;
}

export interface CertificationRuntimeAttachmentSummary {
  attachedAt: string;
  mode: 'preview' | 'execute';
  success: boolean;
  ready: boolean;
  blocked: boolean;
  message: string;
  connectorIds: string[];
  profiles: string[];
  datasets: string[];
  timeWindows: string[];
  queryIds: string[];
  receiptIds: string[];
  artifactPaths: string[];
  blockers: string[];
}

export type CertificationPrerequisiteCheckStatus = 'pass' | 'fail' | 'warn' | 'unknown' | 'skip';

export interface CertificationPrerequisiteCheck {
  id: string;
  label: string;
  status: CertificationPrerequisiteCheckStatus;
  detail: string;
  source: 'operator' | 'bridge' | 'runtime_doctor' | 'campaign_ledger';
  blocking: boolean;
}

export interface CertificationPrerequisiteReport {
  vendorId: string;
  checkedAt: string;
  operator: string | null;
  reviewer: string | null;
  tenantLabel: string | null;
  environmentLabel: string | null;
  pageUrl: string | null;
  pageTitle: string | null;
  connectorProfile: string | null;
  readinessStatus: string | null;
  readyForCapture: boolean;
  readyForRuntime: boolean;
  baselineHistoryAvailable: boolean;
  checks: CertificationPrerequisiteCheck[];
  blockerReasons: string[];
  warningReasons: string[];
  nextSteps: string[];
}

export interface CertificationPromotionSummary {
  target: 'baseline' | 'fixture_candidate' | 'regression_input';
  status: 'none' | 'pending' | 'approved' | 'rejected' | 'superseded';
  decidedAt: string | null;
  decidedBy: string | null;
  notes: string | null;
  outputPath: string | null;
  supersededAt: string | null;
  supersededBy: string | null;
}

export type CertificationCaptureProvenance =
  | 'extension_capture'
  | 'cli_capture'
  | 'blocked_prerequisite_check';

export interface CertificationCampaignSummary {
  campaignId: string;
  vendorId: string;
  tenantLabel: string;
  environmentLabel: string;
  startedAt: string;
  capturedAt: string;
  operator: string;
  reviewer: string | null;
  reviewedAt: string | null;
  status: CertificationCampaignStatus;
  redactionStatus: 'sanitized' | 'failed';
  redactionCount: number;
  pageUrl: string;
  pageTitle: string;
  captureProvenance: CertificationCaptureProvenance;
  connectorProfile: string | null;
  driftClassification: CertificationDriftClassification | null;
  replayPass: boolean | null;
  runtimePreviewStatus: 'pending' | 'ready' | 'blocked' | 'failed' | 'skipped';
  runtimeExecuteStatus: 'pending' | 'ok' | 'blocked' | 'failed' | 'skipped';
  certificationDecision: 'pending' | 'approved' | 'rejected' | 'follow_up_requested' | 'inconclusive';
  reviewState: CertificationCampaignReviewState;
  submittedAt: string | null;
  submittedBy: string | null;
  followUpNeeded: boolean;
  followUpItems: string[];
  latestReviewNote: string | null;
  promotions: CertificationPromotionSummary[];
  notes: string[];
  blockerReasons: string[];
}

export interface CertificationCampaignDetail extends CertificationCampaignSummary {
  bundlePath: string;
  snapshotId: string | null;
  snapshotPath: string;
  metadataPath: string;
  captureExpected: Record<string, unknown> | null;
  prerequisites: CertificationPrerequisiteReport | null;
  replay: CertificationReplaySummary | null;
  runtimePreview: CertificationRuntimeAttachmentSummary | null;
  runtimeExecute: CertificationRuntimeAttachmentSummary | null;
  reviewNotes: CertificationReviewerNote[];
}

export interface CertificationVendorHistorySummary {
  vendorId: string;
  currentStatus: CertificationCampaignStatus | CertificationStatus;
  currentReviewState: CertificationCampaignReviewState;
  campaignCount: number;
  lastCampaignId: string | null;
  lastCampaignAt: string | null;
  lastReviewedAt: string | null;
  liveCertifiedCount: number;
  liveBlockedCount: number;
  driftDetectedCount: number;
  reviewRequiredCount: number;
  readyForReviewCount: number;
  followUpRequestedCount: number;
  inconclusiveCount: number;
  failedCaptureCount: number;
  blockerCount: number;
  promotionCount: number;
  currentBaselineCampaignId: string | null;
  currentBaselinePath: string | null;
  reviewerNotesSummary: string[];
}

export interface CertificationDriftTrendSummary {
  vendorId: string;
  currentPosture: CertificationCampaignStatus | CertificationStatus;
  totalCampaigns: number;
  liveCertifiedCount: number;
  liveBlockedCount: number;
  unresolvedCampaignCount: number;
  driftCounts: Record<CertificationDriftClassification, number>;
  topRecurringDriftClasses: Array<{ classification: CertificationDriftClassification; count: number }>;
  recurringBlockers: Array<{ reason: string; count: number }>;
  lastStableCampaignId: string | null;
  lastStableAt: string | null;
  lastParserBreakAt: string | null;
  suspicionFlags: string[];
}

export interface CertificationBaselineRecord {
  vendorId: string;
  campaignId: string;
  path: string;
  promotedAt: string;
  reviewer: string | null;
  notes: string | null;
  active: boolean;
  supersededBy: string | null;
  supersededAt: string | null;
}

export interface CertificationReviewLedgerEntry {
  vendorId: string;
  campaignId: string;
  reviewer: string;
  recordedAt: string;
  action:
    | 'submit_for_review'
    | 'approve_certification'
    | 'reject_certification'
    | 'approve_promotion'
    | 'reject_promotion'
    | 'request_follow_up'
    | 'mark_inconclusive'
    | 'note';
  reviewState: CertificationCampaignReviewState;
  note: string;
  followUpItems: string[];
  promotionTarget: 'baseline' | 'fixture_candidate' | 'regression_input' | null;
  linkedBaselinePath: string | null;
}

export type CertificationFreshnessBucket = 'fresh' | 'aging' | 'stale' | 'uncertified';

export interface CertificationFreshnessPolicy {
  freshWithinHours: number;
  agingWithinHours: number;
}

export interface CertificationFreshnessSummary {
  vendorId: string;
  currentStatus: CertificationCampaignStatus | CertificationStatus;
  lastCampaignId: string | null;
  lastCampaignAt: string | null;
  lastLiveCertifiedCampaignId: string | null;
  lastLiveCertifiedAt: string | null;
  activeBaselineCampaignId: string | null;
  activeBaselinePromotedAt: string | null;
  ageHours: number | null;
  ageDays: number | null;
  bucket: CertificationFreshnessBucket;
  state: 'fresh' | 'aging' | 'stale' | 'uncertified' | 'blocked';
  nextRecommendedRecertificationAt: string | null;
  overdue: boolean;
  blockingCampaignCount: number;
  policy: CertificationFreshnessPolicy;
  reasons: string[];
}

export type CertificationBaselineStabilityPosture = 'stable' | 'watch' | 'unstable' | 'no_baseline';

export interface CertificationBaselineChurnSummary {
  vendorId: string;
  currentStatus: CertificationCampaignStatus | CertificationStatus;
  activeBaselineCampaignId: string | null;
  activeBaselinePromotedAt: string | null;
  activeBaselineAgeDays: number | null;
  promotedBaselineCount: number;
  supersededBaselineCount: number;
  replacementCount: number;
  averageReplacementIntervalDays: number | null;
  shortestReplacementIntervalDays: number | null;
  lastReplacementAt: string | null;
  driftClassesLeadingToReplacement: Array<{ classification: CertificationDriftClassification; count: number }>;
  currentStabilityPosture: CertificationBaselineStabilityPosture;
  suspicionFlags: string[];
}

export interface CapturedEvidenceSummary {
  evidenceId: string;
  type: string;
  vendorId: string;
  capturedAt: string;
  capturedBy: string;
  sourceUrl: string;
  relatedHypotheses: string[];
  reviewStatus: string;
  summary: string;
  classification: 'query_candidate' | 'receipt_candidate' | 'plain_evidence' | 'ambiguous';
  canonicalizationReason: string | null;
  relatedQueries: string[];
  relatedReceipts: string[];
}

// --- Evidence attachment (browser -> bridge -> case) ---

export interface AttachmentContext {
  pageTitle?: string;
  pageType?: string;
  metadata?: Record<string, unknown>;
  extraction?: {
    supported: boolean;
    confidence: 'high' | 'medium' | 'low';
    completeness: 'complete' | 'partial' | 'unsupported';
    failureReasons: string[];
    detectedSignals: string[];
  };
  sourceQuery?: {
    language: string;
    statement: string;
    timeRange?: { start: string; end: string };
    parameters?: Record<string, unknown>;
  } | null;
}

export interface EvidenceAttachment {
  /** Source surface identifier */
  surfaceId: string;
  /** Attachment type */
  type: 'query_clip' | 'table_clip' | 'entity_clip' | 'screenshot_metadata' | 'page_context' | 'manual_note';
  /** Vendor/console the evidence came from */
  vendorId: string;
  /** URL of the source page */
  sourceUrl: string;
  /** ISO timestamp of capture */
  capturedAt: string;
  /** Operator who captured */
  capturedBy: string;
  /** Related hypothesis IDs */
  hypothesisIds: string[];
  /** Browser capture context for canonicalization */
  context?: AttachmentContext;
  /** Structured payload */
  payload: EvidencePayload;
}

export type EvidencePayload =
  | { kind: 'query'; language: string; statement: string; parameters?: Record<string, unknown> }
  | { kind: 'table'; headers: string[]; rows: string[][]; rowCount: number }
  | { kind: 'entity'; entityType: string; value: string; context?: Record<string, unknown> }
  | { kind: 'screenshot'; width: number; height: number; description: string }
  | { kind: 'page_context'; title: string; url: string; selectedText?: string; metadata?: Record<string, unknown> }
  | { kind: 'note'; text: string };

// --- Derived sidepanel enrichment types ---

export interface RecommendedAction {
  id: string;
  label: string;
  priority: 'high' | 'medium' | 'low';
  category: 'evidence_gap' | 'phase_progress' | 'hypothesis_coverage' | 'capture_debt';
}

export interface AdapterStatus {
  vendorId: string;
  displayName: string;
  state: 'connected' | 'extracting' | 'disconnected' | 'certified' | 'uncertified';
}

export interface EvidenceTimelineEntry {
  id: string;
  type: 'query' | 'receipt' | 'evidence';
  vendorId: string;
  timestamp: string;
  summary: string;
  relatedHypotheses: string[];
}

// --- Full case view model (what surfaces render) ---

export interface CaseViewModel {
  case: CaseSummary;
  progress: CaseProgress;
  hypotheses: HypothesisSummary[];
  recentQueries: QueryLogSummary[];
  recentReceipts: ReceiptSummary[];
  recentEvidence: CapturedEvidenceSummary[];
  findings: FindingSummary[];
  /** Blockers or pending approvals */
  blockers: string[];
  /** Runtime readiness blockers derived from preview/config state */
  readinessBlockers: string[];
  /** Recommended next action description */
  recommendedAction: string | null;
  /** Most recent bridge runtime preview */
  runtimePreview: RuntimePreviewSummary | null;
  /** Most recent bridge execution summary */
  lastExecution: LastExecutionSummary | null;
  /** Certification status for supported vendors */
  certification: CertificationStatusSummary[];
  /** Recent live certification campaigns for diagnostics/review */
  certificationCampaigns: CertificationCampaignSummary[];
  /** Vendor-level certification history summaries */
  certificationHistory: CertificationVendorHistorySummary[];
  /** Vendor-level drift trend summaries */
  certificationDriftTrends: CertificationDriftTrendSummary[];
  /** Active and superseded promoted baselines */
  certificationBaselines: CertificationBaselineRecord[];
  /** Vendor freshness posture derived from approved live certification */
  certificationFreshness: CertificationFreshnessSummary[];
  /** Vendor baseline replacement/churn posture */
  certificationBaselineChurn: CertificationBaselineChurnSummary[];
  /** Derived recommended actions based on case state analysis */
  recommendedActions: RecommendedAction[];
  /** Merged chronological evidence timeline */
  evidenceTimeline: EvidenceTimelineEntry[];
  /** Adapter connection status for known vendors */
  adapterStatuses: AdapterStatus[];
}
