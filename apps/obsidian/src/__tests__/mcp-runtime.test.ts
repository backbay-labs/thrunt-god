import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThruntGodPlugin from '../main';
import { DEFAULT_SETTINGS } from '../settings';
import { EventBus } from '../services/event-bus';

describe('ThruntGodPlugin MCP runtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as { window?: typeof globalThis }).window = globalThis;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function makePlugin() {
    const plugin = new ThruntGodPlugin();
    const connect = vi.fn().mockResolvedValue(undefined);
    const disconnect = vi.fn();

    plugin.settings = { ...DEFAULT_SETTINGS };
    plugin.eventBus = new EventBus();
    plugin.mcpClient = {
      connect,
      disconnect,
      isConnected: vi.fn().mockReturnValue(false),
    } as any;
    plugin.workspaceService = {
      mcpBridge: {
        publishEvents: vi.fn().mockResolvedValue(undefined),
      },
      invalidate: vi.fn(),
    } as any;
    plugin.app = {
      workspace: {
        getLeavesOfType: vi.fn().mockReturnValue([]),
      },
    } as any;
    plugin.registerInterval = vi.fn();
    plugin.saveSettings = vi.fn().mockResolvedValue(undefined);
    plugin.refreshViews = vi.fn().mockResolvedValue(undefined);
    (plugin as any).updateHuntPulse = vi.fn();

    return { plugin, connect, disconnect };
  }

  it('setMcpEnabled persists and updates the MCP client state immediately', async () => {
    const { plugin, connect, disconnect } = makePlugin();

    await plugin.setMcpEnabled(true);
    expect(plugin.settings.mcpEnabled).toBe(true);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
    expect(plugin.refreshViews).toHaveBeenCalledTimes(1);

    await plugin.setMcpEnabled(false);
    expect(plugin.settings.mcpEnabled).toBe(false);
    expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(plugin.refreshViews).toHaveBeenCalledTimes(2);
  });

  it('removes outbound MCP listeners when polling is disabled', () => {
    const { plugin } = makePlugin();

    plugin.settings.mcpEventPollingEnabled = true;
    plugin.enableMcpEventPolling();
    plugin.eventBus.emit('entity:created', {
      name: 'APT29',
      entityType: 'threat-actor',
      sourcePath: '.planning/entities/actor/apt29.md',
    });
    expect((plugin as any).outboundEventBuffer).toHaveLength(1);

    plugin.settings.mcpEventPollingEnabled = false;
    plugin.disableMcpEventPolling();
    expect((plugin as any).outboundEventBuffer).toHaveLength(0);

    plugin.eventBus.emit('entity:created', {
      name: 'APT29',
      entityType: 'threat-actor',
      sourcePath: '.planning/entities/actor/apt29.md',
    });
    expect((plugin as any).outboundEventBuffer).toHaveLength(0);

    plugin.settings.mcpEventPollingEnabled = true;
    plugin.enableMcpEventPolling();
    plugin.eventBus.emit('entity:created', {
      name: 'APT29',
      entityType: 'threat-actor',
      sourcePath: '.planning/entities/actor/apt29.md',
    });
    expect((plugin as any).outboundEventBuffer).toHaveLength(1);
  });
});
