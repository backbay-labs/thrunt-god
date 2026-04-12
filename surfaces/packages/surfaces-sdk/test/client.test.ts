import { describe, test, expect } from 'bun:test';
import { SurfaceClient, SurfaceBridgeError } from '../src/index.ts';

describe('SurfaceClient', () => {
  test('constructs with default options', () => {
    const client = new SurfaceClient();
    expect(client).toBeInstanceOf(SurfaceClient);
  });

  test('constructs with custom base URL', () => {
    const client = new SurfaceClient({ baseUrl: 'http://localhost:9999' });
    expect(client).toBeInstanceOf(SurfaceClient);
  });

  test('SurfaceBridgeError has status and body', () => {
    const err = new SurfaceBridgeError(404, 'Not found');
    expect(err.status).toBe(404);
    expect(err.body).toBe('Not found');
    expect(err.name).toBe('SurfaceBridgeError');
    expect(err.message).toContain('404');
  });

  test('automatically handshakes before authenticated requests', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const client = new SurfaceClient({
      fetch: (async (input, init) => {
        const url = String(input);
        calls.push({ url, init });

        if (url.endsWith('/api/handshake')) {
          return new Response(JSON.stringify({ authenticated: true, token: 'token-123', version: '0.2.0' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ case: { title: 'Active case' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof globalThis.fetch,
    });

    const response = await client.getCase();
    expect((response as any).case.title).toBe('Active case');
    expect(calls[0]?.url.endsWith('/api/handshake')).toBe(true);
    expect(new Headers(calls[1]?.init?.headers).get('X-Bridge-Token')).toBe('token-123');
  });

  test('re-handshakes after a 401 response', async () => {
    let apiCalls = 0;
    const client = new SurfaceClient({
      fetch: (async (input, init) => {
        const url = String(input);

        if (url.endsWith('/api/handshake')) {
          return new Response(JSON.stringify({ authenticated: true, token: 'token-456', version: '0.2.0' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        apiCalls += 1;
        if (apiCalls === 1) {
          return new Response('unauthorized', { status: 401 });
        }

        expect(new Headers(init?.headers).get('X-Bridge-Token')).toBe('token-456');
        return new Response(JSON.stringify({ findings: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }) as typeof globalThis.fetch,
    });

    const response = await client.getFindings();
    expect((response as any).findings).toEqual([]);
    expect(apiCalls).toBe(2);
  });
});
