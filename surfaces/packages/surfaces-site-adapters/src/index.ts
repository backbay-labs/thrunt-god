/**
 * @thrunt-surfaces/site-adapters — Vendor console site adapters and registry.
 */

export { SiteAdapterRegistry, createDefaultRegistry } from './registry.ts';
export {
  buildReplaySummary,
  sanitizeLiveSnapshotHtml,
  writeLiveCertificationCapture,
  compareReplayExtraction,
  writeCertificationStatus,
  summarizeCertificationStatus,
} from './certification.ts';
export {
  resolveCertificationPaths,
  createCertificationCampaign,
  createBlockedCertificationCampaign,
  listCertificationCampaigns,
  listCertificationBaselines,
  readCertificationCampaign,
  finalizeCampaignReplay,
  attachRuntimeResultToCampaign,
  submitCertificationCampaignForReview,
  reviewCertificationCampaign,
  promoteCertificationCampaign,
  refreshCertificationStatusFromCampaigns,
  getCertificationHistory,
  getCertificationDriftTrends,
  getCertificationFreshness,
  getCertificationBaselineChurn,
  getCertificationReviewLedger,
  readLatestApprovedBaseline,
} from './campaigns.ts';
export {
  replayCertificationCampaign,
  runCertificationHarness,
} from './certification-harness.ts';

export { buildAdapter, runAdapterPipeline } from './helpers.ts';
export type { AdapterPipelineConfig } from './helpers.ts';

export { createSplunkAdapter } from './adapters/splunk.ts';
export { createElasticAdapter } from './adapters/elastic.ts';
export { createSentinelAdapter } from './adapters/sentinel.ts';
export { createOktaAdapter } from './adapters/okta.ts';
export { createM365DefenderAdapter } from './adapters/m365-defender.ts';
export { createCrowdStrikeAdapter } from './adapters/crowdstrike.ts';
export { createAwsAdapter } from './adapters/aws.ts';
export { createGcpAdapter } from './adapters/gcp.ts';
export { createJiraAdapter } from './adapters/jira.ts';
export { createConfluenceAdapter } from './adapters/confluence.ts';
export { createServiceNowAdapter } from './adapters/servicenow.ts';
