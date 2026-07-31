import type { McpConnectionStatus, McpHealthResponse, McpToolResult } from './types';

/**
 * MCP client interface -- adapter layer for communicating with the THRUNT MCP server.
 * Follows the VaultAdapter pattern: interface + production implementation + test stub.
 */
export interface McpClient {
  getStatus(): McpConnectionStatus;
  isConnected(): boolean;
  connect(): Promise<void>;
  disconnect(): void;
  checkHealth(): Promise<McpHealthResponse | null>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult | null>;
}

// ---------------------------------------------------------------------------
// Request function type -- compatible with Obsidian's requestUrl signature
// ---------------------------------------------------------------------------

export type McpRequestFn = (opts: {
  url: string;
  method: string;
  body?: string;
  headers?: Record<string, string>;
}) => Promise<{ status: number; text: string }>;

// ---------------------------------------------------------------------------
// HttpMcpClient -- production implementation using injectable requestFn
// ---------------------------------------------------------------------------

export class HttpMcpClient implements McpClient {
  private status: McpConnectionStatus = 'disconnected';

  constructor(
    private getSettings: () => { mcpServerUrl: string; mcpEnabled: boolean },
    private requestFn: McpRequestFn,
  ) {}

  getStatus(): McpConnectionStatus {
    if (!this.getSettings().mcpEnabled) return 'disabled';
    return this.status;
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }

  async connect(): Promise<void> {
    try {
      const { mcpServerUrl } = this.getSettings();
      const response = await this.requestFn({
        url: `${mcpServerUrl}/health`,
        method: 'GET',
      });
      const data = JSON.parse(response.text) as McpHealthResponse;
      this.status = data.status === 'healthy' ? 'connected' : 'error';
    } catch {
      this.status = 'error';
    }
  }

  disconnect(): void {
    this.status = 'disconnected';
  }

  async checkHealth(): Promise<McpHealthResponse | null> {
    if (!this.isConnected()) return null;
    try {
      const { mcpServerUrl } = this.getSettings();
      const response = await this.requestFn({
        url: `${mcpServerUrl}/health`,
        method: 'GET',
      });
      return JSON.parse(response.text) as McpHealthResponse;
    } catch {
      return null;
    }
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult | null> {
    if (!this.isConnected()) return null;
    try {
      const { mcpServerUrl } = this.getSettings();
      const response = await this.requestFn({
        url: `${mcpServerUrl}/tool`,
        method: 'POST',
        body: JSON.stringify({ name, args }),
        headers: { 'Content-Type': 'application/json' },
      });
      return JSON.parse(response.text) as McpToolResult;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// StubMcpClient -- configurable test double for downstream use
// ---------------------------------------------------------------------------

export class StubMcpClient implements McpClient {
  private status: McpConnectionStatus = 'disconnected';
  private healthResponse: McpHealthResponse | null = null;
  private toolResponse: McpToolResult | null = null;

  /** Record of callTool invocations for test assertions. */
  callHistory: Array<{ name: string; args: Record<string, unknown> }> = [];

  setHealthResponse(response: McpHealthResponse): void {
    this.healthResponse = response;
  }

  setToolResponse(response: McpToolResult): void {
    this.toolResponse = response;
  }

  getStatus(): McpConnectionStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }

  async connect(): Promise<void> {
    if (this.healthResponse && this.healthResponse.status === 'healthy') {
      this.status = 'connected';
    } else {
      this.status = 'error';
    }
  }

  disconnect(): void {
    this.status = 'disconnected';
  }

  async checkHealth(): Promise<McpHealthResponse | null> {
    if (!this.isConnected()) return null;
    return this.healthResponse;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult | null> {
    if (!this.isConnected()) return null;
    this.callHistory.push({ name, args });
    return this.toolResponse;
  }
}
