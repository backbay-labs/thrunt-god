import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  CertificationCampaignDetail,
  CertificationPrerequisiteCheck,
  CertificationPrerequisiteCheckStatus,
  CertificationPrerequisiteReport,
  CertificationPrerequisiteRequest,
} from '@thrunt-surfaces/contracts';
import {
  createBlockedCertificationCampaign,
  listCertificationBaselines,
  resolveCertificationPaths,
} from '@thrunt-surfaces/site-adapters';

import { runThruntCommand } from './thrunt-tools.ts';

interface RuntimeDoctorConnector {
  id?: string;
  profile?: string | null;
  readiness_status?: string | null;
  checks?: Record<string, { status?: string; message?: string }>;
}

export interface CertificationPrerequisiteResult {
  report: CertificationPrerequisiteReport;
  campaign: CertificationCampaignDetail | null;
}

export async function checkCertificationPrerequisites(
  projectRoot: string,
  input: CertificationPrerequisiteRequest,
  options: { toolsPath?: string | null } = {},
): Promise<CertificationPrerequisiteResult> {
  const checkedAt = new Date().toISOString();
  const checks: CertificationPrerequisiteCheck[] = [];

  const operator = normalizeOptional(input.operator);
  const reviewer = normalizeOptional(input.reviewer);
  const tenantLabel = normalizeOptional(input.tenantLabel);
  const environmentLabel = normalizeOptional(input.environmentLabel) ?? 'live';
  const pageUrl = normalizeOptional(input.pageUrl);
  const pageTitle = normalizeOptional(input.pageTitle);
  const baselineHistory = listCertificationBaselines(projectRoot).filter((record) => record.vendorId === input.vendorId);

  checks.push({
    id: 'operator_metadata',
    label: 'Operator metadata',
    status: operator ? 'pass' : 'fail',
    detail: operator ? `Operator recorded as ${operator}` : 'Missing operator label. Provide --operator before starting the campaign.',
    source: 'operator',
    blocking: !operator,
  });
  checks.push({
    id: 'reviewer_metadata',
    label: 'Reviewer metadata',
    status: reviewer ? 'pass' : 'warn',
    detail: reviewer ? `Reviewer recorded as ${reviewer}` : 'Reviewer label is missing. Capture can proceed, but review handoff is incomplete.',
    source: 'operator',
    blocking: false,
  });

  const browserStatus = pageUrl && pageTitle ? 'pass' : pageUrl || pageTitle ? 'warn' : 'fail';
  checks.push({
    id: 'browser_session',
    label: 'Live browser session context',
    status: browserStatus,
    detail: browserStatus === 'pass'
      ? `${pageTitle} (${pageUrl})`
      : browserStatus === 'warn'
        ? 'Only partial browser session metadata is present. Provide both page URL and title for a reviewable live capture.'
        : 'No live browser session metadata supplied. Capture from the extension or pass --page-url and --page-title.',
    source: 'bridge',
    blocking: browserStatus === 'fail',
  });

  checks.push({
    id: 'baseline_history',
    label: 'Baseline history',
    status: baselineHistory.length > 0 ? 'pass' : 'warn',
    detail: baselineHistory.length > 0
      ? `Found ${baselineHistory.length} promoted baseline(s) for ${input.vendorId}.`
      : 'No approved baseline history exists yet for this vendor. First campaign will establish the baseline.',
    source: 'campaign_ledger',
    blocking: false,
  });

  const doctor = await runThruntCommand(projectRoot, ['runtime', 'doctor', input.vendorId, '--raw'], options.toolsPath, { timeoutMs: 30_000 });
  const parsedDoctor = safeJsonParse<{ connectors?: RuntimeDoctorConnector[] }>(doctor.stdout);
  const connector = parsedDoctor?.connectors?.[0] ?? null;
  const connectorProfile = normalizeOptional(connector?.profile) ?? 'default';
  const readinessStatus = normalizeOptional(connector?.readiness_status);

  if (!doctor.ok || !connector) {
    checks.push({
      id: 'runtime_doctor',
      label: 'Runtime readiness probe',
      status: 'fail',
      detail: doctor.stderr || doctor.stdout || 'Runtime doctor returned no connector report.',
      source: 'runtime_doctor',
      blocking: true,
    });
  } else {
    const runtimeChecks = connector.checks ?? {};
    checks.push(mapRuntimeCheck('connector_profile', 'Connector profile', runtimeChecks.profile_found, true));
    checks.push(mapRuntimeCheck('profile_validation', 'Profile validation', runtimeChecks.profile_valid, true));
    checks.push(mapRuntimeCheck('auth_material', 'Auth material', runtimeChecks.auth_material, true));
    checks.push(mapRuntimeCheck('permissions', 'Permissions / preflight', runtimeChecks.preflight_ready, true));
    checks.push(mapRuntimeCheck('smoke_spec', 'Smoke spec', runtimeChecks.smoke_spec, true));
  }

  const blockerReasons = checks.filter((check) => check.blocking).map((check) => check.detail);
  const warningReasons = checks.filter((check) => check.status === 'warn').map((check) => check.detail);
  const readyForCapture = !checks.some((check) => check.blocking && ['operator_metadata', 'browser_session'].includes(check.id));
  const readyForRuntime = !checks.some((check) => check.blocking && [
    'runtime_doctor',
    'connector_profile',
    'profile_validation',
    'auth_material',
    'permissions',
    'smoke_spec',
  ].includes(check.id));
  const nextSteps = deriveNextSteps(checks);

  const report: CertificationPrerequisiteReport = {
    vendorId: input.vendorId,
    checkedAt,
    operator,
    reviewer,
    tenantLabel,
    environmentLabel,
    pageUrl,
    pageTitle,
    connectorProfile: connector ? connectorProfile : null,
    readinessStatus,
    readyForCapture,
    readyForRuntime,
    baselineHistoryAvailable: baselineHistory.length > 0,
    checks,
    blockerReasons,
    warningReasons,
    nextSteps,
  };

  writePrerequisiteReport(projectRoot, report);

  let campaign: CertificationCampaignDetail | null = null;
  if (input.persistBlockedCampaign && (!readyForCapture || !readyForRuntime)) {
    campaign = createBlockedCertificationCampaign(projectRoot, {
      vendorId: input.vendorId,
      tenantLabel: tenantLabel ?? `unknown-${input.vendorId}`,
      environmentLabel,
      operator: operator ?? 'operator',
      reviewer,
      notes: input.notes,
      blockerReasons,
      pageUrl: pageUrl ?? undefined,
      pageTitle: pageTitle ?? undefined,
      prerequisites: report,
      captureProvenance: 'blocked_prerequisite_check',
      connectorProfile: connector ? connectorProfile : null,
    });
  }

  return { report, campaign };
}

function mapRuntimeCheck(
  id: string,
  label: string,
  check: { status?: string; message?: string } | undefined,
  blocking: boolean,
): CertificationPrerequisiteCheck {
  const status = normalizeCheckStatus(check?.status);
  return {
    id,
    label,
    status,
    detail: check?.message?.trim() || `${label} check did not return a message.`,
    source: 'runtime_doctor',
    blocking: blocking && (status === 'fail' || status === 'skip' || status === 'unknown'),
  };
}

function deriveNextSteps(checks: CertificationPrerequisiteCheck[]): string[] {
  const steps = new Set<string>();

  for (const check of checks) {
    switch (check.id) {
      case 'operator_metadata':
        if (check.status !== 'pass') steps.add('Provide --operator or capture from the extension with operator metadata.');
        break;
      case 'reviewer_metadata':
        if (check.status !== 'pass') steps.add('Add reviewer metadata before submitting the campaign for approval.');
        break;
      case 'browser_session':
        if (check.status !== 'pass') steps.add('Open a real Okta, Sentinel, or AWS page and capture from the extension or provide --page-url/--page-title.');
        break;
      case 'connector_profile':
      case 'profile_validation':
        if (check.status !== 'pass') steps.add('Configure connector_profiles.<vendor>.default in .planning/config.json.');
        break;
      case 'auth_material':
        if (check.status !== 'pass') steps.add('Populate the required connector auth environment variables or secret refs for the selected profile.');
        break;
      case 'permissions':
        if (check.status !== 'pass') steps.add('Validate connector preflight permissions with `thrunt-tools runtime doctor <vendor> --live` once profiles are configured.');
        break;
      case 'smoke_spec':
        if (check.status !== 'pass') steps.add('Add a smoke_test block to the connector profile or pass explicit --query/--dataset/--language inputs.');
        break;
      case 'baseline_history':
        if (check.status !== 'pass') steps.add('Plan reviewer time for initial baseline promotion because no approved baseline exists yet.');
        break;
      default:
        break;
    }
  }

  return [...steps];
}

function normalizeCheckStatus(value: string | undefined): CertificationPrerequisiteCheckStatus {
  switch (value) {
    case 'pass':
    case 'fail':
    case 'warn':
    case 'unknown':
    case 'skip':
      return value;
    default:
      return 'unknown';
  }
}

function normalizeOptional(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function writePrerequisiteReport(projectRoot: string, report: CertificationPrerequisiteReport): void {
  const paths = resolveCertificationPaths(projectRoot);
  const reportPath = path.join(paths.root, 'prerequisites', `${report.vendorId}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
}
