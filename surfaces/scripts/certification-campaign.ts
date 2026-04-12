#!/usr/bin/env bun

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  CertificationCampaignDetail,
  CertificationCaptureRequest,
  VendorContext,
} from '../packages/surfaces-contracts/src/index.ts';
import {
  attachRuntimeResultToCampaign,
  createBlockedCertificationCampaign,
  createCertificationCampaign,
  getCertificationBaselineChurn,
  getCertificationDriftTrends,
  getCertificationFreshness,
  getCertificationHistory,
  listCertificationBaselines,
  listCertificationCampaigns,
  promoteCertificationCampaign,
  readCertificationCampaign,
  refreshCertificationStatusFromCampaigns,
  replayCertificationCampaign,
  reviewCertificationCampaign,
  runCertificationHarness,
  submitCertificationCampaignForReview,
} from '../packages/surfaces-site-adapters/src/index.ts';
import { checkCertificationPrerequisites } from '../apps/surface-bridge/src/certification-ops.ts';

const [command = 'help'] = process.argv.slice(2);
const argv = process.argv.slice(3);
const projectRoot = path.resolve(readFlag(argv, 'project-root') || process.cwd());
const toolsPath = readFlag(argv, 'tools-path') || undefined;

switch (command) {
  case 'capture':
    print(createCertificationCampaign(projectRoot, readCaptureInput(argv)));
    break;
  case 'start':
  case 'prereqs':
    print(await checkCertificationPrerequisites(projectRoot, {
      vendorId: requiredFlag(argv, 'vendor'),
      tenantLabel: readFlag(argv, 'tenant-label'),
      environmentLabel: readFlag(argv, 'environment-label'),
      operator: readFlag(argv, 'operator'),
      reviewer: readFlag(argv, 'reviewer'),
      pageUrl: readFlag(argv, 'page-url'),
      pageTitle: readFlag(argv, 'page-title'),
      notes: readListFlag(argv, 'note'),
      persistBlockedCampaign: command === 'start' || hasFlag(argv, 'persist-blocked'),
    }, {
      toolsPath,
    }));
    break;
  case 'blocked':
    print(createBlockedCertificationCampaign(projectRoot, {
      vendorId: requiredFlag(argv, 'vendor'),
      tenantLabel: readFlag(argv, 'tenant-label') || `unknown-${requiredFlag(argv, 'vendor')}`,
      environmentLabel: readFlag(argv, 'environment-label') || 'live',
      operator: readFlag(argv, 'operator') || 'operator',
      reviewer: readFlag(argv, 'reviewer'),
      notes: readListFlag(argv, 'note'),
      blockerReasons: readListFlag(argv, 'blocker'),
      pageUrl: readFlag(argv, 'page-url') || undefined,
      pageTitle: readFlag(argv, 'page-title') || undefined,
    }));
    break;
  case 'list':
    print({ campaigns: listCertificationCampaigns(projectRoot) });
    break;
  case 'history':
    print({ history: getCertificationHistory(projectRoot) });
    break;
  case 'trends':
    print({ trends: getCertificationDriftTrends(projectRoot) });
    break;
  case 'baselines':
    print({ baselines: listCertificationBaselines(projectRoot) });
    break;
  case 'freshness':
    print({ freshness: getCertificationFreshness(projectRoot) });
    break;
  case 'churn':
    print({ churn: getCertificationBaselineChurn(projectRoot) });
    break;
  case 'inspect':
    print(requireCampaign(projectRoot, requiredFlag(argv, 'campaign-id')));
    break;
  case 'replay':
    print(await replayCertificationCampaign({
      projectRoot,
      campaignId: requiredFlag(argv, 'campaign-id'),
      comparedAgainst: parseComparedAgainst(readFlag(argv, 'compared-against')),
    }));
    break;
  case 'preview':
    print(await runCampaignRuntime(projectRoot, {
      campaignId: requiredFlag(argv, 'campaign-id'),
      dryRun: true,
      toolsPath,
      packId: readFlag(argv, 'pack-id') || undefined,
      target: readFlag(argv, 'target') || undefined,
      parameters: readParams(argv),
    }));
    break;
  case 'execute':
    print(await runCampaignRuntime(projectRoot, {
      campaignId: requiredFlag(argv, 'campaign-id'),
      dryRun: false,
      toolsPath,
      packId: readFlag(argv, 'pack-id') || undefined,
      target: readFlag(argv, 'target') || undefined,
      parameters: readParams(argv),
    }));
    break;
  case 'report':
    print(await runCertificationHarness({
      projectRoot,
      vendorIds: parseOptionalCsv(readFlag(argv, 'vendors')),
      comparedAgainst: parseComparedAgainst(readFlag(argv, 'compared-against')),
    }));
    break;
  case 'review':
    print(reviewCertificationCampaign(projectRoot, {
      campaignId: requiredFlag(argv, 'campaign-id'),
      reviewer: requiredFlag(argv, 'reviewer'),
      decision: parseDecision(requiredFlag(argv, 'decision')),
      notes: readFlag(argv, 'notes') || undefined,
      followUpItems: readListFlag(argv, 'follow-up'),
    }));
    break;
  case 'submit':
    print(submitCertificationCampaignForReview(projectRoot, {
      campaignId: requiredFlag(argv, 'campaign-id'),
      submittedBy: requiredFlag(argv, 'submitted-by'),
      notes: readFlag(argv, 'notes') || undefined,
    }));
    break;
  case 'promote':
    print(promoteCertificationCampaign(projectRoot, {
      campaignId: requiredFlag(argv, 'campaign-id'),
      reviewer: requiredFlag(argv, 'reviewer'),
      decision: parseDecision(requiredFlag(argv, 'decision')),
      target: parsePromotionTarget(requiredFlag(argv, 'target')),
      notes: readFlag(argv, 'notes') || undefined,
    }));
    break;
  case 'refresh-status':
    print({ statuses: refreshCertificationStatusFromCampaigns(projectRoot) });
    break;
  default:
    renderHelp();
    break;
}

interface RuntimeCommandInput {
  campaignId: string;
  dryRun: boolean;
  toolsPath?: string;
  packId?: string;
  target?: string;
  parameters?: Record<string, unknown>;
}

async function runCampaignRuntime(projectRootValue: string, input: RuntimeCommandInput) {
  const campaign = requireCampaign(projectRootValue, input.campaignId);
  const { createArtifactProvider } = await import('../apps/surface-bridge/src/providers.ts');
  const provider = createArtifactProvider(projectRootValue, { toolsPath: input.toolsPath });
  const execution = await provider.executePack({
    packId: input.packId,
    target: input.target,
    parameters: input.parameters,
    dryRun: input.dryRun,
    vendorContext: buildVendorContext(campaign),
  });
  const updatedCampaign = attachRuntimeResultToCampaign(projectRootValue, {
    campaignId: input.campaignId,
    mode: input.dryRun ? 'preview' : 'execute',
    execution,
  });

  return {
    success: execution.success,
    message: execution.message,
    campaign: updatedCampaign,
    execution,
  };
}

function buildVendorContext(campaign: CertificationCampaignDetail): VendorContext {
  const metadata = campaign.captureExpected?.context && typeof campaign.captureExpected.context === 'object'
    ? campaign.captureExpected.context as Record<string, unknown>
    : {};

  return {
    vendorId: campaign.vendorId,
    consoleName: `${campaign.vendorId} certification capture`,
    pageType: 'unknown',
    pageUrl: campaign.pageUrl,
    pageTitle: campaign.pageTitle,
    metadata,
    capturedAt: campaign.capturedAt,
  };
}

function readCaptureInput(argvValue: string[]): CertificationCaptureRequest {
  const vendorId = requiredFlag(argvValue, 'vendor');
  const rawHtmlPath = requiredFlag(argvValue, 'snapshot-file');
  const expectedPath = requiredFlag(argvValue, 'expected-file');
  const rawHtml = fs.readFileSync(path.resolve(rawHtmlPath), 'utf-8');
  const extraction = JSON.parse(fs.readFileSync(path.resolve(expectedPath), 'utf-8')) as CertificationCaptureRequest['extraction'];
  return {
    vendorId,
    pageUrl: requiredFlag(argvValue, 'page-url'),
    pageTitle: readFlag(argvValue, 'page-title') || `${vendorId} live capture`,
    rawHtml,
    extraction,
    tenantLabel: readFlag(argvValue, 'tenant-label') || undefined,
    environmentLabel: readFlag(argvValue, 'environment-label') || undefined,
    operator: readFlag(argvValue, 'operator') || undefined,
    reviewer: readFlag(argvValue, 'reviewer') || undefined,
    notes: readListFlag(argvValue, 'note'),
  };
}

function requireCampaign(projectRootValue: string, campaignId: string): CertificationCampaignDetail {
  const campaign = readCertificationCampaign(projectRootValue, campaignId);
  if (!campaign) {
    throw new Error(`Unknown campaign: ${campaignId}`);
  }
  return campaign;
}

function readParams(argvValue: string[]): Record<string, unknown> | undefined {
  const paramsFile = readFlag(argvValue, 'params-file');
  if (paramsFile) {
    return JSON.parse(fs.readFileSync(path.resolve(paramsFile), 'utf-8')) as Record<string, unknown>;
  }

  const params = new Map<string, unknown>();
  for (const value of readListFlag(argvValue, 'param')) {
    const [key, ...rest] = value.split('=');
    if (!key || rest.length === 0) continue;
    params.set(key, rest.join('='));
  }
  return params.size > 0 ? Object.fromEntries(params) : undefined;
}

function readFlag(argvValue: string[], name: string): string | null {
  const flag = `--${name}`;
  const index = argvValue.indexOf(flag);
  if (index === -1) return null;
  const value = argvValue[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

function hasFlag(argvValue: string[], name: string): boolean {
  return argvValue.includes(`--${name}`);
}

function readListFlag(argvValue: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < argvValue.length; i++) {
    if (argvValue[i] !== `--${name}`) continue;
    const value = argvValue[i + 1];
    if (value && !value.startsWith('--')) {
      values.push(value);
    }
  }
  return values;
}

function requiredFlag(argvValue: string[], name: string): string {
  const value = readFlag(argvValue, name);
  if (!value) {
    throw new Error(`Missing required flag --${name}`);
  }
  return value;
}

function parseOptionalCsv(value: string | null): string[] | undefined {
  return value
    ? value.split(',').map((item) => item.trim()).filter(Boolean)
    : undefined;
}

function parseComparedAgainst(value: string | null): 'captured' | 'approved_baseline' | undefined {
  if (!value) return undefined;
  if (value === 'captured' || value === 'approved_baseline') return value;
  throw new Error(`Unsupported compared-against value: ${value}`);
}

function parseDecision(value: string): 'approve' | 'reject' | 'request_follow_up' | 'inconclusive' {
  if (value === 'approve' || value === 'reject' || value === 'request_follow_up' || value === 'inconclusive') {
    return value;
  }
  throw new Error(`Unsupported decision: ${value}`);
}

function parsePromotionTarget(value: string): 'baseline' | 'fixture_candidate' | 'regression_input' {
  if (value === 'baseline' || value === 'fixture_candidate' || value === 'regression_input') {
    return value;
  }
  throw new Error(`Unsupported promotion target: ${value}`);
}

function renderHelp(): void {
  console.log(`Usage:
  bun run ./scripts/certification-campaign.ts capture --project-root <root> --vendor <id> --snapshot-file <html> --expected-file <json> --page-url <url> [--page-title ...]
  bun run ./scripts/certification-campaign.ts prereqs --project-root <root> --vendor <id> [--operator ...] [--reviewer ...] [--page-url ...] [--page-title ...]
  bun run ./scripts/certification-campaign.ts start --project-root <root> --vendor <id> [--operator ...] [--reviewer ...] [--page-url ...] [--page-title ...]
  bun run ./scripts/certification-campaign.ts blocked --project-root <root> --vendor <id> --tenant-label <label> --blocker <reason> [--blocker <reason>]
  bun run ./scripts/certification-campaign.ts list --project-root <root>
  bun run ./scripts/certification-campaign.ts history --project-root <root>
  bun run ./scripts/certification-campaign.ts trends --project-root <root>
  bun run ./scripts/certification-campaign.ts baselines --project-root <root>
  bun run ./scripts/certification-campaign.ts freshness --project-root <root>
  bun run ./scripts/certification-campaign.ts churn --project-root <root>
  bun run ./scripts/certification-campaign.ts inspect --project-root <root> --campaign-id <id>
  bun run ./scripts/certification-campaign.ts replay --project-root <root> --campaign-id <id> [--compared-against captured|approved_baseline]
  bun run ./scripts/certification-campaign.ts preview --project-root <root> --campaign-id <id> [--pack-id ...] [--target ...] [--param key=value]
  bun run ./scripts/certification-campaign.ts execute --project-root <root> --campaign-id <id> [--pack-id ...] [--target ...] [--param key=value]
  bun run ./scripts/certification-campaign.ts report --project-root <root> [--vendors okta,sentinel,aws]
  bun run ./scripts/certification-campaign.ts submit --project-root <root> --campaign-id <id> --submitted-by <name> [--notes ...]
  bun run ./scripts/certification-campaign.ts review --project-root <root> --campaign-id <id> --reviewer <name> --decision approve|reject|request_follow_up|inconclusive [--follow-up <item>] [--notes ...]
  bun run ./scripts/certification-campaign.ts promote --project-root <root> --campaign-id <id> --reviewer <name> --decision approve|reject --target baseline|fixture_candidate|regression_input [--notes ...]
  bun run ./scripts/certification-campaign.ts refresh-status --project-root <root>`);
}

function print(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
