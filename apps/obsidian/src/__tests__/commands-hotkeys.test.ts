import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modal modules that commands.ts imports (obsidian is aliased via vitest.config.ts)
vi.mock('../mcp-search-modal', () => ({
  McpSearchModal: vi.fn(),
}));
vi.mock('../hyper-copy-modal', () => ({
  HyperCopyModal: vi.fn(),
}));
vi.mock('../modals', () => ({
  PromptModal: vi.fn(),
  CanvasTemplateModal: vi.fn(),
  CompareHuntsModal: vi.fn(),
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

describe('command hotkeys', () => {
  let commands: any[];

  beforeEach(() => {
    const mock = createMockPlugin();
    registerCommands(mock as any);
    commands = mock.commands;
  });

  it('open-thrunt-workspace has Mod+Shift+T hotkey', () => {
    const cmd = commands.find((c) => c.id === 'open-thrunt-workspace');
    expect(cmd).toBeDefined();
    expect(cmd.hotkeys).toEqual([{ modifiers: ['Mod', 'Shift'], key: 't' }]);
  });

  it('hyper-copy-for-agent has Mod+Shift+H hotkey', () => {
    const cmd = commands.find((c) => c.id === 'hyper-copy-for-agent');
    expect(cmd).toBeDefined();
    expect(cmd.hotkeys).toEqual([{ modifiers: ['Mod', 'Shift'], key: 'h' }]);
  });

  it('ingest-agent-output has Mod+Shift+I hotkey', () => {
    const cmd = commands.find((c) => c.id === 'ingest-agent-output');
    expect(cmd).toBeDefined();
    expect(cmd.hotkeys).toEqual([{ modifiers: ['Mod', 'Shift'], key: 'i' }]);
  });

  it('each hotkey has exactly one binding', () => {
    const ids = [
      'open-thrunt-workspace',
      'hyper-copy-for-agent',
      'ingest-agent-output',
    ];
    for (const id of ids) {
      const cmd = commands.find((c) => c.id === id);
      expect(cmd?.hotkeys).toHaveLength(1);
    }
  });

  it('all use Mod modifier (not Ctrl) for cross-platform compatibility', () => {
    const ids = [
      'open-thrunt-workspace',
      'hyper-copy-for-agent',
      'ingest-agent-output',
    ];
    for (const id of ids) {
      const cmd = commands.find((c) => c.id === id);
      expect(cmd?.hotkeys?.[0]?.modifiers).toContain('Mod');
      expect(cmd?.hotkeys?.[0]?.modifiers).not.toContain('Ctrl');
    }
  });
});
