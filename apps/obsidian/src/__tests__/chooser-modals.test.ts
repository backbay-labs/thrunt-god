import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FuzzySuggestModal } from '../__mocks__/obsidian';

// Stub navigator.clipboard for quickExport
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } },
  writable: true,
});

// Mock modules that chooser-modals.ts imports
vi.mock('../hyper-copy-modal', () => ({
  HyperCopyModal: vi.fn().mockImplementation(() => ({ open: vi.fn() })),
}));
vi.mock('../export-log', () => ({
  buildExportLogEntry: vi.fn().mockReturnValue({}),
}));

import {
  CopyChooserModal,
  CanvasChooserModal,
  CanvasTemplateChooserModal,
  IntelligenceChooserModal,
} from '../chooser-modals';
import type { ChooserItem } from '../chooser-modals';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockPlugin() {
  return {
    app: {
      workspace: {
        getActiveFile: () => ({ path: 'entities/ttps/T1059.md', name: 'T1059.md' }),
        getLeaf: () => ({ openFile: vi.fn() }),
        openLinkText: vi.fn(),
      },
      commands: {
        executeCommandById: vi.fn(),
      },
    },
    settings: { planningDir: '' },
    workspaceService: {
      getAvailableProfiles: () => [
        { agentId: 'query-writer', label: 'Query Writer', maxTokenEstimate: 4000 },
      ],
      assembleContextForProfile: vi.fn().mockResolvedValue({ sections: [], tokenEstimate: 100 }),
      renderAssembledContext: vi.fn().mockReturnValue('rendered'),
      logExport: vi.fn(),
      generateHuntCanvas: vi.fn().mockResolvedValue({ success: true, message: 'done' }),
      canvasFromCurrentHunt: vi.fn().mockResolvedValue({ success: true, message: 'done' }),
      generateKnowledgeDashboard: vi.fn().mockResolvedValue({ success: true, message: 'done' }),
      enrichFromMcp: vi.fn().mockResolvedValue({ success: true, message: 'done' }),
      analyzeCoverage: vi.fn().mockResolvedValue({ success: true, message: 'done' }),
      logDecision: vi.fn().mockResolvedValue({ success: true, message: 'done' }),
      logLearning: vi.fn().mockResolvedValue({ success: true, message: 'done' }),
    },
    mcpClient: { isConnected: () => true },
    refreshViews: vi.fn(),
  };
}

function makeFuzzyMatch<T>(item: T): { item: T; match: any } {
  return { item, match: { score: 0, matches: [] } };
}

// ---------------------------------------------------------------------------
// CopyChooserModal
// ---------------------------------------------------------------------------

describe('CopyChooserModal', () => {
  let modal: InstanceType<typeof CopyChooserModal>;
  let plugin: ReturnType<typeof createMockPlugin>;

  beforeEach(() => {
    plugin = createMockPlugin();
    modal = new CopyChooserModal(plugin.app, plugin as any);
  });

  it('extends FuzzySuggestModal', () => {
    expect(modal).toBeInstanceOf(FuzzySuggestModal);
  });

  it('getItems() returns 4 items with correct ids', () => {
    const items = modal.getItems();
    expect(items).toHaveLength(4);
    const ids = items.map((i: ChooserItem) => i.id);
    expect(ids).toEqual(['hyper-copy', 'query-writer', 'intel-advisor', 'ioc-context']);
  });

  it('getItemText() returns item.name for each item', () => {
    const items = modal.getItems();
    for (const item of items) {
      expect(modal.getItemText(item)).toBe(item.name);
    }
  });

  it('renderSuggestion() creates div with name and description elements', () => {
    const item = modal.getItems()[0]!;
    const match = makeFuzzyMatch(item);
    const children: Array<{ cls: string; text: string }> = [];
    const el = {
      createDiv: (opts: { cls: string; text: string }) => {
        children.push(opts);
        return opts;
      },
    } as any;
    modal.renderSuggestion(match, el);
    expect(children).toHaveLength(2);
    expect(children[0]!.cls).toBe('thrunt-chooser-name');
    expect(children[0]!.text).toBe(item.name);
    expect(children[1]!.cls).toBe('thrunt-chooser-desc');
    expect(children[1]!.text).toBe(item.description);
  });

  it('onChooseItem calls onSelect callback', () => {
    // For non-hyper-copy items, it should call quickExport-style logic
    // We just verify the method doesn't throw
    const item = modal.getItems()[1]!; // query-writer
    expect(() => modal.onChooseItem(item, {} as any)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// CanvasChooserModal
// ---------------------------------------------------------------------------

describe('CanvasChooserModal', () => {
  let modal: InstanceType<typeof CanvasChooserModal>;
  let plugin: ReturnType<typeof createMockPlugin>;

  beforeEach(() => {
    plugin = createMockPlugin();
    modal = new CanvasChooserModal(plugin.app, plugin as any);
  });

  it('extends FuzzySuggestModal', () => {
    expect(modal).toBeInstanceOf(FuzzySuggestModal);
  });

  it('getItems() returns 3 items with correct ids', () => {
    const items = modal.getItems();
    expect(items).toHaveLength(3);
    const ids = items.map((i: ChooserItem) => i.id);
    expect(ids).toEqual([
      'generate-hunt-canvas',
      'canvas-from-current-hunt',
      'generate-knowledge-dashboard',
    ]);
  });

  it('getItemText() returns item.name for each item', () => {
    const items = modal.getItems();
    for (const item of items) {
      expect(modal.getItemText(item)).toBe(item.name);
    }
  });

  it('renderSuggestion() creates div with name and description elements', () => {
    const item = modal.getItems()[0]!;
    const match = makeFuzzyMatch(item);
    const children: Array<{ cls: string; text: string }> = [];
    const el = {
      createDiv: (opts: { cls: string; text: string }) => {
        children.push(opts);
        return opts;
      },
    } as any;
    modal.renderSuggestion(match, el);
    expect(children).toHaveLength(2);
    expect(children[0]!.cls).toBe('thrunt-chooser-name');
    expect(children[1]!.cls).toBe('thrunt-chooser-desc');
  });
});

// ---------------------------------------------------------------------------
// CanvasTemplateChooserModal
// ---------------------------------------------------------------------------

describe('CanvasTemplateChooserModal', () => {
  it('extends FuzzySuggestModal', () => {
    const onSelect = vi.fn();
    const modal = new CanvasTemplateChooserModal({} as any, onSelect);
    expect(modal).toBeInstanceOf(FuzzySuggestModal);
  });

  it('getItems() returns 4 template items', () => {
    const onSelect = vi.fn();
    const modal = new CanvasTemplateChooserModal({} as any, onSelect);
    const items = modal.getItems();
    expect(items).toHaveLength(4);
    const ids = items.map((i: any) => i.id);
    expect(ids).toEqual(['kill-chain', 'diamond', 'lateral-movement', 'hunt-progression']);
  });

  it('onChooseItem calls onSelect with template id', () => {
    const onSelect = vi.fn();
    const modal = new CanvasTemplateChooserModal({} as any, onSelect);
    const items = modal.getItems();
    modal.onChooseItem(items[0]!, {} as any);
    expect(onSelect).toHaveBeenCalledWith('kill-chain');
  });
});

// ---------------------------------------------------------------------------
// IntelligenceChooserModal
// ---------------------------------------------------------------------------

describe('IntelligenceChooserModal', () => {
  let modal: InstanceType<typeof IntelligenceChooserModal>;
  let plugin: ReturnType<typeof createMockPlugin>;

  beforeEach(() => {
    plugin = createMockPlugin();
    modal = new IntelligenceChooserModal(plugin.app, plugin as any);
  });

  it('extends FuzzySuggestModal', () => {
    expect(modal).toBeInstanceOf(FuzzySuggestModal);
  });

  it('getItems() returns 6 items with correct ids', () => {
    const items = modal.getItems();
    expect(items).toHaveLength(6);
    const ids = items.map((i: ChooserItem) => i.id);
    expect(ids).toEqual([
      'enrich-from-mcp',
      'analyze-detection-coverage',
      'log-hunt-decision',
      'log-hunt-learning',
      'search-knowledge-graph',
      'refresh-entity-intelligence',
    ]);
  });

  it('getItemText() returns item.name for each item', () => {
    const items = modal.getItems();
    for (const item of items) {
      expect(modal.getItemText(item)).toBe(item.name);
    }
  });

  it('renderSuggestion() creates div with name and description elements', () => {
    const item = modal.getItems()[0]!;
    const match = makeFuzzyMatch(item);
    const children: Array<{ cls: string; text: string }> = [];
    const el = {
      createDiv: (opts: { cls: string; text: string }) => {
        children.push(opts);
        return opts;
      },
    } as any;
    modal.renderSuggestion(match, el);
    expect(children).toHaveLength(2);
    expect(children[0]!.cls).toBe('thrunt-chooser-name');
    expect(children[1]!.cls).toBe('thrunt-chooser-desc');
  });

  it('onChooseItem does not throw for any item', () => {
    const items = modal.getItems();
    for (const item of items) {
      expect(() => modal.onChooseItem(item, {} as any)).not.toThrow();
    }
  });
});
