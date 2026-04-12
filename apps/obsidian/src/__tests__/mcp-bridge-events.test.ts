import { describe, it, expect, beforeEach, vi } from 'vitest';
import { McpBridgeService } from '../services/mcp-bridge-service';
import { StubMcpClient } from '../mcp-client';
import { EventBus } from '../services/event-bus';
import type { VaultAdapter } from '../vault-adapter';
import type { CliEvent, VaultEvent } from '../mcp-events';
import { formatHuntPulse } from '../hunt-pulse';

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

// --- Helpers ---

function makeService(opts?: {
  mcpClient?: StubMcpClient;
  eventBus?: EventBus;
}): { service: McpBridgeService; mcpClient: StubMcpClient; eventBus: EventBus } {
  const mcpClient = opts?.mcpClient ?? new StubMcpClient();
  const eventBus = opts?.eventBus ?? new EventBus();
  const vaultAdapter = createMockVaultAdapter();
  const service = new McpBridgeService(
    vaultAdapter,
    () => '.planning',
    mcpClient,
    eventBus,
  );
  return { service, mcpClient, eventBus };
}

async function connectClient(client: StubMcpClient): Promise<void> {
  client.setHealthResponse({ status: 'healthy', toolCount: 5, serverVersion: '1.0' });
  await client.connect();
}

// ---------------------------------------------------------------------------
// pollEvents
// ---------------------------------------------------------------------------

describe('McpBridgeService.pollEvents', () => {
  let service: McpBridgeService;
  let mcpClient: StubMcpClient;

  beforeEach(() => {
    const result = makeService();
    service = result.service;
    mcpClient = result.mcpClient;
  });

  it('returns parsed events array when client is connected', async () => {
    await connectClient(mcpClient);
    const events: CliEvent[] = [
      { type: 'hunt:started', timestamp: 1000, payload: { huntId: 'H-1' } },
      { type: 'receipt:generated', timestamp: 2000, payload: { path: 'RECEIPTS/RCT-001.md' } },
    ];
    mcpClient.setToolResponse({
      content: [{ type: 'text', text: JSON.stringify(events) }],
    });

    const result = await service.pollEvents();
    expect(result).toEqual(events);
  });

  it('returns empty array when client is not connected', async () => {
    // mcpClient is disconnected by default
    const result = await service.pollEvents();
    expect(result).toEqual([]);
  });

  it('returns empty array when callTool returns null', async () => {
    await connectClient(mcpClient);
    mcpClient.setToolResponse(null as any);
    // StubMcpClient.callTool returns null when toolResponse is null
    const result = await service.pollEvents();
    expect(result).toEqual([]);
  });

  it('returns empty array when callTool returns error result', async () => {
    await connectClient(mcpClient);
    mcpClient.setToolResponse({
      content: [{ type: 'text', text: '{}' }],
      isError: true,
    });
    const result = await service.pollEvents();
    expect(result).toEqual([]);
  });

  it('advances lastEventCursor to timestamp of last event', async () => {
    await connectClient(mcpClient);
    const events: CliEvent[] = [
      { type: 'hunt:started', timestamp: 1000, payload: {} },
      { type: 'finding:logged', timestamp: 3000, payload: {} },
    ];
    mcpClient.setToolResponse({
      content: [{ type: 'text', text: JSON.stringify(events) }],
    });

    await service.pollEvents();

    // Second poll should pass since=3000
    mcpClient.setToolResponse({
      content: [{ type: 'text', text: '[]' }],
    });
    await service.pollEvents();

    // Verify the second call used since=3000
    const secondCall = mcpClient.callHistory[1];
    expect(secondCall).toBeDefined();
    expect(secondCall!.name).toBe('getEvents');
    expect(secondCall!.args.since).toBe(3000);
  });

  it('does not change cursor when events array is empty', async () => {
    await connectClient(mcpClient);
    mcpClient.setToolResponse({
      content: [{ type: 'text', text: '[]' }],
    });

    await service.pollEvents();

    // Second poll should still use since=0
    mcpClient.setToolResponse({
      content: [{ type: 'text', text: '[]' }],
    });
    await service.pollEvents();

    const secondCall = mcpClient.callHistory[1];
    expect(secondCall!.args.since).toBe(0);
  });

  it('calls getEvents with since parameter', async () => {
    await connectClient(mcpClient);
    mcpClient.setToolResponse({
      content: [{ type: 'text', text: '[]' }],
    });

    await service.pollEvents();

    expect(mcpClient.callHistory[0]).toEqual({
      name: 'getEvents',
      args: { since: 0 },
    });
  });
});

// ---------------------------------------------------------------------------
// publishEvent
// ---------------------------------------------------------------------------

describe('McpBridgeService.publishEvent', () => {
  let service: McpBridgeService;
  let mcpClient: StubMcpClient;

  beforeEach(() => {
    const result = makeService();
    service = result.service;
    mcpClient = result.mcpClient;
  });

  it('calls callTool with publishVaultEvent and event payload', async () => {
    await connectClient(mcpClient);
    mcpClient.setToolResponse({
      content: [{ type: 'text', text: 'ok' }],
    });

    const event: VaultEvent = {
      type: 'entity:created',
      timestamp: Date.now(),
      path: '/entities/actor/apt29.md',
      entityType: 'actor',
    };

    await service.publishEvent(event);

    expect(mcpClient.callHistory).toHaveLength(1);
    expect(mcpClient.callHistory[0]!.name).toBe('publishVaultEvent');
    expect(mcpClient.callHistory[0]!.args.event).toEqual(event);
  });

  it('swallows errors and does not throw', async () => {
    await connectClient(mcpClient);
    // Override callTool to throw
    const originalCallTool = mcpClient.callTool.bind(mcpClient);
    let callCount = 0;
    mcpClient.callTool = async (name: string, args: Record<string, unknown>) => {
      callCount++;
      throw new Error('Network failure');
    };

    const event: VaultEvent = {
      type: 'verdict:set',
      timestamp: Date.now(),
      path: '/entities/infra/c2.md',
      verdict: 'malicious',
    };

    // Should NOT throw
    await expect(service.publishEvent(event)).resolves.toBeUndefined();
  });

  it('is no-op when client is not connected', async () => {
    // mcpClient is disconnected
    const event: VaultEvent = {
      type: 'entity:created',
      timestamp: Date.now(),
      path: '/entities/actor/apt29.md',
    };

    await service.publishEvent(event);
    expect(mcpClient.callHistory).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// publishEvents (batch)
// ---------------------------------------------------------------------------

describe('McpBridgeService.publishEvents (batch)', () => {
  it('publishes array of events via callTool', async () => {
    const { service, mcpClient } = makeService();
    await connectClient(mcpClient);
    mcpClient.setToolResponse({
      content: [{ type: 'text', text: 'ok' }],
    });

    const events: VaultEvent[] = [
      { type: 'entity:created', timestamp: 1000, path: '/a.md', entityType: 'actor' },
      { type: 'verdict:set', timestamp: 2000, path: '/b.md', verdict: 'benign' },
    ];

    await service.publishEvents(events);

    expect(mcpClient.callHistory).toHaveLength(1);
    expect(mcpClient.callHistory[0]!.name).toBe('publishVaultEvent');
    expect(mcpClient.callHistory[0]!.args.events).toEqual(events);
  });
});

// ---------------------------------------------------------------------------
// formatHuntPulse with MCP status
// ---------------------------------------------------------------------------

describe('formatHuntPulse with mcpStatus', () => {
  it('includes "MCP: offline" when mcpStatus is offline and not idle', () => {
    const now = 1000000;
    const lastActivity = now - 30000; // 30 seconds ago
    const result = formatHuntPulse(lastActivity, now, 1, undefined, 'offline');
    expect(result).toContain('MCP: offline');
  });

  it('includes "MCP: online" when mcpStatus is online and not idle', () => {
    const now = 1000000;
    const lastActivity = now - 30000;
    const result = formatHuntPulse(lastActivity, now, 1, undefined, 'online');
    expect(result).toContain('MCP: online');
  });

  it('includes "MCP: offline" when idle and mcpStatus is offline', () => {
    const now = 1000000;
    const lastActivity = now - 300001; // just over 5 minutes (idle)
    const result = formatHuntPulse(lastActivity, now, 1, undefined, 'offline');
    expect(result).toContain('MCP: offline');
  });

  it('does not include MCP status when mcpStatus is undefined', () => {
    const now = 1000000;
    const lastActivity = now - 30000;
    const result = formatHuntPulse(lastActivity, now, 1);
    expect(result).not.toContain('MCP:');
  });
});
