import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modal modules that commands.ts imports
vi.mock('../mcp-search-modal', () => ({
  McpSearchModal: vi.fn(),
}));
vi.mock('../hyper-copy-modal', () => ({
  HyperCopyModal: vi.fn().mockImplementation(() => ({ open: vi.fn() })),
}));
vi.mock('../modals', () => ({
  PromptModal: vi.fn().mockImplementation(() => ({ open: vi.fn() })),
  CanvasTemplateModal: vi.fn().mockImplementation(() => ({ open: vi.fn() })),
  CompareHuntsModal: vi.fn().mockImplementation(() => ({ open: vi.fn() })),
}));
vi.mock('../chooser-modals', () => ({
  CopyChooserModal: vi.fn().mockImplementation(() => ({ open: vi.fn() })),
  CanvasChooserModal: vi.fn().mockImplementation(() => ({ open: vi.fn() })),
  IntelligenceChooserModal: vi.fn().mockImplementation(() => ({ open: vi.fn() })),
}));

import { registerCommands } from '../commands';

// ---------------------------------------------------------------------------
// Minimal mock plugin that captures addCommand() calls
// ---------------------------------------------------------------------------

function createMockPlugin() {
  const commands: Array<{
    id: string;
    name: string;
    hotkeys?: Array<{ modifiers: string[]; key: string }>;
    callback?: Function;
    checkCallback?: Function;
  }> = [];
  return {
    commands,
    app: {
      workspace: { getActiveFile: () => null },
    },
    workspaceService: {
      getAvailableProfiles: () => [],
      getFilePath: () => '',
      vaultAdapter: { getFile: () => null },
    },
    mcpClient: { isConnected: () => false },
    addCommand: (cmd: any) => {
      commands.push(cmd);
    },
    refreshViews: vi.fn(),
  };
}

describe('command consolidation', () => {
  let commands: any[];

  beforeEach(() => {
    const mock = createMockPlugin();
    registerCommands(mock as any);
    commands = mock.commands;
  });

  // -----------------------------------------------------------------------
  // Visible top-level commands
  // -----------------------------------------------------------------------

  it('registers exactly 9 visible top-level commands (non-empty name)', () => {
    const visible = commands.filter((c) => c.name !== '');
    expect(visible).toHaveLength(9);
  });

  it('visible commands include the expected IDs', () => {
    const visible = commands.filter((c) => c.name !== '');
    const ids = visible.map((c) => c.id).sort();
    expect(ids).toEqual([
      'canvas-chooser',
      'compare-hunts',
      'copy-chooser',
      'create-thrunt-workspace',
      'cross-hunt-intel',
      'ingest-agent-output',
      'intelligence-chooser',
      'open-thrunt-workspace',
      'scaffold-attack-ontology',
    ]);
  });

  // -----------------------------------------------------------------------
  // Grouped chooser commands
  // -----------------------------------------------------------------------

  it('copy-chooser is registered with non-empty name', () => {
    const cmd = commands.find((c) => c.id === 'copy-chooser');
    expect(cmd).toBeDefined();
    expect(cmd.name).toBe('Copy...');
  });

  it('canvas-chooser is registered with non-empty name', () => {
    const cmd = commands.find((c) => c.id === 'canvas-chooser');
    expect(cmd).toBeDefined();
    expect(cmd.name).toBe('Canvas...');
  });

  it('intelligence-chooser is registered with non-empty name', () => {
    const cmd = commands.find((c) => c.id === 'intelligence-chooser');
    expect(cmd).toBeDefined();
    expect(cmd.name).toBe('Intelligence...');
  });

  // -----------------------------------------------------------------------
  // Hidden aliases for 12 consolidated command IDs
  // -----------------------------------------------------------------------

  const CONSOLIDATED_IDS = [
    'hyper-copy-for-agent',
    'copy-for-query-writer',
    'copy-for-intel-advisor',
    'copy-ioc-context',
    'generate-hunt-canvas',
    'canvas-from-current-hunt',
    'generate-knowledge-dashboard',
    'enrich-from-mcp',
    'analyze-detection-coverage',
    'log-hunt-decision',
    'log-hunt-learning',
    'search-knowledge-graph',
  ];

  it('all 12 consolidated command IDs exist as hidden aliases (name === "")', () => {
    for (const id of CONSOLIDATED_IDS) {
      const cmd = commands.find((c) => c.id === id);
      expect(cmd, `missing hidden alias for ${id}`).toBeDefined();
      expect(cmd.name, `${id} should have empty name`).toBe('');
    }
  });

  // -----------------------------------------------------------------------
  // Hidden aliases for 5 artifact open commands
  // -----------------------------------------------------------------------

  const ARTIFACT_IDS = [
    'open-thrunt-mission',
    'open-thrunt-hypotheses',
    'open-thrunt-huntmap',
    'open-thrunt-state',
    'open-thrunt-findings',
  ];

  it('all 5 artifact open commands exist as hidden aliases (name === "")', () => {
    for (const id of ARTIFACT_IDS) {
      const cmd = commands.find((c) => c.id === id);
      expect(cmd, `missing hidden alias for ${id}`).toBeDefined();
      expect(cmd.name, `${id} should have empty name`).toBe('');
    }
  });

  // -----------------------------------------------------------------------
  // Context-gated commands preserve checkCallback
  // -----------------------------------------------------------------------

  it('enrich-from-mcp hidden alias uses checkCallback', () => {
    const cmd = commands.find((c) => c.id === 'enrich-from-mcp');
    expect(cmd).toBeDefined();
    expect(cmd.checkCallback).toBeDefined();
    expect(typeof cmd.checkCallback).toBe('function');
  });

  it('log-hunt-decision hidden alias uses checkCallback', () => {
    const cmd = commands.find((c) => c.id === 'log-hunt-decision');
    expect(cmd).toBeDefined();
    expect(cmd.checkCallback).toBeDefined();
    expect(typeof cmd.checkCallback).toBe('function');
  });

  // -----------------------------------------------------------------------
  // Hotkeys preserved on original command IDs
  // -----------------------------------------------------------------------

  it('open-thrunt-workspace hotkey Mod+Shift+T preserved', () => {
    const cmd = commands.find((c) => c.id === 'open-thrunt-workspace');
    expect(cmd?.hotkeys).toEqual([{ modifiers: ['Mod', 'Shift'], key: 't' }]);
  });

  it('hyper-copy-for-agent hotkey Mod+Shift+H preserved on hidden alias', () => {
    const cmd = commands.find((c) => c.id === 'hyper-copy-for-agent');
    expect(cmd?.hotkeys).toEqual([{ modifiers: ['Mod', 'Shift'], key: 'h' }]);
  });

  it('ingest-agent-output hotkey Mod+Shift+I preserved', () => {
    const cmd = commands.find((c) => c.id === 'ingest-agent-output');
    expect(cmd?.hotkeys).toEqual([{ modifiers: ['Mod', 'Shift'], key: 'i' }]);
  });

  // -----------------------------------------------------------------------
  // Total hidden alias count
  // -----------------------------------------------------------------------

  it('has at least 17 hidden aliases (12 consolidated + 5 artifacts)', () => {
    const hidden = commands.filter((c) => c.name === '');
    expect(hidden.length).toBeGreaterThanOrEqual(17);
  });
});
