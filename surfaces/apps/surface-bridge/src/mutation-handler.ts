/**
 * Mutation handler -- validates and dispatches JSON-RPC mutation requests
 * from WebSocket clients to thrunt-tools.cjs.
 */

import type {
  MutationMethod,
  MutationResponse,
  MutationResult,
  MutationError,
  EvidenceAttachParams,
  VerdictUpdateParams,
  IocAddParams,
  CaseOpenParams,
} from '@thrunt-surfaces/contracts';
import { MUTATION_ERROR_CODES } from '@thrunt-surfaces/contracts';
import type { CaseDataProvider } from './providers.ts';
import type { Logger } from './logger.ts';
import { runThruntCommand } from './thrunt-tools.ts';
import { classifyError } from './errors.ts';

export interface MutationHandlerOptions {
  projectRoot: string;
  toolsPath?: string | null;
  logger: Logger;
  provider: CaseDataProvider;
  isSubprocessAvailable: () => boolean;
}

export interface MutationHandler {
  handle(raw: string): Promise<string>;
}

const VALID_METHODS = new Set<string>([
  'evidence.attach',
  'verdict.update',
  'ioc.add',
  'case.open',
]);

const VALID_VERDICTS = new Set(['supported', 'disproved', 'inconclusive', 'open']);

// Methods that require an open case
const CASE_REQUIRED_METHODS = new Set<string>([
  'evidence.attach',
  'verdict.update',
  'ioc.add',
]);

export function createMutationHandler(options: MutationHandlerOptions): MutationHandler {
  const { projectRoot, toolsPath, logger, provider, isSubprocessAvailable } = options;

  function makeErrorResponse(id: string | null, code: number, message: string, data?: MutationError['data']): MutationResponse {
    return {
      jsonrpc: '2.0',
      id: id ?? '',
      error: { code, message, ...(data ? { data } : {}) },
    };
  }

  function makeSuccessResponse(id: string, result: MutationResult): MutationResponse {
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  async function handle(raw: string): Promise<string> {
    // 1. Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return JSON.stringify(makeErrorResponse(null, MUTATION_ERROR_CODES.PARSE_ERROR, 'Parse error: invalid JSON'));
    }

    const req = parsed as Record<string, unknown>;

    // 2. Validate jsonrpc version
    if (req.jsonrpc !== '2.0') {
      return JSON.stringify(makeErrorResponse(
        typeof req.id === 'string' ? req.id : null,
        MUTATION_ERROR_CODES.INVALID_REQUEST,
        'Invalid request: jsonrpc must be "2.0"',
      ));
    }

    // 3. Validate id
    if (typeof req.id !== 'string' || req.id === '') {
      return JSON.stringify(makeErrorResponse(
        null,
        MUTATION_ERROR_CODES.INVALID_REQUEST,
        'Invalid request: id must be a non-empty string',
      ));
    }

    const requestId = req.id as string;

    // 4. Validate method
    if (typeof req.method !== 'string' || !VALID_METHODS.has(req.method)) {
      return JSON.stringify(makeErrorResponse(
        requestId,
        MUTATION_ERROR_CODES.METHOD_NOT_FOUND,
        `Method not found: ${String(req.method)}`,
      ));
    }

    const method = req.method as MutationMethod;

    // 5. Validate params is an object
    if (!req.params || typeof req.params !== 'object' || Array.isArray(req.params)) {
      return JSON.stringify(makeErrorResponse(
        requestId,
        MUTATION_ERROR_CODES.INVALID_PARAMS,
        'Invalid params: params must be an object',
      ));
    }

    // 6. Check subprocess availability
    if (!isSubprocessAvailable()) {
      return JSON.stringify(makeErrorResponse(
        requestId,
        MUTATION_ERROR_CODES.SUBPROCESS_UNAVAILABLE,
        'Subprocess unavailable: bridge is in degraded mode',
      ));
    }

    // 7. Check case is open for methods that require it
    if (CASE_REQUIRED_METHODS.has(method) && !provider.caseOpen()) {
      return JSON.stringify(makeErrorResponse(
        requestId,
        MUTATION_ERROR_CODES.CASE_NOT_OPEN,
        'No case is open -- open a case before performing this mutation',
      ));
    }

    // 8. Dispatch to method-specific handler
    try {
      const params = req.params as Record<string, unknown>;
      let result: MutationResult;

      switch (method) {
        case 'evidence.attach':
          result = await handleEvidenceAttach(requestId, params as unknown as EvidenceAttachParams);
          break;
        case 'verdict.update':
          result = await handleVerdictUpdate(requestId, params as unknown as VerdictUpdateParams);
          break;
        case 'ioc.add':
          result = await handleIocAdd(requestId, params as unknown as IocAddParams);
          break;
        case 'case.open':
          result = await handleCaseOpen(requestId, params as unknown as CaseOpenParams);
          break;
        default:
          return JSON.stringify(makeErrorResponse(requestId, MUTATION_ERROR_CODES.METHOD_NOT_FOUND, `Method not found: ${method}`));
      }

      return JSON.stringify(makeSuccessResponse(requestId, result));
    } catch (err) {
      if (err instanceof ParamValidationError) {
        return JSON.stringify(makeErrorResponse(
          requestId,
          MUTATION_ERROR_CODES.INVALID_PARAMS,
          err.message,
        ));
      }
      if (err instanceof HypothesisNotFoundError) {
        return JSON.stringify(makeErrorResponse(
          requestId,
          MUTATION_ERROR_CODES.HYPOTHESIS_NOT_FOUND,
          err.message,
        ));
      }
      const classified = classifyError(err);
      logger.error('lifecycle', `mutation ${method} failed`, { error: String(err) });
      return JSON.stringify(makeErrorResponse(
        requestId,
        MUTATION_ERROR_CODES.INTERNAL_ERROR,
        classified.message,
        { class: classified.class, bridgeCode: classified.code },
      ));
    }
  }

  async function handleEvidenceAttach(_requestId: string, params: EvidenceAttachParams): Promise<MutationResult> {
    // Validate required params
    if (!params.content || typeof params.content !== 'string' || params.content.trim() === '') {
      throw new ParamValidationError('content must be a non-empty string');
    }
    if (!params.surfaceId || typeof params.surfaceId !== 'string' || params.surfaceId.trim() === '') {
      throw new ParamValidationError('surfaceId must be a non-empty string');
    }

    const result = await provider.attachEvidence({
      surfaceId: params.surfaceId,
      type: 'manual_note',
      vendorId: params.vendorContext?.vendorId ?? 'unknown',
      sourceUrl: params.vendorContext?.pageUrl ?? '',
      capturedAt: new Date().toISOString(),
      capturedBy: params.surfaceId,
      hypothesisIds: [],
      payload: { kind: 'note', text: params.content },
    });

    return {
      success: true,
      method: 'evidence.attach',
      message: result.message,
      artifacts: result.createdArtifacts?.map((a) => ({ type: a.type, id: a.id })),
    };
  }

  async function handleVerdictUpdate(_requestId: string, params: VerdictUpdateParams): Promise<MutationResult> {
    // Validate required params
    if (!params.hypothesisId || typeof params.hypothesisId !== 'string' || params.hypothesisId.trim() === '') {
      throw new ParamValidationError('hypothesisId must be a non-empty string');
    }
    if (!params.verdict || typeof params.verdict !== 'string' || !VALID_VERDICTS.has(params.verdict)) {
      throw new ParamValidationError('verdict must be one of: supported, disproved, inconclusive, open');
    }

    // Consistency check: verify hypothesis exists
    const hypotheses = await provider.getHypotheses();
    const exists = hypotheses.some((h) => h.id === params.hypothesisId);
    if (!exists) {
      throw new HypothesisNotFoundError(params.hypothesisId);
    }

    // Execute via thrunt-tools
    const args = ['verdict', 'update', params.hypothesisId, params.verdict];
    if (params.rationale) {
      args.push('--rationale', params.rationale);
    }

    const cmdResult = await runThruntCommand(projectRoot, args, toolsPath, { logger });
    if (!cmdResult.ok) {
      throw new Error(`verdict update failed: ${cmdResult.stderr || 'unknown error'}`);
    }

    return {
      success: true,
      method: 'verdict.update',
      message: `Verdict for ${params.hypothesisId} updated to ${params.verdict}`,
    };
  }

  async function handleIocAdd(_requestId: string, params: IocAddParams): Promise<MutationResult> {
    // Validate required params
    if (!params.value || typeof params.value !== 'string' || params.value.trim() === '') {
      throw new ParamValidationError('value must be a non-empty string');
    }

    const args = ['ioc', 'add', params.value];
    if (params.type) {
      args.push('--type', params.type);
    }
    if (params.source) {
      args.push('--source', params.source);
    }

    const cmdResult = await runThruntCommand(projectRoot, args, toolsPath, { logger });
    if (!cmdResult.ok) {
      throw new Error(`ioc add failed: ${cmdResult.stderr || 'unknown error'}`);
    }

    return {
      success: true,
      method: 'ioc.add',
      message: `IOC added: ${params.value}`,
    };
  }

  async function handleCaseOpen(_requestId: string, params: CaseOpenParams): Promise<MutationResult> {
    // Validate required params
    if (!params.signal || typeof params.signal !== 'string' || params.signal.trim() === '') {
      throw new ParamValidationError('signal must be a non-empty string');
    }

    const result = await provider.openCase({
      signal: params.signal,
      mode: params.mode,
      owner: params.owner,
    });

    return {
      success: true,
      method: 'case.open',
      message: result.message,
      artifacts: [{ type: 'case', id: result.case?.caseRoot ?? 'new-case' }],
    };
  }

  return { handle };
}

// Custom error classes for param validation vs hypothesis-not-found

class ParamValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParamValidationError';
  }
}

class HypothesisNotFoundError extends Error {
  hypothesisId: string;
  constructor(hypothesisId: string) {
    super(`Hypothesis not found: ${hypothesisId}`);
    this.name = 'HypothesisNotFoundError';
    this.hypothesisId = hypothesisId;
  }
}
