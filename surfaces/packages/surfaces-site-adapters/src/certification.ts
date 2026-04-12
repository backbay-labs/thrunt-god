import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  CertificationCampaignSummary,
  CertificationDiffItem,
  CertificationDriftClassification,
  CertificationReplaySummary,
  CertificationStatusSummary,
} from '@thrunt-surfaces/contracts';

export interface CertificationCaptureInput {
  vendorId: string;
  pageUrl: string;
  pageTitle: string;
  rawHtml: string;
  extraction: {
    detect: boolean;
    context: Record<string, unknown>;
    query: Record<string, unknown> | null;
    table: Record<string, unknown> | null;
    entities: Array<Record<string, unknown>>;
    supportedActions: string[];
  };
}

export interface CertificationCaptureOutput {
  snapshotId: string;
  snapshotPath: string;
  metadataPath: string;
  redactionCount: number;
}

export interface ReplayComparisonResult {
  pass: boolean;
  gaps: string[];
  diff: CertificationDiffItem[];
  driftClassification: CertificationDriftClassification | null;
  blocksCertification: boolean;
  suspectFiles: string[];
}

export interface VendorCertificationResult extends CertificationStatusSummary {
  fixtureSnapshots: number;
  liveSnapshots: number;
  driftCount: number;
  campaignCount?: number;
}

export function sanitizeLiveSnapshotHtml(vendorId: string, rawHtml: string): { html: string; redactionCount: number } {
  const sanitized = applyRedactions(vendorId, rawHtml);
  return {
    html: sanitized.text,
    redactionCount: sanitized.redactionCount,
  };
}

export function writeLiveCertificationCapture(
  projectRoot: string,
  input: CertificationCaptureInput,
): CertificationCaptureOutput {
  const snapshotId = `LIVE-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const liveDir = path.join(projectRoot, '.planning', 'certification', 'live', input.vendorId);
  fs.mkdirSync(liveDir, { recursive: true });

  const sanitized = sanitizeLiveSnapshotHtml(input.vendorId, input.rawHtml);
  const sanitizedExpected = sanitizeCertificationExtraction(input.vendorId, input.extraction);
  const snapshotPath = path.join(liveDir, `${snapshotId}.html`);
  const metadataPath = path.join(liveDir, `${snapshotId}.json`);

  fs.writeFileSync(snapshotPath, sanitized.html, 'utf-8');
  fs.writeFileSync(metadataPath, JSON.stringify({
    snapshotId,
    vendorId: input.vendorId,
    pageUrl: input.pageUrl,
    pageTitle: input.pageTitle,
    capturedAt: new Date().toISOString(),
    redactionCount: sanitized.redactionCount + sanitizedExpected.redactionCount,
    expected: sanitizedExpected.value,
  }, null, 2), 'utf-8');

  return {
    snapshotId,
    snapshotPath: toPosixPath(path.relative(projectRoot, snapshotPath)),
    metadataPath: toPosixPath(path.relative(projectRoot, metadataPath)),
    redactionCount: sanitized.redactionCount + sanitizedExpected.redactionCount,
  };
}

export function compareReplayExtraction(vendorId: string, expected: unknown, actual: unknown): ReplayComparisonResult {
  const diff: CertificationDiffItem[] = [];
  const gaps: string[] = [];

  const expectedRecord = asRecord(expected);
  const actualRecord = asRecord(actual);

  compareValue(diff, gaps, 'detect', expectedRecord?.detect, actualRecord?.detect);
  compareValue(diff, gaps, 'context.pageType', readPath(expectedRecord, ['context', 'pageType']), readPath(actualRecord, ['context', 'pageType']));
  compareValue(
    diff,
    gaps,
    'context.extraction.supported',
    readPath(expectedRecord, ['context', 'extraction', 'supported']),
    readPath(actualRecord, ['context', 'extraction', 'supported']),
  );
  compareValue(
    diff,
    gaps,
    'context.extraction.confidence',
    readPath(expectedRecord, ['context', 'extraction', 'confidence']),
    readPath(actualRecord, ['context', 'extraction', 'confidence']),
  );
  compareValue(
    diff,
    gaps,
    'context.extraction.completeness',
    readPath(expectedRecord, ['context', 'extraction', 'completeness']),
    readPath(actualRecord, ['context', 'extraction', 'completeness']),
  );
  compareValue(diff, gaps, 'query.language', readPath(expectedRecord, ['query', 'language']), readPath(actualRecord, ['query', 'language']));
  compareValue(diff, gaps, 'query.statement', readPath(expectedRecord, ['query', 'statement']), readPath(actualRecord, ['query', 'statement']));
  compareValue(diff, gaps, 'table.totalRows', readPath(expectedRecord, ['table', 'totalRows']), readPath(actualRecord, ['table', 'totalRows']));

  const expectedActions = normalizeStringArray(readPath(expectedRecord, ['supportedActions']));
  const actualActions = normalizeStringArray(readPath(actualRecord, ['supportedActions']));
  compareStringSet(diff, gaps, 'supportedActions', expectedActions, actualActions);

  const expectedEntities = normalizeEntityValues(readPath(expectedRecord, ['entities']));
  const actualEntities = normalizeEntityValues(readPath(actualRecord, ['entities']));
  compareStringSet(diff, gaps, 'entities.values', expectedEntities, actualEntities);

  const classification = classifyReplayDrift(diff, expectedRecord, actualRecord);
  return {
    pass: diff.length === 0,
    gaps,
    diff,
    driftClassification: diff.length > 0 ? classification.classification : null,
    blocksCertification: diff.length > 0 ? classification.blocksCertification : false,
    suspectFiles: diff.length > 0 ? resolveSuspectFiles(vendorId, diff) : [],
  };
}

export function writeCertificationStatus(
  projectRoot: string,
  vendors: VendorCertificationResult[],
): string {
  const statusPath = path.join(projectRoot, '.planning', 'certification', 'status.json');
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
  fs.writeFileSync(statusPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    vendors,
  }, null, 2), 'utf-8');
  return statusPath;
}

export function summarizeCertificationStatus(input: {
  vendorId: string;
  fixtureSnapshots: number;
  campaigns: CertificationCampaignSummary[];
}): VendorCertificationResult {
  const campaigns = [...input.campaigns]
    .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime());
  const latest = campaigns[0] ?? null;
  const liveSnapshots = campaigns.length;
  const driftCount = campaigns.filter((campaign) => campaign.status === 'drift-detected').length;

  if (!latest) {
    return {
      vendorId: input.vendorId,
      status: 'live-blocked',
      source: 'combined',
      generatedAt: new Date().toISOString(),
      summary: `${input.vendorId} has ${input.fixtureSnapshots} fixture snapshot(s) but no live certification campaign yet.`,
      fixtureSnapshots: input.fixtureSnapshots,
      liveSnapshots,
      driftCount,
      campaignCount: campaigns.length,
    };
  }

  const summaryByStatus: Record<CertificationStatusSummary['status'], string> = {
    'fixture-certified': `${input.vendorId} remains fixture-certified only.`,
    'live-certified': `${input.vendorId} has an approved live certification campaign.`,
    'live-blocked': `${input.vendorId} live certification is blocked: ${latest.blockerReasons.join('; ') || 'missing prerequisites'}.`,
    'drift-detected': `${input.vendorId} live certification drift was detected and blocks approval.`,
    'review-required': `${input.vendorId} live campaign is replay-clean but still requires reviewer approval.`,
    'failed-capture': `${input.vendorId} live capture failed before replay could complete.`,
  };

  return {
    vendorId: input.vendorId,
    status: latest.status,
    source: latest.status === 'live-certified' ? 'combined' : 'live',
    generatedAt: new Date().toISOString(),
    summary: summaryByStatus[latest.status],
    fixtureSnapshots: input.fixtureSnapshots,
    liveSnapshots,
    driftCount,
    campaignCount: campaigns.length,
  };
}

export function buildReplaySummary(
  vendorId: string,
  comparedAgainst: 'captured' | 'approved_baseline',
  snapshotPath: string,
  metadataPath: string,
  expected: Record<string, unknown> | null,
  actual: Record<string, unknown> | null,
): CertificationReplaySummary {
  const comparison = compareReplayExtraction(vendorId, expected, actual);
  return {
    comparedAt: new Date().toISOString(),
    comparedAgainst,
    snapshotPath,
    metadataPath,
    pass: comparison.pass,
    gaps: comparison.gaps,
    diff: comparison.diff,
    driftClassification: comparison.driftClassification,
    blocksCertification: comparison.blocksCertification,
    suspectFiles: comparison.suspectFiles,
    approvedExpected: expected,
    actual,
  };
}

function compareValue(
  diff: CertificationDiffItem[],
  gaps: string[],
  fieldPath: string,
  expected: unknown,
  actual: unknown,
): void {
  if (isEmpty(expected)) return;
  if (isEmpty(expected) && isEmpty(actual)) return;
  if (deepEqual(expected, actual)) return;

  const change = isEmpty(actual) ? 'missing' : 'mismatch';
  diff.push({ path: fieldPath, expected, actual, change });
  gaps.push(`${fieldPath} mismatch: expected ${stringify(expected)} got ${stringify(actual)}`);
}

function compareStringSet(
  diff: CertificationDiffItem[],
  gaps: string[],
  fieldPath: string,
  expected: string[],
  actual: string[],
): void {
  if (expected.length === 0) return;
  const missing = expected.filter((value) => !actual.includes(value));
  if (missing.length === 0) return;

  diff.push({ path: fieldPath, expected: missing, actual, change: 'missing' });
  for (const value of missing) {
    gaps.push(`${fieldPath} missing value: ${value}`);
  }
}

function classifyReplayDrift(
  diff: CertificationDiffItem[],
  expected: Record<string, unknown> | null,
  actual: Record<string, unknown> | null,
): { classification: CertificationDriftClassification; blocksCertification: boolean } {
  const failureReasons = [
    ...normalizeStringArray(readPath(expected, ['context', 'extraction', 'failureReasons'])),
    ...normalizeStringArray(readPath(actual, ['context', 'extraction', 'failureReasons'])),
  ].join(' ').toLowerCase();

  const diffPaths = diff.map((item) => item.path);

  if (
    failureReasons.match(/\b(auth|token|login|session|cookie|forbidden|401|403|expired|permission denied)\b/)
    || (readPath(expected, ['detect']) === true && readPath(actual, ['detect']) === false && failureReasons.length > 0)
  ) {
    return { classification: 'auth_session_degradation', blocksCertification: true };
  }

  if (
    failureReasons.match(/\b(permission|privilege|limited|not visible|not authorized|masked)\b/)
    || (diffPaths.includes('table.totalRows') && readPath(expected, ['query', 'statement']) === readPath(actual, ['query', 'statement']))
  ) {
    return { classification: 'privilege_visibility_difference', blocksCertification: true };
  }

  if (
    diffPaths.some((item) => item === 'detect' || item === 'context.pageType')
    || (readPath(expected, ['query', 'statement']) && !readPath(actual, ['query', 'statement']))
  ) {
    return { classification: 'selector_parser_break', blocksCertification: true };
  }

  if (
    diffPaths.some((item) => item.startsWith('query.') || item.startsWith('table.') || item.startsWith('entities.'))
  ) {
    return { classification: 'semantic_extraction_drift', blocksCertification: true };
  }

  if (
    diffPaths.every((item) => item.startsWith('context.extraction.') || item === 'supportedActions')
  ) {
    return { classification: 'benign_ui_drift', blocksCertification: false };
  }

  return { classification: 'unknown', blocksCertification: true };
}

function resolveSuspectFiles(vendorId: string, diff: CertificationDiffItem[]): string[] {
  const suspects = new Set<string>([
    `surfaces/packages/surfaces-site-adapters/src/adapters/${vendorId}.ts`,
  ]);

  if (diff.some((item) => item.path.startsWith('context.extraction.'))) {
    suspects.add('surfaces/packages/surfaces-site-adapters/src/helpers.ts');
  }

  return [...suspects];
}

function sanitizeCertificationExtraction(vendorId: string, extraction: CertificationCaptureInput['extraction']): {
  value: CertificationCaptureInput['extraction'];
  redactionCount: number;
} {
  const encoded = JSON.stringify(extraction);
  const sanitized = applyRedactions(vendorId, encoded);
  return {
    value: JSON.parse(sanitized.text) as CertificationCaptureInput['extraction'],
    redactionCount: sanitized.redactionCount,
  };
}

function applyRedactions(vendorId: string, input: string): { text: string; redactionCount: number } {
  let text = input;
  let redactionCount = 0;

  const replacements: Array<[RegExp, string]> = [
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]'],
    [/\b\d{12}\b/g, '[redacted-account-id]'],
    [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[redacted-guid]'],
    [/\b(?:tenant|workspace|subscription|account|host|org|user|principal)[-_:/= ]+[A-Za-z0-9._:@/-]+\b/gi, '[redacted-identifier]'],
    [/arn:aws:[^"'<\s]+/gi, 'arn:aws:[redacted-arn]'],
    [/\b(?:[A-Za-z0-9-]+\.)+(?:internal|corp|local|example|okta\.com|awsapps\.com|microsoft\.com)\b/gi, 'redacted-hostname'],
    [/\b(?:SELECT|FROM|WHERE|project|SigninLogs|EventName|actor\.[A-Za-z]+)[^<\n"]+/gi, '[redacted-query-literal]'],
  ];

  if (vendorId === 'okta') {
    replacements.push([/https?:\/\/[a-z0-9-]+(?:-admin)?\.okta(?:preview)?\.com/gi, 'https://redacted-okta-tenant.okta.com']);
  }

  if (vendorId === 'sentinel') {
    replacements.push([/\/subscriptions\/[0-9a-f-]+/gi, '/subscriptions/redacted-subscription']);
  }

  if (vendorId === 'elastic') {
    replacements.push(
      [/https?:\/\/[a-z0-9-]+\.kb\.elastic\.co/gi, 'https://redacted-deployment.kb.elastic.co'],
      [/https?:\/\/[a-z0-9-]+\.cloud\.elastic\.co/gi, 'https://redacted-deployment.cloud.elastic.co'],
      [/\/s\/[a-z0-9_-]+\//gi, '/s/redacted-space/'],
    );
  }

  if (vendorId === 'crowdstrike') {
    replacements.push(
      [/falcon\.([a-z0-9-]+)\.crowdstrike\.com/gi, 'falcon.redacted-region.crowdstrike.com'],
      [/\b[a-f0-9]{32}[a-f0-9]{0,96}\b/gi, '[redacted-hash]'],
    );
  }

  for (const [pattern, value] of replacements) {
    text = text.replace(pattern, () => {
      redactionCount += 1;
      return value;
    });
  }

  return { text, redactionCount };
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function readPath(value: Record<string, unknown> | null, segments: string[]): unknown {
  let current: unknown = value;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function normalizeEntityValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = (item as Record<string, unknown>).value;
      return typeof raw === 'string' ? raw.trim() : null;
    })
    .filter((item): item is string => Boolean(item));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean);
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return 'null';
  return JSON.stringify(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
