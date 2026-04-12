/**
 * Minimal session state for bridge and browser extension.
 *
 * In v1, auth is local-only. The bridge binds to localhost without TLS.
 * This module provides a session token abstraction for future network-facing use.
 */

export interface SessionState {
  /** Whether a bridge connection is active */
  connected: boolean;
  /** Bridge base URL */
  bridgeUrl: string;
  /** Session token (unused in v1 local-only mode) */
  token: string | null;
  /** Operator identity */
  operator: string | null;
  /** ISO timestamp of last successful bridge call */
  lastPing: string | null;
}

export function createInitialSession(bridgeUrl = 'http://127.0.0.1:7483'): SessionState {
  return {
    connected: false,
    bridgeUrl,
    token: null,
    operator: null,
    lastPing: null,
  };
}

export function markConnected(session: SessionState, operator?: string): SessionState {
  return {
    ...session,
    connected: true,
    operator: operator ?? session.operator,
    lastPing: new Date().toISOString(),
  };
}

export function markDisconnected(session: SessionState): SessionState {
  return {
    ...session,
    connected: false,
    lastPing: null,
  };
}
