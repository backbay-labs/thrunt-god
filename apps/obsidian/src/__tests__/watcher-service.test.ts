import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WatcherService } from '../services/watcher-service';
import { EventBus } from '../services/event-bus';
import type { VaultAdapter } from '../vault-adapter';
import type { IntelligenceService } from '../services/intelligence-service';
import type { IngestionResult } from '../types';

// --- Mock VaultAdapter ---
function createMockVaultAdapter(): VaultAdapter {
  return {
    fileExists: vi.fn().mockReturnValue(false),
    folderExists: vi.fn().mockReturnValue(false),
    readFile: vi.fn().mockResolvedValue(''),
    createFile: vi.fn().mockResolvedValue(undefined),
    ensureFolder: vi.fn().mockResolvedValue(undefined),
    getFile: vi.fn().mockReturnValue(null),
    listFolders: vi.fn().mockResolvedValue([]),
    listFiles: vi.fn().mockResolvedValue([]),
    modifyFile: vi.fn().mockResolvedValue(undefined),
    getFileMtime: vi.fn().mockReturnValue(null),
  };
}

// --- Mock IntelligenceService ---
function createMockIntelligenceService(result?: IngestionResult): IntelligenceService {
  const defaultResult: IngestionResult = {
    created: 2,
    updated: 1,
    skipped: 0,
    entities: [],
    timestamp: new Date().toISOString(),
  };
  return {
    runIngestion: vi.fn().mockResolvedValue(result ?? defaultResult),
  } as unknown as IntelligenceService;
}

describe('WatcherService', () => {
  let vaultAdapter: VaultAdapter;
  let eventBus: EventBus;
  let intelligenceService: ReturnType<typeof createMockIntelligenceService>;
  let watcher: WatcherService;
  const getPlanningDir = () => '.planning';

  beforeEach(() => {
    vaultAdapter = createMockVaultAdapter();
    eventBus = new EventBus();
    intelligenceService = createMockIntelligenceService();
    watcher = new WatcherService(
      vaultAdapter,
      getPlanningDir,
      intelligenceService,
      eventBus,
    );
  });

  // --- isAutoIngestTarget ---
  describe('isAutoIngestTarget', () => {
    it('returns true for RECEIPTS/RCT-*.md', () => {
      expect(watcher.isAutoIngestTarget('.planning/RECEIPTS/RCT-20260412-001.md')).toBe(true);
    });

    it('returns true for QUERIES/QRY-*.md', () => {
      expect(watcher.isAutoIngestTarget('.planning/QUERIES/QRY-20260412-001.md')).toBe(true);
    });

    it('returns true for any RCT- prefix', () => {
      expect(watcher.isAutoIngestTarget('.planning/RECEIPTS/RCT-abc.md')).toBe(true);
    });

    it('returns false for wrong directory', () => {
      expect(watcher.isAutoIngestTarget('.planning/entities/actors/APT29.md')).toBe(false);
    });

    it('returns false for non-RCT prefix in RECEIPTS', () => {
      expect(watcher.isAutoIngestTarget('.planning/RECEIPTS/README.md')).toBe(false);
    });

    it('returns false for non-QRY prefix in QUERIES', () => {
      expect(watcher.isAutoIngestTarget('.planning/QUERIES/README.md')).toBe(false);
    });

    it('returns false for wrong base directory', () => {
      expect(watcher.isAutoIngestTarget('other/RECEIPTS/RCT-001.md')).toBe(false);
    });
  });

  // --- handleAutoIngest ---
  describe('handleAutoIngest', () => {
    it('calls intelligenceService.runIngestion() exactly once', async () => {
      await watcher.handleAutoIngest();
      expect(intelligenceService.runIngestion).toHaveBeenCalledTimes(1);
    });

    it('updates lastActivityTimestamp to current time', async () => {
      const before = Date.now();
      await watcher.handleAutoIngest();
      const after = Date.now();
      const ts = watcher.getLastActivityTimestamp();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('emits ingestion:complete event via EventBus with result counts', async () => {
      const received: Array<{ created: number; updated: number; skipped: number }> = [];
      eventBus.on('ingestion:complete', (data) => {
        received.push(data);
      });

      await watcher.handleAutoIngest();

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ created: 2, updated: 1, skipped: 0 });
    });

    it('returns the IngestionResult from runIngestion', async () => {
      const result = await watcher.handleAutoIngest();
      expect(result.created).toBe(2);
      expect(result.updated).toBe(1);
      expect(result.skipped).toBe(0);
    });
  });

  // --- recordActivity / getLastActivityTimestamp / getRecentArtifactCount / resetActivity ---
  describe('recordActivity', () => {
    it('updates lastActivityTimestamp', () => {
      const before = Date.now();
      watcher.recordActivity();
      const after = Date.now();
      const ts = watcher.getLastActivityTimestamp();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    it('getLastActivityTimestamp returns 0 initially', () => {
      const fresh = new WatcherService(
        vaultAdapter,
        getPlanningDir,
        intelligenceService,
        eventBus,
      );
      expect(fresh.getLastActivityTimestamp()).toBe(0);
    });

    it('getRecentArtifactCount increments on each recordActivity call', () => {
      watcher.recordActivity();
      watcher.recordActivity();
      watcher.recordActivity();
      expect(watcher.getRecentArtifactCount()).toBe(3);
    });

    it('resetActivity resets counter and timestamp to 0', () => {
      watcher.recordActivity();
      watcher.recordActivity();
      expect(watcher.getRecentArtifactCount()).toBeGreaterThan(0);
      expect(watcher.getLastActivityTimestamp()).toBeGreaterThan(0);

      watcher.resetActivity();
      expect(watcher.getRecentArtifactCount()).toBe(0);
      expect(watcher.getLastActivityTimestamp()).toBe(0);
    });
  });
});
