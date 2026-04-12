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

export function isAllowedOrigin(origin: string): boolean {
  return (
    origin === '' ||
    origin.startsWith('chrome-extension://') ||
    origin.startsWith('moz-extension://') ||
    origin.startsWith('http://127.0.0.1') ||
    origin.startsWith('http://localhost')
  );
}

export function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('origin') ?? '';
  const allowed = isAllowedOrigin(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? (origin || '*') : '',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Bridge-Token',
    ...(allowed && origin ? { 'Vary': 'Origin' } : {}),
  };
}

export function errorResponse(message: string, errorClass: ErrorClass, code: string, status: number, req?: Request): Response {
  const body: BridgeError = { error: message, code, class: errorClass };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}
