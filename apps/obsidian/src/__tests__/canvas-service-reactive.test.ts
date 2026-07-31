import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasService } from '../services/canvas-service';
import { EventBus } from '../services/event-bus';
import type { VaultAdapter } from '../vault-adapter';
import type { CanvasData } from '../types';

// --- Test helpers ---

function makeEntityContent(type: string): string {
  return `---\ntype: ${type}\nverdict: unknown\n---\n# Entity\n`;
}

function makeCanvasJson(nodes: CanvasData['nodes'], edges: CanvasData['edges'] = []): string {
  return JSON.stringify({ nodes, edges }, null, '\t');
}

function createMockVault(files: Record<string, string> = {}): VaultAdapter {
  return {
    fileExists: vi.fn((path: string) => path in files),
    folderExists: vi.fn((path: string) => {
      return Object.keys(files).some(f => f.startsWith(path + '/'));
    }),
    readFile: vi.fn(async (path: string) => {
      if (!(path in files)) throw new Error(`Not found: ${path}`);
      return files[path]!;
    }),
    createFile: vi.fn(async () => {}),
    modifyFile: vi.fn(async (path: string, content: string) => {
      files[path] = content;
    }),
    listFiles: vi.fn(async (path: string) => {
      return Object.keys(files)
        .filter(f => f.startsWith(path + '/') && !f.slice(path.length + 1).includes('/'))
        .map(f => f.slice(path.length + 1));
    }),
    getFile: vi.fn(() => null),
    ensureFolder: vi.fn(async () => {}),
    listFolders: vi.fn(async () => []),
    getFileMtime: vi.fn(() => null),
  };
}

const PLANNING_DIR = 'THRUNT';

describe('CanvasService reactive methods', () => {
  let vault: VaultAdapter;
  let eventBus: EventBus;
  let service: CanvasService;

  describe('handleEntityModified', () => {
    it('reads entity file, finds .canvas files, and patches matching node color', async () => {
      const entityPath = `${PLANNING_DIR}/entities/iocs/evil-ip.md`;
      const canvasPath = `${PLANNING_DIR}/CANVAS_KILL_CHAIN.canvas`;
      const canvasData: CanvasData = {
        nodes: [
          { id: 'n1', x: 0, y: 0, width: 200, height: 100, type: 'file', file: entityPath, color: '#000000' },
        ],
        edges: [],
      };

      vault = createMockVault({
        [entityPath]: makeEntityContent('ioc/ip'),
        [canvasPath]: JSON.stringify(canvasData),
      });
      eventBus = new EventBus();
      service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

      await service.handleEntityModified(entityPath);

      expect(vault.modifyFile).toHaveBeenCalledTimes(1);
      const written = (vault.modifyFile as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
      const parsed = JSON.parse(written) as CanvasData;
      // Color should be IOC red
      expect(parsed.nodes[0]!.color).toBe('#e53935');
    });

    it('does nothing for non-entity paths', async () => {
      vault = createMockVault({
        [`${PLANNING_DIR}/MISSION.md`]: '---\ntype: mission\n---\n',
      });
      eventBus = new EventBus();
      service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

      await service.handleEntityModified(`${PLANNING_DIR}/MISSION.md`);

      expect(vault.readFile).not.toHaveBeenCalled();
    });

    it('silently skips canvas files with invalid JSON', async () => {
      const entityPath = `${PLANNING_DIR}/entities/ttps/T1059.md`;
      vault = createMockVault({
        [entityPath]: makeEntityContent('ttp'),
        [`${PLANNING_DIR}/BAD.canvas`]: '{not valid json!!!',
      });
      eventBus = new EventBus();
      service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

      // Should not throw
      await expect(service.handleEntityModified(entityPath)).resolves.toBeUndefined();
      expect(vault.modifyFile).not.toHaveBeenCalled();
    });

    it('does not write canvas file if changedCount is 0', async () => {
      const entityPath = `${PLANNING_DIR}/entities/actors/APT29.md`;
      const canvasData: CanvasData = {
        nodes: [
          { id: 'n1', x: 0, y: 0, width: 200, height: 100, type: 'file', file: 'some/other/path.md', color: '#000000' },
        ],
        edges: [],
      };

      vault = createMockVault({
        [entityPath]: makeEntityContent('actor'),
        [`${PLANNING_DIR}/test.canvas`]: JSON.stringify(canvasData),
      });
      eventBus = new EventBus();
      service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

      await service.handleEntityModified(entityPath);

      expect(vault.modifyFile).not.toHaveBeenCalled();
    });

    it('writes canvas JSON with tab indentation', async () => {
      const entityPath = `${PLANNING_DIR}/entities/tools/cobalt-strike.md`;
      const canvasData: CanvasData = {
        nodes: [
          { id: 'n1', x: 100, y: 200, width: 200, height: 100, type: 'file', file: entityPath, color: '#000000' },
        ],
        edges: [],
      };

      vault = createMockVault({
        [entityPath]: makeEntityContent('tool'),
        [`${PLANNING_DIR}/my.canvas`]: JSON.stringify(canvasData),
      });
      eventBus = new EventBus();
      service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

      await service.handleEntityModified(entityPath);

      const written = (vault.modifyFile as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
      // Tab indentation check
      expect(written).toContain('\t"nodes"');
    });

    it('preserves node x, y, width, height when patching color', async () => {
      const entityPath = `${PLANNING_DIR}/entities/iocs/evil-domain.md`;
      const canvasData: CanvasData = {
        nodes: [
          { id: 'n1', x: 42, y: 77, width: 300, height: 150, type: 'file', file: entityPath, color: '#000000' },
        ],
        edges: [{ id: 'e1', fromNode: 'n1', toNode: 'n2' }],
      };

      vault = createMockVault({
        [entityPath]: makeEntityContent('ioc/domain'),
        [`${PLANNING_DIR}/layout.canvas`]: JSON.stringify(canvasData),
      });
      eventBus = new EventBus();
      service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

      await service.handleEntityModified(entityPath);

      const written = (vault.modifyFile as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
      const parsed = JSON.parse(written) as CanvasData;
      expect(parsed.nodes[0]!.x).toBe(42);
      expect(parsed.nodes[0]!.y).toBe(77);
      expect(parsed.nodes[0]!.width).toBe(300);
      expect(parsed.nodes[0]!.height).toBe(150);
      expect(parsed.edges).toHaveLength(1);
    });
  });

  describe('refreshAllCanvasNodes', () => {
    it('patches all entities across all canvas files', async () => {
      const iocPath = `${PLANNING_DIR}/entities/iocs/evil.md`;
      const ttpPath = `${PLANNING_DIR}/entities/ttps/T1059.md`;
      const canvasData: CanvasData = {
        nodes: [
          { id: 'n1', x: 0, y: 0, width: 200, height: 100, type: 'file', file: iocPath, color: '#000000' },
          { id: 'n2', x: 300, y: 0, width: 200, height: 100, type: 'file', file: ttpPath, color: '#000000' },
        ],
        edges: [],
      };

      vault = createMockVault({
        [iocPath]: makeEntityContent('ioc/ip'),
        [ttpPath]: makeEntityContent('ttp'),
        [`${PLANNING_DIR}/hunt.canvas`]: JSON.stringify(canvasData),
      });
      eventBus = new EventBus();
      service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

      const result = await service.refreshAllCanvasNodes();

      expect(result.totalPatched).toBe(2);
      expect(vault.modifyFile).toHaveBeenCalledTimes(1);
      const written = (vault.modifyFile as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
      const parsed = JSON.parse(written) as CanvasData;
      expect(parsed.nodes[0]!.color).toBe('#e53935'); // IOC red
      expect(parsed.nodes[1]!.color).toBe('#fb8c00'); // TTP orange
    });
  });

  describe('findCanvasFiles', () => {
    it('returns only .canvas files from planning directory', async () => {
      vault = createMockVault({
        [`${PLANNING_DIR}/CANVAS_KILL_CHAIN.canvas`]: '{}',
        [`${PLANNING_DIR}/CANVAS_DIAMOND.canvas`]: '{}',
        [`${PLANNING_DIR}/MISSION.md`]: '# Mission',
        [`${PLANNING_DIR}/FINDINGS.md`]: '# Findings',
      });
      eventBus = new EventBus();
      service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

      const files = await service.findCanvasFiles();

      expect(files).toHaveLength(2);
      expect(files).toContain(`${PLANNING_DIR}/CANVAS_KILL_CHAIN.canvas`);
      expect(files).toContain(`${PLANNING_DIR}/CANVAS_DIAMOND.canvas`);
    });
  });
});
