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
});
