import { describe, test, expect, afterAll, beforeAll, setDefaultTimeout } from 'bun:test';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { startBridge, type BridgeInstance } from '../src/server.ts';

const MOCK_PORT = 17483;
const REAL_PORT = 17484;
const MUTATION_PORT = 17486;
const RUNTIME_PORT = 17489;
const OKTA_API_PORT = 18080;
const SENTINEL_API_PORT = 18081;
const AWS_API_PORT = 18082;
const EXAMPLE_ROOT = path.resolve(
  import.meta.dir,
  '../../../../thrunt-god/examples/oauth-session-hijack'
);
const FIXTURE_ROOT = path.resolve(
  import.meta.dir,
  '../../../packages/surfaces-site-adapters/test/fixtures',
);
const TOOLS_PATH = path.resolve(
  import.meta.dir,
  '../../../../thrunt-god/bin/thrunt-tools.cjs'
);
const TRUSTED_EXTENSION_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TRUSTED_EXTENSION_ORIGIN = `chrome-extension://${TRUSTED_EXTENSION_ID}`;
const UNTRUSTED_EXTENSION_ORIGIN = 'chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

let mockBridge: BridgeInstance;
let realBridge: BridgeInstance;
let mutationBridge: BridgeInstance;
let runtimeBridge: BridgeInstance;
let mutationRoot: string;
let runtimeRoot: string;
let realExampleRoot: string;
let oktaApi: ReturnType<typeof Bun.serve>;
let sentinelApi: ReturnType<typeof Bun.serve>;
let awsApi: ReturnType<typeof Bun.serve>;

setDefaultTimeout(20_000);

interface FixtureExpectation {
  detect: boolean;
  pageType: string;
  confidence: 'high' | 'medium' | 'low';
  completeness: 'complete' | 'partial' | 'unsupported';
  supported: boolean;
  tableRows: number;
  queryLanguage: string | null;
  entityValues: string[];
  failureReasons?: string[];
}

interface FixtureDefinition {
  file: string;
  url: string;
  expected: FixtureExpectation;
}

interface FixtureManifest {
  fixtures: FixtureDefinition[];
}

beforeAll(() => {
  mutationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-surfaces-bridge-'));
  runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-surfaces-runtime-'));
  realExampleRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-surfaces-example-'));
  fs.cpSync(EXAMPLE_ROOT, realExampleRoot, { recursive: true });

  process.env.BRIDGE_TEST_OKTA_CREDENTIAL = 'okta-test-placeholder';
  process.env.BRIDGE_TEST_SENTINEL_CREDENTIAL = 'sentinel-test-placeholder';
  process.env.BRIDGE_TEST_AWS_ACCESS_KEY_ID = 'AKIATESTKEY123456';
  process.env.BRIDGE_TEST_AWS_SECRET_ACCESS_KEY = 'aws-secret-key';

  writeRuntimeConfig(runtimeRoot);

  oktaApi = startOktaApi();
  sentinelApi = startSentinelApi();
  awsApi = startAwsApi();

  mockBridge = startBridge({ port: MOCK_PORT, mockMode: true });
  realBridge = startBridge({
    port: REAL_PORT,
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
  runtimeBridge = startBridge({
    port: RUNTIME_PORT,
    mockMode: false,
    projectRoot: runtimeRoot,
    toolsPath: TOOLS_PATH,
    allowedExtensionIds: [TRUSTED_EXTENSION_ID],
  });
});

afterAll(() => {
  mockBridge.stop();
  realBridge.stop();
  mutationBridge.stop();
  runtimeBridge.stop();
  oktaApi.stop();
  sentinelApi.stop();
  awsApi.stop();

  const tokenPath = path.join(realExampleRoot, '.planning', '.bridge-token');
  if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);

  fs.rmSync(realExampleRoot, { recursive: true, force: true });
  fs.rmSync(mutationRoot, { recursive: true, force: true });
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
});

function exampleCaseRoot(): string {
  return path.join(realExampleRoot, '.planning', 'cases', 'oauth-session-hijack');
}

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

function readFixture(vendorId: string, file: string): FixtureDefinition {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_ROOT, vendorId, 'fixtures.json'), 'utf-8'),
  ) as FixtureManifest;
  const fixture = manifest.fixtures.find((entry) => entry.file === file);
  if (!fixture) throw new Error(`Missing fixture ${vendorId}/${file}`);
  return fixture;
}

function readFixtureHtml(vendorId: string, file: string): string {
  return fs.readFileSync(path.join(FIXTURE_ROOT, vendorId, file), 'utf-8');
}

// ─── Mock mode tests ───────────────────────────────────────────────────────

describe('Mock mode', () => {
  const base = `http://127.0.0.1:${MOCK_PORT}`;

  test('GET /api/health returns ok', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.status).toBe('ok');
    expect(body.mockMode).toBe(true);
    expect(body.version).toBe('0.2.0');
  });

  test('GET /api/case returns mock case', async () => {
    const res = await fetch(`${base}/api/case`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.case.title).toContain('OAuth Session Hijack');
  });

  test('GET /api/case/view returns full view model', async () => {
    const res = await fetch(`${base}/api/case/view`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.view.hypotheses.length).toBeGreaterThan(0);
    expect(body.view.recentQueries.length).toBeGreaterThan(0);
    expect(body.view.recentEvidence.length).toBeGreaterThan(0);
  });
});

// ─── Real artifact mode tests ──────────────────────────────────────────────

describe('Real artifact mode', () => {
  const base = `http://127.0.0.1:${REAL_PORT}`;
  const headers = () => ({ 'X-Bridge-Token': realBridge.token });

  test('GET /api/health is public (no token required)', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.mockMode).toBe(false);
    expect(body.caseOpen).toBe(true);
    expect(body.planningExists).toBe(true);
  });

  test('GET /api/health does not echo disallowed origins', async () => {
    const res = await fetch(`${base}/api/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('https://evil.example');
  });

  test('GET /api/case requires token in real mode', async () => {
    const res = await fetch(`${base}/api/case`);
    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.code).toBe('AUTH_MISSING_TOKEN');
  });

  test('GET /api/case returns active case mission with token', async () => {
    const res = await fetch(`${base}/api/case`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.case.title).toContain('OAuth');
    expect(body.case.mode).toBe('case');
    expect(body.case.signal).toBeTruthy();
    expect(body.case.scope).toBeTruthy();
  });

  test('GET /api/case/progress returns real state', async () => {
    const res = await fetch(`${base}/api/case/progress`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.progress.currentPhase).toBe(3);
  });

  test('GET /api/case/hypotheses returns parsed hypotheses', async () => {
    const res = await fetch(`${base}/api/case/hypotheses`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.hypotheses.length).toBe(3);
    expect(body.hypotheses[0].id).toBe('HYP-01');
    expect(body.hypotheses[0].status).toBe('Supported');
  });

  test('GET /api/case/queries returns parsed queries', async () => {
    const res = await fetch(`${base}/api/case/queries`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.queries.length).toBeGreaterThanOrEqual(3);
    expect(body.queries[0].queryId).toBeTruthy();
    expect(body.queries[0].relatedHypotheses.length).toBeGreaterThan(0);
    expect(body.total).toBe(body.queries.length);
  });

  test('GET /api/case/receipts returns parsed receipts', async () => {
    const res = await fetch(`${base}/api/case/receipts`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.receipts.length).toBeGreaterThanOrEqual(3);
    expect(body.receipts[0].claimStatus).toBe('supports');
  });

  test('GET /api/case/findings returns parsed findings', async () => {
    const res = await fetch(`${base}/api/case/findings`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.findings.length).toBeGreaterThan(0);
  });

  test('GET /api/case/view returns full projected view', async () => {
    const res = await fetch(`${base}/api/case/view`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const view = body.view;
    expect(view.case.title).toContain('OAuth');
    expect(view.progress.phases.length).toBe(3);
    expect(view.hypotheses.length).toBe(3);
    expect(view.recentQueries.length).toBeGreaterThanOrEqual(3);
    expect(view.recentReceipts.length).toBeGreaterThanOrEqual(3);
    expect(view.findings.length).toBeGreaterThan(0);
    expect(view.recommendedAction).toBeDefined();
  });

  test('POST /api/evidence/attach canonicalizes structured query clips into QUERIES', async () => {
    const res = await fetch(`${base}/api/evidence/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        surfaceId: 'browser-ext',
        type: 'query_clip',
        vendorId: 'okta',
        sourceUrl: 'https://admin.example.okta.com/admin/syslog',
        capturedAt: new Date().toISOString(),
        capturedBy: 'test-analyst',
        hypothesisIds: ['HYP-01'],
        payload: { kind: 'query', language: 'okta-syslog', statement: 'actor.displayName eq "svc-analytics"' },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.attachmentId).toMatch(/^QRY-/);
    expect(body.artifactKind).toBe('query');
    expect(body.classification).toBe('query_candidate');

    const queryPath = path.join(exampleCaseRoot(), 'QUERIES', `${body.attachmentId}.md`);
    expect(fs.existsSync(queryPath)).toBe(true);
    const content = fs.readFileSync(queryPath, 'utf-8');
    expect(content).toContain('svc-analytics');
    expect(content).toContain('HYP-01');
    expect(content).toContain('okta');
  });

  test('POST /api/handshake rejects token bootstrap from disallowed origins', async () => {
    const res = await fetch(`${base}/api/handshake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({ extensionId: 'thrunt-surfaces-extension' }),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.code).toBe('AUTH_ORIGIN_FORBIDDEN');
  });

  test('POST /api/handshake rejects token bootstrap from untrusted extension origins', async () => {
    const res = await fetch(`${base}/api/handshake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: UNTRUSTED_EXTENSION_ORIGIN,
      },
      body: JSON.stringify({
        extensionId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        surfaceId: 'browser-extension',
      }),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.code).toBe('AUTH_ORIGIN_FORBIDDEN');
  });

  test('POST /api/handshake rejects wrong token', async () => {
    const res = await fetch(`${base}/api/handshake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'wrong-token' }),
    });
    expect(res.status).toBe(401);
  });

  test('POST /api/handshake bootstraps a token for trusted extension origins', async () => {
    const res = await fetch(`${base}/api/handshake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: TRUSTED_EXTENSION_ORIGIN,
      },
      body: JSON.stringify({
        extensionId: TRUSTED_EXTENSION_ID,
        surfaceId: 'browser-extension',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.authenticated).toBe(true);
    expect(body.version).toBe('0.2.0');
    expect(body.token).toBe(realBridge.token);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(TRUSTED_EXTENSION_ORIGIN);
  });

  test('POST /api/handshake rejects extension identity mismatches', async () => {
    const res = await fetch(`${base}/api/handshake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: TRUSTED_EXTENSION_ORIGIN,
      },
      body: JSON.stringify({
        extensionId: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        surfaceId: 'browser-extension',
      }),
    });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.code).toBe('AUTH_ORIGIN_FORBIDDEN');
  });

  test('POST /api/handshake accepts valid token', async () => {
    const authBase = `http://127.0.0.1:${MUTATION_PORT}`;
    const res = await fetch(`${authBase}/api/handshake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: mutationBridge.token }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.authenticated).toBe(true);
    expect(body.version).toBe('0.2.0');
    expect(body.token).toBe(mutationBridge.token);
  });

  test('GET /api/case rejects authenticated requests from untrusted browser origins', async () => {
    const authBase = `http://127.0.0.1:${MUTATION_PORT}`;
    const res = await fetch(`${authBase}/api/case`, {
      headers: {
        'X-Bridge-Token': mutationBridge.token,
        Origin: UNTRUSTED_EXTENSION_ORIGIN,
      },
    });
    expect(res.status).toBe(403);
    const body = await res.json() as any;
    expect(body.code).toBe('AUTH_ORIGIN_FORBIDDEN');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  test('POST /api/certification/prerequisites emits explicit blocked outputs when live prerequisites are missing', async () => {
    const res = await fetch(`${base}/api/certification/prerequisites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        vendorId: 'sentinel',
        operator: 'operator',
        persistBlockedCampaign: true,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.report.readyForCapture).toBe(false);
    expect(body.report.readyForRuntime).toBe(false);
    expect(body.report.blockerReasons.some((reason: string) => reason.includes('No live browser session metadata supplied'))).toBe(true);
    expect(body.report.checks.some((check: any) => (
      (check.id === 'connector_profile' && check.status === 'fail')
      || (check.id === 'runtime_doctor' && check.status === 'fail')
    ))).toBe(true);
    expect(body.campaign.status).toBe('live-blocked');
    expect(body.campaign.prerequisites.vendorId).toBe('sentinel');
  });
});

// ─── Mutation path tests ───────────────────────────────────────────────────

describe('Mutation path mode', () => {
  const base = `http://127.0.0.1:${MUTATION_PORT}`;
  const headers = () => ({ 'X-Bridge-Token': mutationBridge.token });

  test('starts without a case', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.caseOpen).toBe(false);
  });

  test('POST /api/case/open bootstraps a real THRUNT case', async () => {
    const res = await fetch(`${base}/api/case/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        signal: 'Okta system log shows suspicious consent grant from unknown ASN',
        owner: 'operator',
        vendorContext: {
          vendorId: 'okta',
          consoleName: 'Okta System Log',
          pageUrl: 'https://acme.okta.com/admin/reports/system-log',
          pageTitle: 'System Log',
          extracted: { pageType: 'log_viewer' },
          capturedAt: new Date().toISOString(),
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.created).toBe(true);
    expect(body.case.mode).toBe('case');
    expect(body.case.title).toContain('Okta');
    expect(body.command.join(' ')).toContain('case');
    expect(fs.existsSync(path.join(mutationRoot, '.planning', '.active-case'))).toBe(true);
  });

  test('POST /api/evidence/attach is later consumed by audit-evidence', async () => {
    const res = await fetch(`${base}/api/evidence/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        surfaceId: 'browser-extension',
        type: 'manual_note',
        vendorId: 'okta',
        sourceUrl: 'https://acme.okta.com/admin/reports/system-log',
        capturedAt: new Date().toISOString(),
        capturedBy: 'operator',
        hypothesisIds: [],
        payload: { kind: 'note', text: 'Captured raw admin context before correlation.' },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.success).toBe(true);

    const auditRaw = execFileSync(process.execPath, [
      TOOLS_PATH,
      'audit-evidence',
      '--raw',
    ], {
      cwd: mutationRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const audit = JSON.parse(auditRaw);
    expect(audit.results.some((result: any) => result.type === 'captured_evidence')).toBe(true);
    expect(audit.summary.by_category.unlinked_evidence).toBe(1);
    expect(audit.summary.by_category.follow_up).toBe(1);
  });

  test('POST /api/execute/pack preview surfaces honest readiness blockers when connector profiles are missing', async () => {
    const res = await fetch(`${base}/api/execute/pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        packId: 'technique.t1078-valid-accounts',
        target: 'Okta anomalous session review',
        dryRun: true,
        parameters: {
          tenant: 'acme',
          focus_user: 'alice@example.com',
          lookback_hours: 24,
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.previewState.ready).toBe(false);
    expect(body.previewState.blockers.some((blocker: string) => blocker.includes('No connector profile found'))).toBe(true);
  });

  test('query clip -> QUERIES, table clip -> RECEIPTS, ambiguous entity -> EVIDENCE', async () => {
    const queryRes = await fetch(`${base}/api/evidence/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        surfaceId: 'browser-extension',
        type: 'query_clip',
        vendorId: 'okta',
        sourceUrl: 'https://acme.okta.com/admin/reports/system-log',
        capturedAt: new Date().toISOString(),
        capturedBy: 'operator',
        hypothesisIds: ['HYP-01'],
        context: {
          pageTitle: 'System Log',
          pageType: 'log_viewer',
          extraction: { supported: true, confidence: 'high', completeness: 'complete', failureReasons: [], detectedSignals: ['page:log_viewer'] },
        },
        payload: { kind: 'query', language: 'okta-filter', statement: 'actor.alternateId eq "alice@example.com"' },
      }),
    });
    const queryBody = await queryRes.json() as any;
    expect(queryBody.artifactKind).toBe('query');

    const receiptRes = await fetch(`${base}/api/evidence/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        surfaceId: 'browser-extension',
        type: 'table_clip',
        vendorId: 'okta',
        sourceUrl: 'https://acme.okta.com/admin/reports/system-log',
        capturedAt: new Date().toISOString(),
        capturedBy: 'operator',
        hypothesisIds: ['HYP-01'],
        context: {
          pageTitle: 'System Log',
          pageType: 'log_viewer',
          extraction: { supported: true, confidence: 'high', completeness: 'complete', failureReasons: [], detectedSignals: ['page:log_viewer'] },
          sourceQuery: { language: 'okta-filter', statement: 'actor.alternateId eq "alice@example.com"' },
        },
        payload: {
          kind: 'table',
          headers: ['Actor', 'IP'],
          rows: [['alice@example.com', '203.0.113.10']],
          rowCount: 1,
        },
      }),
    });
    const receiptBody = await receiptRes.json() as any;
    expect(receiptBody.artifactKind).toBe('receipt');
    expect(receiptBody.classification).toBe('receipt_candidate');
    expect(receiptBody.createdArtifacts.some((artifact: any) => artifact.type === 'receipt')).toBe(true);
    expect(receiptBody.createdArtifacts.some((artifact: any) => artifact.type === 'query')).toBe(true);

    const ambiguousRes = await fetch(`${base}/api/evidence/attach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        surfaceId: 'browser-extension',
        type: 'entity_clip',
        vendorId: 'okta',
        sourceUrl: 'https://acme.okta.com/admin/reports/system-log',
        capturedAt: new Date().toISOString(),
        capturedBy: 'operator',
        hypothesisIds: [],
        context: {
          pageTitle: 'System Log',
          pageType: 'log_viewer',
          extraction: { supported: true, confidence: 'low', completeness: 'partial', failureReasons: ['No source query detected'], detectedSignals: ['page:log_viewer'] },
        },
        payload: { kind: 'entity', entityType: 'user', value: 'alice@example.com' },
      }),
    });
    const ambiguousBody = await ambiguousRes.json() as any;
    expect(ambiguousBody.artifactKind).toBe('evidence');
    expect(ambiguousBody.classification).toBe('ambiguous');

    const viewRes = await fetch(`${base}/api/case/view`, { headers: headers() });
    const viewBody = await viewRes.json() as any;
    expect(viewBody.view.recentQueries.length).toBeGreaterThan(0);
    expect(viewBody.view.recentReceipts.length).toBeGreaterThan(0);
    expect(viewBody.view.recentEvidence.length).toBeGreaterThan(0);
  });

  test('POST /api/execute/next performs a real THRUNT state mutation', async () => {
    const res = await fetch(`${base}/api/execute/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.mutation?.mutated).toBe(true);
    expect(body.command.join(' ')).toContain('state');
    expect(body.view.progress.currentPlan).toBe(2);

    const refreshed = await fetch(`${base}/api/case/view`, { headers: headers() });
    const refreshedBody = await refreshed.json() as any;
    expect(refreshedBody.view.progress.currentPlan).toBe(2);
  });
});

describe('Runtime depth mode', () => {
  const base = `http://127.0.0.1:${RUNTIME_PORT}`;
  const headers = () => ({ 'X-Bridge-Token': runtimeBridge.token });
  let runtimeCampaignId = '';

  test('POST /api/case/open prepares a runtime-backed case', async () => {
    const res = await fetch(`${base}/api/case/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        signal: 'AWS CloudTrail shows suspicious AssumeRole activity from new source IP',
        owner: 'operator',
        vendorContext: {
          vendorId: 'aws',
          consoleName: 'AWS Console',
          pageUrl: 'https://console.aws.amazon.com/cloudtrail/home',
          pageTitle: 'CloudTrail Event History',
          extracted: { pageType: 'log_viewer' },
          capturedAt: new Date().toISOString(),
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.created).toBe(true);
  });

  test('certification campaign endpoints capture, replay, attach runtime results, and promote approved baselines', async () => {
    const fixture = readFixture('aws', 'cloudtrail-rich.html');
    const captureRes = await fetch(`${base}/api/certification/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        vendorId: 'aws',
        pageUrl: fixture.url,
        pageTitle: 'CloudTrail Event History',
        rawHtml: readFixtureHtml('aws', fixture.file),
        extraction: {
          detect: true,
          context: {
            pageType: 'log_viewer',
            extraction: {
              supported: true,
              confidence: 'high',
              completeness: 'complete',
              failureReasons: [],
            },
          },
          query: null,
          table: { totalRows: 3 },
          entities: [],
          supportedActions: [],
        },
        tenantLabel: 'runtime-acme',
        environmentLabel: 'live',
        operator: 'operator',
      }),
    });

    expect(captureRes.status).toBe(201);
    const captureBody = await captureRes.json() as any;
    runtimeCampaignId = captureBody.campaignId;
    expect(runtimeCampaignId).toMatch(/^CERT-AWS-/);
    expect(fs.existsSync(path.join(runtimeRoot, captureBody.campaignPath))).toBe(true);

    const listRes = await fetch(`${base}/api/certification/campaigns`, { headers: headers() });
    const listBody = await listRes.json() as any;
    expect(listBody.campaigns.some((campaign: any) => campaign.campaignId === runtimeCampaignId)).toBe(true);

    const replayRes = await fetch(`${base}/api/certification/campaigns/${runtimeCampaignId}/replay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({ comparedAgainst: 'captured' }),
    });
    expect(replayRes.status).toBe(200);
    const replayBody = await replayRes.json() as any;
    expect(replayBody.campaign.status).toBe('review-required');
    expect(replayBody.campaign.replay.pass).toBe(true);

    const previewRes = await fetch(`${base}/api/certification/campaigns/${runtimeCampaignId}/runtime/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        packId: 'domain.cloud-abuse',
        target: 'AWS CloudTrail principal abuse sweep',
        parameters: {
          tenant: 'acme',
          focus_principal: 'svc-analytics',
          focus_resource: 'critical-bucket',
          lookback_hours: 24,
        },
      }),
    });
    expect(previewRes.status).toBe(200);
    const previewBody = await previewRes.json() as any;
    expect(previewBody.campaign.runtimePreviewStatus).toBe('ready');

    const executeRes = await fetch(`${base}/api/certification/campaigns/${runtimeCampaignId}/runtime/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        packId: 'domain.cloud-abuse',
        target: 'AWS CloudTrail principal abuse sweep',
        parameters: {
          tenant: 'acme',
          focus_principal: 'svc-analytics',
          focus_resource: 'critical-bucket',
          lookback_hours: 24,
        },
      }),
    });
    expect(executeRes.status).toBe(200);
    const executeBody = await executeRes.json() as any;
    expect(executeBody.campaign.runtimeExecuteStatus).toBe('ok');
    expect(executeBody.campaign.runtimeExecute.queryIds.length).toBeGreaterThan(0);

    const submitRes = await fetch(`${base}/api/certification/campaigns/${runtimeCampaignId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        submittedBy: 'operator',
        notes: 'Replay and runtime evidence are ready for reviewer inspection',
      }),
    });
    expect(submitRes.status).toBe(200);
    const submitBody = await submitRes.json() as any;
    expect(submitBody.campaign.reviewState).toBe('ready_for_review');

    const reviewRes = await fetch(`${base}/api/certification/campaigns/${runtimeCampaignId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        reviewer: 'reviewer-1',
        decision: 'approve',
        notes: 'Runtime and replay both look healthy',
      }),
    });
    expect(reviewRes.status).toBe(200);
    const reviewBody = await reviewRes.json() as any;
    expect(reviewBody.campaign.status).toBe('live-certified');

    const promoteRes = await fetch(`${base}/api/certification/campaigns/${runtimeCampaignId}/promote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        reviewer: 'reviewer-1',
        decision: 'approve',
        target: 'baseline',
        notes: 'Promote this capture as the live replay baseline',
      }),
    });
    expect(promoteRes.status).toBe(200);
    const promoteBody = await promoteRes.json() as any;
    const baselinePromotion = promoteBody.campaign.promotions.find((entry: any) => entry.target === 'baseline');
    expect(baselinePromotion.status).toBe('approved');
    expect(fs.existsSync(path.join(runtimeRoot, baselinePromotion.outputPath))).toBe(true);
  });

  test('rejects traversal-like certification vendor ids at capture time', async () => {
    const res = await fetch(`${base}/api/certification/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        vendorId: '../../escape',
        pageUrl: 'https://example.invalid/case',
        pageTitle: 'Invalid capture',
        rawHtml: '<div>capture</div>',
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toContain('Invalid certification vendorId');
  });

  test('rejects traversal-like certification campaign ids after URL decoding', async () => {
    const res = await fetch(`${base}/api/certification/campaigns/..%2F..%2Fescape`, {
      headers: headers(),
    });

    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toBe('Invalid certification campaign ID');
  });

  test('certification history, drift trends, baselines, freshness, and churn endpoints reflect campaign history', async () => {
    const [historyRes, trendsRes, baselinesRes, freshnessRes, churnRes] = await Promise.all([
      fetch(`${base}/api/certification/history`, { headers: headers() }),
      fetch(`${base}/api/certification/drift-trends`, { headers: headers() }),
      fetch(`${base}/api/certification/baselines`, { headers: headers() }),
      fetch(`${base}/api/certification/freshness`, { headers: headers() }),
      fetch(`${base}/api/certification/churn`, { headers: headers() }),
    ]);

    expect(historyRes.status).toBe(200);
    expect(trendsRes.status).toBe(200);
    expect(baselinesRes.status).toBe(200);
    expect(freshnessRes.status).toBe(200);
    expect(churnRes.status).toBe(200);

    const historyBody = await historyRes.json() as any;
    const trendsBody = await trendsRes.json() as any;
    const baselinesBody = await baselinesRes.json() as any;
    const freshnessBody = await freshnessRes.json() as any;
    const churnBody = await churnRes.json() as any;

    const awsHistory = historyBody.history.find((entry: any) => entry.vendorId === 'aws');
    const awsTrend = trendsBody.trends.find((entry: any) => entry.vendorId === 'aws');
    const awsBaseline = baselinesBody.baselines.find((entry: any) => entry.vendorId === 'aws' && entry.active);
    const awsFreshness = freshnessBody.freshness.find((entry: any) => entry.vendorId === 'aws');
    const awsChurn = churnBody.churn.find((entry: any) => entry.vendorId === 'aws');

    expect(awsHistory.currentBaselineCampaignId).toBe(runtimeCampaignId);
    expect(awsHistory.lastCampaignId).toBe(runtimeCampaignId);
    expect(awsHistory.currentReviewState).toBe('approved');
    expect(awsTrend.currentPosture).toBe('live-certified');
    expect(awsTrend.lastStableCampaignId).toBe(runtimeCampaignId);
    expect(awsBaseline.campaignId).toBe(runtimeCampaignId);
    expect(awsFreshness.state).toBe('fresh');
    expect(awsChurn.currentStabilityPosture).toBe('stable');
  });

  test('POST /api/execute/pack dryRun preview resolves rendered targets and readiness', async () => {
    const res = await fetch(`${base}/api/execute/pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        packId: 'technique.t1078-valid-accounts',
        target: 'Okta anomalous session review',
        dryRun: true,
        parameters: {
          tenant: 'acme',
          focus_user: 'alice@example.com',
          lookback_hours: 24,
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.previewState.ready).toBe(true);
    expect(body.previewState.targets[0].connectorId).toBe('okta');
  });

  test('POST /api/execute/pack dryRun infers Okta focus_user from vendor context entities', async () => {
    const res = await fetch(`${base}/api/execute/pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        dryRun: true,
        vendorContext: {
          vendorId: 'okta',
          consoleName: 'Okta',
          pageUrl: 'https://acme-admin.okta.com/report/system_log_2',
          pageTitle: 'System Log',
          extracted: {
            metadata: {
              orgName: 'acme',
              entities: [
                { type: 'other', value: 'Connor Whelan (User)', context: 'okta-table-actor' },
                { type: 'ip', value: '73.68.55.51', context: 'okta-table-ip' },
              ],
            },
            extraction: {
              supported: true,
              confidence: 'high',
              completeness: 'complete',
              failureReasons: [],
              detectedSignals: ['page:log_viewer'],
            },
          },
          capturedAt: new Date().toISOString(),
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(['technique.t1078-valid-accounts', 'technique.t1098-account-manipulation']).toContain(body.resolvedPackId);
    expect(body.previewState.ready).toBe(true);
    expect(body.previewState.targets[0].connectorId).toBe('okta');
    expect(body.previewState.targets[0].querySummary).toContain('Connor Whelan');
    expect(body.previewState.targets[0].querySummary).not.toContain('Apr 11 20:47:09');
  });

  test('POST /api/execute/pack performs real runtime execution beyond pack resolution', async () => {
    const res = await fetch(`${base}/api/execute/pack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        packId: 'domain.cloud-abuse',
        target: 'AWS CloudTrail principal abuse sweep',
        parameters: {
          tenant: 'acme',
          focus_principal: 'svc-analytics',
          focus_resource: 'critical-bucket',
          lookback_hours: 24,
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.executionState.mode).toBe('pack');
    expect(body.createdArtifacts.some((artifact: any) => artifact.type === 'query')).toBe(true);
    expect(body.createdArtifacts.some((artifact: any) => artifact.type === 'receipt')).toBe(true);

    const caseDir = path.join(runtimeRoot, '.planning', 'cases');
    const caseSlug = fs.readFileSync(path.join(runtimeRoot, '.planning', '.active-case'), 'utf-8').trim();
    const queriesDir = path.join(caseDir, caseSlug, 'QUERIES');
    const receiptsDir = path.join(caseDir, caseSlug, 'RECEIPTS');
    expect(fs.readdirSync(queriesDir).length).toBeGreaterThan(0);
    expect(fs.readdirSync(receiptsDir).length).toBeGreaterThan(0);
  });

  test('POST /api/execute/target executes direct runtime connector queries', async () => {
    const res = await fetch(`${base}/api/execute/target`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers() },
      body: JSON.stringify({
        connectorId: 'sentinel',
        dataset: 'events',
        query: 'SigninLogs | take 1',
        timeWindowMinutes: 60,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.executionState.mode).toBe('target');
    expect(body.createdArtifacts.some((artifact: any) => artifact.type === 'query')).toBe(true);
  });
});
