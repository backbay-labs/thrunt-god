/**
 * McpBridgeService -- domain service for MCP enrichment, coverage analysis,
 * decision logging, and learning logging.
 *
 * Shell created in Plan 79-01. Logic moved from WorkspaceService in Plan 79-02.
 */

import type { VaultAdapter } from '../vault-adapter';
import type { EventBus } from './event-bus';
import type { McpClient } from '../mcp-client';

export class McpBridgeService {
  constructor(
    private vaultAdapter: VaultAdapter,
    private getPlanningDir: () => string,
    private mcpClient?: McpClient,
    private eventBus?: EventBus,
  ) {}

  /** Implemented in Plan 79-02 */
  async enrichFromMcp(notePath: string): Promise<{ success: boolean; message: string }> {
    throw new Error('Not implemented');
  }

  /** Implemented in Plan 79-02 */
  async analyzeCoverage(): Promise<{ success: boolean; message: string }> {
    throw new Error('Not implemented');
  }

  /** Implemented in Plan 79-02 */
  async logDecision(notePath: string, decision: string, rationale: string): Promise<{ success: boolean; message: string }> {
    throw new Error('Not implemented');
  }

  /** Implemented in Plan 79-02 */
  async logLearning(topic: string, learning: string): Promise<{ success: boolean; message: string }> {
    throw new Error('Not implemented');
  }
}
