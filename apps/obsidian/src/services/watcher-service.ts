/**
 * WatcherService -- stub service for filesystem watcher integration.
 *
 * Stub created in Plan 79-01. Real implementation in Phase 87 (Filesystem Watcher + Hunt Pulse).
 */

import type { VaultAdapter } from '../vault-adapter';
import type { EventBus } from './event-bus';

/** Stub service -- real implementation in Phase 87 (Filesystem Watcher + Hunt Pulse) */
export class WatcherService {
  constructor(
    private vaultAdapter: VaultAdapter,
    private eventBus?: EventBus,
  ) {}
}
