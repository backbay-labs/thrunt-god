/**
 * Error classification and typed error responses for Surface Bridge.
 */

export type ErrorClass = 'auth' | 'timeout' | 'subprocess' | 'file-system' | 'validation';

export interface BridgeError {
  error: string;
  code: string;
  class: ErrorClass;
}

export function classifyError(err: unknown): { class: ErrorClass; code: string; message: string } {
  const errObj = err as { code?: string; message?: string } | null;
  const code = errObj?.code ?? '';
  const message = errObj?.message ?? String(err);

  if (code === 'ENOENT' || code === 'EACCES') {
    return { class: 'file-system', code: `FS_${code}`, message };
  }

  if (message.includes('timeout') || message.includes('SIGKILL') || message.includes('timed out')) {
    return { class: 'timeout', code: 'SUBPROCESS_TIMEOUT', message };
  }

  if (message.includes('spawn') || message.includes('exit code')) {
    return { class: 'subprocess', code: 'SUBPROCESS_FAILURE', message };
  }

  return { class: 'validation', code: 'UNKNOWN_ERROR', message };
}

export function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Bridge-Token',
  };
}

export function errorResponse(message: string, errorClass: ErrorClass, code: string, status: number): Response {
  const body: BridgeError = { error: message, code, class: errorClass };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}
