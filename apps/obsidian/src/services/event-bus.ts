/**
 * Typed EventBus for inter-service communication.
 *
 * Synchronous, in-process event emitter with compile-time type safety.
 * Used by domain services to communicate without direct coupling.
 *
 * Pure TypeScript -- NO Obsidian imports.
 */

// --- Event type map ---

export type EventMap = {
  'cache:invalidated': void;
  'entity:created': { name: string; entityType: string; sourcePath: string };
  'entity:modified': { path: string };
  'ingestion:complete': { created: number; updated: number; skipped: number };
  'canvas:generated': { canvasPath: string };
  'canvas:refreshed': { canvasPath: string; changedCount: number };
  'watcher:activity': { artifactCount: number; lastTimestamp: number };
  'verdict:set': { path: string; verdict: string; entityName: string };
};

// --- Handler type ---

type EventHandler<T> = T extends void ? () => void : (data: T) => void;

// --- EventBus class ---

export class EventBus {
  private handlers = new Map<string, Set<Function>>();

  on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit<K extends keyof EventMap>(
    event: K,
    ...args: EventMap[K] extends void ? [] : [EventMap[K]]
  ): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(...args);
      }
    }
  }

  removeAllListeners(): void {
    this.handlers.clear();
  }
}
