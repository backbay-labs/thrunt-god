import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  compareReplayExtraction,
  sanitizeLiveSnapshotHtml,
} from '../src/certification.ts';
import {
  createCertificationCampaign,
  createBlockedCertificationCampaign,
  finalizeCampaignReplay,
  getCertificationBaselineChurn,
  getCertificationDriftTrends,
  getCertificationFreshness,
  getCertificationHistory,
  listCertificationBaselines,
  promoteCertificationCampaign,
  readCertificationCampaign,
  readLatestApprovedBaseline,
  reviewCertificationCampaign,
  submitCertificationCampaignForReview,
} from '../src/campaigns.ts';
import { replayCertificationCampaign, runCertificationHarness } from '../src/certification-harness.ts';

const FIXTURE_ROOT = path.resolve(import.meta.dir, 'fixtures');

setDefaultTimeout(20_000);

interface FixtureExpectation {
  detect: boolean;
  pageType: string;
  confidence: 'high' | 'medium' | 'low';
  completeness: 'complete' | 'partial' | 'unsupported';
  supported: boolean;
  tableRows: number;
  queryLanguage: string | null;
  entityValues: string[];
  failureReasons?: string[];
}

interface FixtureDefinition {
  file: string;
  url: string;
  expected: FixtureExpectation;
}

interface FixtureManifest {
  vendorId: string;
  fixtures: FixtureDefinition[];
}

describe('live certification tooling', () => {
  test('sanitizeLiveSnapshotHtml redacts common tenant and identity markers', () => {
    const raw = `
      <div>alice@example.com</div>
      <div>123456789012</div>
      <div>arn:aws:iam::123456789012:role/test-role</div>
      <div>https://acme-admin.okta.com/admin/reports/system-log</div>
    `;

    const sanitized = sanitizeLiveSnapshotHtml('okta', raw);
    expect(sanitized.redactionCount).toBeGreaterThanOrEqual(4);
    expect(sanitized.html).not.toContain('alice@example.com');
    expect(sanitized.html).not.toContain('123456789012');
    expect(sanitized.html).not.toContain('acme-admin.okta.com');
  });

  test('runCertificationHarness marks matching live replay as review-required before approval', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-cert-pass-'));
    try {
      const fixture = readManifest('okta').fixtures[0];
      const html = readFixtureHtml('okta', fixture.file);
      createCertificationCampaign(root, {
        vendorId: 'okta',
        pageUrl: fixture.url,
        pageTitle: 'System Log',
        rawHtml: html,
        extraction: expectedReplay(fixture.expected),
      });

      const report = await runCertificationHarness({
        projectRoot: root,
        vendorIds: ['okta'],
        fixturesRoot: FIXTURE_ROOT,
      });

      expect(report.vendors).toHaveLength(1);
      expect(report.vendors[0]?.status?.status).toBe('review-required');
      expect(report.vendors[0].liveSnapshots).toBe(1);
      expect(report.vendors[0].driftCount).toBe(0);
      expect(fs.existsSync(report.reportPath)).toBe(true);
      expect(fs.existsSync(report.statusPath)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('createCertificationCampaign writes an inspectable campaign bundle', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-cert-campaign-'));
    try {
      const fixture = readManifest('okta').fixtures[0];
      const html = readFixtureHtml('okta', fixture.file);
      const campaign = createCertificationCampaign(root, {
        vendorId: 'okta',
        pageUrl: fixture.url,
        pageTitle: 'System Log',
        rawHtml: html,
        extraction: expectedReplay(fixture.expected),
        tenantLabel: 'acme',
        operator: 'analyst',
        notes: ['initial capture'],
      });

      expect(campaign.campaignId).toMatch(/^CERT-OKTA-/);
      expect(fs.existsSync(path.join(root, campaign.bundlePath))).toBe(true);
      expect(fs.existsSync(path.join(root, '.planning', 'certification', 'campaigns', campaign.campaignId, 'review.md'))).toBe(true);
      expect(campaign.captureExpected?.query).toEqual({ language: 'okta-filter' });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('compareReplayExtraction classifies auth/session degradation', () => {
    const comparison = compareReplayExtraction('okta', {
      detect: true,
      context: {
        pageType: 'log_viewer',
        extraction: {
          supported: true,
          confidence: 'high',
          completeness: 'complete',
          failureReasons: [],
        },
      },
      query: { language: 'okta-filter', statement: 'actor.displayName eq "[redacted-email]"' },
      table: { totalRows: 1 },
      entities: [],
      supportedActions: ['capture_live_snapshot'],
    }, {
      detect: false,
      context: {
        pageType: 'unknown',
        extraction: {
          supported: false,
          confidence: 'low',
          completeness: 'unsupported',
          failureReasons: ['session expired while loading results'],
        },
      },
      query: null,
      table: { totalRows: 0 },
      entities: [],
      supportedActions: [],
    });

    expect(comparison.pass).toBe(false);
    expect(comparison.driftClassification).toBe('auth_session_degradation');
    expect(comparison.blocksCertification).toBe(true);
  });

  test('runCertificationHarness marks mismatched live replay as drift-detected', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-cert-drift-'));
    try {
      const fixture = readManifest('sentinel').fixtures[0];
      const html = readFixtureHtml('sentinel', fixture.file);
      const expected = expectedReplay(fixture.expected);
      expected.query = { language: 'not-kql' };

      createCertificationCampaign(root, {
        vendorId: 'sentinel',
        pageUrl: fixture.url,
        pageTitle: 'Sentinel Logs',
        rawHtml: html,
        extraction: expected,
      });

      const report = await runCertificationHarness({
        projectRoot: root,
        vendorIds: ['sentinel'],
        fixturesRoot: FIXTURE_ROOT,
      });

      expect(report.vendors[0]?.status?.status).toBe('drift-detected');
      expect(report.vendors[0].driftCount).toBe(1);
      expect(report.vendors[0].replays[0].gaps.some((gap) => gap.includes('query.language'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('runCertificationHarness reports blocked campaigns as live-blocked', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-cert-blocked-'));
    try {
      createBlockedCertificationCampaign(root, {
        vendorId: 'aws',
        tenantLabel: 'sandbox',
        environmentLabel: 'live',
        operator: 'operator',
        blockerReasons: ['Missing aws default connector profile'],
      });
      const report = await runCertificationHarness({
        projectRoot: root,
        vendorIds: ['aws'],
        fixturesRoot: FIXTURE_ROOT,
      });

      expect(report.vendors[0]?.status?.status).toBe('live-blocked');
      expect(report.vendors[0].liveSnapshots).toBe(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('review and promotion workflow requires explicit approval', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-cert-review-'));
    try {
      const fixture = readManifest('aws').fixtures[0];
      const html = readFixtureHtml('aws', fixture.file);
      const created = createCertificationCampaign(root, {
        vendorId: 'aws',
        pageUrl: fixture.url,
        pageTitle: 'CloudTrail',
        rawHtml: html,
        extraction: {
          detect: true,
          context: {
            pageType: 'log_viewer',
            extraction: {
              supported: true,
              confidence: 'high',
              completeness: 'complete',
              failureReasons: [],
            },
          },
          query: null,
          table: { totalRows: 3 },
          entities: [],
          supportedActions: [],
        },
      });

      const replayed = finalizeCampaignReplay(root, {
        campaignId: created.campaignId,
        actual: {
          detect: true,
          context: {
            pageType: 'log_viewer',
            extraction: {
              supported: true,
              confidence: 'high',
              completeness: 'complete',
              failureReasons: [],
            },
          },
          query: null,
          table: { totalRows: 3 },
          entities: [],
          supportedActions: [],
        },
      });
      expect(replayed.status).toBe('review-required');

      const submitted = submitCertificationCampaignForReview(root, {
        campaignId: created.campaignId,
        submittedBy: 'operator',
        notes: 'Submitting replay-clean campaign for reviewer approval',
      });
      expect(submitted.reviewState).toBe('ready_for_review');

      const approved = reviewCertificationCampaign(root, {
        campaignId: created.campaignId,
        reviewer: 'reviewer-1',
        decision: 'approve',
        notes: 'Replay matches approved operator expectation',
      });
      expect(approved.status).toBe('live-certified');

      const promoted = promoteCertificationCampaign(root, {
        campaignId: created.campaignId,
        reviewer: 'reviewer-1',
        decision: 'approve',
        target: 'baseline',
        notes: 'Promote as replay baseline',
      });
      const baseline = promoted.promotions.find((entry) => entry.target === 'baseline');
      expect(baseline?.status).toBe('approved');
      expect(baseline?.outputPath).toBeTruthy();
      expect(fs.existsSync(path.join(root, baseline!.outputPath!))).toBe(true);

      const latestBaseline = readLatestApprovedBaseline(root, 'aws');
      expect(latestBaseline?.expected).toBeTruthy();
      expect(readCertificationCampaign(root, created.campaignId)?.reviewNotes.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('baseline promotion supersedes the previous active baseline and updates history', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-cert-baseline-history-'));
    try {
      const fixture = readManifest('okta').fixtures[0];
      const html = readFixtureHtml('okta', fixture.file);

      const first = createCertificationCampaign(root, {
        vendorId: 'okta',
        pageUrl: fixture.url,
        pageTitle: 'System Log',
        rawHtml: html,
        extraction: {
          detect: true,
          context: {
            pageType: 'log_viewer',
            extraction: {
              supported: true,
              confidence: 'high',
              completeness: 'complete',
              failureReasons: [],
            },
          },
          query: { language: 'okta-filter' },
          table: { totalRows: 2 },
          entities: [],
          supportedActions: [],
        },
        operator: 'op-1',
      });
      finalizeCampaignReplay(root, {
        campaignId: first.campaignId,
        actual: {
          detect: true,
          context: {
            pageType: 'log_viewer',
            extraction: {
              supported: true,
              confidence: 'high',
              completeness: 'complete',
              failureReasons: [],
            },
          },
          query: { language: 'okta-filter' },
          table: { totalRows: 2 },
          entities: [],
          supportedActions: [],
        },
      });
      reviewCertificationCampaign(root, {
        campaignId: first.campaignId,
        reviewer: 'reviewer-1',
        decision: 'approve',
      });
      promoteCertificationCampaign(root, {
        campaignId: first.campaignId,
        reviewer: 'reviewer-1',
        decision: 'approve',
        target: 'baseline',
        notes: 'First promoted baseline',
      });

      const second = createCertificationCampaign(root, {
        vendorId: 'okta',
        pageUrl: fixture.url,
        pageTitle: 'System Log',
        rawHtml: html,
        extraction: {
          detect: true,
          context: {
            pageType: 'log_viewer',
            extraction: {
              supported: true,
              confidence: 'high',
              completeness: 'complete',
              failureReasons: [],
            },
          },
          query: { language: 'okta-filter' },
          table: { totalRows: 2 },
          entities: [],
          supportedActions: [],
        },
        operator: 'op-2',
      });
      finalizeCampaignReplay(root, {
        campaignId: second.campaignId,
        actual: {
          detect: true,
          context: {
            pageType: 'log_viewer',
            extraction: {
              supported: true,
              confidence: 'high',
              completeness: 'complete',
              failureReasons: [],
            },
          },
          query: { language: 'okta-filter' },
          table: { totalRows: 2 },
          entities: [],
          supportedActions: [],
        },
      });
      reviewCertificationCampaign(root, {
        campaignId: second.campaignId,
        reviewer: 'reviewer-2',
        decision: 'approve',
      });
      promoteCertificationCampaign(root, {
        campaignId: second.campaignId,
        reviewer: 'reviewer-2',
        decision: 'approve',
        target: 'baseline',
        notes: 'Superseding baseline',
      });

      const baselines = listCertificationBaselines(root).filter((record) => record.vendorId === 'okta');
      expect(baselines).toHaveLength(2);
      expect(baselines.find((record) => record.active)?.campaignId).toBe(second.campaignId);
      expect(baselines.find((record) => record.campaignId === first.campaignId)?.supersededBy).toBe(second.campaignId);

      const firstCampaign = readCertificationCampaign(root, first.campaignId);
      const firstBaselinePromotion = firstCampaign?.promotions.find((entry) => entry.target === 'baseline');
      expect(firstBaselinePromotion?.status).toBe('superseded');

      const history = getCertificationHistory(root).find((entry) => entry.vendorId === 'okta');
      expect(history?.currentBaselineCampaignId).toBe(second.campaignId);
      expect(history?.promotionCount).toBe(2);
      expect(history?.liveCertifiedCount).toBe(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('drift trends aggregate repeated classes and recurring blockers over time', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-cert-drift-trends-'));
    try {
      createBlockedCertificationCampaign(root, {
        vendorId: 'aws',
        tenantLabel: 'sandbox',
        environmentLabel: 'live',
        operator: 'operator-1',
        blockerReasons: ['Missing live session capture'],
      });
      createBlockedCertificationCampaign(root, {
        vendorId: 'aws',
        tenantLabel: 'sandbox',
        environmentLabel: 'live',
        operator: 'operator-2',
        blockerReasons: ['Missing live session capture'],
      });

      const fixture = readManifest('sentinel').fixtures[0];
      for (let index = 0; index < 2; index += 1) {
        const campaign = createCertificationCampaign(root, {
          vendorId: 'sentinel',
          pageUrl: fixture.url,
          pageTitle: `Sentinel Logs ${index}`,
          rawHtml: readFixtureHtml('sentinel', fixture.file),
          extraction: {
            detect: true,
            context: {
              pageType: 'log_viewer',
              extraction: {
                supported: true,
                confidence: 'high',
                completeness: 'complete',
                failureReasons: [],
              },
            },
            query: { language: `not-kql-${index}` },
            table: { totalRows: 1 },
            entities: [],
            supportedActions: [],
          },
        });
        finalizeCampaignReplay(root, {
          campaignId: campaign.campaignId,
          actual: {
            detect: true,
            context: {
              pageType: 'log_viewer',
              extraction: {
                supported: true,
                confidence: 'high',
                completeness: 'complete',
                failureReasons: [],
              },
            },
            query: { language: 'kql', statement: 'SigninLogs | take 50' },
            table: { totalRows: 1 },
            entities: [],
            supportedActions: [],
          },
        });
      }

      const awsTrend = getCertificationDriftTrends(root).find((entry) => entry.vendorId === 'aws');
      expect(awsTrend?.liveBlockedCount).toBe(2);
      expect(awsTrend?.recurringBlockers[0]?.reason).toContain('Missing live session capture');
      expect(awsTrend?.suspicionFlags).toContain('repeated_blocker_pattern');

      const sentinelTrend = getCertificationDriftTrends(root).find((entry) => entry.vendorId === 'sentinel');
      expect(sentinelTrend?.driftCounts.semantic_extraction_drift).toBe(2);
      expect(sentinelTrend?.topRecurringDriftClasses[0]?.classification).toBe('semantic_extraction_drift');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('submission and follow-up review decisions persist in campaign history', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-cert-review-state-'));
    try {
      const fixture = readManifest('okta').fixtures[0];
      const html = readFixtureHtml('okta', fixture.file);
      const campaign = createCertificationCampaign(root, {
        vendorId: 'okta',
        pageUrl: fixture.url,
        pageTitle: 'System Log',
        rawHtml: html,
        extraction: {
          detect: true,
          context: {
            pageType: 'log_viewer',
            extraction: {
              supported: true,
              confidence: 'high',
              completeness: 'complete',
              failureReasons: [],
            },
          },
          query: { language: 'okta-filter' },
          table: { totalRows: 2 },
          entities: [],
          supportedActions: [],
        },
        operator: 'analyst-1',
      });

      finalizeCampaignReplay(root, {
        campaignId: campaign.campaignId,
        actual: {
          detect: true,
          context: {
            pageType: 'log_viewer',
            extraction: {
              supported: true,
              confidence: 'high',
              completeness: 'complete',
              failureReasons: [],
            },
          },
          query: { language: 'okta-filter' },
          table: { totalRows: 2 },
          entities: [],
          supportedActions: [],
        },
      });
      const submitted = submitCertificationCampaignForReview(root, {
        campaignId: campaign.campaignId,
        submittedBy: 'analyst-1',
        notes: 'Replay and preview evidence assembled for review',
      });
      expect(submitted.reviewState).toBe('ready_for_review');
      expect(submitted.submittedBy).toBe('analyst-1');

      const followUp = reviewCertificationCampaign(root, {
        campaignId: campaign.campaignId,
        reviewer: 'reviewer-1',
        decision: 'request_follow_up',
        notes: 'Need one more capture after the results pane fully loads',
        followUpItems: ['Capture a fully loaded results table', 'Re-run replay after the follow-up capture'],
      });
      expect(followUp.reviewState).toBe('follow_up_requested');
      expect(followUp.certificationDecision).toBe('follow_up_requested');
      expect(followUp.followUpItems).toContain('Capture a fully loaded results table');

      const history = getCertificationHistory(root).find((entry) => entry.vendorId === 'okta');
      expect(history?.followUpRequestedCount).toBe(1);
      expect(history?.readyForReviewCount).toBe(0);
      expect(readCertificationCampaign(root, campaign.campaignId)?.reviewNotes.some((note) => note.action === 'submit_for_review')).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('freshness summaries distinguish fresh, stale, and blocked vendors', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-cert-freshness-'));
    try {
      const fixture = readManifest('aws').fixtures[0];
      const html = readFixtureHtml('aws', fixture.file);
      const campaign = createCertificationCampaign(root, {
        vendorId: 'aws',
        pageUrl: fixture.url,
        pageTitle: 'CloudTrail',
        rawHtml: html,
        extraction: {
          detect: true,
          context: {
            pageType: 'log_viewer',
            extraction: {
              supported: true,
              confidence: 'high',
              completeness: 'complete',
              failureReasons: [],
            },
          },
          query: null,
          table: { totalRows: 3 },
          entities: [],
          supportedActions: [],
        },
        operator: 'analyst-1',
      });
      await replayCertificationCampaign({ projectRoot: root, campaignId: campaign.campaignId });
      submitCertificationCampaignForReview(root, {
        campaignId: campaign.campaignId,
        submittedBy: 'analyst-1',
      });
      reviewCertificationCampaign(root, {
        campaignId: campaign.campaignId,
        reviewer: 'reviewer-1',
        decision: 'approve',
      });

      mutateCampaign(root, campaign.campaignId, (parsed) => {
        parsed.reviewedAt = '2026-03-01T00:00:00.000Z';
        parsed.capturedAt = '2026-03-01T00:00:00.000Z';
        return parsed;
      });

      createBlockedCertificationCampaign(root, {
        vendorId: 'okta',
        tenantLabel: 'sandbox',
        environmentLabel: 'live',
        operator: 'operator',
        blockerReasons: ['Missing live browser session capture'],
      });

      const freshness = getCertificationFreshness(root);
      const aws = freshness.find((entry) => entry.vendorId === 'aws');
      const okta = freshness.find((entry) => entry.vendorId === 'okta');
      expect(aws?.bucket).toBe('stale');
      expect(aws?.state).toBe('stale');
      expect(okta?.bucket).toBe('uncertified');
      expect(okta?.state).toBe('blocked');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('baseline churn reports rapid baseline replacement and unstable posture', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-cert-churn-'));
    try {
      const fixture = readManifest('okta').fixtures[0];
      const html = readFixtureHtml('okta', fixture.file);
      const promotedAt = [
        '2026-04-01T00:00:00.000Z',
        '2026-04-03T00:00:00.000Z',
        '2026-04-05T00:00:00.000Z',
      ];

      for (let index = 0; index < promotedAt.length; index += 1) {
        const campaign = createCertificationCampaign(root, {
          vendorId: 'okta',
          pageUrl: fixture.url,
          pageTitle: `System Log ${index}`,
          rawHtml: html,
          extraction: {
            detect: true,
            context: {
              pageType: 'log_viewer',
              extraction: {
                supported: true,
                confidence: 'high',
                completeness: 'complete',
                failureReasons: [],
              },
            },
            query: { language: 'okta-filter' },
            table: { totalRows: 2 },
            entities: [],
            supportedActions: [],
          },
          operator: `op-${index}`,
        });
        finalizeCampaignReplay(root, {
          campaignId: campaign.campaignId,
          actual: {
            detect: true,
            context: {
              pageType: 'log_viewer',
              extraction: {
                supported: true,
                confidence: 'high',
                completeness: 'complete',
                failureReasons: [],
              },
            },
            query: { language: 'okta-filter' },
            table: { totalRows: 2 },
            entities: [],
            supportedActions: [],
          },
        });
        submitCertificationCampaignForReview(root, {
          campaignId: campaign.campaignId,
          submittedBy: `op-${index}`,
        });
        reviewCertificationCampaign(root, {
          campaignId: campaign.campaignId,
          reviewer: `reviewer-${index}`,
          decision: 'approve',
        });
        promoteCertificationCampaign(root, {
          campaignId: campaign.campaignId,
          reviewer: `reviewer-${index}`,
          decision: 'approve',
          target: 'baseline',
        });
        mutateCampaign(root, campaign.campaignId, (parsed) => {
          const promotion = Array.isArray(parsed.promotions)
            ? (parsed.promotions as Array<Record<string, unknown>>).find((entry) => entry.target === 'baseline')
            : null;
          if (promotion) {
            promotion.decidedAt = promotedAt[index];
            if (index < promotedAt.length - 1 && promotion.status === 'approved') {
              promotion.status = 'superseded';
              promotion.supersededBy = `placeholder-${index}`;
              promotion.supersededAt = promotedAt[index + 1];
            }
          }
          if (index === promotedAt.length - 1 && promotion) {
            promotion.status = 'approved';
            promotion.supersededBy = null;
            promotion.supersededAt = null;
          }
          parsed.reviewedAt = promotedAt[index];
          parsed.capturedAt = promotedAt[index];
          return parsed;
        });
      }

      const churn = getCertificationBaselineChurn(root).find((entry) => entry.vendorId === 'okta');
      expect(churn?.promotedBaselineCount).toBe(3);
      expect(churn?.supersededBaselineCount).toBe(2);
      expect(churn?.replacementCount).toBe(2);
      expect(churn?.currentStabilityPosture).toBe('unstable');
      expect(churn?.suspicionFlags).toContain('rapid_baseline_replacement');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

function readManifest(vendorId: string): FixtureManifest {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_ROOT, vendorId, 'fixtures.json'), 'utf-8'),
  ) as FixtureManifest;
}

function readFixtureHtml(vendorId: string, file: string): string {
  return fs.readFileSync(path.join(FIXTURE_ROOT, vendorId, file), 'utf-8');
}

function expectedReplay(fixture: FixtureExpectation) {
  return {
    detect: fixture.detect,
    context: {
      pageType: fixture.pageType,
      extraction: {
        supported: fixture.supported,
        confidence: fixture.confidence,
        completeness: fixture.completeness,
        failureReasons: fixture.failureReasons ?? [],
      },
    },
    query: fixture.queryLanguage ? { language: fixture.queryLanguage } : null,
    table: { totalRows: fixture.tableRows },
    entities: fixture.entityValues.map((value) => ({ value })),
    supportedActions: [],
  };
}

function mutateCampaign(
  root: string,
  campaignId: string,
  mutate: (parsed: Record<string, unknown>) => Record<string, unknown>,
): void {
  const campaign = readCertificationCampaign(root, campaignId);
  if (!campaign) {
    throw new Error(`Unknown campaign: ${campaignId}`);
  }
  const campaignPath = path.join(root, campaign.bundlePath);
  const parsed = JSON.parse(fs.readFileSync(campaignPath, 'utf-8')) as Record<string, unknown>;
  fs.writeFileSync(campaignPath, JSON.stringify(mutate(parsed), null, 2), 'utf-8');
}
