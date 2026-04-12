import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { chromium, type BrowserContext, type Route } from 'playwright';

import type {
  CertificationBaselineChurnSummary,
  CertificationCampaignDetail,
  CertificationCampaignSummary,
  CertificationFreshnessSummary,
  CertificationStatusSummary,
} from '@thrunt-surfaces/contracts';

import {
  finalizeCampaignReplay,
  getCertificationBaselineChurn,
  getCertificationFreshness,
  listCertificationCampaigns,
  readCertificationCampaign,
  refreshCertificationStatusFromCampaigns,
  resolveCertificationPaths,
} from './campaigns.ts';

export interface CertificationHarnessOptions {
  projectRoot: string;
  vendorIds?: string[];
  comparedAgainst?: 'captured' | 'approved_baseline';
  fixturesRoot?: string;
}

export interface CertificationReplayRecord {
  campaignId: string;
  vendorId: string;
  tenantLabel: string;
  snapshotPath: string;
  metadataPath: string;
  pass: boolean;
  driftClassification: string | null;
  gaps: string[];
  actual: unknown;
  suspectFiles: string[];
}

export interface VendorCertificationReport {
  vendorId: string;
  fixtureSnapshots: number;
  liveSnapshots: number;
  livePassed: number;
  driftCount: number;
  blockedCount: number;
  reviewRequiredCount: number;
  status: CertificationStatusSummary | null;
  freshness: CertificationFreshnessSummary | null;
  baselineChurn: CertificationBaselineChurnSummary | null;
  summary: string;
  replays: CertificationReplayRecord[];
}

export interface CertificationHarnessReport {
  generatedAt: string;
  projectRoot: string;
  reportPath: string;
  statusPath: string;
  campaigns: CertificationCampaignSummary[];
  vendors: VendorCertificationReport[];
}

export async function replayCertificationCampaign(options: {
  projectRoot: string;
  campaignId: string;
  comparedAgainst?: 'captured' | 'approved_baseline';
}): Promise<CertificationCampaignDetail> {
  const projectRoot = path.resolve(options.projectRoot);
  const campaign = readCertificationCampaign(projectRoot, options.campaignId);
  if (!campaign) {
    throw new Error(`Unknown certification campaign: ${options.campaignId}`);
  }
  if (!campaign.snapshotPath) {
    return finalizeCampaignReplay(projectRoot, {
      campaignId: options.campaignId,
      comparedAgainst: options.comparedAgainst,
      actual: null,
    });
  }

  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-certify-build-'));
  const harnessPath = await buildHarness(buildDir);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  try {
    const html = fs.readFileSync(path.join(projectRoot, campaign.snapshotPath), 'utf-8');
    const actual = await replaySnapshot(context, harnessPath, campaign.vendorId, campaign.pageUrl, html);
    return finalizeCampaignReplay(projectRoot, {
      campaignId: options.campaignId,
      comparedAgainst: options.comparedAgainst,
      actual: asRecord(actual),
    });
  } finally {
    await context.close();
    await browser.close();
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
}

export async function runCertificationHarness(
  options: CertificationHarnessOptions,
): Promise<CertificationHarnessReport> {
  const projectRoot = path.resolve(options.projectRoot);
  const comparedAgainst = options.comparedAgainst ?? 'captured';
  const allCampaigns = listCertificationCampaigns(projectRoot);
  const filteredCampaignSummaries = options.vendorIds?.length
    ? allCampaigns.filter((campaign) => options.vendorIds?.includes(campaign.vendorId))
    : allCampaigns;
  const filteredCampaigns = filteredCampaignSummaries
    .map((campaign) => readCertificationCampaign(projectRoot, campaign.campaignId))
    .filter((campaign): campaign is CertificationCampaignDetail => Boolean(campaign));

  const replayableCampaigns = filteredCampaigns.filter((campaign) => Boolean(campaign.snapshotPath));
  let buildDir: string | null = null;
  let harnessPath: string | null = null;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let context: BrowserContext | null = null;

  if (replayableCampaigns.length > 0) {
    buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-certify-build-'));
    harnessPath = await buildHarness(buildDir);
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
  }

  try {
    const replayRecords: CertificationReplayRecord[] = [];
    for (const campaign of replayableCampaigns) {
      const detail = readCertificationCampaign(projectRoot, campaign.campaignId);
      if (!detail || !context || !harnessPath || !detail.snapshotPath) continue;

      const html = fs.readFileSync(path.join(projectRoot, detail.snapshotPath), 'utf-8');
      const actual = await replaySnapshot(context, harnessPath, detail.vendorId, detail.pageUrl, html);
      const updated = finalizeCampaignReplay(projectRoot, {
        campaignId: detail.campaignId,
        comparedAgainst,
        actual: asRecord(actual),
      });
      if (!updated.replay) continue;

      replayRecords.push({
        campaignId: updated.campaignId,
        vendorId: updated.vendorId,
        tenantLabel: updated.tenantLabel,
        snapshotPath: updated.snapshotPath,
        metadataPath: updated.metadataPath,
        pass: updated.replay.pass,
        driftClassification: updated.replay.driftClassification,
        gaps: updated.replay.gaps,
        actual,
        suspectFiles: updated.replay.suspectFiles,
      });
    }

    const statusSummaries = refreshCertificationStatusFromCampaigns(projectRoot);
    const refreshedCampaigns = listCertificationCampaigns(projectRoot);
    const freshnessSummaries = getCertificationFreshness(projectRoot);
    const churnSummaries = getCertificationBaselineChurn(projectRoot);
    const vendorIds = [...new Set([
      ...refreshedCampaigns.map((campaign) => campaign.vendorId),
      ...statusSummaries.map((status) => status.vendorId),
    ])]
      .filter((vendorId) => !options.vendorIds?.length || options.vendorIds.includes(vendorId))
      .sort();

    const vendorReports = vendorIds.map((vendorId) => {
      const vendorCampaigns = refreshedCampaigns.filter((campaign) => campaign.vendorId === vendorId);
      const status = statusSummaries.find((entry) => entry.vendorId === vendorId) ?? null;
      const replays = replayRecords.filter((record) => record.vendorId === vendorId);
      const blockedCount = vendorCampaigns.filter((campaign) => campaign.status === 'live-blocked').length;
      const reviewRequiredCount = vendorCampaigns.filter((campaign) => campaign.status === 'review-required').length;
      const driftCount = vendorCampaigns.filter((campaign) => campaign.status === 'drift-detected').length;
      const livePassed = replays.filter((record) => record.pass).length;
      const freshness = freshnessSummaries.find((entry) => entry.vendorId === vendorId) ?? null;
      const baselineChurn = churnSummaries.find((entry) => entry.vendorId === vendorId) ?? null;

      return {
        vendorId,
        fixtureSnapshots: status && 'fixtureSnapshots' in status && typeof (status as Record<string, unknown>).fixtureSnapshots === 'number'
          ? Number((status as Record<string, unknown>).fixtureSnapshots)
          : 0,
        liveSnapshots: vendorCampaigns.length,
        livePassed,
        driftCount,
        blockedCount,
        reviewRequiredCount,
        status,
        freshness,
        baselineChurn,
        summary: status?.summary ?? 'No certification status available',
        replays,
      };
    });

    const reportPath = writeHarnessReport(projectRoot, refreshedCampaigns, vendorReports);
    const statusPath = resolveCertificationPaths(projectRoot).statusPath;
    return {
      generatedAt: new Date().toISOString(),
      projectRoot,
      reportPath,
      statusPath,
      campaigns: refreshedCampaigns,
      vendors: vendorReports,
    };
  } finally {
    if (context) {
      await context.close();
    }
    if (browser) {
      await browser.close();
    }
    if (buildDir) {
      fs.rmSync(buildDir, { recursive: true, force: true });
    }
  }
}

async function buildHarness(buildDir: string): Promise<string> {
  const entrypoint = path.resolve(import.meta.dir, './browser-harness-entry.ts');
  const result = await Bun.build({
    entrypoints: [entrypoint],
    outdir: buildDir,
    naming: 'browser-harness.js',
    target: 'browser',
    format: 'iife',
    minify: false,
    sourcemap: 'none',
  });

  if (!result.success) {
    throw new Error(result.logs.map((log) => log.message).join('\n'));
  }

  return path.join(buildDir, 'browser-harness.js');
}

async function replaySnapshot(
  context: BrowserContext,
  harnessPath: string,
  vendorId: string,
  pageUrl: string,
  html: string,
): Promise<unknown> {
  const page = await context.newPage();
  const requestUrl = stripHash(pageUrl);

  try {
    await page.route('**/*', async (route: Route) => {
      if (route.request().url() === requestUrl) {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: html,
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'text/plain',
        body: '',
      });
    });

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
    await page.addScriptTag({ path: harnessPath });
    return await page.evaluate((id) => {
      return (window as typeof window & {
        __thruntSurfaces?: { runAdapter(adapterId: string): unknown };
      }).__thruntSurfaces?.runAdapter(id);
    }, vendorId);
  } finally {
    await page.close();
  }
}

function writeHarnessReport(
  projectRoot: string,
  campaigns: CertificationCampaignSummary[],
  vendors: VendorCertificationReport[],
): string {
  const reportPath = resolveCertificationPaths(projectRoot).reportPath;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    campaigns,
    vendors,
  }, null, 2), 'utf-8');
  return reportPath;
}

function stripHash(url: string): string {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.toString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}
