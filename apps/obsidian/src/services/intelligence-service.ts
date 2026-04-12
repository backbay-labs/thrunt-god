/**
 * IntelligenceService -- domain service for cross-hunt intelligence,
 * entity scanning, ingestion, and knowledge dashboard generation.
 *
 * Shell created in Plan 79-01. Logic moved from WorkspaceService in Plan 79-02.
 */

import type { VaultAdapter } from '../vault-adapter';
import type { EventBus } from './event-bus';
import type { IngestionResult } from '../types';

export class IntelligenceService {
  constructor(
    private vaultAdapter: VaultAdapter,
    private getPlanningDir: () => string,
    private eventBus?: EventBus,
  ) {}

  /** Implemented in Plan 79-02 */
  async runIngestion(): Promise<IngestionResult> {
    throw new Error('Not implemented');
  }

  /** Implemented in Plan 79-02 */
  async crossHuntIntel(): Promise<{ success: boolean; message: string; reportPath?: string }> {
    throw new Error('Not implemented');
  }

  /** Implemented in Plan 79-02 */
  async compareHuntsReport(huntAPath: string, huntBPath: string): Promise<{ success: boolean; message: string; reportPath?: string }> {
    throw new Error('Not implemented');
  }

  /** Implemented in Plan 79-02 */
  async generateKnowledgeDashboard(): Promise<{ success: boolean; message: string; canvasPath?: string }> {
    throw new Error('Not implemented');
  }
}
