/**
 * WatcherService -- filesystem watcher integration for auto-ingestion and hunt pulse.
 *
 * Detects new receipts (RCT-*.md) and queries (QRY-*.md) in the planning directory,
 * delegates ingestion to IntelligenceService, and tracks activity for hunt pulse display.
 *
 * Stub created in Plan 79-01. Real implementation in Phase 87 (Plan 87-01).
 */

import type { VaultAdapter } from '../vault-adapter';
import type { EventBus } from './event-bus';
import type { IntelligenceService } from './intelligence-service';
import type { IngestionResult } from '../types';

export class WatcherService {
  private lastActivityTimestamp = 0;
  private recentArtifactCount = 0;

  constructor(
    private vaultAdapter: VaultAdapter,
    private getPlanningDir: () => string,
    private intelligenceService: IntelligenceService,
    private eventBus?: EventBus,
  ) {}

  /**
   * Check whether a file path is an auto-ingest target.
   *
   * Scoped to RECEIPTS/RCT-*.md and QUERIES/QRY-*.md under the planning directory.
   */
  isAutoIngestTarget(filePath: string): boolean {
    const planningDir = this.getPlanningDir();

    if (!filePath.endsWith('.md')) return false;
    if (!filePath.startsWith(planningDir + '/')) return false;

    const relative = filePath.slice(planningDir.length + 1);

    if (relative.startsWith('RECEIPTS/RCT-')) return true;
    if (relative.startsWith('QUERIES/QRY-')) return true;

    return false;
  }

  /**
   * Run auto-ingestion via IntelligenceService and update activity tracking.
   *
   * Emits ingestion:complete via EventBus with result counts.
   */
  async handleAutoIngest(): Promise<IngestionResult> {
    const result = await this.intelligenceService.runIngestion();

    this.lastActivityTimestamp = Date.now();
    this.recentArtifactCount += result.created + result.updated;

    this.eventBus?.emit('ingestion:complete', {
      created: result.created,
      updated: result.updated,
      skipped: result.skipped,
    });

    return result;
  }

  /**
   * Record a manual activity event (e.g. vault file change detected).
   * Updates timestamp and increments artifact counter.
   */
  recordActivity(): void {
    this.lastActivityTimestamp = Date.now();
    this.recentArtifactCount++;
  }

  /** Get the timestamp of the last recorded activity (0 = never). */
  getLastActivityTimestamp(): number {
    return this.lastActivityTimestamp;
  }

  /** Get the number of artifacts tracked since last reset. */
  getRecentArtifactCount(): number {
    return this.recentArtifactCount;
  }

  /** Reset activity tracking state to zero. */
  resetActivity(): void {
    this.lastActivityTimestamp = 0;
    this.recentArtifactCount = 0;
  }
}
