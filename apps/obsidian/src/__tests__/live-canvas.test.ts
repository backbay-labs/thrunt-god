import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CanvasService } from '../services/canvas-service';
import { EventBus } from '../services/event-bus';
import { computeNewNodePosition, isSubstantiveEntityChange } from '../services/canvas-service';
import type { VaultAdapter } from '../vault-adapter';
import type { CanvasData, CanvasNode } from '../types';

// --- Test helpers (self-contained, copied from canvas-service-reactive.test.ts) ---

function makeEntityContent(type: string, verdict = 'unknown', confidenceScore?: number): string {
  const lines = [`---`, `type: ${type}`, `verdict: ${verdict}`];
  if (confidenceScore !== undefined) {
    lines.push(`confidence_score: ${confidenceScore}`);
  }
  lines.push(`---`, `# Entity`, ``);
  return lines.join('\n');
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
    createFile: vi.fn(async (path: string, content: string) => {
      files[path] = content;
    }),
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

// --- computeNewNodePosition tests ---

describe('computeNewNodePosition', () => {
  it('returns {x: 0, y: 0} for nodeIndex 0 with empty canvas', () => {
    const pos = computeNewNodePosition([], 0);
    expect(pos).toEqual({ x: 0, y: 0 });
  });

  it('starts new row below existing nodes with 20px gap', () => {
    const existing: CanvasNode[] = [
      { id: 'n1', x: 0, y: 0, width: 250, height: 60, type: 'file', color: '#000' },
    ];
    const pos = computeNewNodePosition(existing, 0);
    // maxBottom = 0 + 60 = 60, startY = 60 + 20 = 80
    expect(pos).toEqual({ x: 0, y: 80 });
  });

  it('fills 4 columns per row with nodeIndex 0-3', () => {
    const pos0 = computeNewNodePosition([], 0);
    const pos1 = computeNewNodePosition([], 1);
    const pos2 = computeNewNodePosition([], 2);
    const pos3 = computeNewNodePosition([], 3);
    expect(pos0).toEqual({ x: 0, y: 0 });
    expect(pos1).toEqual({ x: 270, y: 0 });       // 1 * (250 + 20)
    expect(pos2).toEqual({ x: 540, y: 0 });       // 2 * (250 + 20)
    expect(pos3).toEqual({ x: 810, y: 0 });       // 3 * (250 + 20)
  });

  it('wraps nodeIndex 4 to second row', () => {
    const pos = computeNewNodePosition([], 4);
    // row = Math.floor(4/4) = 1, col = 4 % 4 = 0
    // y = 0 + 1 * (60 + 20) = 80
    expect(pos).toEqual({ x: 0, y: 80 });
  });

  it('uses 250px wide, 60px tall, 20px gaps with 4 columns', () => {
    const existing: CanvasNode[] = [
      { id: 'n1', x: 0, y: 100, width: 250, height: 60, type: 'file', color: '#000' },
    ];
    // maxBottom = 100 + 60 = 160, startY = 180
    const pos = computeNewNodePosition(existing, 2);
    // col = 2, row = 0
    expect(pos).toEqual({ x: 540, y: 180 });
  });
});

// --- handleEntityCreated tests ---

describe('CanvasService.handleEntityCreated', () => {
  let vault: VaultAdapter;
  let eventBus: EventBus;
  let service: CanvasService;

  it('appends new file-type node to existing live-hunt.canvas with resolveEntityColor color', async () => {
    const canvasData: CanvasData = { nodes: [], edges: [] };
    const files: Record<string, string> = {
      [`${PLANNING_DIR}/live-hunt.canvas`]: JSON.stringify(canvasData),
    };
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    await service.handleEntityCreated({
      name: 'APT29',
      entityType: 'actor',
      sourcePath: `${PLANNING_DIR}/entities/actors/APT29.md`,
    });

    const written = files[`${PLANNING_DIR}/live-hunt.canvas`]!;
    const parsed = JSON.parse(written) as CanvasData;
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.nodes[0]!.type).toBe('file');
    expect(parsed.nodes[0]!.file).toBe(`${PLANNING_DIR}/entities/actors/APT29.md`);
    // actor color is #8e24aa
    expect(parsed.nodes[0]!.color).toBe('#8e24aa');
  });

  it('creates live-hunt.canvas with {nodes:[], edges:[]} if it does not exist', async () => {
    const files: Record<string, string> = {};
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    await service.handleEntityCreated({
      name: 'T1059',
      entityType: 'ttp',
      sourcePath: `${PLANNING_DIR}/entities/ttps/T1059.md`,
    });

    expect(vault.createFile).toHaveBeenCalled();
    const written = files[`${PLANNING_DIR}/live-hunt.canvas`]!;
    const parsed = JSON.parse(written) as CanvasData;
    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.edges).toEqual([]);
  });

  it('does NOT add duplicate node when entity file already present', async () => {
    const existingNode: CanvasNode = {
      id: 'entity-123-abc', x: 0, y: 0, width: 250, height: 60,
      type: 'file', file: `${PLANNING_DIR}/entities/actors/APT29.md`, color: '#8e24aa',
    };
    const canvasData: CanvasData = { nodes: [existingNode], edges: [] };
    const files: Record<string, string> = {
      [`${PLANNING_DIR}/live-hunt.canvas`]: JSON.stringify(canvasData),
    };
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    await service.handleEntityCreated({
      name: 'APT29',
      entityType: 'actor',
      sourcePath: `${PLANNING_DIR}/entities/actors/APT29.md`,
    });

    const written = files[`${PLANNING_DIR}/live-hunt.canvas`]!;
    const parsed = JSON.parse(written) as CanvasData;
    expect(parsed.nodes).toHaveLength(1);
  });

  it('preserves existing node positions when appending new node', async () => {
    const existingNode: CanvasNode = {
      id: 'n1', x: 42, y: 77, width: 300, height: 150,
      type: 'file', file: 'some/other/path.md', color: '#000',
    };
    const canvasData: CanvasData = { nodes: [existingNode], edges: [] };
    const files: Record<string, string> = {
      [`${PLANNING_DIR}/live-hunt.canvas`]: JSON.stringify(canvasData),
    };
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    await service.handleEntityCreated({
      name: 'evil-ip',
      entityType: 'ioc/ip',
      sourcePath: `${PLANNING_DIR}/entities/iocs/evil-ip.md`,
    });

    const written = files[`${PLANNING_DIR}/live-hunt.canvas`]!;
    const parsed = JSON.parse(written) as CanvasData;
    expect(parsed.nodes[0]!.x).toBe(42);
    expect(parsed.nodes[0]!.y).toBe(77);
    expect(parsed.nodes[0]!.width).toBe(300);
    expect(parsed.nodes[0]!.height).toBe(150);
  });

  it('new node has width: 250, height: 60, type: file', async () => {
    const files: Record<string, string> = {};
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    await service.handleEntityCreated({
      name: 'cobalt-strike',
      entityType: 'tool',
      sourcePath: `${PLANNING_DIR}/entities/tools/cobalt-strike.md`,
    });

    const written = files[`${PLANNING_DIR}/live-hunt.canvas`]!;
    const parsed = JSON.parse(written) as CanvasData;
    expect(parsed.nodes[0]!.width).toBe(250);
    expect(parsed.nodes[0]!.height).toBe(60);
    expect(parsed.nodes[0]!.type).toBe('file');
    expect(parsed.nodes[0]!.file).toBe(`${PLANNING_DIR}/entities/tools/cobalt-strike.md`);
  });

  it('node ID includes entity- prefix with timestamp and random suffix', async () => {
    const files: Record<string, string> = {};
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    await service.handleEntityCreated({
      name: 'test',
      entityType: 'actor',
      sourcePath: `${PLANNING_DIR}/entities/actors/test.md`,
    });

    const written = files[`${PLANNING_DIR}/live-hunt.canvas`]!;
    const parsed = JSON.parse(written) as CanvasData;
    expect(parsed.nodes[0]!.id).toMatch(/^entity-\d+-[a-z0-9]+$/);
  });

  it('writes canvas JSON with tab indentation', async () => {
    const files: Record<string, string> = {};
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    await service.handleEntityCreated({
      name: 'test',
      entityType: 'actor',
      sourcePath: `${PLANNING_DIR}/entities/actors/test.md`,
    });

    const written = files[`${PLANNING_DIR}/live-hunt.canvas`]!;
    expect(written).toContain('\t"nodes"');
  });

  it('emits canvas:refreshed event after successful write', async () => {
    const files: Record<string, string> = {};
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    const spy = vi.fn();
    eventBus.on('canvas:refreshed', spy);

    await service.handleEntityCreated({
      name: 'test',
      entityType: 'actor',
      sourcePath: `${PLANNING_DIR}/entities/actors/test.md`,
    });

    expect(spy).toHaveBeenCalledWith({
      canvasPath: `${PLANNING_DIR}/live-hunt.canvas`,
      changedCount: 1,
    });
  });

  it('silently returns if canvas file exists but is malformed JSON', async () => {
    const files: Record<string, string> = {
      [`${PLANNING_DIR}/live-hunt.canvas`]: '{not valid json!!!',
    };
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    // Should not throw
    await expect(service.handleEntityCreated({
      name: 'test',
      entityType: 'actor',
      sourcePath: `${PLANNING_DIR}/entities/actors/test.md`,
    })).resolves.toBeUndefined();
  });

  it('multiple new entities get sequential grid positions', async () => {
    const files: Record<string, string> = {};
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    // First entity
    await service.handleEntityCreated({
      name: 'entity1',
      entityType: 'actor',
      sourcePath: `${PLANNING_DIR}/entities/actors/entity1.md`,
    });

    // Second entity -- reads updated canvas
    await service.handleEntityCreated({
      name: 'entity2',
      entityType: 'ttp',
      sourcePath: `${PLANNING_DIR}/entities/ttps/entity2.md`,
    });

    // Third entity
    await service.handleEntityCreated({
      name: 'entity3',
      entityType: 'ioc/ip',
      sourcePath: `${PLANNING_DIR}/entities/iocs/entity3.md`,
    });

    const written = files[`${PLANNING_DIR}/live-hunt.canvas`]!;
    const parsed = JSON.parse(written) as CanvasData;
    expect(parsed.nodes).toHaveLength(3);

    // First at (0, 0), second at (270, 0), third at (540, 0)
    expect(parsed.nodes[0]!.x).toBe(0);
    expect(parsed.nodes[0]!.y).toBe(0);
    expect(parsed.nodes[1]!.x).toBe(270);
    expect(parsed.nodes[1]!.y).toBe(0);
    expect(parsed.nodes[2]!.x).toBe(540);
    expect(parsed.nodes[2]!.y).toBe(0);
  });
});

// --- refreshDashboardCanvas tests ---

describe('CanvasService.refreshDashboardCanvas', () => {
  let vault: VaultAdapter;
  let eventBus: EventBus;
  let service: CanvasService;

  it('reads CANVAS_DASHBOARD.canvas, patches entity colors, preserves positions', async () => {
    const entityPath = `${PLANNING_DIR}/entities/iocs/evil-ip.md`;
    const canvasData: CanvasData = {
      nodes: [
        { id: 'n1', x: 42, y: 77, width: 300, height: 150, type: 'file', file: entityPath, color: '#000000' },
      ],
      edges: [],
    };

    const files: Record<string, string> = {
      [`${PLANNING_DIR}/CANVAS_DASHBOARD.canvas`]: JSON.stringify(canvasData),
      [entityPath]: makeEntityContent('ioc/ip'),
    };
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    await service.refreshDashboardCanvas();

    const written = files[`${PLANNING_DIR}/CANVAS_DASHBOARD.canvas`]!;
    const parsed = JSON.parse(written) as CanvasData;
    expect(parsed.nodes[0]!.color).toBe('#e53935'); // IOC red
    expect(parsed.nodes[0]!.x).toBe(42);
    expect(parsed.nodes[0]!.y).toBe(77);
    expect(parsed.nodes[0]!.width).toBe(300);
    expect(parsed.nodes[0]!.height).toBe(150);
  });

  it('returns early if CANVAS_DASHBOARD.canvas does not exist', async () => {
    vault = createMockVault({});
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    // Should not throw and should not write
    await expect(service.refreshDashboardCanvas()).resolves.toBeUndefined();
    expect(vault.modifyFile).not.toHaveBeenCalled();
  });

  it('silently skips malformed CANVAS_DASHBOARD.canvas', async () => {
    const files: Record<string, string> = {
      [`${PLANNING_DIR}/CANVAS_DASHBOARD.canvas`]: '{broken json',
    };
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    await expect(service.refreshDashboardCanvas()).resolves.toBeUndefined();
    expect(vault.modifyFile).not.toHaveBeenCalled();
  });

  it('emits canvas:refreshed after successful patch', async () => {
    const entityPath = `${PLANNING_DIR}/entities/actors/APT28.md`;
    const canvasData: CanvasData = {
      nodes: [
        { id: 'n1', x: 0, y: 0, width: 200, height: 100, type: 'file', file: entityPath, color: '#000000' },
      ],
      edges: [],
    };

    const files: Record<string, string> = {
      [`${PLANNING_DIR}/CANVAS_DASHBOARD.canvas`]: JSON.stringify(canvasData),
      [entityPath]: makeEntityContent('actor'),
    };
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    const spy = vi.fn();
    eventBus.on('canvas:refreshed', spy);

    await service.refreshDashboardCanvas();

    expect(spy).toHaveBeenCalledWith({
      canvasPath: `${PLANNING_DIR}/CANVAS_DASHBOARD.canvas`,
      changedCount: 1,
    });
  });

  it('does not write if patchCanvasNodeColors returns changedCount 0', async () => {
    const entityPath = `${PLANNING_DIR}/entities/actors/APT28.md`;
    const canvasData: CanvasData = {
      nodes: [
        { id: 'n1', x: 0, y: 0, width: 200, height: 100, type: 'file', file: entityPath, color: '#8e24aa' }, // already correct actor color
      ],
      edges: [],
    };

    const files: Record<string, string> = {
      [`${PLANNING_DIR}/CANVAS_DASHBOARD.canvas`]: JSON.stringify(canvasData),
      [entityPath]: makeEntityContent('actor'),
    };
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    await service.refreshDashboardCanvas();

    expect(vault.modifyFile).not.toHaveBeenCalled();
  });

  it('grays out file-type nodes whose entity files no longer exist (#757575)', async () => {
    const entityPath = `${PLANNING_DIR}/entities/actors/APT28.md`;
    const canvasData: CanvasData = {
      nodes: [
        { id: 'n1', x: 0, y: 0, width: 200, height: 100, type: 'file', file: entityPath, color: '#8e24aa' },
      ],
      edges: [],
    };

    // Canvas has a node referencing APT28.md, but that file does NOT exist in vault
    const files: Record<string, string> = {
      [`${PLANNING_DIR}/CANVAS_DASHBOARD.canvas`]: JSON.stringify(canvasData),
      // APT28.md is NOT included -- simulates deleted entity
    };
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    await service.refreshDashboardCanvas();

    const written = files[`${PLANNING_DIR}/CANVAS_DASHBOARD.canvas`]!;
    const parsed = JSON.parse(written) as CanvasData;
    // Should be grayed out to #757575
    expect(parsed.nodes[0]!.color).toBe('#757575');
  });

  it('grays out removed entities and counts them in canvas:refreshed event', async () => {
    const existingEntityPath = `${PLANNING_DIR}/entities/iocs/good-ip.md`;
    const removedEntityPath = `${PLANNING_DIR}/entities/actors/APT28.md`;
    const canvasData: CanvasData = {
      nodes: [
        { id: 'n1', x: 0, y: 0, width: 200, height: 100, type: 'file', file: existingEntityPath, color: '#000000' },
        { id: 'n2', x: 300, y: 0, width: 200, height: 100, type: 'file', file: removedEntityPath, color: '#8e24aa' },
      ],
      edges: [],
    };

    const files: Record<string, string> = {
      [`${PLANNING_DIR}/CANVAS_DASHBOARD.canvas`]: JSON.stringify(canvasData),
      [existingEntityPath]: makeEntityContent('ioc/ip'),
      // removedEntityPath NOT included (deleted entity)
    };
    vault = createMockVault(files);
    eventBus = new EventBus();
    service = new CanvasService(vault, () => PLANNING_DIR, eventBus);

    const spy = vi.fn();
    eventBus.on('canvas:refreshed', spy);

    await service.refreshDashboardCanvas();

    const written = files[`${PLANNING_DIR}/CANVAS_DASHBOARD.canvas`]!;
    const parsed = JSON.parse(written) as CanvasData;
    expect(parsed.nodes[0]!.color).toBe('#e53935'); // IOC red (still exists)
    expect(parsed.nodes[1]!.color).toBe('#757575'); // grayed out (removed)

    // changedCount includes both the color fix and the gray-out
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![0].changedCount).toBe(2);
  });
});

// --- isSubstantiveEntityChange tests ---

describe('isSubstantiveEntityChange', () => {
  it('returns true when verdict field changes', () => {
    const oldContent = makeEntityContent('actor', 'unknown');
    const newContent = makeEntityContent('actor', 'suspicious');
    expect(isSubstantiveEntityChange(oldContent, newContent)).toBe(true);
  });

  it('returns true when confidence_score changes', () => {
    const oldContent = makeEntityContent('actor', 'unknown', 0.5);
    const newContent = makeEntityContent('actor', 'unknown', 0.9);
    expect(isSubstantiveEntityChange(oldContent, newContent)).toBe(true);
  });

  it('returns true when type field changes', () => {
    const oldContent = makeEntityContent('ioc/ip', 'unknown');
    const newContent = makeEntityContent('ioc/domain', 'unknown');
    expect(isSubstantiveEntityChange(oldContent, newContent)).toBe(true);
  });

  it('returns false when only whitespace or body content changes', () => {
    const oldContent = `---\ntype: actor\nverdict: unknown\n---\n# Entity\n\nSome body text`;
    const newContent = `---\ntype: actor\nverdict: unknown\n---\n# Entity\n\nDifferent body text with more details`;
    expect(isSubstantiveEntityChange(oldContent, newContent)).toBe(false);
  });
});
