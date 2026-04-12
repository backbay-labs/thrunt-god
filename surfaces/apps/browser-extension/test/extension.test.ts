import { describe, test, expect, afterAll, beforeAll } from 'bun:test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { ExtensionBridgeClient } from '../src/lib/bridge-client.ts';
import { startBridge, type BridgeInstance } from '../../surface-bridge/src/server.ts';

const TEST_PORT = 17485;
const MUTATION_PORT = 17487;
const RECONNECT_PORT = 17488;
const RUNTIME_PORT = 17490;
const OKTA_API_PORT = 18180;
const SENTINEL_API_PORT = 18181;
const AWS_API_PORT = 18182;
const EXAMPLE_ROOT = path.resolve(
  import.meta.dir,
  '../../../../thrunt-god/examples/oauth-session-hijack'
);
const TOOLS_PATH = path.resolve(
  import.meta.dir,
  '../../../../thrunt-god/bin/thrunt-tools.cjs'
);
const TRUSTED_EXTENSION_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

let bridge: BridgeInstance;
let mutationBridge: BridgeInstance;
let reconnectBridge: BridgeInstance;
let runtimeBridge: BridgeInstance;
let mutationRoot: string;
let reconnectRoot: string;
let runtimeRoot: string;
let realExampleRoot: string;
let oktaApi: ReturnType<typeof Bun.serve>;
let sentinelApi: ReturnType<typeof Bun.serve>;
let awsApi: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  mutationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-surfaces-ext-mutation-'));
  reconnectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-surfaces-ext-reconnect-'));
  runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-surfaces-ext-runtime-'));
  realExampleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-surfaces-ext-example-'));
  fs.cpSync(EXAMPLE_ROOT, realExampleRoot, { recursive: true });

  process.env.BRIDGE_TEST_OKTA_CREDENTIAL = 'okta-test-placeholder';
  process.env.BRIDGE_TEST_SENTINEL_CREDENTIAL = 'sentinel-test-placeholder';
  process.env.BRIDGE_TEST_AWS_ACCESS_KEY_ID = 'AKIATESTKEY123456';
  process.env.BRIDGE_TEST_AWS_SECRET_ACCESS_KEY = 'aws-secret-key';

  writeRuntimeConfig(runtimeRoot);
  oktaApi = startOktaApi();
  sentinelApi = startSentinelApi();
  awsApi = startAwsApi();

  bridge = startBridge({
    port: TEST_PORT,
    mockMode: false,
    projectRoot: realExampleRoot,
    allowedExtensionIds: [TRUSTED_EXTENSION_ID],
  });
  mutationBridge = startBridge({
    port: MUTATION_PORT,
    mockMode: false,
    projectRoot: mutationRoot,
    toolsPath: TOOLS_PATH,
    allowedExtensionIds: [TRUSTED_EXTENSION_ID],
  });
  reconnectBridge = startBridge({
    port: RECONNECT_PORT,
    mockMode: false,
    projectRoot: reconnectRoot,
    toolsPath: TOOLS_PATH,
    allowedExtensionIds: [TRUSTED_EXTENSION_ID],
  });
  runtimeBridge = startBridge({
    port: RUNTIME_PORT,
    mockMode: false,
    projectRoot: runtimeRoot,
    toolsPath: TOOLS_PATH,
    allowedExtensionIds: [TRUSTED_EXTENSION_ID],
  });
});

afterAll(() => {
  bridge.stop();
  mutationBridge.stop();
  reconnectBridge.stop();
  runtimeBridge.stop();
  oktaApi.stop();
  sentinelApi.stop();
  awsApi.stop();

  const exampleEvidenceDir = path.join(realExampleRoot, '.planning', 'cases', 'oauth-session-hijack', 'EVIDENCE');
  if (fs.existsSync(exampleEvidenceDir)) {
    for (const f of fs.readdirSync(exampleEvidenceDir)) fs.unlinkSync(path.join(exampleEvidenceDir, f));
    fs.rmdirSync(exampleEvidenceDir);
  }

  const tokenPath = path.join(realExampleRoot, '.planning', '.bridge-token');
  if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);

  fs.rmSync(realExampleRoot, { recursive: true, force: true });
  fs.rmSync(mutationRoot, { recursive: true, force: true });
  fs.rmSync(reconnectRoot, { recursive: true, force: true });
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
});

function writeRuntimeConfig(root: string) {
  const planningRoot = path.join(root, '.planning');
  fs.mkdirSync(planningRoot, { recursive: true });
  fs.writeFileSync(path.join(planningRoot, 'config.json'), JSON.stringify({
    connector_profiles: {
      okta: {
        default: {
          auth_type: 'api_key',
          base_url: `http://127.0.0.1:${OKTA_API_PORT}`,
          secret_refs: {
            okta_ref: 'BRIDGE_TEST_OKTA_CREDENTIAL',
          },
        },
      },
      sentinel: {
        default: {
          auth_type: 'bearer',
          base_url: `http://127.0.0.1:${SENTINEL_API_PORT}/v1`,
          secret_refs: {
            sentinel_ref: 'BRIDGE_TEST_SENTINEL_CREDENTIAL',
          },
          default_parameters: {
            workspace_id: 'workspace-local',
          },
        },
      },
      aws: {
        default: {
          auth_type: 'sigv4',
          base_url: `http://127.0.0.1:${AWS_API_PORT}/`,
          region: 'us-east-1',
          secret_refs: {
            access_key_id: 'BRIDGE_TEST_AWS_ACCESS_KEY_ID',
            secret_access_key: 'BRIDGE_TEST_AWS_SECRET_ACCESS_KEY',
          },
        },
      },
    },
  }, null, 2), 'utf-8');
}

function startOktaApi() {
  return Bun.serve({
    port: OKTA_API_PORT,
    fetch() {
      return new Response(JSON.stringify([
        {
          uuid: 'evt-okta-1',
          published: '2026-04-11T12:00:00Z',
          eventType: 'user.session.start',
          displayMessage: 'User session started',
          actor: { alternateId: 'alice@example.com' },
          client: { ipAddress: '203.0.113.10', device: 'Chrome' },
          target: [{ type: 'User', alternateId: 'alice@example.com', displayName: 'Alice' }],
        },
      ]), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
}

function startSentinelApi() {
  return Bun.serve({
    port: SENTINEL_API_PORT,
    fetch() {
      return new Response(JSON.stringify({
        tables: [{
          name: 'PrimaryResult',
          columns: [
            { name: 'TimeGenerated', type: 'datetime' },
            { name: 'IPAddress', type: 'string' },
            { name: 'UserPrincipalName', type: 'string' },
          ],
          rows: [
            ['2026-04-11T12:05:00Z', '203.0.113.10', 'alice@example.com'],
          ],
        }],
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
}

function startAwsApi() {
  return Bun.serve({
    port: AWS_API_PORT,
    fetch() {
      return new Response(JSON.stringify({
        Events: [
          {
            EventId: 'evt-aws-1',
            EventTime: '2026-04-11T12:10:00Z',
            EventName: 'AssumeRole',
            EventSource: 'sts.amazonaws.com',
            Username: 'svc-analytics',
            CloudTrailEvent: JSON.stringify({
              sourceIPAddress: '203.0.113.44',
              userIdentity: { arn: 'arn:aws:iam::123456789012:role/test-role' },
            }),
          },
        ],
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
}

function createClient(baseUrl = `http://127.0.0.1:${TEST_PORT}`): ExtensionBridgeClient {
  return new ExtensionBridgeClient(baseUrl, { extensionId: TRUSTED_EXTENSION_ID });
}

describe('ExtensionBridgeClient', () => {
  test('starts disconnected', () => {
    const client = new ExtensionBridgeClient();
    expect(client.getStatus()).toBe('disconnected');
    expect(client.isConnected()).toBe(false);
  });

  test('falls back gracefully when bridge is unreachable', async () => {
    const client = new ExtensionBridgeClient('http://127.0.0.1:19999');
    await client.checkHealth();
    expect(client.getStatus()).toBe('disconnected');
  });

  test('handshake obtains real token', async () => {
    const client = createClient();
    const ok = await client.handshake();
    expect(ok).toBe(true);
    expect(client.isConnected()).toBe(true);
    expect(client.getStatus()).toBe('connected');
  });

  test('getCaseView returns real active-case data after handshake', async () => {
    const client = createClient();
    await client.handshake();
    const view = await client.getCaseView();
    expect(view.view.case.title).toContain('OAuth');
    expect(view.view.case.mode).toBe('case');
    expect(view.view.hypotheses.length).toBe(3);
    expect(view.view.recentQueries.length).toBeGreaterThanOrEqual(3);
    expect(view.view.recentReceipts.length).toBeGreaterThanOrEqual(3);
    expect(view.view.progress.phases.length).toBe(3);
  });

  test('captureCertificationSnapshot stores sanitized live session artifacts', async () => {
    const client = createClient();
    await client.handshake();
    const result = await client.captureCertificationSnapshot({
      vendorId: 'okta',
      pageUrl: 'https://acme-admin.okta.com/admin/reports/system-log',
      pageTitle: 'System Log',
      rawHtml: '<div>alice@example.com</div><div>123456789012</div>',
      extraction: {
        detect: true,
        context: { pageType: 'log_viewer', extraction: { confidence: 'high', completeness: 'complete' } },
        query: { language: 'okta-filter' },
        table: { totalRows: 1 },
        entities: [{ value: 'alice@example.com' }],
        supportedActions: ['capture_live_snapshot'],
      },
    });

    expect(result.success).toBe(true);
    expect(result.campaignId).toMatch(/^CERT-OKTA-/);
    expect(result.snapshotPath).toContain('.planning/certification/campaigns/');
    expect(result.campaign?.status).toBe('review-required');
    expect(result.redactionCount).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(realExampleRoot, result.snapshotPath))).toBe(true);
    expect(fs.existsSync(path.join(realExampleRoot, result.metadataPath))).toBe(true);
  });

  test('openCase creates a real THRUNT case in a fresh workspace', async () => {
    const client = createClient(`http://127.0.0.1:${MUTATION_PORT}`);
    const result = await client.openCase({
      signal: 'Sentinel incident shows impossible-travel sign-in followed by mailbox access',
      owner: 'operator',
      vendorContext: {
        vendorId: 'sentinel',
        consoleName: 'Microsoft Sentinel',
        pageType: 'incident',
        pageUrl: 'https://portal.azure.com/#view/Microsoft_Azure_Security_Insights',
        pageTitle: 'Incident details',
        metadata: {},
        capturedAt: new Date().toISOString(),
      },
    });
    expect(result.created).toBe(true);
    expect(result.case.title).toContain('Microsoft Sentinel');
    expect(fs.existsSync(path.join(mutationRoot, '.planning', '.active-case'))).toBe(true);
  });

  test('executeNext returns a real mutation response after openCase', async () => {
    const client = createClient(`http://127.0.0.1:${MUTATION_PORT}`);
    await client.handshake();
    const result = await client.executeNext();
    expect(result.success).toBe(true);
    expect(result.mutation?.mutated).toBe(true);
    expect(result.view?.progress.currentPlan).toBe(2);
  });

  test('executePack supports repeated preview and runtime execution cycles', async () => {
    const client = createClient(`http://127.0.0.1:${RUNTIME_PORT}`);
    await client.openCase({
      signal: 'AWS CloudTrail shows suspicious role assumption from new source IP',
      owner: 'operator',
      vendorContext: {
        vendorId: 'aws',
        consoleName: 'AWS CloudTrail',
        pageType: 'log_viewer',
        pageUrl: 'https://console.aws.amazon.com/cloudtrail/home',
        pageTitle: 'CloudTrail Event History',
        metadata: {},
        capturedAt: new Date().toISOString(),
      },
    });

    const preview = await client.executePack({
      packId: 'domain.cloud-abuse',
      target: 'AWS CloudTrail principal abuse sweep',
      dryRun: true,
      parameters: {
        focus_principal: 'svc-analytics',
        focus_resource: 'critical-bucket',
        lookback_hours: 24,
      },
    });
    expect(preview.success).toBe(true);
    expect(preview.previewState?.ready).toBe(true);

    const execute = await client.executePack({
      packId: 'domain.cloud-abuse',
      target: 'AWS CloudTrail principal abuse sweep',
      parameters: {
        focus_principal: 'svc-analytics',
        focus_resource: 'critical-bucket',
        lookback_hours: 24,
      },
    });
    expect(execute.success).toBe(true);
    expect(execute.executionState?.mode).toBe('pack');
    expect(execute.createdArtifacts?.some((artifact) => artifact.type === 'query')).toBe(true);
    expect(execute.createdArtifacts?.some((artifact) => artifact.type === 'receipt')).toBe(true);

    const secondPreview = await client.executePack({
      packId: 'domain.cloud-abuse',
      target: 'AWS CloudTrail principal abuse sweep',
      dryRun: true,
      parameters: {
        focus_principal: 'svc-analytics',
        focus_resource: 'critical-bucket',
        lookback_hours: 24,
      },
    });
    expect(secondPreview.success).toBe(true);
    expect(secondPreview.previewState?.targets[0].connectorId).toBe('aws');
  });

  test('stale token triggers automatic re-handshake after bridge restart', async () => {
    const client = createClient();
    await client.handshake();

    bridge.stop();
    bridge = startBridge({
      port: TEST_PORT,
      mockMode: false,
      projectRoot: realExampleRoot,
      allowedExtensionIds: [TRUSTED_EXTENSION_ID],
    });

    const view = await client.getCaseView();
    expect(view.view.case.title).toContain('OAuth');
  });

  test('websocket reconnects with backoff and receives events after bridge restart', async () => {
    const client = new ExtensionBridgeClient(`http://127.0.0.1:${RECONNECT_PORT}`, {
      extensionId: TRUSTED_EXTENSION_ID,
      reconnectInitialMs: 50,
      reconnectMaxMs: 200,
      heartbeatTimeoutMs: 2_500,
    });

    await client.openCase({
      signal: 'AWS CloudTrail shows suspicious role assumption from new source IP',
      owner: 'operator',
      vendorContext: {
        vendorId: 'aws',
        consoleName: 'AWS CloudTrail',
        pageType: 'log_viewer',
        pageUrl: 'https://console.aws.amazon.com/cloudtrail/home',
        pageTitle: 'CloudTrail Event History',
        metadata: {},
        capturedAt: new Date().toISOString(),
      },
    });

    const events: string[] = [];
    const unsubscribe = client.subscribeEvents((event) => {
      events.push(event.type);
    });

    await Bun.sleep(150);
    reconnectBridge.stop();
    reconnectBridge = startBridge({
      port: RECONNECT_PORT,
      mockMode: false,
      projectRoot: reconnectRoot,
      toolsPath: TOOLS_PATH,
      allowedExtensionIds: [TRUSTED_EXTENSION_ID],
    });

    await Bun.sleep(1_500);

    const triggerClient = createClient(`http://127.0.0.1:${RECONNECT_PORT}`);
    const attachResult = await triggerClient.attachEvidence({
      surfaceId: 'browser-extension',
      type: 'entity_clip',
      vendorId: 'aws',
      sourceUrl: 'https://console.aws.amazon.com/cloudtrail/home',
      capturedAt: new Date().toISOString(),
      capturedBy: 'operator',
      hypothesisIds: ['HYP-01'],
      payload: { kind: 'entity', entityType: 'ip', value: '203.0.113.44' },
    });
    expect(attachResult.success).toBe(true);

    await Bun.sleep(1_200);
    unsubscribe();

    expect(events).toContain('evidence:attached');
  });
});
