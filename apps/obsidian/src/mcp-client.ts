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

// Placeholder -- implementations will be added in GREEN phase
