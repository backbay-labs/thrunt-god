/**
 * Bridge client for the browser extension background worker.
 *
 * Owns handshake recovery, token-authenticated fetches, and reconnecting
 * WebSocket subscriptions for local dogfooding.
 */

import type {
  AttachEvidenceResponse,
  BridgeEvent,
  BridgeHealthResponse,
  CaseViewResponse,
  CertificationCaptureRequest,
  CertificationCaptureResponse,
  EvidenceAttachment,
  ExecutePackRequest,
  ExecuteResponse,
  OpenCaseRequest,
  OpenCaseResponse,
} from '@thrunt-surfaces/contracts';
import { mockCaseViewModel, mockBridgeHealth } from '@thrunt-surfaces/mocks';

const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:7483';

export type BridgeStatus = 'connected' | 'mock' | 'disconnected' | 'handshake_pending' | 'reconnecting';

interface BridgeClientOptions {
  reconnectInitialMs?: number;
  reconnectMaxMs?: number;
  heartbeatTimeoutMs?: number;
}

export class ExtensionBridgeClient {
  private bridgeUrl: string;
  private token: string | null = null;
  private status: BridgeStatus = 'disconnected';
  private websocket: WebSocket | null = null;
  private unsubscribe: (() => void) | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatMonitor: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private keepWsAlive = false;
  private onEvent: ((event: BridgeEvent) => void) | null = null;
  private lastHeartbeatAt = 0;
  private readonly reconnectInitialMs: number;
  private readonly reconnectMaxMs: number;
  private readonly heartbeatTimeoutMs: number;

  constructor(bridgeUrl = DEFAULT_BRIDGE_URL, options: BridgeClientOptions = {}) {
    this.bridgeUrl = bridgeUrl;
    this.reconnectInitialMs = options.reconnectInitialMs ?? 250;
    this.reconnectMaxMs = options.reconnectMaxMs ?? 5_000;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 15_000;
  }

  getStatus(): BridgeStatus { return this.status; }
  isConnected(): boolean { return this.status === 'connected'; }
  isMockMode(): boolean { return this.status === 'mock'; }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['X-Bridge-Token'] = this.token;
    return headers;
  }

  private async fetchWithAuth(input: string, init: RequestInit = {}, retryOnAuth = true): Promise<Response> {
    if (!this.token) {
      const ok = await this.handshake();
      if (!ok || !this.token) {
        throw new Error('Bridge handshake failed');
      }
    }

    try {
      const res = await fetch(input, {
        ...init,
        headers: {
          ...this.authHeaders(),
          ...(init.headers ?? {}),
        },
      });

      if (res.status === 401 && retryOnAuth) {
        this.token = null;
        const ok = await this.handshake();
        if (!ok) {
          throw new Error('Bridge token expired and re-handshake failed');
        }
        return this.fetchWithAuth(input, init, false);
      }

      return res;
    } catch (error) {
      this.status = 'disconnected';
      this.token = null;
      throw error;
    }
  }

  /** Perform handshake with bridge to obtain a session token. */
  async handshake(): Promise<boolean> {
    this.status = 'handshake_pending';
    try {
      const res = await fetch(`${this.bridgeUrl}/api/handshake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extensionId: 'thrunt-surfaces-extension', surfaceId: 'browser-extension' }),
      });
      if (!res.ok) {
        this.status = 'disconnected';
        this.token = null;
        return false;
      }
      const body = await res.json() as { token: string };
      this.token = body.token;
      this.status = 'connected';
      return true;
    } catch {
      this.status = 'disconnected';
      this.token = null;
      return false;
    }
  }

  async checkHealth(): Promise<BridgeHealthResponse> {
    try {
      const res = await fetch(`${this.bridgeUrl}/api/health`);
      if (!res.ok) throw new Error(`Bridge returned ${res.status}`);
      const health = await res.json() as BridgeHealthResponse;

      if (!health.mockMode && !this.token) {
        await this.handshake();
      }

      this.status = health.mockMode ? 'mock' : (this.token ? 'connected' : 'disconnected');
      return health;
    } catch {
      this.status = 'disconnected';
      this.token = null;
      return { ...mockBridgeHealth, status: 'error' as BridgeHealthResponse['status'] };
    }
  }

  async getCaseView(): Promise<CaseViewResponse> {
    try {
      const res = await this.fetchWithAuth(`${this.bridgeUrl}/api/case/view`);
      if (!res.ok) throw new Error(`Bridge error: ${res.status}`);
      const body = await res.json() as CaseViewResponse;
      this.status = 'connected';
      return body;
    } catch {
      return { view: mockCaseViewModel };
    }
  }

  async openCase(request: OpenCaseRequest): Promise<OpenCaseResponse> {
    const res = await this.fetchWithAuth(`${this.bridgeUrl}/api/case/open`, {
      method: 'POST',
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      throw new Error(`Bridge error: ${res.status}`);
    }
    return await res.json() as OpenCaseResponse;
  }

  async attachEvidence(attachment: EvidenceAttachment): Promise<AttachEvidenceResponse> {
    try {
      const res = await this.fetchWithAuth(`${this.bridgeUrl}/api/evidence/attach`, {
        method: 'POST',
        body: JSON.stringify(attachment),
      });
      if (!res.ok) {
        return { success: false, attachmentId: '', message: `Bridge error: ${res.status}` };
      }
      return await res.json() as AttachEvidenceResponse;
    } catch (error) {
      return { success: false, attachmentId: '', message: error instanceof Error ? error.message : 'Bridge not connected' };
    }
  }

  async executeNext(): Promise<ExecuteResponse> {
    try {
      const res = await this.fetchWithAuth(`${this.bridgeUrl}/api/execute/next`, {
        method: 'POST',
      });
      if (!res.ok) {
        return { success: false, executionId: '', message: `Bridge error: ${res.status}` };
      }
      return await res.json() as ExecuteResponse;
    } catch (error) {
      return { success: false, executionId: '', message: error instanceof Error ? error.message : 'Bridge not connected' };
    }
  }

  async executePack(request: ExecutePackRequest): Promise<ExecuteResponse> {
    try {
      const res = await this.fetchWithAuth(`${this.bridgeUrl}/api/execute/pack`, {
        method: 'POST',
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        return { success: false, executionId: '', message: `Bridge error: ${res.status}` };
      }
      return await res.json() as ExecuteResponse;
    } catch (error) {
      return { success: false, executionId: '', message: error instanceof Error ? error.message : 'Bridge not connected' };
    }
  }

  async captureCertificationSnapshot(request: CertificationCaptureRequest): Promise<CertificationCaptureResponse> {
    try {
      const res = await this.fetchWithAuth(`${this.bridgeUrl}/api/certification/capture`, {
        method: 'POST',
        body: JSON.stringify(request),
      });
      if (!res.ok) {
        return {
          success: false,
          campaignId: '',
          snapshotId: '',
          message: `Bridge error: ${res.status}`,
          campaignPath: '',
          snapshotPath: '',
          metadataPath: '',
          redactionCount: 0,
          campaign: null,
        };
      }
      return await res.json() as CertificationCaptureResponse;
    } catch (error) {
      return {
        success: false,
        campaignId: '',
        snapshotId: '',
        message: error instanceof Error ? error.message : 'Bridge not connected',
        campaignPath: '',
        snapshotPath: '',
        metadataPath: '',
        redactionCount: 0,
        campaign: null,
      };
    }
  }

  subscribeEvents(onEvent: (event: BridgeEvent) => void): () => void {
    if (this.unsubscribe) this.unsubscribe();

    this.onEvent = onEvent;
    this.keepWsAlive = true;
    this.reconnectAttempt = 0;
    void this.connectWebSocket();

    this.unsubscribe = () => {
      this.keepWsAlive = false;
      this.onEvent = null;
      this.clearReconnectTimer();
      this.clearHeartbeatMonitor();
      try { this.websocket?.close(); } catch {}
      this.websocket = null;
    };
    return this.unsubscribe;
  }

  private async connectWebSocket(): Promise<void> {
    if (!this.keepWsAlive) return;

    const ok = this.token ? true : await this.handshake();
    if (!ok || !this.token) {
      this.scheduleReconnect();
      return;
    }

    try {
      const wsUrl = this.bridgeUrl.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(this.token)}`;
      const ws = new WebSocket(wsUrl);
      this.websocket = ws;

      ws.onopen = () => {
        this.status = 'connected';
        this.reconnectAttempt = 0;
        this.lastHeartbeatAt = Date.now();
        this.startHeartbeatMonitor();
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data)) as BridgeEvent;
          if (parsed.type === 'bridge:heartbeat') {
            this.lastHeartbeatAt = Date.now();
          }
          this.onEvent?.(parsed);
        } catch {
          // Ignore malformed bridge events.
        }
      };

      ws.onerror = () => {
        this.scheduleReconnect();
      };

      ws.onclose = () => {
        this.scheduleReconnect();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.keepWsAlive) return;
    this.clearHeartbeatMonitor();

    try { this.websocket?.close(); } catch {}
    this.websocket = null;
    this.status = 'reconnecting';

    this.clearReconnectTimer();
    const delay = Math.min(this.reconnectInitialMs * (2 ** this.reconnectAttempt), this.reconnectMaxMs);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      void (async () => {
        this.token = null;
        await this.handshake();
        await this.connectWebSocket();
      })();
    }, delay);
  }

  private startHeartbeatMonitor(): void {
    this.clearHeartbeatMonitor();
    this.heartbeatMonitor = setInterval(() => {
      if (!this.keepWsAlive) return;
      if (this.lastHeartbeatAt && Date.now() - this.lastHeartbeatAt <= this.heartbeatTimeoutMs) {
        return;
      }
      this.scheduleReconnect();
    }, Math.max(250, Math.floor(this.heartbeatTimeoutMs / 3)));
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearHeartbeatMonitor(): void {
    if (!this.heartbeatMonitor) return;
    clearInterval(this.heartbeatMonitor);
    this.heartbeatMonitor = null;
  }
}
