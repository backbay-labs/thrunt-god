/**
 * @thrunt-surfaces/sdk — Typed HTTP + WebSocket client for the surface bridge.
 */

import type {
  BridgeHealthResponse,
  CaseResponse,
  ProgressResponse,
  HypothesesResponse,
  QueriesResponse,
  ReceiptsResponse,
  FindingsResponse,
  CaseViewResponse,
  AttachEvidenceResponse,
  ExecuteResponse,
  OpenCaseRequest,
  ExecutePackRequest,
  ExecuteTargetRequest,
  BridgeEvent,
  EvidenceAttachment,
  CertificationCampaignListResponse,
  CertificationCampaignHistoryResponse,
  CertificationDriftTrendResponse,
  CertificationBaselineListResponse,
  CertificationFreshnessResponse,
  CertificationBaselineChurnResponse,
  CertificationCampaignResponse,
  CertificationCaptureRequest,
  CertificationCaptureResponse,
  CertificationPrerequisiteRequest,
  CertificationPrerequisiteResponse,
  CertificationCampaignReplayRequest,
  CertificationCampaignMutationResponse,
  CertificationCampaignSubmitRequest,
  CertificationCampaignReviewRequest,
  CertificationCampaignPromotionRequest,
} from '@thrunt-surfaces/contracts';

export interface SurfaceClientOptions {
  baseUrl?: string;
  /** Override for testing — inject a custom fetch */
  fetch?: typeof globalThis.fetch;
}

export class SurfaceClient {
  private readonly baseUrl: string;
  private readonly _fetch: typeof globalThis.fetch;

  constructor(options: SurfaceClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://127.0.0.1:7483';
    this._fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this._fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      throw new SurfaceBridgeError(res.status, await res.text());
    }
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await this._fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new SurfaceBridgeError(res.status, await res.text());
    }
    return res.json() as Promise<T>;
  }

  // --- Read operations ---

  health(): Promise<BridgeHealthResponse> {
    return this.get('/api/health');
  }

  getCase(): Promise<CaseResponse> {
    return this.get('/api/case');
  }

  getProgress(): Promise<ProgressResponse> {
    return this.get('/api/case/progress');
  }

  getHypotheses(): Promise<HypothesesResponse> {
    return this.get('/api/case/hypotheses');
  }

  getQueries(): Promise<QueriesResponse> {
    return this.get('/api/case/queries');
  }

  getReceipts(): Promise<ReceiptsResponse> {
    return this.get('/api/case/receipts');
  }

  getFindings(): Promise<FindingsResponse> {
    return this.get('/api/case/findings');
  }

  getCaseView(): Promise<CaseViewResponse> {
    return this.get('/api/case/view');
  }

  // --- Write operations ---

  openCase(request: OpenCaseRequest): Promise<CaseResponse> {
    return this.post('/api/case/open', request);
  }

  attachEvidence(attachment: EvidenceAttachment): Promise<AttachEvidenceResponse> {
    return this.post('/api/evidence/attach', attachment);
  }

  executePack(request: ExecutePackRequest): Promise<ExecuteResponse> {
    return this.post('/api/execute/pack', request);
  }

  executeTarget(request: ExecuteTargetRequest): Promise<ExecuteResponse> {
    return this.post('/api/execute/target', request);
  }

  executeNext(): Promise<ExecuteResponse> {
    return this.post('/api/execute/next');
  }

  // --- Certification read operations ---

  getCertificationCampaigns(): Promise<CertificationCampaignListResponse> {
    return this.get('/api/certification/campaigns');
  }

  getCertificationHistory(): Promise<CertificationCampaignHistoryResponse> {
    return this.get('/api/certification/history');
  }

  getCertificationDriftTrends(): Promise<CertificationDriftTrendResponse> {
    return this.get('/api/certification/drift-trends');
  }

  getCertificationBaselines(): Promise<CertificationBaselineListResponse> {
    return this.get('/api/certification/baselines');
  }

  getCertificationFreshness(): Promise<CertificationFreshnessResponse> {
    return this.get('/api/certification/freshness');
  }

  getCertificationChurn(): Promise<CertificationBaselineChurnResponse> {
    return this.get('/api/certification/churn');
  }

  getCertificationCampaign(campaignId: string): Promise<CertificationCampaignResponse> {
    return this.get(`/api/certification/campaigns/${encodeURIComponent(campaignId)}`);
  }

  // --- Certification write operations ---

  captureCertification(request: CertificationCaptureRequest): Promise<CertificationCaptureResponse> {
    return this.post('/api/certification/capture', request);
  }

  checkCertificationPrerequisites(request: CertificationPrerequisiteRequest): Promise<CertificationPrerequisiteResponse> {
    return this.post('/api/certification/prerequisites', request);
  }

  replayCampaign(campaignId: string, request?: CertificationCampaignReplayRequest): Promise<CertificationCampaignMutationResponse> {
    return this.post(`/api/certification/campaigns/${encodeURIComponent(campaignId)}/replay`, request);
  }

  submitCampaignForReview(campaignId: string, request: CertificationCampaignSubmitRequest): Promise<CertificationCampaignMutationResponse> {
    return this.post(`/api/certification/campaigns/${encodeURIComponent(campaignId)}/submit`, request);
  }

  reviewCampaign(campaignId: string, request: CertificationCampaignReviewRequest): Promise<CertificationCampaignMutationResponse> {
    return this.post(`/api/certification/campaigns/${encodeURIComponent(campaignId)}/review`, request);
  }

  promoteCampaign(campaignId: string, request: CertificationCampaignPromotionRequest): Promise<CertificationCampaignMutationResponse> {
    return this.post(`/api/certification/campaigns/${encodeURIComponent(campaignId)}/promote`, request);
  }

  // --- WebSocket subscription ---

  subscribe(onEvent: (event: BridgeEvent) => void, onError?: (error: Error) => void): () => void {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/ws';
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as BridgeEvent;
        onEvent(parsed);
      } catch (err) {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    };

    ws.onerror = (event) => {
      onError?.(new Error(`WebSocket error: ${String(event)}`));
    };

    return () => {
      ws.close();
    };
  }
}

export class SurfaceBridgeError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Bridge error ${status}: ${body}`);
    this.name = 'SurfaceBridgeError';
  }
}
