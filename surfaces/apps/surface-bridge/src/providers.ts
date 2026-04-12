/**
 * Data providers — abstract case data access so mock and real modes share the same interface.
 */

import * as fs from 'node:fs';

import type {
  AttachEvidenceResponse,
  CaseProgress,
  CaseSummary,
  CaseViewModel,
  CertificationStatusSummary,
  EvidenceAttachment,
  ExecutePackRequest,
  ExecuteResponse,
  ExecuteTargetRequest,
  FindingSummary,
  HypothesisSummary,
  LastExecutionSummary,
  OpenCaseRequest,
  OpenCaseResponse,
  QueryLogSummary,
  ReceiptSummary,
  RuntimePreviewSummary,
  VendorContext,
} from '@thrunt-surfaces/contracts';

import {
  mockCaseSummary,
  mockProgress,
  mockHypotheses,
  mockQueries,
  mockReceipts,
  mockFindings,
  mockCaseViewModel,
} from '@thrunt-surfaces/mocks';

import {
  loadAllArtifacts,
  resolvePlanningPaths,
  planningExists,
  type LoadedArtifacts,
} from '@thrunt-surfaces/artifacts';

import { projectCaseViewModel } from '@thrunt-surfaces/state';
import { runThruntCommand } from './thrunt-tools.ts';
import { canonicalizeAttachment } from './clip-canonicalization.ts';
import type { Logger } from './logger.ts';

interface ArtifactProviderOptions {
  toolsPath?: string | null;
  logger?: Logger;
}

interface PlannedMutation {
  kind: string;
  command: string[];
  message: string;
}

interface ResolvedPackExecution {
  packId: string;
  targetName: string | null;
  parameters: Record<string, unknown>;
  reason: string;
}

interface RuntimeArtifactRef {
  type: 'query' | 'receipt' | 'evidence';
  id: string;
  path?: string;
}

function safeJsonParse<T>(value: string): T | null {
  try {
    const trimmed = value.trim();
    if (trimmed.startsWith('@file:')) {
      const payloadPath = trimmed.slice('@file:'.length);
      if (!fs.existsSync(payloadPath)) return null;
      return JSON.parse(fs.readFileSync(payloadPath, 'utf-8')) as T;
    }
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

function truncate(value: string, max = 120): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function stringifyParamValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function appendParameterArgs(command: string[], parameters: Record<string, unknown>): string[] {
  const args = [...command];
  for (const [key, value] of Object.entries(parameters)) {
    if (value === undefined || value === null || value === '') continue;
    args.push('--param', `${key}=${stringifyParamValue(value)}`);
  }
  return args;
}

function inferVendorMetadata(vendorContext?: VendorContext | null): Record<string, unknown> {
  if (!vendorContext) return {};

  // VendorContext now extends VendorPageContext — metadata is a direct field
  const metadata = vendorContext.metadata;
  return metadata && typeof metadata === 'object'
    ? metadata as Record<string, unknown>
    : {};
}

function inferVendorEntities(vendorContext?: VendorContext | null): string[] {
  if (!vendorContext) return [];

  // VendorContext now extends VendorPageContext — metadata is a direct field
  const metadata = vendorContext.metadata && typeof vendorContext.metadata === 'object'
    ? vendorContext.metadata as Record<string, unknown>
    : null;
  const metadataEntities = metadata && Array.isArray(metadata.entities) ? metadata.entities : [];
  const entities = metadataEntities;
  return entities
    .map((entity) => {
      if (!entity || typeof entity !== 'object') return null;
      const value = (entity as Record<string, unknown>).value;
      return typeof value === 'string' ? value.trim() : null;
    })
    .filter((value): value is string => Boolean(value));
}

function inferFocusUser(entityValues: string[]): string {
  const email = entityValues.find((value) => value.includes('@'));
  if (email) return email;

  const preferred = [...entityValues]
    .map((value) => normalizeFocusUserCandidate(value))
    .filter(Boolean)
    .sort((left, right) => scoreFocusUserCandidate(right) - scoreFocusUserCandidate(left));

  return preferred[0] ?? '';
}

function normalizeFocusUserCandidate(value: string): string {
  if (!value) return '';
  let normalized = value.trim();
  if (!normalized) return '';

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) return '';
  if (/^[0-9a-f:]+$/i.test(normalized)) return '';
  if (looksLikeTimestamp(normalized)) return '';

  normalized = normalized.replace(/\s+\d{1,3}(?:\.\d{1,3}){3}$/g, '').trim();
  normalized = normalized.replace(/\s+\((?:user|appuser|admin|group)\)$/i, '').trim();

  if (!normalized) return '';
  if (!/[A-Za-z]/.test(normalized)) return '';
  if (looksLikeTimestamp(normalized)) return '';
  if (/^(success|failure|deny|denied|allow|allowed|true|false)$/i.test(normalized)) return '';
  return normalized;
}

function scoreFocusUserCandidate(value: string): number {
  let score = 0;
  if (value.includes('@')) score += 100;
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(value)) score += 50;
  if (/\b(user|admin)\b/i.test(value)) score += 10;
  if (value.length <= 48) score += 10;
  if (/\s/.test(value)) score += 5;
  if (/event|result|success|policy|application|target/i.test(value)) score -= 40;
  return score;
}

function looksLikeTimestamp(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}[ t]\d{2}:\d{2}/i.test(value) ||
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?$/i.test(value)
  );
}

function resolveSuggestedPack(
  data: LoadedArtifacts,
  vendorContext?: VendorContext | null,
): ResolvedPackExecution | null {
  const vendorId = vendorContext?.vendorId?.toLowerCase() ?? '';
  const text = [
    data.mission?.signal ?? '',
    data.mission?.title ?? '',
    vendorContext?.pageTitle ?? '',
  ].join(' ').toLowerCase();
  const metadata = inferVendorMetadata(vendorContext);
  const entityValues = inferVendorEntities(vendorContext);
  const focusUser = inferFocusUser(entityValues);
  const sourceIp = entityValues.find((value) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) ?? '';

  if (vendorId === 'okta') {
    if (/(failed|failure|spray|brute|password)/i.test(text)) {
      return {
        packId: 'technique.t1110-brute-force',
        targetName: 'Okta failure burst review',
        parameters: {
          tenant: String(metadata.orgName ?? metadata.tenant ?? 'local-dogfood'),
          lookback_hours: 24,
          source_ip: sourceIp,
        },
        reason: 'Mapped Okta failure-oriented console context to the brute-force hunt pack.',
      };
    }

    if (/(mfa|group|policy|admin|consent|password reset|role|change)/i.test(text)) {
      return {
        packId: 'technique.t1098-account-manipulation',
        targetName: 'Okta admin-change sweep',
        parameters: {
          tenant: String(metadata.orgName ?? metadata.tenant ?? 'local-dogfood'),
          lookback_hours: 72,
          focus_user: focusUser,
        },
        reason: 'Mapped Okta admin-change context to the account-manipulation hunt pack.',
      };
    }

    return {
      packId: 'technique.t1078-valid-accounts',
      targetName: 'Okta anomalous session review',
      parameters: {
        tenant: String(metadata.orgName ?? metadata.tenant ?? 'local-dogfood'),
        lookback_hours: 24,
        focus_user: focusUser,
      },
      reason: 'Mapped Okta session context to the valid-accounts hunt pack.',
    };
  }

  if (vendorId === 'sentinel') {
    return {
      packId: 'technique.t1110-brute-force',
      targetName: 'Sentinel password spray correlation',
      parameters: {
        tenant: String(metadata.workspace ?? metadata.subscription ?? 'local-dogfood'),
        lookback_hours: 24,
        source_ip: entityValues.find((value) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) ?? '',
      },
      reason: 'Mapped Microsoft Sentinel console context to the password-spray correlation target.',
    };
  }

  if (vendorId === 'aws') {
    return {
      packId: 'domain.cloud-abuse',
      targetName: 'AWS CloudTrail principal abuse sweep',
      parameters: {
        tenant: String(metadata.accountId ?? metadata.service ?? 'local-dogfood'),
        lookback_hours: 24,
        focus_principal: entityValues[0] ?? String(metadata.accountId ?? ''),
        focus_resource: entityValues[1] ?? String(metadata.service ?? ''),
      },
      reason: 'Mapped AWS console context to the CloudTrail principal-abuse sweep.',
    };
  }

  return null;
}

function inferPackTenant(
  data: LoadedArtifacts,
  vendorContext: VendorContext | null | undefined,
  explicitPackId: string,
  targetName: string | null,
): string {
  const metadata = inferVendorMetadata(vendorContext);
  const metadataTenant = [
    metadata.tenant,
    metadata.orgName,
    metadata.workspace,
    metadata.subscription,
    metadata.accountId,
    metadata.service,
  ].find((value) => typeof value === 'string' && value.trim().length > 0);
  if (typeof metadataTenant === 'string' && metadataTenant.trim()) {
    return metadataTenant.trim();
  }

  const missionScope = data.mission?.scope;
  if (typeof missionScope === 'string' && /^[A-Za-z0-9._-]+$/.test(missionScope.trim())) {
    return missionScope.trim();
  }

  const hint = `${explicitPackId} ${targetName ?? ''}`.toLowerCase();
  if (hint.includes('okta')) return 'okta-dogfood';
  if (hint.includes('sentinel')) return 'sentinel-dogfood';
  if (hint.includes('aws') || hint.includes('cloud')) return 'aws-dogfood';
  return 'local-dogfood';
}

// --- Provider interface ---

export interface CaseDataProvider {
  getCase(): Promise<CaseSummary | null>;
  getProgress(): Promise<CaseProgress | null>;
  getHypotheses(): Promise<HypothesisSummary[]>;
  getQueries(): Promise<QueryLogSummary[]>;
  getReceipts(): Promise<ReceiptSummary[]>;
  getFindings(): Promise<FindingSummary[]>;
  getCaseView(): Promise<CaseViewModel | null>;
  openCase(request: OpenCaseRequest): Promise<OpenCaseResponse>;
  attachEvidence(attachment: EvidenceAttachment): Promise<AttachEvidenceResponse>;
  executePack(request: ExecutePackRequest): Promise<ExecuteResponse>;
  executeTarget(request: ExecuteTargetRequest): Promise<ExecuteResponse>;
  executeNext(): Promise<ExecuteResponse>;
  caseOpen(): boolean;
  planningExists(): boolean;
  invalidate(): void;
}

// --- Mock provider ---

export function createMockProvider(): CaseDataProvider {
  let attachmentCounter = 0;
  let executionCounter = 0;

  return {
    async getCase() { return mockCaseSummary; },
    async getProgress() { return mockProgress; },
    async getHypotheses() { return mockHypotheses; },
    async getQueries() { return mockQueries; },
    async getReceipts() { return mockReceipts; },
    async getFindings() { return mockFindings; },
    async getCaseView() { return mockCaseViewModel; },
    async openCase(request) {
      return {
        case: {
          ...mockCaseSummary,
          title: request.signal.slice(0, 80),
        },
        created: true,
        message: 'Case opened (mock mode)',
      };
    },
    async attachEvidence(_attachment) {
      attachmentCounter++;
      return {
        success: true,
        attachmentId: `ATT-MOCK-${String(attachmentCounter).padStart(4, '0')}`,
        message: 'Evidence attached (mock mode)',
      };
    },
    async executePack(request) {
      executionCounter++;
      return {
        success: true,
        executionId: `EXEC-MOCK-${String(executionCounter).padStart(4, '0')}`,
        message: request.dryRun
          ? `Runtime preview for ${request.packId || 'suggested pack'} generated (mock mode)`
          : `Pack ${request.packId || 'suggested pack'} queued (mock mode)`,
      };
    },
    async executeTarget(request) {
      executionCounter++;
      return {
        success: true,
        executionId: `EXEC-MOCK-${String(executionCounter).padStart(4, '0')}`,
        message: request.dryRun
          ? `Target preview for ${request.connectorId} generated (mock mode)`
          : `Target query to ${request.connectorId} executed (mock mode)`,
      };
    },
    async executeNext() {
      executionCounter++;
      return {
        success: true,
        executionId: `EXEC-MOCK-${String(executionCounter).padStart(4, '0')}`,
        message: 'Next step: Continue phase 3 (mock mode)',
      };
    },
    caseOpen() { return true; },
    planningExists() { return true; },
    invalidate() {},
  };
}

// --- Real artifact provider ---

export function createArtifactProvider(projectRoot: string, options: ArtifactProviderOptions = {}): CaseDataProvider {
  let cached: LoadedArtifacts | null = null;
  let runtimePreviewState: RuntimePreviewSummary | null = null;
  let lastExecutionState: LastExecutionSummary | null = null;

  function load(): LoadedArtifacts {
    if (!cached) {
      cached = loadAllArtifacts(projectRoot);
    }
    return cached;
  }

  function makeId(prefix: string): string {
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefix}-${stamp}-${suffix}`;
  }

  function currentPaths() {
    return resolvePlanningPaths(projectRoot);
  }

  function currentView(): CaseViewModel | null {
    const data = load();
    if (!data.mission || !data.progress) return null;

    const certification = (data as LoadedArtifacts & {
      certification?: CertificationStatusSummary[];
    }).certification ?? [];

    return projectCaseViewModel({
      mission: data.mission,
      progress: data.progress,
      hypotheses: data.hypotheses,
      queries: data.queries,
      receipts: data.receipts,
      evidence: data.evidence,
      findings: data.findings,
      blockers: data.blockers,
      runtimePreview: runtimePreviewState,
      lastExecution: lastExecutionState,
      certification,
      certificationCampaigns: data.certificationCampaigns,
      certificationHistory: data.certificationHistory,
      certificationDriftTrends: data.certificationDriftTrends,
      certificationBaselines: data.certificationBaselines,
      certificationFreshness: data.certificationFreshness,
      certificationBaselineChurn: data.certificationBaselineChurn,
    });
  }

  function deriveExecuteNextMutation(data: LoadedArtifacts): PlannedMutation | null {
    const progress = data.progress;
    if (!progress || !data.mission) return null;

    const status = data.mission.status.toLowerCase();
    if (status.includes('closed') || status.includes('complete')) {
      return null;
    }

    if (progress.totalPlansInPhase > 0 && progress.currentPlan < progress.totalPlansInPhase) {
      return {
        kind: 'state.advance-plan',
        command: ['state', 'advance-plan', '--raw'],
        message: `Advanced plan ${progress.currentPlan} to ${progress.currentPlan + 1}`,
      };
    }

    if (progress.currentPhase > 0) {
      return {
        kind: 'phase.complete',
        command: ['phase', 'complete', String(progress.currentPhase), '--raw'],
        message: `Completed phase ${progress.currentPhase}`,
      };
    }

    return null;
  }

  function collectReadinessBlockers(report: any): string[] {
    const connector = Array.isArray(report?.connectors) ? report.connectors[0] : null;
    if (!connector) return ['Runtime readiness report was malformed'];

    const blockers: string[] = [];
    const checks = connector.checks || {};
    for (const key of ['profile_found', 'profile_valid', 'auth_material', 'preflight_ready', 'smoke_spec']) {
      const check = checks[key];
      if (check && check.status === 'fail' && typeof check.message === 'string') {
        blockers.push(check.message);
      }
    }

    return blockers.length > 0 ? blockers : (connector.readiness_status === 'ready' || connector.readiness_status === 'live_verified'
      ? []
      : [`Connector ${connector.id || connector.display_name || 'unknown'} is not ready (${connector.readiness_status || 'partial'})`]);
  }

  function resolvePackRequest(request: ExecutePackRequest, data: LoadedArtifacts): ResolvedPackExecution | null {
    const suggested = resolveSuggestedPack(data, request.vendorContext);
    if (!request.packId) {
      if (!suggested) return null;
      return {
        ...suggested,
        targetName: request.target ?? suggested.targetName,
        parameters: {
          ...suggested.parameters,
          ...(request.parameters ?? {}),
        },
      };
    }

    const mergedParameters = {
      ...(suggested?.parameters ?? {}),
      ...(request.parameters ?? {}),
    };
    if (!mergedParameters.tenant) {
      mergedParameters.tenant = inferPackTenant(
        data,
        request.vendorContext,
        request.packId,
        request.target ?? suggested?.targetName ?? null,
      );
    }

    return {
      packId: request.packId,
      targetName: request.target ?? suggested?.targetName ?? null,
      parameters: mergedParameters,
      reason: suggested?.reason ?? 'Using explicitly requested pack.',
    };
  }

  async function previewPackExecution(request: ExecutePackRequest, executionId: string): Promise<ExecuteResponse> {
    const data = load();
    const resolved = resolvePackRequest(request, data);
    if (!resolved) {
      return {
        success: false,
        executionId,
        message: 'Unable to resolve a hunt pack from the current console context. Provide an explicit packId.',
        view: currentView(),
      };
    }

    const renderArgs = appendParameterArgs([
      'pack', 'render-targets', resolved.packId,
      ...(resolved.targetName ? ['--target', resolved.targetName] : []),
    ], resolved.parameters);
    const renderResult = await runThruntCommand(projectRoot, renderArgs, options.toolsPath, { timeoutMs: 30_000, logger: options.logger });

    if (!renderResult.ok) {
      return {
        success: false,
        executionId,
        message: `Pack preview failed: ${renderResult.stderr || renderResult.stdout || 'Unable to render pack targets.'}`,
        command: renderResult.command,
        exitCode: renderResult.exitCode,
        stdout: renderResult.stdout,
        stderr: renderResult.stderr,
        mutation: {
          kind: 'runtime.preview',
          mutated: false,
          fallback: false,
          toolsPath: renderResult.toolsPath,
          diagnostics: renderResult.diagnostics,
        },
        resolvedPackId: resolved.packId,
        view: currentView(),
      };
    }

    const rendered = safeJsonParse<{
      valid?: boolean;
      pack_id: string;
      pack?: { title?: string };
      errors?: string[];
      missing_template_parameters?: string[];
      query_specs?: Array<{
        name: string;
        connector: string;
        dataset: string;
        language: string;
        query_spec: {
          connector: { id: string; profile: string };
          dataset: { kind: string };
          query: { language: string; statement: string };
          time_window: { start: string; end: string };
          parameters?: Record<string, unknown>;
        };
      }>;
    }>(renderResult.stdout);

    if (!rendered) {
      return {
        success: false,
        executionId,
        message: 'Pack preview returned malformed JSON',
        command: renderResult.command,
        exitCode: renderResult.exitCode,
        stdout: renderResult.stdout,
        stderr: renderResult.stderr,
        mutation: {
          kind: 'runtime.preview',
          mutated: false,
          fallback: false,
          toolsPath: renderResult.toolsPath,
          diagnostics: renderResult.diagnostics,
        },
        resolvedPackId: resolved.packId,
        view: currentView(),
      };
    }

    if (rendered.valid === false) {
      const blockers = [
        ...(Array.isArray(rendered.errors) ? rendered.errors : []),
        ...(Array.isArray(rendered.missing_template_parameters)
          ? rendered.missing_template_parameters.map((param) => `Missing required parameter: ${param}`)
          : []),
      ];
      return {
        success: false,
        executionId,
        message: `Pack preview blocked: ${blockers.join('; ') || 'pack validation failed'}`,
        command: renderResult.command,
        exitCode: renderResult.exitCode,
        stdout: renderResult.stdout,
        stderr: renderResult.stderr,
        mutation: {
          kind: 'runtime.preview',
          mutated: false,
          fallback: false,
          toolsPath: renderResult.toolsPath,
          diagnostics: renderResult.diagnostics,
        },
        resolvedPackId: resolved.packId,
        view: currentView(),
      };
    }

    if (!Array.isArray(rendered.query_specs)) {
      return {
        success: false,
        executionId,
        message: 'Pack preview returned malformed JSON',
        command: renderResult.command,
        exitCode: renderResult.exitCode,
        stdout: renderResult.stdout,
        stderr: renderResult.stderr,
        mutation: {
          kind: 'runtime.preview',
          mutated: false,
          fallback: false,
          toolsPath: renderResult.toolsPath,
          diagnostics: renderResult.diagnostics,
        },
        resolvedPackId: resolved.packId,
        view: currentView(),
      };
    }

    const previewTargets: RuntimePreviewSummary['targets'] = [];
    const blockers: string[] = [];

    for (const target of rendered.query_specs) {
      const spec = target.query_spec;
      const doctorArgs = appendParameterArgs([
        'runtime', 'doctor', spec.connector.id,
        '--profile', spec.connector.profile || 'default',
        '--dataset', spec.dataset.kind,
        '--language', spec.query.language,
        '--query', spec.query.statement,
        '--raw',
      ], spec.parameters || {});
      const doctorResult = await runThruntCommand(projectRoot, doctorArgs, options.toolsPath, { timeoutMs: 30_000, logger: options.logger });

      let readinessStatus = 'partial';
      let ready = false;
      let targetBlockers: string[] = [];
      if (doctorResult.ok) {
        const report = safeJsonParse<any>(doctorResult.stdout);
        readinessStatus = report?.overall_status || 'partial';
        targetBlockers = collectReadinessBlockers(report);
        ready = targetBlockers.length === 0 && ['ready', 'live_verified'].includes(readinessStatus);
      } else {
        targetBlockers = [doctorResult.stderr || doctorResult.stdout || `Runtime doctor failed for ${spec.connector.id}`];
      }

      blockers.push(...targetBlockers);
      previewTargets.push({
        name: target.name,
        connectorId: spec.connector.id,
        dataset: spec.dataset.kind,
        language: spec.query.language,
        profile: spec.connector.profile || 'default',
        timeWindow: `${spec.time_window.start} -> ${spec.time_window.end}`,
        querySummary: truncate(spec.query.statement, 160),
        readinessStatus,
        ready,
        blockers: targetBlockers,
      });
    }

    runtimePreviewState = {
      packId: resolved.packId,
      packTitle: rendered.pack?.title || resolved.packId,
      targetName: resolved.targetName,
      generatedAt: new Date().toISOString(),
      ready: blockers.length === 0,
      blockers: [...new Set(blockers)],
      targets: previewTargets,
    };

    return {
      success: true,
      executionId,
      message: runtimePreviewState.ready
        ? `Previewed ${runtimePreviewState.packTitle} with ${previewTargets.length} target(s)`
        : `Previewed ${runtimePreviewState.packTitle}; runtime blockers remain`,
      previewState: runtimePreviewState,
      resolvedPackId: resolved.packId,
      command: renderResult.command,
      exitCode: renderResult.exitCode,
      stdout: renderResult.stdout,
      stderr: renderResult.stderr,
      mutation: {
        kind: 'runtime.preview',
        mutated: false,
        fallback: false,
        toolsPath: renderResult.toolsPath,
        diagnostics: renderResult.diagnostics,
      },
      view: currentView(),
    };
  }

  function collectExecutionArtifacts(payload: any): RuntimeArtifactRef[] {
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const artifacts: RuntimeArtifactRef[] = [];

    for (const result of results) {
      const queryLog = result?.artifacts?.query_log;
      if (queryLog?.id) {
        artifacts.push({ type: 'query', id: queryLog.id, path: queryLog.path });
      }

      for (const receipt of Array.isArray(result?.artifacts?.receipts) ? result.artifacts.receipts : []) {
        if (receipt?.id) {
          artifacts.push({ type: 'receipt', id: receipt.id, path: receipt.path });
        }
      }
    }

    return artifacts;
  }

  async function executeRuntimePack(request: ExecutePackRequest, executionId: string): Promise<ExecuteResponse> {
    const preview = await previewPackExecution({ ...request, dryRun: true }, executionId);
    if (!preview.success || !preview.previewState || !preview.previewState.ready || !preview.resolvedPackId) {
      return {
        ...preview,
        success: false,
        message: preview.previewState
          ? `Runtime execution blocked: ${preview.previewState.blockers.join('; ')}`
          : preview.message,
      };
    }

    const resolved = resolvePackRequest(request, load());
    if (!resolved) {
      return {
        success: false,
        executionId,
        message: 'Unable to resolve the requested pack for runtime execution',
        view: currentView(),
      };
    }

    const executeArgs = appendParameterArgs([
      'runtime', 'execute', '--pack', resolved.packId,
      ...(resolved.targetName ? ['--target', resolved.targetName] : []),
      '--raw',
    ], resolved.parameters);
    const result = await runThruntCommand(projectRoot, executeArgs, options.toolsPath, { timeoutMs: 30_000, logger: options.logger });

    if (!result.ok) {
      return {
        success: false,
        executionId,
        message: `Runtime execution failed: ${result.stderr || result.stdout || 'Unknown runtime failure'}`,
        command: result.command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        mutation: {
          kind: 'runtime.execute',
          mutated: false,
          fallback: false,
          toolsPath: result.toolsPath,
          diagnostics: result.diagnostics,
        },
        previewState: runtimePreviewState,
        resolvedPackId: resolved.packId,
        view: currentView(),
      };
    }

    const payload = safeJsonParse<any>(result.stdout);
    const artifacts = collectExecutionArtifacts(payload);
    const resultStatuses = (Array.isArray(payload?.results) ? payload.results : []).map((item: any) => item?.result?.status ?? 'error');
    const status = resultStatuses.every((value: string) => value === 'error')
      ? 'error'
      : resultStatuses.some((value: string) => value === 'partial' || value === 'error')
        ? 'partial'
        : 'ok';

    cached = null;
    lastExecutionState = {
      executionId,
      mode: 'pack',
      packId: resolved.packId,
      targetName: resolved.targetName,
      connectorId: artifacts.find((artifact) => artifact.type === 'query')?.id ? null : null,
      status,
      completedAt: new Date().toISOString(),
      message: `Executed ${resolved.packId}${resolved.targetName ? ` (${resolved.targetName})` : ''}`,
      queryIds: artifacts.filter((artifact) => artifact.type === 'query').map((artifact) => artifact.id),
      receiptIds: artifacts.filter((artifact) => artifact.type === 'receipt').map((artifact) => artifact.id),
      artifactPaths: artifacts.map((artifact) => artifact.path).filter((value): value is string => Boolean(value)),
    };

    return {
      success: status !== 'error',
      executionId,
      message: lastExecutionState.message,
      command: result.command,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      mutation: {
        kind: 'runtime.execute',
        mutated: true,
        fallback: false,
        toolsPath: result.toolsPath,
        diagnostics: result.diagnostics,
      },
      previewState: runtimePreviewState,
      executionState: lastExecutionState,
      createdArtifacts: artifacts,
      resolvedPackId: resolved.packId,
      view: currentView(),
    };
  }

  async function executeRuntimeTarget(request: ExecuteTargetRequest, executionId: string): Promise<ExecuteResponse> {
    const doctorArgs = [
      'runtime', 'doctor', request.connectorId,
      '--dataset', request.dataset || 'events',
      '--language', 'native',
      '--query', request.query,
      '--raw',
    ];
    const doctor = await runThruntCommand(projectRoot, doctorArgs, options.toolsPath, { timeoutMs: 30_000, logger: options.logger });
    if (!doctor.ok) {
      return {
        success: false,
        executionId,
        message: doctor.stderr || doctor.stdout || `Runtime doctor failed for ${request.connectorId}`,
        command: doctor.command,
        exitCode: doctor.exitCode,
        stdout: doctor.stdout,
        stderr: doctor.stderr,
        mutation: {
          kind: request.dryRun ? 'runtime.target.preview' : 'runtime.target.execute',
          mutated: false,
          fallback: false,
          toolsPath: doctor.toolsPath,
          diagnostics: doctor.diagnostics,
        },
        view: currentView(),
      };
    }

    const doctorReport = safeJsonParse<any>(doctor.stdout);
    const blockers = collectReadinessBlockers(doctorReport);
    const previewState: RuntimePreviewSummary = {
      packId: 'direct-runtime-target',
      packTitle: `Direct ${request.connectorId} runtime target`,
      targetName: null,
      generatedAt: new Date().toISOString(),
      ready: blockers.length === 0,
      blockers,
      targets: [{
        name: `${request.connectorId} direct query`,
        connectorId: request.connectorId,
        dataset: request.dataset || 'events',
        language: 'native',
        profile: 'default',
        timeWindow: `lookback ${request.timeWindowMinutes || 60}m`,
        querySummary: truncate(request.query, 160),
        readinessStatus: doctorReport?.overall_status || 'partial',
        ready: blockers.length === 0,
        blockers,
      }],
    };

    if (request.dryRun) {
      runtimePreviewState = previewState;
      return {
        success: true,
        executionId,
        message: previewState.ready
          ? `Previewed ${request.connectorId} direct runtime query`
          : `Previewed ${request.connectorId} direct runtime query; blockers remain`,
        previewState,
        command: doctor.command,
        exitCode: doctor.exitCode,
        stdout: doctor.stdout,
        stderr: doctor.stderr,
        mutation: {
          kind: 'runtime.target.preview',
          mutated: false,
          fallback: false,
          toolsPath: doctor.toolsPath,
          diagnostics: doctor.diagnostics,
        },
        view: currentView(),
      };
    }

    if (blockers.length > 0) {
      runtimePreviewState = previewState;
      return {
        success: false,
        executionId,
        message: `Runtime execution blocked: ${blockers.join('; ')}`,
        previewState,
        command: doctor.command,
        exitCode: doctor.exitCode,
        stdout: doctor.stdout,
        stderr: doctor.stderr,
        mutation: {
          kind: 'runtime.target.execute',
          mutated: false,
          fallback: false,
          toolsPath: doctor.toolsPath,
          diagnostics: doctor.diagnostics,
        },
        view: currentView(),
      };
    }

    const executeArgs = [
      'runtime', 'execute',
      '--connector', request.connectorId,
      '--dataset', request.dataset || 'events',
      '--query', request.query,
      '--lookback-minutes', String(request.timeWindowMinutes || 60),
      '--raw',
    ];
    const execute = await runThruntCommand(projectRoot, executeArgs, options.toolsPath, { timeoutMs: 30_000, logger: options.logger });
    if (!execute.ok) {
      return {
        success: false,
        executionId,
        message: execute.stderr || execute.stdout || `Runtime execution failed for ${request.connectorId}`,
        command: execute.command,
        exitCode: execute.exitCode,
        stdout: execute.stdout,
        stderr: execute.stderr,
        mutation: {
          kind: 'runtime.target.execute',
          mutated: false,
          fallback: false,
          toolsPath: execute.toolsPath,
          diagnostics: execute.diagnostics,
        },
        view: currentView(),
      };
    }

    const payload = safeJsonParse<any>(execute.stdout);
    const artifacts: RuntimeArtifactRef[] = [];
    if (payload?.artifacts?.query_log?.id) {
      artifacts.push({ type: 'query', id: payload.artifacts.query_log.id, path: payload.artifacts.query_log.path });
    }
    for (const receipt of Array.isArray(payload?.artifacts?.receipts) ? payload.artifacts.receipts : []) {
      if (receipt?.id) {
        artifacts.push({ type: 'receipt', id: receipt.id, path: receipt.path });
      }
    }

    cached = null;
    lastExecutionState = {
      executionId,
      mode: 'target',
      packId: null,
      targetName: null,
      connectorId: request.connectorId,
      status: payload?.result?.status === 'error' ? 'error' : payload?.result?.status === 'partial' ? 'partial' : 'ok',
      completedAt: new Date().toISOString(),
      message: `Executed direct ${request.connectorId} runtime query`,
      queryIds: artifacts.filter((artifact) => artifact.type === 'query').map((artifact) => artifact.id),
      receiptIds: artifacts.filter((artifact) => artifact.type === 'receipt').map((artifact) => artifact.id),
      artifactPaths: artifacts.map((artifact) => artifact.path).filter((value): value is string => Boolean(value)),
    };

    return {
      success: lastExecutionState.status !== 'error',
      executionId,
      message: lastExecutionState.message,
      command: execute.command,
      exitCode: execute.exitCode,
      stdout: execute.stdout,
      stderr: execute.stderr,
      mutation: {
        kind: 'runtime.target.execute',
        mutated: true,
        fallback: false,
        toolsPath: execute.toolsPath,
        diagnostics: execute.diagnostics,
      },
      previewState,
      executionState: lastExecutionState,
      createdArtifacts: artifacts,
      view: currentView(),
    };
  }

  return {
    async getCase() {
      return load().mission;
    },
    async getProgress() {
      return load().progress;
    },
    async getHypotheses() {
      return load().hypotheses;
    },
    async getQueries() {
      return load().queries;
    },
    async getReceipts() {
      return load().receipts;
    },
    async getFindings() {
      return load().findings;
    },
    async getCaseView() {
      return currentView();
    },
    async openCase(request) {
      const title = deriveCaseTitle(request);
      const commandResult = await runThruntCommand(
        projectRoot,
        ['case', 'new', title, '--signal', request.signal, '--bootstrap-program', '--raw'],
        options.toolsPath,
      );

      if (!commandResult.ok) {
        throw new Error(commandResult.stderr || commandResult.stdout || 'Case creation failed');
      }

      cached = null;
      const caseSummary = await this.getCase();
      if (!caseSummary) {
        throw new Error('Case creation succeeded but no case summary was available');
      }

      return {
        case: caseSummary,
        created: true,
        message: `Case opened via THRUNT tooling: ${title}`,
        command: commandResult.command,
        exitCode: commandResult.exitCode,
        stdout: commandResult.stdout,
        stderr: commandResult.stderr,
      };
    },
    async attachEvidence(attachment) {
      const result = canonicalizeAttachment(currentPaths(), attachment, load(), makeId);
      cached = null;
      const view = currentView();
      return {
        success: true,
        attachmentId: result.primaryId,
        message: result.message,
        artifactKind: result.artifactKind,
        classification: result.classification,
        createdArtifacts: result.createdArtifacts,
        reason: result.reason,
        view,
      };
    },
    async executePack(request) {
      const executionId = makeId('EXEC');
      if (request.dryRun) {
        return previewPackExecution(request, executionId);
      }
      return executeRuntimePack(request, executionId);
    },
    async executeTarget(request) {
      const executionId = makeId('EXEC');
      return executeRuntimeTarget(request, executionId);
    },
    async executeNext() {
      const executionId = makeId('EXEC');
      const data = load();
      const planned = deriveExecuteNextMutation(data);

      if (!planned) {
        return {
          success: false,
          executionId,
          message: 'No actionable THRUNT mutation path is available for the current case state',
          view: currentView(),
        };
      }

      const result = await runThruntCommand(projectRoot, planned.command, options.toolsPath, { timeoutMs: 30_000, logger: options.logger });
      if (!result.ok) {
        return {
          success: false,
          executionId,
          message: `Fallback only: ${planned.message}. ${result.stderr || result.stdout || 'thrunt-tools was unavailable.'}`,
          command: result.command,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          mutation: {
            kind: planned.kind,
            mutated: false,
            fallback: true,
            toolsPath: result.toolsPath,
            diagnostics: result.diagnostics,
          },
          view: currentView(),
        };
      }

      cached = null;
      lastExecutionState = {
        executionId,
        mode: 'next',
        packId: null,
        targetName: null,
        connectorId: null,
        status: 'ok',
        completedAt: new Date().toISOString(),
        message: planned.message,
        queryIds: [],
        receiptIds: [],
        artifactPaths: [],
      };
      const view = currentView();
      return {
        success: true,
        executionId,
        message: planned.message,
        command: result.command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        mutation: {
          kind: planned.kind,
          mutated: true,
          fallback: false,
          toolsPath: result.toolsPath,
          diagnostics: result.diagnostics,
        },
        executionState: lastExecutionState,
        view,
      };
    },
    caseOpen() {
      return fs.existsSync(currentPaths().mission);
    },
    planningExists() {
      return planningExists(projectRoot);
    },
    invalidate() {
      cached = null;
    },
  };
}

function deriveCaseTitle(request: OpenCaseRequest): string {
  const signal = normalizeSingleLine(request.signal);
  const vendor = request.vendorContext?.consoleName || request.vendorContext?.vendorId || 'Console';
  const shortened = signal.length > 72 ? `${signal.slice(0, 69)}...` : signal;
  return `${vendor}: ${shortened}`;
}

function normalizeSingleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
