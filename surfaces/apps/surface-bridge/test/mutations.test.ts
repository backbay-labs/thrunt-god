import { describe, test, expect } from 'bun:test';
import { createMutationHandler, type MutationHandler } from '../src/mutation-handler.ts';
import type { CaseDataProvider } from '../src/providers.ts';
import { MUTATION_ERROR_CODES } from '@thrunt-surfaces/contracts';

// --- Mock helpers ---

function createMockLogger() {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  } as any;
}

function createMockProvider(overrides: Partial<CaseDataProvider> = {}): CaseDataProvider {
  const mockCase = {
    caseRoot: '/tmp/test', title: 'Test', signal: 'test signal', mode: 'case',
    owner: 'tester', createdAt: '', updatedAt: '', phase: 'TRIAGE', status: 'Active',
    opened: '', desiredOutcome: '', scope: '', workingTheory: '',
  };
  return {
    caseOpen: () => true,
    planningExists: () => true,
    getCase: async () => mockCase as any,
    getProgress: async () => null,
    getHypotheses: async () => [{ id: 'HYP-001', assertion: 'Test hypothesis', priority: 'High' as const, status: 'Open' as const, confidence: 'Medium' as const }],
    getQueries: async () => [],
    getReceipts: async () => [],
    getFindings: async () => [],
    getCaseView: async () => null,
    openCase: async () => ({ case: mockCase, created: true, message: 'Case opened' }) as any,
    attachEvidence: async () => ({ success: true, attachmentId: 'att-001', message: 'Evidence attached', createdArtifacts: [{ type: 'evidence' as const, id: 'ev-001' }] }),
    executePack: async () => ({ success: true, executionId: 'exec-1', message: 'ok' }),
    executeTarget: async () => ({ success: true, executionId: 'exec-2', message: 'ok' }),
    executeNext: async () => ({ success: true, executionId: 'exec-3', message: 'ok' }),
    invalidate: () => {},
    ...overrides,
  };
}

function makeHandler(opts: {
  isSubprocessAvailable?: () => boolean;
  provider?: Partial<CaseDataProvider>;
} = {}): MutationHandler {
  return createMutationHandler({
    projectRoot: '/tmp/test-project',
    toolsPath: null,
    logger: createMockLogger(),
    provider: createMockProvider(opts.provider),
    isSubprocessAvailable: opts.isSubprocessAvailable ?? (() => true),
  });
}

function makeRequest(method: string, params: Record<string, unknown>, id = 'req-1'): string {
  return JSON.stringify({ jsonrpc: '2.0', method, params, id });
}

async function parseResponse(handler: MutationHandler, raw: string) {
  const responseStr = await handler.handle(raw);
  return JSON.parse(responseStr);
}

// --- Tests ---

describe('mutation handler', () => {

  test('rejects malformed JSON with PARSE_ERROR', async () => {
    const handler = makeHandler();
    const resp = await parseResponse(handler, 'not valid json {{{');
    expect(resp.error).toBeDefined();
    expect(resp.error.code).toBe(MUTATION_ERROR_CODES.PARSE_ERROR);
  });

  test('rejects missing jsonrpc field with INVALID_REQUEST', async () => {
    const handler = makeHandler();
    const resp = await parseResponse(handler, JSON.stringify({ method: 'case.open', params: { signal: 'test' }, id: '1' }));
    expect(resp.error).toBeDefined();
    expect(resp.error.code).toBe(MUTATION_ERROR_CODES.INVALID_REQUEST);
  });

  test('rejects unknown method with METHOD_NOT_FOUND', async () => {
    const handler = makeHandler();
    const resp = await parseResponse(handler, makeRequest('unknown.method', {}));
    expect(resp.error).toBeDefined();
    expect(resp.error.code).toBe(MUTATION_ERROR_CODES.METHOD_NOT_FOUND);
  });

  test('rejects missing id with INVALID_REQUEST', async () => {
    const handler = makeHandler();
    const resp = await parseResponse(handler, JSON.stringify({ jsonrpc: '2.0', method: 'case.open', params: { signal: 'test' } }));
    expect(resp.error).toBeDefined();
    expect(resp.error.code).toBe(MUTATION_ERROR_CODES.INVALID_REQUEST);
  });

  test('returns SUBPROCESS_UNAVAILABLE when subprocess is down', async () => {
    const handler = makeHandler({ isSubprocessAvailable: () => false });
    const resp = await parseResponse(handler, makeRequest('case.open', { signal: 'test' }));
    expect(resp.error).toBeDefined();
    expect(resp.error.code).toBe(MUTATION_ERROR_CODES.SUBPROCESS_UNAVAILABLE);
  });

  test('returns CASE_NOT_OPEN for evidence.attach when no case', async () => {
    const handler = makeHandler({ provider: { caseOpen: () => false } });
    const resp = await parseResponse(handler, makeRequest('evidence.attach', { content: 'data', surfaceId: 'ext-1' }));
    expect(resp.error).toBeDefined();
    expect(resp.error.code).toBe(MUTATION_ERROR_CODES.CASE_NOT_OPEN);
  });

  test('validates evidence.attach requires content and surfaceId', async () => {
    const handler = makeHandler();
    // Missing content
    const resp1 = await parseResponse(handler, makeRequest('evidence.attach', { content: '', surfaceId: 'ext-1' }));
    expect(resp1.error).toBeDefined();
    expect(resp1.error.code).toBe(MUTATION_ERROR_CODES.INVALID_PARAMS);

    // Missing surfaceId
    const resp2 = await parseResponse(handler, makeRequest('evidence.attach', { content: 'data', surfaceId: '' }));
    expect(resp2.error).toBeDefined();
    expect(resp2.error.code).toBe(MUTATION_ERROR_CODES.INVALID_PARAMS);
  });

  test('validates verdict.update requires hypothesisId and valid verdict', async () => {
    const handler = makeHandler();
    // Invalid verdict value
    const resp = await parseResponse(handler, makeRequest('verdict.update', { hypothesisId: 'HYP-001', verdict: 'invalid-value' }));
    expect(resp.error).toBeDefined();
    expect(resp.error.code).toBe(MUTATION_ERROR_CODES.INVALID_PARAMS);
  });

  test('successful case.open returns result with success:true', async () => {
    const handler = makeHandler();
    const resp = await parseResponse(handler, makeRequest('case.open', { signal: 'Suspicious login from unknown IP' }));
    expect(resp.error).toBeUndefined();
    expect(resp.result).toBeDefined();
    expect(resp.result.success).toBe(true);
    expect(resp.result.method).toBe('case.open');
  });

  test('response id correlates with request id', async () => {
    const handler = makeHandler();
    const requestId = 'test-correlation-123';
    const resp = await parseResponse(handler, makeRequest('case.open', { signal: 'test' }, requestId));
    expect(resp.id).toBe(requestId);
  });

  test('returns HYPOTHESIS_NOT_FOUND for unknown hypothesis in verdict.update', async () => {
    const handler = makeHandler();
    const resp = await parseResponse(handler, makeRequest('verdict.update', { hypothesisId: 'HYP-999', verdict: 'supported' }));
    expect(resp.error).toBeDefined();
    expect(resp.error.code).toBe(MUTATION_ERROR_CODES.HYPOTHESIS_NOT_FOUND);
  });

  test('successful evidence.attach returns result with artifacts', async () => {
    const handler = makeHandler();
    const resp = await parseResponse(handler, makeRequest('evidence.attach', { content: 'Log entry data', surfaceId: 'ext-browser' }));
    expect(resp.error).toBeUndefined();
    expect(resp.result).toBeDefined();
    expect(resp.result.success).toBe(true);
    expect(resp.result.method).toBe('evidence.attach');
    expect(resp.result.artifacts).toBeDefined();
    expect(resp.result.artifacts.length).toBeGreaterThan(0);
  });

  test('case.open does not require an open case', async () => {
    const handler = makeHandler({ provider: { caseOpen: () => false } });
    const resp = await parseResponse(handler, makeRequest('case.open', { signal: 'New investigation' }));
    // case.open should succeed even without an open case
    expect(resp.error).toBeUndefined();
    expect(resp.result).toBeDefined();
    expect(resp.result.success).toBe(true);
  });

  test('rejects params that is not an object', async () => {
    const handler = makeHandler();
    const resp = await parseResponse(handler, JSON.stringify({ jsonrpc: '2.0', method: 'case.open', params: 'not-an-object', id: 'r1' }));
    expect(resp.error).toBeDefined();
    expect(resp.error.code).toBe(MUTATION_ERROR_CODES.INVALID_PARAMS);
  });
});
