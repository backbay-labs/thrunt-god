/**
 * CanvasService -- domain service for Obsidian Canvas generation
 * (hunt canvases, current-hunt canvases).
 *
 * Shell created in Plan 79-01. Logic moved from WorkspaceService in Plan 79-02.
 */

import type { VaultAdapter } from '../vault-adapter';
import type { EventBus } from './event-bus';

export class CanvasService {
  constructor(
    private vaultAdapter: VaultAdapter,
    private getPlanningDir: () => string,
    private eventBus?: EventBus,
  ) {}

  /** Implemented in Plan 79-02 */
  async generateHuntCanvas(templateName: string): Promise<{ success: boolean; message: string; canvasPath?: string }> {
    throw new Error('Not implemented');
  }

  /** Implemented in Plan 79-02 */
  async canvasFromCurrentHunt(templateName: string): Promise<{ success: boolean; message: string; canvasPath?: string }> {
    throw new Error('Not implemented');
  }
}
