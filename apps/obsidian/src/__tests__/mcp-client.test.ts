import { describe, it, expect, beforeEach } from 'vitest';
import type { McpClient } from '../mcp-client';
import { HttpMcpClient, StubMcpClient } from '../mcp-client';
import type { McpHealthResponse, McpToolResult } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds an HttpMcpClient with injectable requestFn and settings. */
function makeHttpClient(opts: {
  mcpServerUrl?: string;
  mcpEnabled?: boolean;
  requestFn?: (opts: {
    url: string;
    method: string;
    body?: string;
    headers?: Record<string, string>;
  }) => Promise<{ status: number; text: string }>;
}): HttpMcpClient {
  const settings = {
    mcpServerUrl: opts.mcpServerUrl ?? 'http://localhost:3100',
    mcpEnabled: opts.mcpEnabled ?? true,
  };
  const requestFn =
    opts.requestFn ??
    (async () => ({ status: 200, text: '{}' }));
  return new HttpMcpClient(() => settings, requestFn);
}

function healthyResponse(): { status: number; text: string } {
  return {
    status: 200,
    text: JSON.stringify({
      status: 'healthy',
      toolCount: 11,
      serverVersion: '0.3.6',
    } satisfies McpHealthResponse),
  };
}

function unhealthyResponse(): { status: number; text: string } {
  return {
    status: 200,
    text: JSON.stringify({
      status: 'unhealthy',
      toolCount: 0,
      serverVersion: '0.3.6',
      error: 'db offline',
    } satisfies McpHealthResponse),
  };
}

// ---------------------------------------------------------------------------
// StubMcpClient tests
// ---------------------------------------------------------------------------

describe('StubMcpClient', () => {
  let stub: StubMcpClient;

  beforeEach(() => {
    stub = new StubMcpClient();
  });

  it('isConnected() returns false initially', () => {
    expect(stub.isConnected()).toBe(false);
  });

  it('connect() with healthy response sets status to connected', async () => {
    stub.setHealthResponse({ status: 'healthy', toolCount: 5, serverVersion: '1.0' });
    await stub.connect();
    expect(stub.getStatus()).toBe('connected');
    expect(stub.isConnected()).toBe(true);
  });

  it('connect() with unhealthy response sets status to error', async () => {
    stub.setHealthResponse({ status: 'unhealthy', toolCount: 0, serverVersion: '1.0', error: 'broken' });
    await stub.connect();
    expect(stub.getStatus()).toBe('error');
    expect(stub.isConnected()).toBe(false);
  });

  it('disconnect() resets status to disconnected', async () => {
    stub.setHealthResponse({ status: 'healthy', toolCount: 5, serverVersion: '1.0' });
    await stub.connect();
    expect(stub.isConnected()).toBe(true);
    stub.disconnect();
    expect(stub.getStatus()).toBe('disconnected');
    expect(stub.isConnected()).toBe(false);
  });

  it('checkHealth() returns McpHealthResponse when connected', async () => {
    const expected: McpHealthResponse = { status: 'healthy', toolCount: 5, serverVersion: '1.0' };
    stub.setHealthResponse(expected);
    await stub.connect();
    const health = await stub.checkHealth();
    expect(health).toEqual(expected);
  });

  it('checkHealth() returns null when not connected', async () => {
    const health = await stub.checkHealth();
    expect(health).toBeNull();
  });

  it('callTool returns null when not connected', async () => {
    const result = await stub.callTool('test-tool', {});
    expect(result).toBeNull();
  });

  it('callTool returns configured response when connected', async () => {
    const expected: McpToolResult = { content: [{ type: 'text', text: 'hello' }] };
    stub.setHealthResponse({ status: 'healthy', toolCount: 1, serverVersion: '1.0' });
    stub.setToolResponse(expected);
    await stub.connect();
    const result = await stub.callTool('test-tool', {});
    expect(result).toEqual(expected);
  });

  it('tracks call history', async () => {
    stub.setHealthResponse({ status: 'healthy', toolCount: 1, serverVersion: '1.0' });
    await stub.connect();
    stub.setToolResponse({ content: [{ type: 'text', text: 'ok' }] });
    await stub.callTool('tool-a', { key: 'val' });
    await stub.callTool('tool-b', {});
    expect(stub.callHistory).toHaveLength(2);
    expect(stub.callHistory[0]).toEqual({ name: 'tool-a', args: { key: 'val' } });
    expect(stub.callHistory[1]).toEqual({ name: 'tool-b', args: {} });
  });
});

// ---------------------------------------------------------------------------
// HttpMcpClient tests
// ---------------------------------------------------------------------------

describe('HttpMcpClient', () => {
  it('isConnected() returns false initially', () => {
    const client = makeHttpClient({});
    expect(client.isConnected()).toBe(false);
  });

  it('getStatus() returns disabled when mcpEnabled is false', () => {
    const client = makeHttpClient({ mcpEnabled: false });
    expect(client.getStatus()).toBe('disabled');
  });

  it('getStatus() returns disconnected before connect() is called', () => {
    const client = makeHttpClient({ mcpEnabled: true });
    expect(client.getStatus()).toBe('disconnected');
  });

  it('connect() with healthy response sets status to connected', async () => {
    const client = makeHttpClient({
      requestFn: async () => healthyResponse(),
    });
    await client.connect();
    expect(client.getStatus()).toBe('connected');
    expect(client.isConnected()).toBe(true);
  });

  it('connect() with unhealthy response sets status to error', async () => {
    const client = makeHttpClient({
      requestFn: async () => unhealthyResponse(),
    });
    await client.connect();
    expect(client.getStatus()).toBe('error');
    expect(client.isConnected()).toBe(false);
  });

  it('connect() sets error status on network failure, never throws', async () => {
    const client = makeHttpClient({
      requestFn: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    // Should NOT throw
    await client.connect();
    expect(client.getStatus()).toBe('error');
  });

  it('disconnect() resets status to disconnected', async () => {
    const client = makeHttpClient({
      requestFn: async () => healthyResponse(),
    });
    await client.connect();
    client.disconnect();
    expect(client.getStatus()).toBe('disconnected');
    expect(client.isConnected()).toBe(false);
  });

  it('checkHealth() returns McpHealthResponse when connected', async () => {
    const client = makeHttpClient({
      requestFn: async () => healthyResponse(),
    });
    await client.connect();
    const health = await client.checkHealth();
    expect(health).not.toBeNull();
    expect(health!.status).toBe('healthy');
    expect(health!.toolCount).toBe(11);
    expect(health!.serverVersion).toBe('0.3.6');
  });

  it('checkHealth() returns null when not connected', async () => {
    const client = makeHttpClient({});
    const health = await client.checkHealth();
    expect(health).toBeNull();
  });

  it('checkHealth() returns null on error, never throws', async () => {
    let callCount = 0;
    const client = makeHttpClient({
      requestFn: async () => {
        callCount++;
        if (callCount === 1) return healthyResponse(); // connect()
        throw new Error('Network error'); // checkHealth()
      },
    });
    await client.connect();
    const health = await client.checkHealth();
    expect(health).toBeNull();
  });

  it('callTool returns null when not connected', async () => {
    const client = makeHttpClient({});
    const result = await client.callTool('test', {});
    expect(result).toBeNull();
  });

  it('callTool returns parsed McpToolResult when connected', async () => {
    const toolResult: McpToolResult = {
      content: [{ type: 'text', text: 'result data' }],
    };
    let callCount = 0;
    const client = makeHttpClient({
      requestFn: async () => {
        callCount++;
        if (callCount === 1) return healthyResponse(); // connect()
        return { status: 200, text: JSON.stringify(toolResult) }; // callTool()
      },
    });
    await client.connect();
    const result = await client.callTool('enrich-ioc', { value: '1.2.3.4' });
    expect(result).toEqual(toolResult);
  });

  it('callTool returns null on error, never throws', async () => {
    let callCount = 0;
    const client = makeHttpClient({
      requestFn: async () => {
        callCount++;
        if (callCount === 1) return healthyResponse(); // connect()
        throw new Error('500 Internal Server Error'); // callTool()
      },
    });
    await client.connect();
    const result = await client.callTool('broken-tool', {});
    expect(result).toBeNull();
  });

  it('callTool sends POST to {serverUrl}/tool with name and args', async () => {
    const requests: Array<{ url: string; method: string; body?: string }> = [];
    let callCount = 0;
    const client = makeHttpClient({
      mcpServerUrl: 'http://my-server:9000',
      requestFn: async (opts) => {
        callCount++;
        requests.push(opts);
        if (callCount === 1) return healthyResponse();
        return {
          status: 200,
          text: JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }),
        };
      },
    });
    await client.connect();
    await client.callTool('lookup', { ip: '10.0.0.1' });
    // Second request is the callTool
    const toolReq = requests[1]!;
    expect(toolReq.url).toBe('http://my-server:9000/tool');
    expect(toolReq.method).toBe('POST');
    expect(JSON.parse(toolReq.body!)).toEqual({ name: 'lookup', args: { ip: '10.0.0.1' } });
  });

  it('connect() calls GET {serverUrl}/health', async () => {
    const requests: Array<{ url: string; method: string }> = [];
    const client = makeHttpClient({
      mcpServerUrl: 'http://my-server:9000',
      requestFn: async (opts) => {
        requests.push(opts);
        return healthyResponse();
      },
    });
    await client.connect();
    expect(requests[0]!.url).toBe('http://my-server:9000/health');
    expect(requests[0]!.method).toBe('GET');
  });
});
