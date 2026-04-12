/**
 * JournalService -- stub service for hunt journal engine.
 *
 * Stub created in Plan 79-01. Real implementation in Phase 89 (Hunt Journal Engine).
 */

import type { VaultAdapter } from '../vault-adapter';
import type { EventBus } from './event-bus';

/** Stub service -- real implementation in Phase 89 (Hunt Journal Engine) */
export class JournalService {
  constructor(
    private vaultAdapter: VaultAdapter,
    private eventBus?: EventBus,
  ) {}
}
