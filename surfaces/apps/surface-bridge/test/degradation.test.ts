import { describe, test, expect, afterAll, beforeAll, setDefaultTimeout } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { startBridge, type BridgeInstance } from '../src/server.ts';

const HEALTH_PORT = 17490;
const DEGRADED_PORT = 17491;

setDefaultTimeout(15_000);

// ─── /api/health extended response ─────────────────────────────────────────

describe('/api/health extended response', () => {
  let bridge: BridgeInstance;

  beforeAll(() => {
    bridge = startBridge({ port: HEALTH_PORT, mockMode: true, projectRoot: process.cwd() });
  });

  afterAll(() => {
    bridge.stop();
  });

  test('returns all required fields', async () => {
    const res = await fetch(`http://127.0.0.1:${HEALTH_PORT}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveProperty('status');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('mockMode');
    expect(body).toHaveProperty('projectRoot');
    expect(body).toHaveProperty('planningExists');
    expect(body).toHaveProperty('caseOpen');
    expect(body).toHaveProperty('uptime');
    expect(body).toHaveProperty('wsClients');
    expect(body).toHaveProperty('activeCaseId');
    expect(body).toHaveProperty('lastFileWatcherEvent');
    expect(body).toHaveProperty('subprocessAvailable');
  });

  test('wsClients is a number >= 0', async () => {
    const res = await fetch(`http://127.0.0.1:${HEALTH_PORT}/api/health`);
    const body = await res.json();
    expect(typeof body.wsClients).toBe('number');
    expect(body.wsClients).toBeGreaterThanOrEqual(0);
  });

  test('uptime is a positive number', async () => {
    const res = await fetch(`http://127.0.0.1:${HEALTH_PORT}/api/health`);
    const body = await res.json();
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  test('status is ok in mock mode', async () => {
    const res = await fetch(`http://127.0.0.1:${HEALTH_PORT}/api/health`);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('subprocessAvailable is true in mock mode', async () => {
    const res = await fetch(`http://127.0.0.1:${HEALTH_PORT}/api/health`);
    const body = await res.json();
    expect(body.subprocessAvailable).toBe(true);
  });
});

// ─── Graceful degradation ──────────────────────────────────────────────────

describe('graceful degradation', () => {
  let bridge: BridgeInstance;
  let tmpDir: string;

  beforeAll(async () => {
    // Create a temp project root with .planning/ folder and config.json
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-degraded-'));
    const planningDir = path.join(tmpDir, '.planning');
    fs.mkdirSync(planningDir, { recursive: true });
    fs.writeFileSync(
      path.join(planningDir, 'config.json'),
      JSON.stringify({ caseId: 'test-case', signal: 'test' }),
    );

    bridge = startBridge({
      port: DEGRADED_PORT,
      mockMode: false,
      projectRoot: tmpDir,
      toolsPath: '/tmp/nonexistent-thrunt-tools-xyz-98765.cjs',
    });

    // Wait for the initial probe to run and fail twice (need consecutiveFailures >= 2)
    // The health monitor probes immediately, then every 60s. We need to wait for
    // at least the first probe, then manually trigger a second to get consecutive failures.
    await new Promise((resolve) => setTimeout(resolve, 2000));
  });

  afterAll(() => {
    bridge.stop();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  test('GET /api/health shows status degraded', async () => {
    const res = await fetch(`http://127.0.0.1:${DEGRADED_PORT}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('degraded');
    expect(body.subprocessAvailable).toBe(false);
  });

  test('GET /api/case/queries still works (not 503)', async () => {
    const res = await fetch(`http://127.0.0.1:${DEGRADED_PORT}/api/case/queries`, {
      headers: { 'X-Bridge-Token': bridge.token },
    });
    // May return 200 with empty array or data — but NOT 503
    expect(res.status).not.toBe(503);
  });

  test('POST /api/case/open returns 503 BRIDGE_DEGRADED', async () => {
    const res = await fetch(`http://127.0.0.1:${DEGRADED_PORT}/api/case/open`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Token': bridge.token,
      },
      body: JSON.stringify({ signal: 'test signal' }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('BRIDGE_DEGRADED');
    expect(body.class).toBe('subprocess');
  });

  test('POST /api/evidence/attach returns 503 BRIDGE_DEGRADED', async () => {
    const res = await fetch(`http://127.0.0.1:${DEGRADED_PORT}/api/evidence/attach`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Token': bridge.token,
      },
      body: JSON.stringify({ surfaceId: 'test', content: 'data' }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('BRIDGE_DEGRADED');
    expect(body.class).toBe('subprocess');
  });

  test('POST /api/execute/pack returns 503 BRIDGE_DEGRADED', async () => {
    const res = await fetch(`http://127.0.0.1:${DEGRADED_PORT}/api/execute/pack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Token': bridge.token,
      },
      body: JSON.stringify({ packId: 'test-pack' }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('BRIDGE_DEGRADED');
    expect(body.class).toBe('subprocess');
  });
});
