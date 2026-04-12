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
import { classifyError, corsHeaders, errorResponse, type ErrorClass } from './errors.ts';
import { createSubprocessHealthMonitor } from './subprocess-health.ts';
import { createEventJournal } from './event-journal.ts';
import { createStructuredWatcher, type StructuredWatcher } from './file-watcher.ts';
import type { EventBridgeEnvelope } from '@thrunt-surfaces/contracts';

const VERSION = '0.2.0';

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
    const token = new URL(req.url).searchParams.get('token');
    return token === sessionToken;
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

  // Current request context — set at the top of handleRequest so json/error
  // helpers emit correct CORS headers without threading req through every call.
  let _currentReq: Request | undefined;

  function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(_currentReq) },
    });
  }

  function error(message: string, status = 400, errorClass: ErrorClass = 'validation', code = 'VALIDATION_ERROR'): Response {
    return errorResponse(message, errorClass, code, status, _currentReq);
  }

  // ─── Request handler ─────────────────────────────────────────────────

  async function handleRequest(req: Request): Promise<Response> {
    _currentReq = req;
    const url = new URL(req.url);
    const reqPath = url.pathname;
    const method = req.method;
    const reqStart = Date.now();

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(req) });
    }

    try {
    return await handleRequestInner(req, url, reqPath, method);
    } catch (err) {
      const classified = classifyError(err);
      logger.error('http', 'unhandled', { path: reqPath, error: String(err) });
      return error(classified.message, 500, classified.class, classified.code);
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

  async function handleRequestInner(_req: Request, _url: URL, reqPath: string, method: string): Promise<Response> {
    const req = _req;

    // Auth check — health and handshake are public, everything else requires token
    const isWrite = method === 'POST';
    const isPublic = reqPath === '/api/health' || reqPath === '/api/handshake';
    if (!checkAuth(req, isWrite) && !isPublic) {
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
      const body = await req.json() as OpenCaseRequest;
      if (!body.signal) return error('signal is required');
      const result = await provider.openCase(body);
      provider.invalidate();
      writeTokenFile();
      ensureStructuredWatcher();
      broadcast({ type: 'case:updated', data: result.case });
      return json(result, 201);
    }

    if (method === 'POST' && reqPath === '/api/evidence/attach') {
      const attachment = await req.json() as EvidenceAttachment;
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
      const body = await req.json() as ExecutePackRequest;
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
      const body = await req.json() as ExecuteTargetRequest;
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
      // Caller must prove filesystem access by providing the bridge token
      const body = await req.json() as { token?: string };
      const providedToken = body.token;
      if (!providedToken || providedToken !== sessionToken) {
        return error('Invalid or missing token — read .bridge-token file', 401, 'auth', 'AUTH_INVALID_TOKEN');
      }
      return json({ authenticated: true, version: VERSION });
    }

    if (method === 'POST' && reqPath === '/api/certification/capture') {
      const body = await req.json() as CertificationCaptureRequest;
      if (!body.vendorId || !body.pageUrl || !body.rawHtml) {
        return error('vendorId, pageUrl, and rawHtml are required');
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
      const body = await req.json() as CertificationPrerequisiteRequest;
      if (!body.vendorId) {
        return error('vendorId is required');
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
      const campaignId = decodeURIComponent(campaignDetailMatch[1] ?? '');
      const campaign = readCertificationCampaign(cfg.projectRoot, campaignId);
      if (!campaign) return error('Unknown certification campaign', 404);
      return json({ campaign });
    }

    const replayMatch = reqPath.match(/^\/api\/certification\/campaigns\/([^/]+)\/replay$/);
    if (method === 'POST' && replayMatch) {
      const campaignId = decodeURIComponent(replayMatch[1] ?? '');
      const body = await req.json().catch(() => ({})) as { comparedAgainst?: 'captured' | 'approved_baseline' };
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
      const campaignId = decodeURIComponent(runtimePreviewMatch[1] ?? '');
      const campaign = readCertificationCampaign(cfg.projectRoot, campaignId);
      if (!campaign) return error('Unknown certification campaign', 404);
      const body = await req.json().catch(() => ({})) as CertificationCampaignRuntimeRequest;
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
      const campaignId = decodeURIComponent(runtimeExecuteMatch[1] ?? '');
      const campaign = readCertificationCampaign(cfg.projectRoot, campaignId);
      if (!campaign) return error('Unknown certification campaign', 404);
      const body = await req.json().catch(() => ({})) as CertificationCampaignRuntimeRequest;
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
      const campaignId = decodeURIComponent(reviewMatch[1] ?? '');
      const body = await req.json() as CertificationCampaignReviewRequest;
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
      const campaignId = decodeURIComponent(submitMatch[1] ?? '');
      const body = await req.json() as CertificationCampaignSubmitRequest;
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
      const campaignId = decodeURIComponent(promoteMatch[1] ?? '');
      const body = await req.json() as CertificationCampaignPromotionRequest;
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
      if (new URL(req.url).pathname === '/ws') {
        if (!checkWsAuth(req)) {
          return new Response('Unauthorized — provide bridge token', { status: 401 });
        }
        const lastSeqStr = new URL(req.url).searchParams.get('last_seq');
        const lastSeq = lastSeqStr ? parseInt(lastSeqStr, 10) : undefined;
        if (server.upgrade(req, { data: { lastSeq } } as any)) return undefined as unknown as Response;
        return new Response('WebSocket upgrade failed', { status: 400 });
      }
      return handleRequest(req);
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
  console.log(`  Token: ${sessionToken}`);
  console.log(`  WS: ws://${cfg.host}:${cfg.port}/ws`);

  return {
    stop: () => {
      clearInterval(heartbeatTimer);
      subprocessHealth.stop();
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
  const extracted = campaign.captureExpected?.context && typeof campaign.captureExpected.context === 'object'
    ? campaign.captureExpected.context as Record<string, unknown>
    : {};

  return {
    vendorId: campaign.vendorId,
    consoleName: `${campaign.vendorId} certification capture`,
    pageUrl: campaign.pageUrl,
    pageTitle: campaign.pageTitle,
    extracted,
    capturedAt: campaign.capturedAt,
  };
}
