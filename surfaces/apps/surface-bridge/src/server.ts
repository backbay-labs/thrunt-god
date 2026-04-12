/**
 * Surface Bridge HTTP + WebSocket server.
 *
 * Phase two: real artifact projection, file watcher, auth, evidence writes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type {
  BridgeConfig,
  BridgeHealthResponse,
  BridgeEvent,
  CertificationPrerequisiteRequest,
  CertificationCampaignPromotionRequest,
  CertificationCampaignReviewRequest,
  CertificationCampaignSubmitRequest,
  CertificationCampaignRuntimeRequest,
  CertificationCaptureRequest,
  OpenCaseRequest,
  ExecutePackRequest,
  ExecuteTargetRequest,
  EvidenceAttachment,
  VendorContext,
} from '@thrunt-surfaces/contracts';
import { DEFAULT_BRIDGE_CONFIG } from '@thrunt-surfaces/contracts';
import { resolvePlanningPaths } from '@thrunt-surfaces/artifacts';
import {
  attachRuntimeResultToCampaign,
  createCertificationCampaign,
  getCertificationBaselineChurn,
  getCertificationDriftTrends,
  getCertificationFreshness,
  getCertificationHistory,
  listCertificationCampaigns,
  listCertificationBaselines,
  normalizeCertificationCampaignId,
  normalizeCertificationVendorId,
  promoteCertificationCampaign,
  readCertificationCampaign,
  replayCertificationCampaign,
  reviewCertificationCampaign,
  submitCertificationCampaignForReview,
} from '@thrunt-surfaces/site-adapters';
import { createMockProvider, createArtifactProvider, type CaseDataProvider } from './providers.ts';
import { createMutationHandler } from './mutation-handler.ts';
import { checkCertificationPrerequisites } from './certification-ops.ts';
import { createLogger } from './logger.ts';
import {
  classifyError,
  corsHeaders,
  errorResponse,
  getExtensionIdFromOrigin,
  normalizeExtensionId,
  type ErrorClass,
} from './errors.ts';
import { createSubprocessHealthMonitor } from './subprocess-health.ts';
import { createEventJournal } from './event-journal.ts';
import { createStructuredWatcher, type StructuredWatcher } from './file-watcher.ts';
import type { EventBridgeEnvelope } from '@thrunt-surfaces/contracts';

const VERSION = '0.2.0';

// ─── Rate limiter ──────────────────────────────────────────────────────
interface RateLimiterConfig {
  requestsPerMinute: number;
  authFailuresPerMinute: number;
  maxWsPerIp: number;
}

interface RateLimiter {
  /** Returns true if the request is allowed. */
  allow(ip: string): boolean;
  /** Record an auth failure for stricter limiting. */
  recordAuthFailure(ip: string): void;
  /** Track WS connections; returns true if under limit. */
  allowWs(ip: string): boolean;
  /** Release a WS slot (on disconnect). */
  releaseWs(ip: string): void;
  /** Stop cleanup timer. */
  stop(): void;
}

function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const requests = new Map<string, number[]>();
  const authFailures = new Map<string, number[]>();
  const wsConnections = new Map<string, number>();
  const windowMs = 60_000;

  // Periodic cleanup of stale entries
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    const cutoff = now - windowMs;
    for (const [ip, timestamps] of requests) {
      const filtered = timestamps.filter(t => t > cutoff);
      if (filtered.length === 0) requests.delete(ip);
      else requests.set(ip, filtered);
    }
    for (const [ip, timestamps] of authFailures) {
      const filtered = timestamps.filter(t => t > cutoff);
      if (filtered.length === 0) authFailures.delete(ip);
      else authFailures.set(ip, filtered);
    }
  }, 60_000);

  function countRecent(map: Map<string, number[]>, ip: string): number {
    const timestamps = map.get(ip);
    if (!timestamps) return 0;
    const cutoff = Date.now() - windowMs;
    return timestamps.filter(t => t > cutoff).length;
  }

  return {
    allow(ip: string): boolean {
      // Check auth failure lockout first
      if (countRecent(authFailures, ip) >= config.authFailuresPerMinute) {
        return false;
      }
      // Check request rate
      if (countRecent(requests, ip) >= config.requestsPerMinute) {
        return false;
      }
      const arr = requests.get(ip) ?? [];
      arr.push(Date.now());
      requests.set(ip, arr);
      return true;
    },
    recordAuthFailure(ip: string): void {
      const arr = authFailures.get(ip) ?? [];
      arr.push(Date.now());
      authFailures.set(ip, arr);
    },
    allowWs(ip: string): boolean {
      const count = wsConnections.get(ip) ?? 0;
      if (count >= config.maxWsPerIp) return false;
      wsConnections.set(ip, count + 1);
      return true;
    },
    releaseWs(ip: string): void {
      const count = wsConnections.get(ip) ?? 0;
      if (count <= 1) wsConnections.delete(ip);
      else wsConnections.set(ip, count - 1);
    },
    stop(): void {
      clearInterval(cleanupTimer);
    },
  };
}

class RequestBodyValidationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code = 'INVALID_JSON_BODY', status = 400) {
    super(message);
    this.name = 'RequestBodyValidationError';
    this.code = code;
    this.status = status;
  }
}

function createMutex() {
  let pending = Promise.resolve();
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      const release = pending;
      let resolve: () => void;
      pending = new Promise<void>(r => { resolve = r; });
      await release;
      try {
        return await fn();
      } finally {
        resolve!();
      }
    }
  };
}

export interface BridgeInstance {
  stop(): void;
  token: string;
  port: number;
}

export function startBridge(config: Partial<BridgeConfig> = {}): BridgeInstance {
  const cfg: BridgeConfig = {
    ...DEFAULT_BRIDGE_CONFIG,
    projectRoot: config.projectRoot ?? process.cwd(),
    ...config,
  };
  const logger = createLogger();
  const provider: CaseDataProvider = cfg.mockMode
    ? createMockProvider()
    : createArtifactProvider(cfg.projectRoot, { toolsPath: cfg.toolsPath, logger });
  const startTime = Date.now();
  const wsClients = new Set<{ send(data: string): void }>();
  let lastFileWatcherEvent: string | null = null;
  const journal = createEventJournal(1000);

  // ─── Subprocess health monitoring ───────────────────────────────────
  const subprocessHealth = createSubprocessHealthMonitor({
    projectRoot: cfg.projectRoot,
    toolsPath: cfg.toolsPath,
    logger,
    probeTimeoutMs: 5000,
    onStateChange: (available) => {
      if (!available) {
        logger.warn('lifecycle', 'subprocess became unavailable — entering degraded mode', {});
        broadcast({ type: 'bridge:error', data: { code: 'BRIDGE_DEGRADED', message: 'Subprocess unavailable' } });
      } else {
        logger.info('lifecycle', 'subprocess recovered — resuming full operation', {});
      }
    },
  });
  if (!cfg.mockMode) { subprocessHealth.startPeriodicProbe(60_000); }

  // ─── Mutation handler ───────────────────────────────────────────────
  const mutationHandler = createMutationHandler({
    projectRoot: cfg.projectRoot,
    toolsPath: cfg.toolsPath,
    logger,
    provider,
    isSubprocessAvailable: () => cfg.mockMode || subprocessHealth.isAvailable(),
  });
  const mutationMutex = createMutex();

  // ─── Rate limiting ──────────────────────────────────────────────────
  const rateLimiter = createRateLimiter({
    requestsPerMinute: 60,
    authFailuresPerMinute: 5,
    maxWsPerIp: 10,
  });
  const allowedExtensionIds = new Set(
    (cfg.allowedExtensionIds ?? [])
      .map((value) => normalizeExtensionId(value))
      .filter((value): value is string => Boolean(value)),
  );

  // ─── Auth: session nonce ─────────────────────────────────────────────
  const sessionToken = crypto.randomBytes(16).toString('hex');

  function writeTokenFile(): void {
    if (cfg.mockMode) return;
    try {
      const paths = resolvePlanningPaths(cfg.projectRoot);
      if (!fs.existsSync(paths.programRoot)) return;
      const tokenPath = path.join(paths.programRoot, '.bridge-token');
      fs.writeFileSync(tokenPath, sessionToken, { encoding: 'utf-8', mode: 0o600 });
    } catch { /* non-fatal if planning dir doesn't exist yet */ }
  }

  function checkAuth(req: Request, requireWrite: boolean): boolean {
    if (cfg.mockMode) return true; // Mock mode is open for dev
    const token = req.headers.get('x-bridge-token');
    if (token === sessionToken) return true;
    // Read-only health endpoint is public
    if (!requireWrite && new URL(req.url).pathname === '/api/health') return true;
    return false;
  }

  function checkWsAuth(req: Request): boolean {
    if (cfg.mockMode) return true;
    const origin = req.headers.get('origin') ?? '';
    if (origin && !resolveTrustedOrigin(origin)) {
      return false;
    }
    const token = new URL(req.url).searchParams.get('token');
    return token === sessionToken;
  }

  function resolveTrustedOrigin(origin: string, expected?: {
    extensionId?: string;
    surfaceId?: string;
  }): string | null {
    if (!origin) return null;

    const originExtensionId = getExtensionIdFromOrigin(origin);
    if (!originExtensionId || !allowedExtensionIds.has(originExtensionId)) {
      return null;
    }

    if (expected?.surfaceId !== undefined && expected.surfaceId !== 'browser-extension') {
      return null;
    }

    const claimedExtensionId = normalizeExtensionId(expected?.extensionId);
    if (expected?.extensionId !== undefined && claimedExtensionId !== originExtensionId) {
      return null;
    }

    return origin;
  }

  writeTokenFile();

  // ─── Structured file watcher ──────────────────────────────────────────
  let structuredWatcher: StructuredWatcher | null = null;

  function ensureStructuredWatcher(): void {
    if (cfg.mockMode || structuredWatcher) return;
    const paths = resolvePlanningPaths(cfg.projectRoot);
    if (!fs.existsSync(paths.programRoot)) return;

    structuredWatcher = createStructuredWatcher({
      planningRoot: paths.programRoot,
      logger,
      onEvent: (event) => {
        lastFileWatcherEvent = new Date().toISOString();
        const envelope = journal.append(event);
        broadcastEnvelope(envelope);
        // Also trigger provider invalidation for backward compat with existing BridgeEvent consumers
        provider.invalidate();
      },
    });
    structuredWatcher.start();
  }
  ensureStructuredWatcher();

  // ─── Broadcasting ────────────────────────────────────────────────────

  function broadcast(event: BridgeEvent) {
    logger.debug('ws', 'broadcast', { type: event.type, clients: wsClients.size });
    const data = JSON.stringify(event);
    for (const client of wsClients) {
      try { client.send(data); } catch { wsClients.delete(client); }
    }
  }

  function broadcastEnvelope(envelope: EventBridgeEnvelope): void {
    logger.debug('ws', 'broadcast envelope', { type: envelope.type, seq: envelope.seq, clients: wsClients.size });
    const data = JSON.stringify(envelope);
    for (const client of wsClients) {
      try { client.send(data); } catch { wsClients.delete(client); }
    }
  }

  const heartbeatTimer = setInterval(() => {
    const hb: EventBridgeEnvelope = {
      v: 1,
      seq: 0, // Heartbeats don't consume journal sequence numbers
      ts: new Date().toISOString(),
      type: 'bridge:heartbeat',
      data: { ts: new Date().toISOString() },
    };
    broadcastEnvelope(hb);
  }, 1_000);

  // ─── Response helpers ────────────────────────────────────────────────

  // Response helpers — accept req parameter for correct per-request CORS headers.
  function createJsonResponse(data: unknown, status = 200, req?: Request, allowedOrigin: string | null = ''): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(req, allowedOrigin) },
    });
  }

  function createErrorResponse(
    message: string,
    status = 400,
    errorClass: ErrorClass = 'validation',
    code = 'VALIDATION_ERROR',
    req?: Request,
    allowedOrigin: string | null = '',
  ): Response {
    return errorResponse(message, errorClass, code, status, req, allowedOrigin);
  }

  // ─── Request handler ─────────────────────────────────────────────────

  async function handleRequest(req: Request, clientIp: string = '127.0.0.1'): Promise<Response> {
    const url = new URL(req.url);
    const reqPath = url.pathname;
    const method = req.method;
    const reqStart = Date.now();
    const responseOrigin = resolveTrustedOrigin(req.headers.get('origin') ?? '');

    if (method === 'OPTIONS') {
      if (req.headers.get('origin') && !responseOrigin) {
        return new Response(null, { status: 403, headers: corsHeaders(req, null) });
      }
      return new Response(null, { headers: corsHeaders(req, responseOrigin) });
    }

    try {
      return await handleRequestInner(req, url, reqPath, method, clientIp, responseOrigin);
    } catch (err) {
      if (err instanceof RequestBodyValidationError) {
        logger.warn('http', 'invalid request body', { path: reqPath, error: err.message });
        return createErrorResponse(err.message, err.status, 'validation', err.code, req, responseOrigin);
      }
      const classified = classifyError(err);
      logger.error('http', 'unhandled', { path: reqPath, error: String(err) });
      return createErrorResponse(classified.message, 500, classified.class, classified.code, req, responseOrigin);
    } finally {
      const durationMs = Date.now() - reqStart;
      logger.info('http', `${method} ${reqPath}`, { durationMs });
    }
  }

  // Routes that require subprocess availability for write operations
  const SUBPROCESS_REQUIRED_ROUTES = new Set([
    '/api/case/open',
    '/api/evidence/attach',
    '/api/execute/pack',
    '/api/execute/target',
    '/api/execute/next',
  ]);

  async function handleRequestInner(
    _req: Request,
    _url: URL,
    reqPath: string,
    method: string,
    clientIp: string,
    responseOrigin: string | null,
  ): Promise<Response> {
    const req = _req;
    const json = (data: unknown, status = 200): Response => createJsonResponse(data, status, req, responseOrigin);
    const error = (
      message: string,
      status = 400,
      errorClass: ErrorClass = 'validation',
      code = 'VALIDATION_ERROR',
    ): Response => createErrorResponse(message, status, errorClass, code, req, responseOrigin);
    const requestOrigin = req.headers.get('origin') ?? '';
    const parseCampaignId = (rawValue: string): string | null => {
      try {
        return normalizeCertificationCampaignId(decodeURIComponent(rawValue));
      } catch {
        return null;
      }
    };
    const readJsonObject = async <T extends object>(allowEmpty = false): Promise<T> => {
      const raw = await req.text();
      if (!raw.trim()) {
        if (allowEmpty) return {} as T;
        throw new RequestBodyValidationError('Request body must be a JSON object');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new RequestBodyValidationError('Malformed JSON request body');
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new RequestBodyValidationError('Request body must be a JSON object');
      }

      return parsed as T;
    };

    if (requestOrigin && !responseOrigin && reqPath !== '/api/health') {
      rateLimiter.recordAuthFailure(clientIp);
      return error('Request origin is not allowed', 403, 'auth', 'AUTH_ORIGIN_FORBIDDEN');
    }

    // Auth check — health and handshake are public, everything else requires token
    const isWrite = method === 'POST';
    const isPublic = reqPath === '/api/health' || reqPath === '/api/handshake';
    if (!checkAuth(req, isWrite) && !isPublic) {
      rateLimiter.recordAuthFailure(clientIp);
      return error('Unauthorized — provide X-Bridge-Token header', 401, 'auth', 'AUTH_MISSING_TOKEN');
    }

    // ─── Subprocess degradation gate ──────────────────────────────────
    if (method === 'POST' && !cfg.mockMode && SUBPROCESS_REQUIRED_ROUTES.has(reqPath) && !subprocessHealth.isAvailable()) {
      logger.warn('http', 'write rejected — bridge degraded', { path: reqPath });
      return error(
        'Bridge is in degraded mode — thrunt-tools subprocess is unavailable. Read operations continue to work. Write operations will resume when the subprocess recovers.',
        503,
        'subprocess',
        'BRIDGE_DEGRADED'
      );
    }

    // ─── GET routes ────────────────────────────────────────────────

    if (method === 'GET' && reqPath === '/api/health') {
      const health: BridgeHealthResponse = {
        status: subprocessHealth.isAvailable() || cfg.mockMode ? 'ok' : 'degraded',
        version: VERSION,
        mockMode: cfg.mockMode,
        projectRoot: cfg.projectRoot,
        planningExists: provider.planningExists(),
        caseOpen: provider.caseOpen(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        wsClients: wsClients.size,
        activeCaseId: provider.caseOpen() ? (await provider.getCase())?.caseRoot ?? null : null,
        lastFileWatcherEvent,
        subprocessAvailable: cfg.mockMode ? true : subprocessHealth.isAvailable(),
      };
      return json(health);
    }

    if (method === 'GET' && reqPath === '/api/case') {
      const cs = await provider.getCase();
      if (!cs) return error('No case open', 404);
      return json({ case: cs });
    }

    if (method === 'GET' && reqPath === '/api/case/progress') {
      const progress = await provider.getProgress();
      if (!progress) return error('No progress data', 404);
      return json({ progress });
    }

    if (method === 'GET' && reqPath === '/api/case/hypotheses') {
      return json({ hypotheses: await provider.getHypotheses() });
    }

    if (method === 'GET' && reqPath === '/api/case/queries') {
      const queries = await provider.getQueries();
      return json({ queries, total: queries.length });
    }

    if (method === 'GET' && reqPath === '/api/case/receipts') {
      const receipts = await provider.getReceipts();
      return json({ receipts, total: receipts.length });
    }

    if (method === 'GET' && reqPath === '/api/case/findings') {
      return json({ findings: await provider.getFindings() });
    }

    if (method === 'GET' && reqPath === '/api/case/view') {
      const view = await provider.getCaseView();
      if (!view) return error('No case data available', 404);
      return json({ view });
    }

    // ─── POST routes ───────────────────────────────────────────────

    if (method === 'POST' && reqPath === '/api/case/open') {
      const body = await readJsonObject<OpenCaseRequest>();
      if (!body.signal) return error('signal is required');
      const result = await provider.openCase(body);
      provider.invalidate();
      writeTokenFile();
      ensureStructuredWatcher();
      broadcast({ type: 'case:updated', data: result.case });
      return json(result, 201);
    }

    if (method === 'POST' && reqPath === '/api/evidence/attach') {
      const attachment = await readJsonObject<EvidenceAttachment>();
      const result = await provider.attachEvidence(attachment);
      for (const artifact of result.createdArtifacts ?? []) {
        if (artifact.type === 'query') {
          const queries = await provider.getQueries();
          const query = queries.find((item) => item.queryId === artifact.id);
          if (query) {
            broadcast({ type: 'query:added', data: query });
          }
          continue;
        }

        if (artifact.type === 'receipt') {
          const receipts = await provider.getReceipts();
          const receipt = receipts.find((item) => item.receiptId === artifact.id);
          if (receipt) {
            broadcast({ type: 'receipt:added', data: receipt });
          }
          continue;
        }

        broadcast({ type: 'evidence:attached', data: { attachmentId: artifact.id, surfaceId: attachment.surfaceId } });
      }

      if (result.view) {
        broadcast({ type: 'case:updated', data: result.view.case });
      }
      return json(result, 201);
    }

    if (method === 'POST' && reqPath === '/api/execute/pack') {
      const body = await readJsonObject<ExecutePackRequest>();
      const result = await provider.executePack(body);
      if (!body.dryRun && result.executionId) {
        broadcast({
          type: 'execution:started',
          data: { executionId: result.executionId, description: `Pack: ${result.resolvedPackId || body.packId || 'suggested pack'}` },
        });
        broadcast({ type: 'execution:completed', data: { executionId: result.executionId, success: result.success } });
      }
      if (result.success && result.view) {
        broadcast({ type: 'case:updated', data: result.view.case });
      }
      return json(result);
    }

    if (method === 'POST' && reqPath === '/api/execute/target') {
      const body = await readJsonObject<ExecuteTargetRequest>();
      if (!body.connectorId || !body.query) return error('connectorId and query are required');
      const result = await provider.executeTarget(body);
      if (!body.dryRun && result.executionId) {
        broadcast({
          type: 'execution:started',
          data: { executionId: result.executionId, description: `Target: ${body.connectorId}` },
        });
        broadcast({ type: 'execution:completed', data: { executionId: result.executionId, success: result.success } });
      }
      if (result.success && result.view) {
        broadcast({ type: 'case:updated', data: result.view.case });
      }
      return json(result);
    }

    if (method === 'POST' && reqPath === '/api/execute/next') {
      const result = await provider.executeNext();
      if (result.executionId) {
        broadcast({ type: 'execution:started', data: { executionId: result.executionId, description: result.message } });
        broadcast({ type: 'execution:completed', data: { executionId: result.executionId, success: result.success } });
      }
      if (result.success && result.view) {
        broadcast({ type: 'case:updated', data: result.view.case });
      }
      return json(result);
    }

    // ─── Handshake endpoint ────────────────────────────────────────

    if (method === 'POST' && reqPath === '/api/handshake') {
      const body = await readJsonObject<{
        token?: string;
        extensionId?: string;
        surfaceId?: string;
      }>(true);
      const providedToken = body.token;
      const trustedOrigin = resolveTrustedOrigin(requestOrigin, {
        extensionId: body.extensionId,
        surfaceId: body.surfaceId,
      });

      if (providedToken && providedToken !== sessionToken) {
        rateLimiter.recordAuthFailure(clientIp);
        return error('Invalid bridge token', 401, 'auth', 'AUTH_INVALID_TOKEN');
      }

      if (requestOrigin && !trustedOrigin) {
        rateLimiter.recordAuthFailure(clientIp);
        return error('Handshake origin is not allowed', 403, 'auth', 'AUTH_ORIGIN_FORBIDDEN');
      }

      return json({
        authenticated: true,
        token: sessionToken,
        version: VERSION,
      });
    }

    if (method === 'POST' && reqPath === '/api/certification/capture') {
      const body = await readJsonObject<CertificationCaptureRequest>();
      if (!body.vendorId || !body.pageUrl || !body.rawHtml) {
        return error('vendorId, pageUrl, and rawHtml are required');
      }
      try {
        body.vendorId = normalizeCertificationVendorId(body.vendorId);
      } catch (err) {
        return error(err instanceof Error ? err.message : 'Invalid certification vendorId');
      }

      const campaign = createCertificationCampaign(cfg.projectRoot, body);
      return json({
        success: true,
        campaignId: campaign.campaignId,
        snapshotId: campaign.snapshotId ?? campaign.campaignId,
        message: `Captured sanitized live snapshot for ${body.vendorId}`,
        campaignPath: campaign.bundlePath,
        snapshotPath: campaign.snapshotPath,
        metadataPath: campaign.metadataPath,
        redactionCount: campaign.redactionCount,
        campaign,
        certification: null,
      }, 201);
    }

    if (method === 'POST' && reqPath === '/api/certification/prerequisites') {
      const body = await readJsonObject<CertificationPrerequisiteRequest>();
      if (!body.vendorId) {
        return error('vendorId is required');
      }
      try {
        body.vendorId = normalizeCertificationVendorId(body.vendorId);
      } catch (err) {
        return error(err instanceof Error ? err.message : 'Invalid certification vendorId');
      }
      const result = await checkCertificationPrerequisites(cfg.projectRoot, body, {
        toolsPath: cfg.toolsPath,
      });
      return json({
        success: result.report.readyForCapture && result.report.readyForRuntime,
        message: result.campaign
          ? `Certification campaign blocked for ${body.vendorId}`
          : `Prerequisites checked for ${body.vendorId}`,
        report: result.report,
        campaign: result.campaign,
      }, result.campaign ? 201 : 200);
    }

    if (method === 'GET' && reqPath === '/api/certification/campaigns') {
      return json({ campaigns: listCertificationCampaigns(cfg.projectRoot) });
    }

    if (method === 'GET' && reqPath === '/api/certification/history') {
      return json({ history: getCertificationHistory(cfg.projectRoot) });
    }

    if (method === 'GET' && reqPath === '/api/certification/drift-trends') {
      return json({ trends: getCertificationDriftTrends(cfg.projectRoot) });
    }

    if (method === 'GET' && reqPath === '/api/certification/baselines') {
      return json({ baselines: listCertificationBaselines(cfg.projectRoot) });
    }

    if (method === 'GET' && reqPath === '/api/certification/freshness') {
      return json({ freshness: getCertificationFreshness(cfg.projectRoot) });
    }

    if (method === 'GET' && reqPath === '/api/certification/churn') {
      return json({ churn: getCertificationBaselineChurn(cfg.projectRoot) });
    }

    const campaignDetailMatch = reqPath.match(/^\/api\/certification\/campaigns\/([^/]+)$/);
    if (method === 'GET' && campaignDetailMatch) {
      const campaignId = parseCampaignId(campaignDetailMatch[1] ?? '');
      if (!campaignId) return error('Invalid certification campaign ID');
      const campaign = readCertificationCampaign(cfg.projectRoot, campaignId);
      if (!campaign) return error('Unknown certification campaign', 404);
      return json({ campaign });
    }

    const replayMatch = reqPath.match(/^\/api\/certification\/campaigns\/([^/]+)\/replay$/);
    if (method === 'POST' && replayMatch) {
      const campaignId = parseCampaignId(replayMatch[1] ?? '');
      if (!campaignId) return error('Invalid certification campaign ID');
      const body = await readJsonObject<{ comparedAgainst?: 'captured' | 'approved_baseline' }>(true);
      const campaign = await replayCertificationCampaign({
        projectRoot: cfg.projectRoot,
        campaignId,
        comparedAgainst: body.comparedAgainst,
      });
      return json({
        success: true,
        message: `Replayed certification campaign ${campaignId}`,
        campaign,
      });
    }

    const runtimePreviewMatch = reqPath.match(/^\/api\/certification\/campaigns\/([^/]+)\/runtime\/preview$/);
    if (method === 'POST' && runtimePreviewMatch) {
      const campaignId = parseCampaignId(runtimePreviewMatch[1] ?? '');
      if (!campaignId) return error('Invalid certification campaign ID');
      const campaign = readCertificationCampaign(cfg.projectRoot, campaignId);
      if (!campaign) return error('Unknown certification campaign', 404);
      const body = await readJsonObject<CertificationCampaignRuntimeRequest>(true);
      const execution = await provider.executePack({
        packId: body.packId,
        target: body.target,
        parameters: body.parameters,
        dryRun: true,
        vendorContext: buildVendorContext(campaign),
      });
      const updatedCampaign = attachRuntimeResultToCampaign(cfg.projectRoot, {
        campaignId,
        mode: 'preview',
        execution,
      });
      return json({
        success: execution.success,
        message: execution.message,
        campaign: updatedCampaign,
        execution,
      });
    }

    const runtimeExecuteMatch = reqPath.match(/^\/api\/certification\/campaigns\/([^/]+)\/runtime\/execute$/);
    if (method === 'POST' && runtimeExecuteMatch) {
      const campaignId = parseCampaignId(runtimeExecuteMatch[1] ?? '');
      if (!campaignId) return error('Invalid certification campaign ID');
      const campaign = readCertificationCampaign(cfg.projectRoot, campaignId);
      if (!campaign) return error('Unknown certification campaign', 404);
      const body = await readJsonObject<CertificationCampaignRuntimeRequest>(true);
      const execution = await provider.executePack({
        packId: body.packId,
        target: body.target,
        parameters: body.parameters,
        vendorContext: buildVendorContext(campaign),
      });
      const updatedCampaign = attachRuntimeResultToCampaign(cfg.projectRoot, {
        campaignId,
        mode: 'execute',
        execution,
      });
      if (execution.success && execution.view) {
        broadcast({ type: 'case:updated', data: execution.view.case });
      }
      return json({
        success: execution.success,
        message: execution.message,
        campaign: updatedCampaign,
        execution,
      });
    }

    const reviewMatch = reqPath.match(/^\/api\/certification\/campaigns\/([^/]+)\/review$/);
    if (method === 'POST' && reviewMatch) {
      const campaignId = parseCampaignId(reviewMatch[1] ?? '');
      if (!campaignId) return error('Invalid certification campaign ID');
      const body = await readJsonObject<CertificationCampaignReviewRequest>();
      if (!body.reviewer || !body.decision) return error('reviewer and decision are required');
      const campaign = reviewCertificationCampaign(cfg.projectRoot, {
        campaignId,
        reviewer: body.reviewer,
        decision: body.decision,
        notes: body.notes,
        followUpItems: body.followUpItems,
      });
      return json({
        success: true,
        message: `Recorded review decision for ${campaignId}`,
        campaign,
      });
    }

    const submitMatch = reqPath.match(/^\/api\/certification\/campaigns\/([^/]+)\/submit$/);
    if (method === 'POST' && submitMatch) {
      const campaignId = parseCampaignId(submitMatch[1] ?? '');
      if (!campaignId) return error('Invalid certification campaign ID');
      const body = await readJsonObject<CertificationCampaignSubmitRequest>();
      if (!body.submittedBy) return error('submittedBy is required');
      const campaign = submitCertificationCampaignForReview(cfg.projectRoot, {
        campaignId,
        submittedBy: body.submittedBy,
        notes: body.notes,
      });
      return json({
        success: true,
        message: `Submitted ${campaignId} for review`,
        campaign,
      });
    }

    const promoteMatch = reqPath.match(/^\/api\/certification\/campaigns\/([^/]+)\/promote$/);
    if (method === 'POST' && promoteMatch) {
      const campaignId = parseCampaignId(promoteMatch[1] ?? '');
      if (!campaignId) return error('Invalid certification campaign ID');
      const body = await readJsonObject<CertificationCampaignPromotionRequest>();
      if (!body.reviewer || !body.decision || !body.target) {
        return error('reviewer, decision, and target are required');
      }
      const campaign = promoteCertificationCampaign(cfg.projectRoot, {
        campaignId,
        reviewer: body.reviewer,
        decision: body.decision,
        target: body.target,
        notes: body.notes,
      });
      return json({
        success: true,
        message: `Recorded promotion decision for ${campaignId}`,
        campaign,
      });
    }

    return error('Not found', 404);
  }

  // ─── Server ──────────────────────────────────────────────────────────

  const server = Bun.serve({
    port: cfg.port,
    hostname: cfg.host,
    fetch(req, server) {
      const ip = server.requestIP(req)?.address ?? '127.0.0.1';

      if (new URL(req.url).pathname === '/ws') {
        if (!checkWsAuth(req)) {
          return new Response('Unauthorized — provide bridge token', { status: 401 });
        }
        if (!rateLimiter.allowWs(ip)) {
          return new Response(JSON.stringify({ error: 'Too many WebSocket connections', code: 'RATE_LIMITED', class: 'rate-limit' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(req, resolveTrustedOrigin(req.headers.get('origin') ?? '')) },
          });
        }
        const lastSeqStr = new URL(req.url).searchParams.get('last_seq');
        const lastSeq = lastSeqStr ? parseInt(lastSeqStr, 10) : undefined;
        if (server.upgrade(req, { data: { lastSeq, ip } } as any)) return undefined as unknown as Response;
        rateLimiter.releaseWs(ip);
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      if (!rateLimiter.allow(ip)) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded', code: 'RATE_LIMITED', class: 'rate-limit' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req, resolveTrustedOrigin(req.headers.get('origin') ?? '')) },
        });
      }

      return handleRequest(req, ip);
    },
    websocket: {
      open(ws) {
        wsClients.add(ws);
        logger.info('ws', 'client connected', { clients: wsClients.size });

        // Send welcome with protocol version and current seq
        const welcome: EventBridgeEnvelope = {
          v: 1,
          seq: 0, // Welcome is not a journal event
          ts: new Date().toISOString(),
          type: 'bridge:welcome',
          data: { protocolVersions: [1], seq: journal.currentSeq() },
        };
        try { ws.send(JSON.stringify(welcome)); } catch {}

        // Check for replay request (last_seq passed as query param on WS connect)
        const lastSeq = (ws as any).data?.lastSeq as number | undefined;
        if (lastSeq !== undefined && !isNaN(lastSeq)) {
          const result = journal.replayFrom(lastSeq);
          if ('overflow' in result) {
            const overflow: EventBridgeEnvelope = {
              v: 1,
              seq: 0,
              ts: new Date().toISOString(),
              type: 'bridge:journal_overflow',
              data: { oldestSeq: result.oldestSeq, currentSeq: result.currentSeq, message: 'Requested sequence too old; perform full refresh' },
            };
            try { ws.send(JSON.stringify(overflow)); } catch {}
          } else {
            for (const event of result.events) {
              try { ws.send(JSON.stringify(event)); } catch { break; }
            }
          }
        }
      },
      close(ws) {
        wsClients.delete(ws);
        const wsIp = (ws as any).data?.ip as string | undefined;
        if (wsIp) rateLimiter.releaseWs(wsIp);
        logger.info('ws', 'client disconnected', { clients: wsClients.size });
      },
      message(ws, message) {
        const raw = typeof message === 'string' ? message : new TextDecoder().decode(message as unknown as ArrayBuffer);
        logger.debug('ws', 'inbound message', { length: raw.length });

        // Handle mutation requests (JSON-RPC format) -- serialized via mutex to prevent TOCTOU races
        void mutationMutex.run(() => mutationHandler.handle(raw)).then((response) => {
          try { ws.send(response); } catch { /* client disconnected */ }
        }).catch((err) => {
          logger.error('ws', 'mutation handler error', { error: String(err) });
          const errorResponse = JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32603, message: 'Internal error' },
          });
          try { ws.send(errorResponse); } catch {}
        });
      },
    },
  });

  const mode = cfg.mockMode ? ' (mock mode)' : '';
  console.log(`THRUNT Surface Bridge v${VERSION}${mode} on http://${cfg.host}:${cfg.port}`);
  console.log(`  Project: ${cfg.projectRoot}`);
  try {
    const paths = resolvePlanningPaths(cfg.projectRoot);
    console.log(`  Token: ${path.join(paths.programRoot, '.bridge-token')}`);
  } catch {
    console.log('  Token: written to .planning/.bridge-token');
  }
  console.log(`  WS: ws://${cfg.host}:${cfg.port}/ws`);

  return {
    stop: () => {
      clearInterval(heartbeatTimer);
      subprocessHealth.stop();
      rateLimiter.stop();
      structuredWatcher?.stop();
      server.stop();
    },
    token: sessionToken,
    port: cfg.port,
  };
}

function buildVendorContext(campaign: {
  vendorId: string;
  pageUrl: string;
  pageTitle: string;
  capturedAt: string;
  captureExpected: Record<string, unknown> | null;
}): VendorContext {
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
