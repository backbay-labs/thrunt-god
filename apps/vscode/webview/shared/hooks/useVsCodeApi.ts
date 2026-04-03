declare global {
  interface Window {
    acquireVsCodeApi?: <S>() => {
      getState(): S | undefined;
      setState(s: S): void;
      postMessage(m: unknown): void;
    };
  }
}

export interface VsCodeApi<TState, TMessage> {
  getState(): TState | undefined;
  setState(state: TState): void;
  postMessage(message: TMessage): void;
}

let cachedApi: VsCodeApi<unknown, unknown> | null = null;

/**
 * Create or return the cached VS Code API instance.
 *
 * - Calls `acquireVsCodeApi()` once if running inside a VS Code webview.
 * - Returns a no-op fallback when running outside VS Code (e.g. in a browser
 *   during development).
 * - The instance is cached at module scope so multiple callers share one API
 *   object (VS Code only allows `acquireVsCodeApi` to be called once).
 */
export function createVsCodeApi<
  TState = unknown,
  TMessage = unknown,
>(): VsCodeApi<TState, TMessage> {
  if (cachedApi) {
    return cachedApi as VsCodeApi<TState, TMessage>;
  }

  if (typeof window.acquireVsCodeApi === 'function') {
    const raw = window.acquireVsCodeApi<TState>();
    cachedApi = raw as unknown as VsCodeApi<unknown, unknown>;
  } else {
    cachedApi = {
      getState: () => undefined,
      setState: () => {},
      postMessage: () => {},
    };
  }

  return cachedApi as VsCodeApi<TState, TMessage>;
}

/**
 * Hook convenience wrapper -- returns the cached VS Code API.
 *
 * Intended for use inside Preact component trees where callers want a stable
 * reference without managing module-level imports directly.
 */
export function useVsCodeApi<
  TState = unknown,
  TMessage = unknown,
>(): VsCodeApi<TState, TMessage> {
  return createVsCodeApi<TState, TMessage>();
}
