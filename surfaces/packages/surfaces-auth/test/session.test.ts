import { describe, test, expect } from 'bun:test';
import { createInitialSession, markConnected, markDisconnected } from '../src/session.ts';

describe('SessionState', () => {
  test('createInitialSession returns disconnected state with defaults', () => {
    const session = createInitialSession();
    expect(session.connected).toBe(false);
    expect(session.bridgeUrl).toBe('http://127.0.0.1:7483');
    expect(session.token).toBeNull();
    expect(session.operator).toBeNull();
    expect(session.lastPing).toBeNull();
  });

  test('createInitialSession accepts custom bridge URL', () => {
    const session = createInitialSession('http://localhost:9999');
    expect(session.bridgeUrl).toBe('http://localhost:9999');
  });

  test('markConnected sets connected and lastPing', () => {
    const initial = createInitialSession();
    const connected = markConnected(initial, 'analyst-1');

    expect(connected.connected).toBe(true);
    expect(connected.operator).toBe('analyst-1');
    expect(connected.lastPing).not.toBeNull();
    // lastPing should be a valid ISO string
    expect(new Date(connected.lastPing!).toISOString()).toBe(connected.lastPing!);
  });

  test('markConnected preserves existing operator when none provided', () => {
    const initial = createInitialSession();
    const first = markConnected(initial, 'analyst-1');
    const second = markConnected(first);

    expect(second.operator).toBe('analyst-1');
    expect(second.connected).toBe(true);
  });

  test('markDisconnected clears connected and lastPing', () => {
    const initial = createInitialSession();
    const connected = markConnected(initial, 'analyst-1');
    const disconnected = markDisconnected(connected);

    expect(disconnected.connected).toBe(false);
    expect(disconnected.lastPing).toBeNull();
    // Operator is preserved after disconnect
    expect(disconnected.operator).toBe('analyst-1');
    // Bridge URL is preserved
    expect(disconnected.bridgeUrl).toBe('http://127.0.0.1:7483');
  });

  test('full connect/disconnect cycle', () => {
    let session = createInitialSession();
    expect(session.connected).toBe(false);

    session = markConnected(session, 'operator-A');
    expect(session.connected).toBe(true);
    expect(session.operator).toBe('operator-A');

    session = markDisconnected(session);
    expect(session.connected).toBe(false);

    session = markConnected(session, 'operator-B');
    expect(session.connected).toBe(true);
    expect(session.operator).toBe('operator-B');
  });

  test('session state is immutable (returns new objects)', () => {
    const initial = createInitialSession();
    const connected = markConnected(initial, 'test');

    expect(initial.connected).toBe(false);
    expect(connected.connected).toBe(true);
    expect(initial).not.toBe(connected);
  });
});
