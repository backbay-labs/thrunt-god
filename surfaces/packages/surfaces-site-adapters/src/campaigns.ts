import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  CertificationBaselineChurnSummary,
  CertificationBaselineRecord,
  CertificationCampaignDetail,
  CertificationCampaignReviewState,
  CertificationCampaignStatus,
  CertificationCampaignSummary,
  CertificationCaptureProvenance,
  CertificationDriftClassification,
  CertificationDriftTrendSummary,
  CertificationFreshnessPolicy,
  CertificationFreshnessSummary,
  CertificationPrerequisiteReport,
  CertificationPromotionSummary,
  CertificationReviewerNote,
  CertificationReviewLedgerEntry,
  CertificationRuntimeAttachmentSummary,
  CertificationStatusSummary,
  CertificationVendorHistorySummary,
  ExecuteResponse,
} from '@thrunt-surfaces/contracts';

import {
  buildReplaySummary,
  summarizeCertificationStatus,
  writeCertificationStatus,
  writeLiveCertificationCapture,
  type CertificationCaptureInput,
} from './certification.ts';

export interface CertificationPaths {
  root: string;
  campaignsRoot: string;
  baselinesRoot: string;
  fixtureCandidatesRoot: string;
  regressionInputsRoot: string;
  liveRoot: string;
  statusPath: string;
  reportPath: string;
  historyPath: string;
  driftTrendsPath: string;
  freshnessPath: string;
  baselineChurnPath: string;
  reviewLedgerPath: string;
  baselineInventoryPath: string;
}

export interface CreateCertificationCampaignInput extends CertificationCaptureInput {
  tenantLabel?: string;
  environmentLabel?: string;
  operator?: string;
  reviewer?: string | null;
  notes?: string[];
  prerequisites?: CertificationPrerequisiteReport | null;
  captureProvenance?: CertificationCaptureProvenance;
  connectorProfile?: string | null;
}

export interface CreateBlockedCertificationCampaignInput {
  vendorId: string;
  tenantLabel: string;
  environmentLabel: string;
  operator: string;
  reviewer?: string | null;
  notes?: string[];
  blockerReasons: string[];
  pageUrl?: string;
  pageTitle?: string;
  prerequisites?: CertificationPrerequisiteReport | null;
  captureProvenance?: CertificationCaptureProvenance;
  connectorProfile?: string | null;
}

export interface CampaignReplayFinalizeInput {
  campaignId: string;
  comparedAgainst?: 'captured' | 'approved_baseline';
  actual: Record<string, unknown> | null;
}

export interface CampaignReviewInput {
  campaignId: string;
  reviewer: string;
  decision: 'approve' | 'reject' | 'request_follow_up' | 'inconclusive';
  notes?: string;
  followUpItems?: string[];
}

export interface CampaignSubmitInput {
  campaignId: string;
  submittedBy: string;
  notes?: string;
}

export interface CampaignPromotionInput {
  campaignId: string;
  reviewer: string;
  decision: 'approve' | 'reject';
  target: CertificationPromotionSummary['target'];
  notes?: string;
}

export interface AttachCampaignRuntimeInput {
  campaignId: string;
  mode: 'preview' | 'execute';
  execution: ExecuteResponse;
}

interface CampaignCaptureMetadata {
  vendorId: string;
  snapshotId: string;
  pageUrl: string;
  pageTitle: string;
  capturedAt: string;
  extraction: Record<string, unknown> | null;
}

interface CertificationLedger {
  statuses: CertificationStatusSummary[];
  history: CertificationVendorHistorySummary[];
  driftTrends: CertificationDriftTrendSummary[];
  baselines: CertificationBaselineRecord[];
  freshness: CertificationFreshnessSummary[];
  baselineChurn: CertificationBaselineChurnSummary[];
  reviewLedger: CertificationReviewLedgerEntry[];
}

const PROMOTION_TARGETS: CertificationPromotionSummary['target'][] = [
  'baseline',
  'fixture_candidate',
  'regression_input',
];

const DRIFT_CLASSES: CertificationDriftClassification[] = [
  'benign_ui_drift',
  'selector_parser_break',
  'semantic_extraction_drift',
  'auth_session_degradation',
  'privilege_visibility_difference',
  'unknown',
];

const DEFAULT_FRESH_POLICY: CertificationFreshnessPolicy = {
  freshWithinHours: 24 * 7,
  agingWithinHours: 24 * 14,
};

const CERTIFICATION_VENDOR_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const CERTIFICATION_CAMPAIGN_ID_PATTERN = /^CERT-[A-Z0-9-]+-\d{14}-[A-Z0-9]{4}$/;

export function resolveCertificationPaths(projectRoot: string): CertificationPaths {
  const root = path.join(projectRoot, '.planning', 'certification');
  return {
    root,
    campaignsRoot: path.join(root, 'campaigns'),
    baselinesRoot: path.join(root, 'baselines'),
    fixtureCandidatesRoot: path.join(root, 'fixture-candidates'),
    regressionInputsRoot: path.join(root, 'regression-inputs'),
    liveRoot: path.join(root, 'live'),
    statusPath: path.join(root, 'status.json'),
    reportPath: path.join(root, 'report.json'),
    historyPath: path.join(root, 'history.json'),
    driftTrendsPath: path.join(root, 'drift-trends.json'),
    freshnessPath: path.join(root, 'freshness.json'),
    baselineChurnPath: path.join(root, 'baseline-churn.json'),
    reviewLedgerPath: path.join(root, 'review-ledger.json'),
    baselineInventoryPath: path.join(root, 'baselines', 'inventory.json'),
  };
}

export function normalizeCertificationVendorId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!CERTIFICATION_VENDOR_ID_PATTERN.test(normalized)) {
    throw new Error(`Invalid certification vendorId: ${value}`);
  }
  return normalized;
}

export function normalizeCertificationCampaignId(value: string): string | null {
  const normalized = value.trim();
  return CERTIFICATION_CAMPAIGN_ID_PATTERN.test(normalized) ? normalized : null;
}

export function createCertificationCampaign(
  projectRoot: string,
  input: CreateCertificationCampaignInput,
): CertificationCampaignDetail {
  const vendorId = normalizeCertificationVendorId(input.vendorId);
  const capture = writeLiveCertificationCapture(projectRoot, input);
  const captureMetadata = readLegacyCaptureMetadata(projectRoot, capture.metadataPath);
  const campaignId = makeCampaignId(vendorId);
  const paths = resolveCertificationPaths(projectRoot);
  const campaignDir = path.join(paths.campaignsRoot, campaignId);
  fs.mkdirSync(campaignDir, { recursive: true });

  const snapshotAbs = path.join(projectRoot, capture.snapshotPath);
  const metadataAbs = path.join(projectRoot, capture.metadataPath);
  const bundleSnapshotPath = path.join(campaignDir, 'snapshot.html');
  const bundleMetadataPath = path.join(campaignDir, 'capture.json');
  fs.copyFileSync(snapshotAbs, bundleSnapshotPath);
  fs.copyFileSync(metadataAbs, bundleMetadataPath);

  const capturedAt = captureMetadata?.capturedAt || new Date().toISOString();
  const campaign = normalizeCampaign(projectRoot, {
    campaignId,
    vendorId,
    tenantLabel: input.tenantLabel?.trim() || inferTenantLabel(vendorId, input.pageUrl),
    environmentLabel: input.environmentLabel?.trim() || 'live',
    startedAt: capturedAt,
    capturedAt,
    operator: input.operator?.trim() || 'operator',
    reviewer: input.reviewer?.trim() || null,
    reviewedAt: null,
    status: 'review-required',
    redactionStatus: 'sanitized',
    redactionCount: capture.redactionCount,
    pageUrl: input.pageUrl,
    pageTitle: input.pageTitle,
    captureProvenance: input.captureProvenance ?? 'cli_capture',
    connectorProfile: input.connectorProfile?.trim() || input.prerequisites?.connectorProfile || null,
    driftClassification: null,
    replayPass: null,
    runtimePreviewStatus: 'pending',
    runtimeExecuteStatus: 'pending',
    certificationDecision: 'pending',
    reviewState: 'review_required',
    submittedAt: null,
    submittedBy: null,
    followUpNeeded: false,
    followUpItems: [],
    latestReviewNote: null,
    promotions: defaultPromotions(),
    notes: input.notes?.filter(Boolean) ?? [],
    blockerReasons: [],
    bundlePath: toPosixPath(path.relative(projectRoot, path.join(campaignDir, 'campaign.json'))),
    snapshotId: captureMetadata?.snapshotId || capture.snapshotId,
    snapshotPath: toPosixPath(path.relative(projectRoot, bundleSnapshotPath)),
    metadataPath: toPosixPath(path.relative(projectRoot, bundleMetadataPath)),
    captureExpected: captureMetadata?.extraction ?? null,
    prerequisites: input.prerequisites ?? null,
    replay: null,
    runtimePreview: null,
    runtimeExecute: null,
    reviewNotes: [],
  });

  campaign.blockerReasons = deriveCampaignBlockers(campaign);
  writeCampaignBundle(projectRoot, campaign);
  refreshCertificationStatusFromCampaigns(projectRoot);
  return campaign;
}

export function createBlockedCertificationCampaign(
  projectRoot: string,
  input: CreateBlockedCertificationCampaignInput,
): CertificationCampaignDetail {
  const vendorId = normalizeCertificationVendorId(input.vendorId);
  const campaignId = makeCampaignId(vendorId);
  const campaignDir = path.join(resolveCertificationPaths(projectRoot).campaignsRoot, campaignId);
  fs.mkdirSync(campaignDir, { recursive: true });

  const capturedAt = new Date().toISOString();
  const campaign = normalizeCampaign(projectRoot, {
    campaignId,
    vendorId,
    tenantLabel: input.tenantLabel,
    environmentLabel: input.environmentLabel,
    startedAt: capturedAt,
    capturedAt,
    operator: input.operator,
    reviewer: input.reviewer?.trim() || null,
    reviewedAt: null,
    status: 'live-blocked',
    redactionStatus: 'failed',
    redactionCount: 0,
    pageUrl: input.pageUrl ?? '',
    pageTitle: input.pageTitle ?? '',
    captureProvenance: input.captureProvenance ?? 'blocked_prerequisite_check',
    connectorProfile: input.connectorProfile?.trim() || input.prerequisites?.connectorProfile || null,
    driftClassification: null,
    replayPass: null,
    runtimePreviewStatus: 'skipped',
    runtimeExecuteStatus: 'skipped',
    certificationDecision: 'pending',
    reviewState: 'blocked',
    submittedAt: null,
    submittedBy: null,
    followUpNeeded: false,
    followUpItems: [],
    latestReviewNote: null,
    promotions: defaultPromotions(),
    notes: input.notes?.filter(Boolean) ?? [],
    blockerReasons: [...new Set(input.blockerReasons.filter(Boolean))],
    bundlePath: toPosixPath(path.relative(projectRoot, path.join(campaignDir, 'campaign.json'))),
    snapshotId: null,
    snapshotPath: '',
    metadataPath: '',
    captureExpected: null,
    prerequisites: input.prerequisites ?? null,
    replay: null,
    runtimePreview: null,
    runtimeExecute: null,
    reviewNotes: [],
  });

  campaign.blockerReasons = deriveCampaignBlockers(campaign, campaign.blockerReasons);
  writeCampaignBundle(projectRoot, campaign);
  refreshCertificationStatusFromCampaigns(projectRoot);
  return campaign;
}

export function listCertificationCampaigns(projectRoot: string): CertificationCampaignSummary[] {
  return listCertificationCampaignDetails(projectRoot)
    .map((campaign) => summarizeCampaign(campaign))
    .sort((left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime());
}

export function readCertificationCampaign(projectRoot: string, campaignId: string): CertificationCampaignDetail | null {
  const normalizedCampaignId = normalizeCertificationCampaignId(campaignId);
  if (!normalizedCampaignId) return null;
  const campaignPath = path.join(resolveCertificationPaths(projectRoot).campaignsRoot, normalizedCampaignId, 'campaign.json');
  if (!fs.existsSync(campaignPath)) return null;
  const parsed = JSON.parse(fs.readFileSync(campaignPath, 'utf-8')) as Record<string, unknown>;
  return normalizeCampaign(projectRoot, parsed, normalizedCampaignId);
}

export function finalizeCampaignReplay(
  projectRoot: string,
  input: CampaignReplayFinalizeInput,
): CertificationCampaignDetail {
  const campaign = requireCampaign(projectRoot, input.campaignId);
  if (!campaign.snapshotPath || !campaign.metadataPath) {
    campaign.status = campaign.captureProvenance === 'blocked_prerequisite_check' ? 'live-blocked' : 'failed-capture';
    campaign.reviewState = deriveCampaignReviewState(campaign);
    campaign.blockerReasons = deriveCampaignBlockers(campaign, ['Campaign has no sanitized capture bundle to replay']);
    writeCampaignBundle(projectRoot, campaign);
    refreshCertificationStatusFromCampaigns(projectRoot);
    return campaign;
  }

  const comparedAgainst = input.comparedAgainst ?? 'captured';
  const approvedBaseline = comparedAgainst === 'approved_baseline'
    ? readLatestApprovedBaseline(projectRoot, campaign.vendorId)
    : null;
  const expected = comparedAgainst === 'approved_baseline'
    ? approvedBaseline?.expected ?? null
    : campaign.captureExpected;

  const replay = buildReplaySummary(
    campaign.vendorId,
    comparedAgainst,
    campaign.snapshotPath,
    campaign.metadataPath,
    expected,
    input.actual,
  );
  campaign.replay = replay;
  campaign.replayPass = replay.pass;
  campaign.driftClassification = replay.driftClassification;
  campaign.status = deriveCampaignStatus(campaign);
  campaign.reviewState = deriveCampaignReviewState(campaign);
  campaign.blockerReasons = deriveCampaignBlockers(
    campaign,
    approvedBaseline ? [] : comparedAgainst === 'approved_baseline'
      ? ['No approved baseline exists for this vendor yet']
      : [],
  );

  writeCampaignBundle(projectRoot, campaign);
  refreshCertificationStatusFromCampaigns(projectRoot);
  return campaign;
}

export function attachRuntimeResultToCampaign(
  projectRoot: string,
  input: AttachCampaignRuntimeInput,
): CertificationCampaignDetail {
  const campaign = requireCampaign(projectRoot, input.campaignId);
  const attachment = summarizeRuntimeAttachment(input.mode, input.execution);

  if (!campaign.connectorProfile && attachment.profiles.length > 0) {
    campaign.connectorProfile = attachment.profiles[0] ?? null;
  }

  if (input.mode === 'preview') {
    campaign.runtimePreview = attachment;
    campaign.runtimePreviewStatus = attachment.blocked
      ? 'blocked'
      : attachment.ready
        ? 'ready'
        : 'failed';
  } else {
    campaign.runtimeExecute = attachment;
    campaign.runtimeExecuteStatus = attachment.blocked
      ? 'blocked'
      : attachment.success
        ? 'ok'
        : 'failed';
  }

  campaign.status = deriveCampaignStatus(campaign);
  campaign.reviewState = deriveCampaignReviewState(campaign);
  campaign.blockerReasons = deriveCampaignBlockers(campaign);
  writeCampaignBundle(projectRoot, campaign);
  refreshCertificationStatusFromCampaigns(projectRoot);
  return campaign;
}

export function submitCertificationCampaignForReview(
  projectRoot: string,
  input: CampaignSubmitInput,
): CertificationCampaignDetail {
  const campaign = requireCampaign(projectRoot, input.campaignId);
  const submittedAt = new Date().toISOString();
  campaign.submittedAt = submittedAt;
  campaign.submittedBy = input.submittedBy;
  campaign.reviewNotes.push({
    reviewer: input.submittedBy,
    recordedAt: submittedAt,
    action: 'submit_for_review',
    note: input.notes?.trim() || '',
  });
  campaign.reviewState = deriveCampaignReviewState(campaign);
  campaign.blockerReasons = deriveCampaignBlockers(campaign);
  writeCampaignBundle(projectRoot, campaign);
  refreshCertificationStatusFromCampaigns(projectRoot);
  return campaign;
}

export function reviewCertificationCampaign(
  projectRoot: string,
  input: CampaignReviewInput,
): CertificationCampaignDetail {
  const campaign = requireCampaign(projectRoot, input.campaignId);
  const recordedAt = new Date().toISOString();
  campaign.reviewer = input.reviewer;
  campaign.reviewedAt = recordedAt;
  const followUpItems = input.followUpItems?.filter((value) => value.trim().length > 0) ?? [];
  campaign.reviewNotes.push({
    reviewer: input.reviewer,
    recordedAt,
    action: input.decision === 'approve'
      ? 'approve_certification'
      : input.decision === 'reject'
        ? 'reject_certification'
        : input.decision === 'request_follow_up'
          ? 'request_follow_up'
          : 'mark_inconclusive',
    note: input.notes?.trim() || '',
    followUpItems,
  });
  campaign.certificationDecision = input.decision === 'approve'
    ? 'approved'
    : input.decision === 'reject'
      ? 'rejected'
      : input.decision === 'request_follow_up'
        ? 'follow_up_requested'
        : 'inconclusive';
  campaign.followUpNeeded = input.decision === 'reject' || input.decision === 'request_follow_up';
  campaign.followUpItems = followUpItems;

  if (input.decision === 'approve' && canApproveCampaign(campaign)) {
    campaign.status = 'live-certified';
  } else if (input.decision === 'reject' && campaign.status === 'live-certified') {
    campaign.status = 'review-required';
  } else {
    campaign.status = deriveCampaignStatus(campaign);
  }

  campaign.reviewState = deriveCampaignReviewState(campaign);
  campaign.blockerReasons = deriveCampaignBlockers(campaign);
  writeCampaignBundle(projectRoot, campaign);
  refreshCertificationStatusFromCampaigns(projectRoot);
  return campaign;
}

export function promoteCertificationCampaign(
  projectRoot: string,
  input: CampaignPromotionInput,
): CertificationCampaignDetail {
  const campaign = requireCampaign(projectRoot, input.campaignId);
  const promotion = campaign.promotions.find((entry) => entry.target === input.target);
  if (!promotion) {
    throw new Error(`Unknown promotion target: ${input.target}`);
  }

  const decidedAt = new Date().toISOString();
  if (input.decision === 'reject') {
    promotion.status = 'rejected';
    promotion.decidedAt = decidedAt;
    promotion.decidedBy = input.reviewer;
    promotion.notes = input.notes?.trim() || null;
    promotion.outputPath = null;
    promotion.supersededAt = null;
    promotion.supersededBy = null;
  } else {
    if (input.target === 'baseline') {
      supersedeActiveBaseline(projectRoot, campaign.vendorId, campaign.campaignId, decidedAt);
    }

    const outputPath = writePromotionBundle(projectRoot, campaign, input.target);
    promotion.status = 'approved';
    promotion.decidedAt = decidedAt;
    promotion.decidedBy = input.reviewer;
    promotion.notes = input.notes?.trim() || null;
    promotion.outputPath = outputPath;
    promotion.supersededAt = null;
    promotion.supersededBy = null;
  }

  campaign.reviewNotes.push({
    reviewer: input.reviewer,
    recordedAt: decidedAt,
    action: input.decision === 'approve' ? 'approve_promotion' : 'reject_promotion',
    note: `${input.target}: ${input.notes?.trim() || input.decision}`,
    linkedBaselinePath: input.target === 'baseline' ? promotion.outputPath : null,
  });
  campaign.reviewedAt = decidedAt;
  campaign.reviewState = deriveCampaignReviewState(campaign);

  writeCampaignBundle(projectRoot, campaign);
  refreshCertificationStatusFromCampaigns(projectRoot);
  return campaign;
}

export function refreshCertificationStatusFromCampaigns(projectRoot: string): CertificationStatusSummary[] {
  return refreshCertificationLedger(projectRoot).statuses;
}

export function getCertificationHistory(projectRoot: string): CertificationVendorHistorySummary[] {
  return refreshCertificationLedger(projectRoot).history;
}

export function getCertificationDriftTrends(projectRoot: string): CertificationDriftTrendSummary[] {
  return refreshCertificationLedger(projectRoot).driftTrends;
}

export function listCertificationBaselines(projectRoot: string): CertificationBaselineRecord[] {
  return refreshCertificationLedger(projectRoot).baselines;
}

export function getCertificationFreshness(projectRoot: string): CertificationFreshnessSummary[] {
  return refreshCertificationLedger(projectRoot).freshness;
}

export function getCertificationBaselineChurn(projectRoot: string): CertificationBaselineChurnSummary[] {
  return refreshCertificationLedger(projectRoot).baselineChurn;
}

export function getCertificationReviewLedger(projectRoot: string): CertificationReviewLedgerEntry[] {
  return refreshCertificationLedger(projectRoot).reviewLedger;
}

export function readLatestApprovedBaseline(
  projectRoot: string,
  vendorId: string,
): { outputPath: string; expected: Record<string, unknown> | null } | null {
  const records = listCertificationBaselines(projectRoot)
    .filter((record) => record.vendorId === vendorId)
    .sort((left, right) => new Date(right.promotedAt).getTime() - new Date(left.promotedAt).getTime());
  const preferred = records.find((record) => record.active) ?? records[0];
  if (!preferred) return null;

  const expectedPath = path.join(projectRoot, preferred.path, 'expected.json');
  if (!fs.existsSync(expectedPath)) return null;
  return {
    outputPath: preferred.path,
    expected: JSON.parse(fs.readFileSync(expectedPath, 'utf-8')) as Record<string, unknown>,
  };
}

function refreshCertificationLedger(projectRoot: string): CertificationLedger {
  const campaigns = listCertificationCampaigns(projectRoot);
  const fixtureCounts = discoverFixtureCounts();
  const baselines = deriveBaselineInventory(projectRoot);
  const vendorIds = [...new Set([
    ...Object.keys(fixtureCounts),
    ...campaigns.map((campaign) => campaign.vendorId),
    ...baselines.map((record) => record.vendorId),
  ])].sort();

  const statuses = vendorIds.map((vendorId) => summarizeCertificationStatus({
    vendorId,
    fixtureSnapshots: fixtureCounts[vendorId] ?? 0,
    campaigns: campaigns.filter((campaign) => campaign.vendorId === vendorId),
  }));
  const statusByVendor = new Map(statuses.map((status) => [status.vendorId, status]));
  const history = vendorIds.map((vendorId) => summarizeVendorHistory(
    vendorId,
    campaigns.filter((campaign) => campaign.vendorId === vendorId),
    baselines.filter((record) => record.vendorId === vendorId),
    statusByVendor.get(vendorId) ?? null,
  ));
  const driftTrends = vendorIds.map((vendorId) => summarizeVendorDriftTrend(
    vendorId,
    campaigns.filter((campaign) => campaign.vendorId === vendorId),
    baselines.filter((record) => record.vendorId === vendorId),
    statusByVendor.get(vendorId) ?? null,
  ));
  const freshness = vendorIds.map((vendorId) => summarizeVendorFreshness(
    vendorId,
    campaigns.filter((campaign) => campaign.vendorId === vendorId),
    baselines.filter((record) => record.vendorId === vendorId),
    statusByVendor.get(vendorId) ?? null,
  ));
  const baselineChurn = vendorIds.map((vendorId) => summarizeVendorBaselineChurn(
    vendorId,
    campaigns.filter((campaign) => campaign.vendorId === vendorId),
    baselines.filter((record) => record.vendorId === vendorId),
    statusByVendor.get(vendorId) ?? null,
  ));
  const reviewLedger = deriveReviewLedger(projectRoot, listCertificationCampaignDetails(projectRoot));

  const paths = resolveCertificationPaths(projectRoot);
  writeCertificationStatus(projectRoot, statuses);
  writeJsonArtifact(paths.historyPath, { generatedAt: new Date().toISOString(), vendors: history });
  writeJsonArtifact(paths.driftTrendsPath, { generatedAt: new Date().toISOString(), vendors: driftTrends });
  writeJsonArtifact(paths.freshnessPath, {
    generatedAt: new Date().toISOString(),
    policy: getFreshnessPolicy(),
    vendors: freshness,
  });
  writeJsonArtifact(paths.baselineChurnPath, { generatedAt: new Date().toISOString(), vendors: baselineChurn });
  writeJsonArtifact(paths.reviewLedgerPath, { generatedAt: new Date().toISOString(), entries: reviewLedger });
  writeJsonArtifact(paths.baselineInventoryPath, { generatedAt: new Date().toISOString(), records: baselines });

  return { statuses, history, driftTrends, baselines, freshness, baselineChurn, reviewLedger };
}

function deriveBaselineInventory(projectRoot: string): CertificationBaselineRecord[] {
  const details = listCertificationCampaignDetails(projectRoot);
  return details
    .flatMap((campaign) => {
      const promotion = campaign.promotions.find((entry) => entry.target === 'baseline');
      if (!promotion || !promotion.outputPath || !promotion.decidedAt) return [];
      if (!['approved', 'superseded'].includes(promotion.status)) return [];
      return [{
        vendorId: campaign.vendorId,
        campaignId: campaign.campaignId,
        path: promotion.outputPath,
        promotedAt: promotion.decidedAt,
        reviewer: promotion.decidedBy,
        notes: promotion.notes,
        active: promotion.status === 'approved',
        supersededBy: promotion.supersededBy,
        supersededAt: promotion.supersededAt,
      }];
    })
    .sort((left, right) => new Date(right.promotedAt).getTime() - new Date(left.promotedAt).getTime());
}

function summarizeVendorHistory(
  vendorId: string,
  campaigns: CertificationCampaignSummary[],
  baselines: CertificationBaselineRecord[],
  status: CertificationStatusSummary | null,
): CertificationVendorHistorySummary {
  const sorted = [...campaigns].sort((left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime());
  const latest = sorted[0] ?? null;
  const lastReviewedAt = sorted
    .map((campaign) => campaign.reviewedAt)
    .find((value): value is string => typeof value === 'string' && value.length > 0) ?? null;
  const reviewerNotesSummary = sorted
    .map((campaign) => campaign.latestReviewNote)
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .slice(0, 5);
  const activeBaseline = baselines.find((record) => record.active) ?? null;

  return {
    vendorId,
    currentStatus: latest?.status ?? status?.status ?? 'live-blocked',
    currentReviewState: latest?.reviewState ?? 'blocked',
    campaignCount: sorted.length,
    lastCampaignId: latest?.campaignId ?? null,
    lastCampaignAt: latest?.capturedAt ?? null,
    lastReviewedAt,
    liveCertifiedCount: sorted.filter((campaign) => campaign.status === 'live-certified').length,
    liveBlockedCount: sorted.filter((campaign) => campaign.status === 'live-blocked').length,
    driftDetectedCount: sorted.filter((campaign) => campaign.status === 'drift-detected').length,
    reviewRequiredCount: sorted.filter((campaign) => campaign.status === 'review-required').length,
    readyForReviewCount: sorted.filter((campaign) => campaign.reviewState === 'ready_for_review').length,
    followUpRequestedCount: sorted.filter((campaign) => campaign.reviewState === 'follow_up_requested').length,
    inconclusiveCount: sorted.filter((campaign) => campaign.reviewState === 'inconclusive').length,
    failedCaptureCount: sorted.filter((campaign) => campaign.status === 'failed-capture').length,
    blockerCount: sorted.reduce((sum, campaign) => sum + campaign.blockerReasons.length, 0),
    promotionCount: baselines.length,
    currentBaselineCampaignId: activeBaseline?.campaignId ?? null,
    currentBaselinePath: activeBaseline?.path ?? null,
    reviewerNotesSummary,
  };
}

function summarizeVendorFreshness(
  vendorId: string,
  campaigns: CertificationCampaignSummary[],
  baselines: CertificationBaselineRecord[],
  status: CertificationStatusSummary | null,
): CertificationFreshnessSummary {
  const sorted = [...campaigns].sort((left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime());
  const latest = sorted[0] ?? null;
  const activeBaseline = baselines.find((record) => record.active) ?? null;
  const latestCertified = [...sorted]
    .sort((left, right) => reviewTimestamp(right).getTime() - reviewTimestamp(left).getTime())
    .find((campaign) => campaign.status === 'live-certified') ?? null;
  const lastLiveCertifiedAt = latestCertified ? reviewTimestamp(latestCertified).toISOString() : null;
  const ageHours = lastLiveCertifiedAt ? hoursBetween(lastLiveCertifiedAt, new Date().toISOString()) : null;
  const ageDays = ageHours === null ? null : roundTo(ageHours / 24, 2);
  const policy = getFreshnessPolicy();
  const bucket = classifyFreshnessBucket(ageHours, policy);
  const blocked = latest?.status === 'live-blocked';
  const state = blocked
    ? 'blocked'
    : bucket === 'fresh'
      ? 'fresh'
      : bucket === 'aging'
        ? 'aging'
        : bucket === 'stale'
          ? 'stale'
          : 'uncertified';
  const nextRecommendedRecertificationAt = lastLiveCertifiedAt
    ? new Date(new Date(lastLiveCertifiedAt).getTime() + policy.freshWithinHours * 60 * 60 * 1000).toISOString()
    : null;
  const reasons: string[] = [];

  if (!lastLiveCertifiedAt) {
    reasons.push('No reviewer-approved live-certified campaign exists for this vendor yet.');
  }
  if (blocked && latest?.blockerReasons.length) {
    reasons.push(...latest.blockerReasons.slice(0, 3));
  }
  if (bucket === 'stale' && nextRecommendedRecertificationAt) {
    reasons.push(`Recertification is overdue since ${nextRecommendedRecertificationAt}.`);
  }

  return {
    vendorId,
    currentStatus: latest?.status ?? status?.status ?? 'live-blocked',
    lastCampaignId: latest?.campaignId ?? null,
    lastCampaignAt: latest?.capturedAt ?? null,
    lastLiveCertifiedCampaignId: latestCertified?.campaignId ?? null,
    lastLiveCertifiedAt,
    activeBaselineCampaignId: activeBaseline?.campaignId ?? null,
    activeBaselinePromotedAt: activeBaseline?.promotedAt ?? null,
    ageHours: ageHours === null ? null : roundTo(ageHours, 2),
    ageDays,
    bucket,
    state,
    nextRecommendedRecertificationAt,
    overdue: bucket === 'stale' || bucket === 'uncertified',
    blockingCampaignCount: sorted.filter((campaign) => campaign.status === 'live-blocked').length,
    policy,
    reasons,
  };
}

function summarizeVendorBaselineChurn(
  vendorId: string,
  campaigns: CertificationCampaignSummary[],
  baselines: CertificationBaselineRecord[],
  status: CertificationStatusSummary | null,
): CertificationBaselineChurnSummary {
  const sortedBaselines = [...baselines].sort((left, right) => new Date(left.promotedAt).getTime() - new Date(right.promotedAt).getTime());
  const activeBaseline = baselines.find((record) => record.active) ?? null;
  const replacementIntervalsDays: number[] = [];
  const driftClassCounts = makeEmptyDriftCounts();

  for (let index = 1; index < sortedBaselines.length; index += 1) {
    const previous = sortedBaselines[index - 1];
    const current = sortedBaselines[index];
    replacementIntervalsDays.push(daysBetween(previous.promotedAt, current.promotedAt));

    for (const campaign of campaigns) {
      const capturedAt = new Date(campaign.capturedAt).getTime();
      if (capturedAt <= new Date(previous.promotedAt).getTime()) continue;
      if (capturedAt > new Date(current.promotedAt).getTime()) continue;
      if (campaign.driftClassification) {
        driftClassCounts[campaign.driftClassification] += 1;
      }
    }
  }

  const driftClassesLeadingToReplacement = DRIFT_CLASSES
    .map((classification) => ({ classification, count: driftClassCounts[classification] }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count);
  const shortestReplacementIntervalDays = replacementIntervalsDays.length > 0
    ? roundTo(Math.min(...replacementIntervalsDays), 2)
    : null;
  const averageReplacementIntervalDays = replacementIntervalsDays.length > 0
    ? roundTo(replacementIntervalsDays.reduce((sum, value) => sum + value, 0) / replacementIntervalsDays.length, 2)
    : null;
  const activeBaselineAgeDays = activeBaseline ? roundTo(daysBetween(activeBaseline.promotedAt, new Date().toISOString()), 2) : null;
  const suspicionFlags: string[] = [];

  if (!activeBaseline) suspicionFlags.push('no_stable_baseline');
  if ((shortestReplacementIntervalDays ?? Number.POSITIVE_INFINITY) <= 7 && sortedBaselines.length >= 3) {
    suspicionFlags.push('rapid_baseline_replacement');
  }
  if (driftClassCounts.selector_parser_break >= 2) suspicionFlags.push('repeated_selector_parser_break');
  if (driftClassCounts.auth_session_degradation >= 2) suspicionFlags.push('repeated_auth_session_degradation');
  if (driftClassCounts.privilege_visibility_difference >= 2) suspicionFlags.push('repeated_privilege_visibility_changes');

  const currentStabilityPosture = !activeBaseline
    ? 'no_baseline'
    : suspicionFlags.includes('rapid_baseline_replacement')
      || suspicionFlags.includes('repeated_selector_parser_break')
      || suspicionFlags.includes('repeated_auth_session_degradation')
      ? 'unstable'
      : suspicionFlags.length > 0
        ? 'watch'
        : 'stable';

  return {
    vendorId,
    currentStatus: campaigns[0]?.status ?? status?.status ?? 'live-blocked',
    activeBaselineCampaignId: activeBaseline?.campaignId ?? null,
    activeBaselinePromotedAt: activeBaseline?.promotedAt ?? null,
    activeBaselineAgeDays,
    promotedBaselineCount: sortedBaselines.length,
    supersededBaselineCount: sortedBaselines.filter((record) => !record.active).length,
    replacementCount: Math.max(sortedBaselines.length - 1, 0),
    averageReplacementIntervalDays,
    shortestReplacementIntervalDays,
    lastReplacementAt: sortedBaselines.length > 1 ? sortedBaselines[sortedBaselines.length - 1]?.promotedAt ?? null : null,
    driftClassesLeadingToReplacement,
    currentStabilityPosture,
    suspicionFlags,
  };
}

function deriveReviewLedger(
  projectRoot: string,
  campaigns: CertificationCampaignDetail[],
): CertificationReviewLedgerEntry[] {
  return campaigns
    .flatMap((campaign) => {
      const entries: CertificationReviewLedgerEntry[] = [];
      const baselinePromotion = campaign.promotions.find((entry) => entry.target === 'baseline');

      for (const note of campaign.reviewNotes) {
        entries.push({
          vendorId: campaign.vendorId,
          campaignId: campaign.campaignId,
          reviewer: note.reviewer,
          recordedAt: note.recordedAt,
          action: note.action,
          reviewState: deriveLedgerReviewState(note.action, campaign),
          note: note.note,
          followUpItems: note.followUpItems ?? [],
          promotionTarget: note.action === 'approve_promotion' || note.action === 'reject_promotion'
            ? inferPromotionTarget(note.note)
            : null,
          linkedBaselinePath: note.linkedBaselinePath
            ?? (note.action === 'approve_promotion' && baselinePromotion?.outputPath
              ? toPosixPath(path.relative(projectRoot, path.join(projectRoot, baselinePromotion.outputPath)))
              : null),
        });
      }

      return entries;
    })
    .sort((left, right) => new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime());
}

function summarizeVendorDriftTrend(
  vendorId: string,
  campaigns: CertificationCampaignSummary[],
  baselines: CertificationBaselineRecord[],
  status: CertificationStatusSummary | null,
): CertificationDriftTrendSummary {
  const sorted = [...campaigns].sort((left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime());
  const driftCounts = makeEmptyDriftCounts();
  const blockerCounts = new Map<string, number>();

  for (const campaign of sorted) {
    if (campaign.driftClassification) {
      driftCounts[campaign.driftClassification] += 1;
    }
    for (const blocker of campaign.blockerReasons) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
    }
  }

  const topRecurringDriftClasses = DRIFT_CLASSES
    .map((classification) => ({ classification, count: driftCounts[classification] }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 3);
  const recurringBlockers = [...blockerCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
  const activeBaseline = baselines.find((record) => record.active) ?? null;
  const lastStableCampaign = sorted.find((campaign) => campaign.status === 'live-certified') ?? null;
  const lastParserBreak = sorted.find((campaign) => campaign.driftClassification === 'selector_parser_break');
  const suspicionFlags: string[] = [];

  if (driftCounts.selector_parser_break >= 2) suspicionFlags.push('adapter_instability');
  if (driftCounts.auth_session_degradation >= 2) suspicionFlags.push('auth_session_churn');
  if (driftCounts.privilege_visibility_difference >= 2) suspicionFlags.push('visibility_inconsistency');
  if ((baselines.find((record) => record.active) ?? null) === null && sorted.length >= 2) suspicionFlags.push('baseline_staleness');
  if (sorted.filter((campaign) => campaign.status === 'live-blocked').length >= 2) suspicionFlags.push('repeated_blocker_pattern');

  return {
    vendorId,
    currentPosture: sorted[0]?.status ?? status?.status ?? 'live-blocked',
    totalCampaigns: sorted.length,
    liveCertifiedCount: sorted.filter((campaign) => campaign.status === 'live-certified').length,
    liveBlockedCount: sorted.filter((campaign) => campaign.status === 'live-blocked').length,
    unresolvedCampaignCount: sorted.filter((campaign) => campaign.status !== 'live-certified').length,
    driftCounts,
    topRecurringDriftClasses,
    recurringBlockers,
    lastStableCampaignId: activeBaseline?.campaignId ?? lastStableCampaign?.campaignId ?? null,
    lastStableAt: activeBaseline?.promotedAt ?? lastStableCampaign?.capturedAt ?? null,
    lastParserBreakAt: lastParserBreak?.capturedAt ?? null,
    suspicionFlags,
  };
}

function summarizeCampaign(campaign: CertificationCampaignDetail): CertificationCampaignSummary {
  return {
    campaignId: campaign.campaignId,
    vendorId: campaign.vendorId,
    tenantLabel: campaign.tenantLabel,
    environmentLabel: campaign.environmentLabel,
    startedAt: campaign.startedAt,
    capturedAt: campaign.capturedAt,
    operator: campaign.operator,
    reviewer: campaign.reviewer,
    reviewedAt: campaign.reviewedAt,
    status: campaign.status,
    redactionStatus: campaign.redactionStatus,
    redactionCount: campaign.redactionCount,
    pageUrl: campaign.pageUrl,
    pageTitle: campaign.pageTitle,
    captureProvenance: campaign.captureProvenance,
    connectorProfile: campaign.connectorProfile,
    driftClassification: campaign.driftClassification,
    replayPass: campaign.replayPass,
    runtimePreviewStatus: campaign.runtimePreviewStatus,
    runtimeExecuteStatus: campaign.runtimeExecuteStatus,
    certificationDecision: campaign.certificationDecision,
    reviewState: campaign.reviewState,
    submittedAt: campaign.submittedAt,
    submittedBy: campaign.submittedBy,
    followUpNeeded: campaign.followUpNeeded,
    followUpItems: campaign.followUpItems,
    latestReviewNote: campaign.reviewNotes[campaign.reviewNotes.length - 1]?.note?.trim() || null,
    promotions: campaign.promotions,
    notes: campaign.notes,
    blockerReasons: campaign.blockerReasons,
  };
}

function writeCampaignBundle(projectRoot: string, campaign: CertificationCampaignDetail): void {
  const campaignPath = path.join(projectRoot, campaign.bundlePath);
  const campaignDir = path.dirname(campaignPath);
  fs.mkdirSync(campaignDir, { recursive: true });
  fs.writeFileSync(campaignPath, JSON.stringify(campaign, null, 2), 'utf-8');

  if (campaign.prerequisites) {
    fs.writeFileSync(
      path.join(campaignDir, 'prerequisites.json'),
      JSON.stringify(campaign.prerequisites, null, 2),
      'utf-8',
    );
  } else {
    removeIfExists(path.join(campaignDir, 'prerequisites.json'));
  }

  if (campaign.replay) {
    fs.writeFileSync(
      path.join(campaignDir, 'replay.json'),
      JSON.stringify(campaign.replay, null, 2),
      'utf-8',
    );
  } else {
    removeIfExists(path.join(campaignDir, 'replay.json'));
  }
  if (campaign.runtimePreview) {
    fs.writeFileSync(
      path.join(campaignDir, 'runtime-preview.json'),
      JSON.stringify(campaign.runtimePreview, null, 2),
      'utf-8',
    );
  } else {
    removeIfExists(path.join(campaignDir, 'runtime-preview.json'));
  }
  if (campaign.runtimeExecute) {
    fs.writeFileSync(
      path.join(campaignDir, 'runtime-execute.json'),
      JSON.stringify(campaign.runtimeExecute, null, 2),
      'utf-8',
    );
  } else {
    removeIfExists(path.join(campaignDir, 'runtime-execute.json'));
  }

  fs.writeFileSync(path.join(campaignDir, 'review.md'), renderCampaignReview(campaign), 'utf-8');
}

function renderCampaignReview(campaign: CertificationCampaignDetail): string {
  const baseline = campaign.promotions.find((entry) => entry.target === 'baseline');
  const lines = [
    `# Certification Campaign ${campaign.campaignId}`,
    '',
    `- Vendor: ${campaign.vendorId}`,
    `- Tenant: ${campaign.tenantLabel}`,
    `- Environment: ${campaign.environmentLabel}`,
    `- Started At: ${campaign.startedAt}`,
    `- Captured At: ${campaign.capturedAt}`,
    `- Operator: ${campaign.operator}`,
    `- Submitted By: ${campaign.submittedBy ?? 'pending'}`,
    `- Submitted At: ${campaign.submittedAt ?? 'pending'}`,
    `- Reviewer: ${campaign.reviewer ?? 'pending'}`,
    `- Reviewed At: ${campaign.reviewedAt ?? 'pending'}`,
    `- Status: ${campaign.status}`,
    `- Review State: ${campaign.reviewState}`,
    `- Capture Provenance: ${campaign.captureProvenance}`,
    `- Connector Profile: ${campaign.connectorProfile ?? 'default'}`,
    `- Replay: ${campaign.replay ? (campaign.replay.pass ? 'pass' : 'drift') : 'pending'}`,
    `- Runtime Preview: ${campaign.runtimePreviewStatus}`,
    `- Runtime Execute: ${campaign.runtimeExecuteStatus}`,
    `- Baseline Promotion: ${baseline?.status ?? 'none'}`,
    '',
    '## Blockers',
    ...(campaign.blockerReasons.length > 0 ? campaign.blockerReasons.map((value) => `- ${value}`) : ['- none']),
    '',
    '## Prerequisites',
    ...(campaign.prerequisites
      ? campaign.prerequisites.checks.map((check) => `- ${check.status.toUpperCase()} ${check.label}: ${check.detail}`)
      : ['- none recorded']),
    '',
    '## Notes',
    ...(campaign.notes.length > 0 ? campaign.notes.map((value) => `- ${value}`) : ['- none']),
    '',
    '## Follow-Up Items',
    ...(campaign.followUpItems.length > 0 ? campaign.followUpItems.map((value) => `- ${value}`) : ['- none']),
    '',
    '## Review Actions',
    ...(campaign.reviewNotes.length > 0
      ? campaign.reviewNotes.map((note) => {
        const extras = note.followUpItems?.length ? ` [follow-up: ${note.followUpItems.join('; ')}]` : '';
        return `- ${note.recordedAt} ${note.reviewer} ${note.action}: ${note.note || '(no note)'}${extras}`;
      })
      : ['- none']),
  ];
  return `${lines.join('\n')}\n`;
}

function deriveCampaignStatus(campaign: CertificationCampaignDetail): CertificationCampaignStatus {
  if (campaign.captureProvenance === 'blocked_prerequisite_check') return 'live-blocked';
  if (campaign.redactionStatus === 'failed') return 'failed-capture';
  if (campaign.runtimeExecute?.blocked || campaign.runtimePreview?.blocked) return 'live-blocked';
  if (campaign.prerequisites?.readyForRuntime === false && campaign.runtimePreview === null && campaign.runtimeExecute === null) {
    return 'live-blocked';
  }
  if (campaign.replay && !campaign.replay.pass && campaign.replay.blocksCertification) return 'drift-detected';
  if (campaign.certificationDecision === 'approved' && canApproveCampaign(campaign)) return 'live-certified';
  return 'review-required';
}

function deriveCampaignReviewState(campaign: CertificationCampaignDetail): CertificationCampaignReviewState {
  if (campaign.certificationDecision === 'approved' && canApproveCampaign(campaign)) return 'approved';
  if (campaign.certificationDecision === 'rejected') return 'rejected';
  if (campaign.certificationDecision === 'follow_up_requested') return 'follow_up_requested';
  if (campaign.certificationDecision === 'inconclusive') return 'inconclusive';
  if (campaign.captureProvenance === 'blocked_prerequisite_check'
    || campaign.status === 'live-blocked'
    || campaign.runtimePreview?.blocked
    || campaign.runtimeExecute?.blocked) {
    return 'blocked';
  }
  if (campaign.replay && !campaign.replay.pass && campaign.replay.blocksCertification) {
    return 'blocked';
  }
  if (campaign.redactionStatus === 'failed' || campaign.status === 'failed-capture') {
    return 'failed_capture';
  }
  if (campaign.submittedAt && campaign.replay) {
    return 'ready_for_review';
  }
  return 'review_required';
}

function deriveCampaignBlockers(campaign: CertificationCampaignDetail, extra: string[] = []): string[] {
  const blockers = new Set<string>(extra);

  for (const blocker of campaign.prerequisites?.blockerReasons ?? []) {
    blockers.add(blocker);
  }

  if (campaign.captureProvenance !== 'blocked_prerequisite_check') {
    if (!campaign.replay) {
      blockers.add('Replay has not been run for this campaign yet');
    } else if (!campaign.replay.pass) {
      for (const gap of campaign.replay.gaps.slice(0, 5)) {
        blockers.add(gap);
      }
    }
  }

  for (const runtime of [campaign.runtimePreview, campaign.runtimeExecute]) {
    if (!runtime) continue;
    for (const blocker of runtime.blockers) {
      blockers.add(blocker);
    }
  }

  if (campaign.certificationDecision === 'rejected') {
    blockers.add('Reviewer rejected certification');
  }
  if (campaign.certificationDecision === 'follow_up_requested' || campaign.followUpNeeded) {
    blockers.add('Reviewer marked follow-up as needed');
  }
  if (campaign.certificationDecision === 'inconclusive') {
    blockers.add('Reviewer marked the campaign as inconclusive');
  }
  for (const item of campaign.followUpItems) {
    blockers.add(`Follow-up: ${item}`);
  }

  return [...blockers];
}

function canApproveCampaign(campaign: CertificationCampaignDetail): boolean {
  if (!campaign.replay) return false;
  if (!campaign.replay.pass && campaign.replay.blocksCertification) return false;
  if (campaign.runtimePreview?.blocked || campaign.runtimeExecute?.blocked) return false;
  return true;
}

function summarizeRuntimeAttachment(
  mode: 'preview' | 'execute',
  execution: ExecuteResponse,
): CertificationRuntimeAttachmentSummary {
  const previewTargets = execution.previewState?.targets ?? [];
  const connectorIds = previewTargets.map((target) => target.connectorId).filter(Boolean);
  const profiles = previewTargets.map((target) => target.profile).filter(Boolean);
  const datasets = previewTargets.map((target) => target.dataset).filter(Boolean);
  const timeWindows = previewTargets.map((target) => target.timeWindow).filter(Boolean);
  const blockers = execution.previewState?.blockers ?? [];

  return {
    attachedAt: new Date().toISOString(),
    mode,
    success: execution.success,
    ready: execution.previewState?.ready ?? execution.success,
    blocked: blockers.length > 0 && !execution.success,
    message: execution.message,
    connectorIds: connectorIds.length > 0
      ? connectorIds
      : execution.executionState?.connectorId
        ? [execution.executionState.connectorId]
        : [],
    profiles,
    datasets,
    timeWindows,
    queryIds: execution.executionState?.queryIds ?? [],
    receiptIds: execution.executionState?.receiptIds ?? [],
    artifactPaths: execution.executionState?.artifactPaths ?? [],
    blockers,
  };
}

function writePromotionBundle(
  projectRoot: string,
  campaign: CertificationCampaignDetail,
  target: CertificationPromotionSummary['target'],
): string {
  const paths = resolveCertificationPaths(projectRoot);
  const root = target === 'baseline'
    ? paths.baselinesRoot
    : target === 'fixture_candidate'
      ? paths.fixtureCandidatesRoot
      : paths.regressionInputsRoot;
  const outputDir = path.join(root, campaign.vendorId, campaign.campaignId);
  fs.mkdirSync(outputDir, { recursive: true });

  if (campaign.snapshotPath) {
    const sourceSnapshot = path.join(projectRoot, campaign.snapshotPath);
    if (fs.existsSync(sourceSnapshot)) {
      fs.copyFileSync(sourceSnapshot, path.join(outputDir, 'snapshot.html'));
    }
  }
  fs.writeFileSync(path.join(outputDir, 'campaign.json'), JSON.stringify(campaign, null, 2), 'utf-8');
  fs.writeFileSync(
    path.join(outputDir, 'expected.json'),
    JSON.stringify(campaign.replay?.actual ?? campaign.captureExpected ?? null, null, 2),
    'utf-8',
  );
  fs.writeFileSync(path.join(outputDir, 'metadata.json'), JSON.stringify({
    vendorId: campaign.vendorId,
    campaignId: campaign.campaignId,
    promotedAt: new Date().toISOString(),
    reviewer: campaign.reviewer,
    connectorProfile: campaign.connectorProfile,
  }, null, 2), 'utf-8');
  return toPosixPath(path.relative(projectRoot, outputDir));
}

function discoverFixtureCounts(): Record<string, number> {
  const fixturesRoot = path.resolve(import.meta.dir, '../test/fixtures');
  if (!fs.existsSync(fixturesRoot)) return {};

  return fs.readdirSync(fixturesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .reduce<Record<string, number>>((acc, entry) => {
      const manifestPath = path.join(fixturesRoot, entry.name, 'fixtures.json');
      if (!fs.existsSync(manifestPath)) {
        acc[entry.name] = 0;
        return acc;
      }
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { fixtures?: unknown[] };
      acc[entry.name] = Array.isArray(manifest.fixtures) ? manifest.fixtures.length : 0;
      return acc;
    }, {});
}

function listCertificationCampaignDetails(projectRoot: string): CertificationCampaignDetail[] {
  const campaignsRoot = resolveCertificationPaths(projectRoot).campaignsRoot;
  if (!fs.existsSync(campaignsRoot)) return [];

  return fs.readdirSync(campaignsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readCertificationCampaign(projectRoot, entry.name))
    .filter((campaign): campaign is CertificationCampaignDetail => Boolean(campaign))
    .sort((left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime());
}

function defaultPromotions(): CertificationPromotionSummary[] {
  return PROMOTION_TARGETS.map((target) => ({
    target,
    status: 'none',
    decidedAt: null,
    decidedBy: null,
    notes: null,
    outputPath: null,
    supersededAt: null,
    supersededBy: null,
  }));
}

function inferTenantLabel(vendorId: string, pageUrl: string): string {
  try {
    const url = new URL(pageUrl);
    if (vendorId === 'okta') {
      return url.hostname.split('.')[0] || 'unknown-tenant';
    }
    return url.hostname || `unknown-${vendorId}`;
  } catch {
    return `unknown-${vendorId}`;
  }
}

function readLegacyCaptureMetadata(projectRoot: string, metadataPath: string): CampaignCaptureMetadata | null {
  const absolutePath = path.join(projectRoot, metadataPath);
  if (!fs.existsSync(absolutePath)) return null;
  const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf-8')) as Record<string, unknown>;
  return {
    vendorId: String(parsed.vendorId || ''),
    snapshotId: String(parsed.snapshotId || ''),
    pageUrl: String(parsed.pageUrl || ''),
    pageTitle: String(parsed.pageTitle || ''),
    capturedAt: String(parsed.capturedAt || new Date().toISOString()),
    extraction: parsed.expected && typeof parsed.expected === 'object'
      ? parsed.expected as Record<string, unknown>
      : null,
  };
}

function requireCampaign(projectRoot: string, campaignId: string): CertificationCampaignDetail {
  const campaign = readCertificationCampaign(projectRoot, campaignId);
  if (!campaign) {
    throw new Error(`Unknown certification campaign: ${campaignId}`);
  }
  return campaign;
}

function supersedeActiveBaseline(
  projectRoot: string,
  vendorId: string,
  newCampaignId: string,
  supersededAt: string,
): void {
  for (const candidate of listCertificationCampaignDetails(projectRoot)) {
    if (candidate.vendorId !== vendorId || candidate.campaignId === newCampaignId) continue;
    const promotion = candidate.promotions.find((entry) => entry.target === 'baseline');
    if (!promotion || promotion.status !== 'approved') continue;
    promotion.status = 'superseded';
    promotion.supersededBy = newCampaignId;
    promotion.supersededAt = supersededAt;
    writeCampaignBundle(projectRoot, candidate);
  }
}

function normalizeCampaign(
  projectRoot: string,
  parsed: Record<string, unknown>,
  fallbackCampaignId?: string,
): CertificationCampaignDetail {
  const capturedAt = stringValue(parsed.capturedAt) ?? stringValue(parsed.startedAt) ?? new Date().toISOString();
  const reviewNotes = normalizeReviewNotes(parsed.reviewNotes);
  const runtimePreview = asRuntimeAttachment(parsed.runtimePreview);
  const runtimeExecute = asRuntimeAttachment(parsed.runtimeExecute);
  const bundlePath = stringValue(parsed.bundlePath)
    ?? toPosixPath(path.relative(projectRoot, path.join(resolveCertificationPaths(projectRoot).campaignsRoot, fallbackCampaignId ?? stringValue(parsed.campaignId) ?? 'unknown', 'campaign.json')));
  const promotions = normalizePromotions(parsed.promotions);
  const campaign: CertificationCampaignDetail = {
    campaignId: stringValue(parsed.campaignId) ?? fallbackCampaignId ?? makeCampaignId(stringValue(parsed.vendorId) ?? 'unknown'),
    vendorId: stringValue(parsed.vendorId) ?? 'unknown',
    tenantLabel: stringValue(parsed.tenantLabel) ?? 'unknown-tenant',
    environmentLabel: stringValue(parsed.environmentLabel) ?? 'live',
    startedAt: stringValue(parsed.startedAt) ?? capturedAt,
    capturedAt,
    operator: stringValue(parsed.operator) ?? 'operator',
    reviewer: nullableStringValue(parsed.reviewer),
    reviewedAt: nullableStringValue(parsed.reviewedAt)
      ?? [...reviewNotes].reverse().find((note) => note.action !== 'note')?.recordedAt
      ?? null,
    status: normalizeCampaignStatus(parsed.status),
    redactionStatus: parsed.redactionStatus === 'sanitized' ? 'sanitized' : 'failed',
    redactionCount: numberValue(parsed.redactionCount),
    pageUrl: stringValue(parsed.pageUrl) ?? '',
    pageTitle: stringValue(parsed.pageTitle) ?? '',
    captureProvenance: normalizeCaptureProvenance(parsed.captureProvenance),
    connectorProfile: nullableStringValue(parsed.connectorProfile)
      ?? runtimePreview?.profiles[0]
      ?? runtimeExecute?.profiles[0]
      ?? null,
    driftClassification: normalizeDriftClassification(parsed.driftClassification),
    replayPass: typeof parsed.replayPass === 'boolean' ? parsed.replayPass : null,
    runtimePreviewStatus: normalizeRuntimePreviewStatus(parsed.runtimePreviewStatus),
    runtimeExecuteStatus: normalizeRuntimeExecuteStatus(parsed.runtimeExecuteStatus),
    certificationDecision: parsed.certificationDecision === 'approved'
      || parsed.certificationDecision === 'rejected'
      || parsed.certificationDecision === 'follow_up_requested'
      || parsed.certificationDecision === 'inconclusive'
      ? parsed.certificationDecision
      : 'pending',
    reviewState: 'review_required',
    submittedAt: nullableStringValue(parsed.submittedAt),
    submittedBy: nullableStringValue(parsed.submittedBy),
    followUpNeeded: parsed.followUpNeeded === true
      || parsed.certificationDecision === 'rejected'
      || parsed.certificationDecision === 'follow_up_requested',
    followUpItems: stringArray(parsed.followUpItems),
    latestReviewNote: null,
    promotions,
    notes: Array.isArray(parsed.notes) ? parsed.notes.filter((value): value is string => typeof value === 'string' && value.length > 0) : [],
    blockerReasons: Array.isArray(parsed.blockerReasons)
      ? parsed.blockerReasons.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [],
    bundlePath,
    snapshotId: nullableStringValue(parsed.snapshotId),
    snapshotPath: stringValue(parsed.snapshotPath) ?? '',
    metadataPath: stringValue(parsed.metadataPath) ?? '',
    captureExpected: isRecord(parsed.captureExpected) ? parsed.captureExpected : null,
    prerequisites: isRecord(parsed.prerequisites) ? parsed.prerequisites as unknown as CertificationPrerequisiteReport : null,
    replay: isRecord(parsed.replay) ? parsed.replay as unknown as CertificationCampaignDetail['replay'] : null,
    runtimePreview,
    runtimeExecute,
    reviewNotes,
  };
  campaign.reviewState = normalizeReviewState(parsed.reviewState) ?? deriveCampaignReviewState(campaign);
  return campaign;
}

function normalizePromotions(value: unknown): CertificationPromotionSummary[] {
  const existing = Array.isArray(value)
    ? value.filter((entry) => entry && typeof entry === 'object') as Array<Record<string, unknown>>
    : [];

  return PROMOTION_TARGETS.map((target) => {
    const parsed = existing.find((entry) => entry.target === target);
    return {
      target,
      status: parsed?.status === 'approved' || parsed?.status === 'rejected' || parsed?.status === 'pending' || parsed?.status === 'superseded'
        ? parsed.status
        : 'none',
      decidedAt: nullableStringValue(parsed?.decidedAt),
      decidedBy: nullableStringValue(parsed?.decidedBy),
      notes: nullableStringValue(parsed?.notes),
      outputPath: nullableStringValue(parsed?.outputPath),
      supersededAt: nullableStringValue(parsed?.supersededAt),
      supersededBy: nullableStringValue(parsed?.supersededBy),
    };
  });
}

function normalizeCampaignStatus(value: unknown): CertificationCampaignStatus {
  switch (value) {
    case 'live-certified':
    case 'drift-detected':
    case 'live-blocked':
    case 'review-required':
    case 'failed-capture':
      return value;
    default:
      return 'review-required';
  }
}

function normalizeReviewState(value: unknown): CertificationCampaignReviewState | null {
  switch (value) {
    case 'blocked':
    case 'failed_capture':
    case 'review_required':
    case 'ready_for_review':
    case 'approved':
    case 'rejected':
    case 'follow_up_requested':
    case 'inconclusive':
      return value;
    default:
      return null;
  }
}

function normalizeCaptureProvenance(value: unknown): CertificationCaptureProvenance {
  switch (value) {
    case 'extension_capture':
    case 'cli_capture':
    case 'blocked_prerequisite_check':
      return value;
    default:
      return 'cli_capture';
  }
}

function normalizeDriftClassification(value: unknown): CertificationDriftClassification | null {
  return DRIFT_CLASSES.includes(value as CertificationDriftClassification)
    ? value as CertificationDriftClassification
    : null;
}

function normalizeRuntimePreviewStatus(value: unknown): CertificationCampaignDetail['runtimePreviewStatus'] {
  return value === 'ready' || value === 'blocked' || value === 'failed' || value === 'skipped'
    ? value
    : 'pending';
}

function normalizeRuntimeExecuteStatus(value: unknown): CertificationCampaignDetail['runtimeExecuteStatus'] {
  return value === 'ok' || value === 'blocked' || value === 'failed' || value === 'skipped'
    ? value
    : 'pending';
}

function normalizeReviewNotes(value: unknown): CertificationCampaignDetail['reviewNotes'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const parsed = entry as Record<string, unknown>;
      return {
        reviewer: stringValue(parsed.reviewer) ?? 'reviewer',
        recordedAt: stringValue(parsed.recordedAt) ?? new Date().toISOString(),
        action: normalizeReviewerAction(parsed.action),
        note: stringValue(parsed.note) ?? '',
        followUpItems: stringArray(parsed.followUpItems),
        linkedBaselinePath: nullableStringValue(parsed.linkedBaselinePath),
      };
    });
}

function normalizeReviewerAction(value: unknown): CertificationReviewerNote['action'] {
  switch (value) {
    case 'submit_for_review':
    case 'approve_certification':
    case 'reject_certification':
    case 'approve_promotion':
    case 'reject_promotion':
    case 'request_follow_up':
    case 'mark_inconclusive':
    case 'note':
      return value;
    default:
      return 'note';
  }
}

function asRuntimeAttachment(value: unknown): CertificationRuntimeAttachmentSummary | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Record<string, unknown>;
  return {
    attachedAt: stringValue(parsed.attachedAt) ?? new Date().toISOString(),
    mode: parsed.mode === 'execute' ? 'execute' : 'preview',
    success: parsed.success === true,
    ready: parsed.ready === true,
    blocked: parsed.blocked === true,
    message: stringValue(parsed.message) ?? '',
    connectorIds: stringArray(parsed.connectorIds),
    profiles: stringArray(parsed.profiles),
    datasets: stringArray(parsed.datasets),
    timeWindows: stringArray(parsed.timeWindows),
    queryIds: stringArray(parsed.queryIds),
    receiptIds: stringArray(parsed.receiptIds),
    artifactPaths: stringArray(parsed.artifactPaths),
    blockers: stringArray(parsed.blockers),
  };
}

function getFreshnessPolicy(): CertificationFreshnessPolicy {
  const freshWithinHours = parsePositiveNumber(process.env.THRUNT_CERT_FRESH_HOURS) ?? DEFAULT_FRESH_POLICY.freshWithinHours;
  const agingWithinHours = parsePositiveNumber(process.env.THRUNT_CERT_AGING_HOURS) ?? DEFAULT_FRESH_POLICY.agingWithinHours;
  return {
    freshWithinHours,
    agingWithinHours: agingWithinHours > freshWithinHours ? agingWithinHours : freshWithinHours * 2,
  };
}

function classifyFreshnessBucket(
  ageHours: number | null,
  policy: CertificationFreshnessPolicy,
): CertificationFreshnessSummary['bucket'] {
  if (ageHours === null) return 'uncertified';
  if (ageHours <= policy.freshWithinHours) return 'fresh';
  if (ageHours <= policy.agingWithinHours) return 'aging';
  return 'stale';
}

function reviewTimestamp(campaign: CertificationCampaignSummary): Date {
  return new Date(campaign.reviewedAt ?? campaign.capturedAt);
}

function deriveLedgerReviewState(
  action: CertificationReviewLedgerEntry['action'],
  campaign: CertificationCampaignDetail,
): CertificationCampaignReviewState {
  switch (action) {
    case 'submit_for_review':
      return campaign.reviewState === 'approved'
        || campaign.reviewState === 'rejected'
        || campaign.reviewState === 'follow_up_requested'
        || campaign.reviewState === 'inconclusive'
        ? 'ready_for_review'
        : campaign.reviewState;
    case 'approve_certification':
      return 'approved';
    case 'reject_certification':
      return 'rejected';
    case 'request_follow_up':
      return 'follow_up_requested';
    case 'mark_inconclusive':
      return 'inconclusive';
    default:
      return campaign.reviewState;
  }
}

function inferPromotionTarget(note: string): CertificationPromotionSummary['target'] | null {
  if (note.startsWith('baseline:')) return 'baseline';
  if (note.startsWith('fixture_candidate:')) return 'fixture_candidate';
  if (note.startsWith('regression_input:')) return 'regression_input';
  return null;
}

function makeEmptyDriftCounts(): Record<CertificationDriftClassification, number> {
  return {
    benign_ui_drift: 0,
    selector_parser_break: 0,
    semantic_extraction_drift: 0,
    auth_session_degradation: 0,
    privilege_visibility_difference: 0,
    unknown: 0,
  };
}

function writeJsonArtifact(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
}

function removeIfExists(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  fs.unlinkSync(filePath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function parsePositiveNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nullableStringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function hoursBetween(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60);
}

function daysBetween(start: string, end: string): number {
  return hoursBetween(start, end) / 24;
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function makeCampaignId(vendorId: string): string {
  const normalizedVendorId = normalizeCertificationVendorId(vendorId);
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CERT-${normalizedVendorId.toUpperCase()}-${stamp}-${suffix}`;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}
