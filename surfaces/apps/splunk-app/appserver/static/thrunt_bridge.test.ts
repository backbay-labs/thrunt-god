import { afterEach, describe, expect, test } from 'bun:test';

const originalFetch = globalThis.fetch;
const originalDocument = (globalThis as Record<string, unknown>).document;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalDocument === undefined) {
    delete (globalThis as Record<string, unknown>).document;
  } else {
    (globalThis as Record<string, unknown>).document = originalDocument;
  }
});

describe('Splunk bridge shell', () => {
  test('escapes bridge data before rendering it into the DOM', async () => {
    const listeners = new Map<string, () => void>();
    const elements = new Map<string, { innerHTML: string }>([
      ['thrunt-case-status', { innerHTML: '' }],
      ['thrunt-recent-queries', { innerHTML: '' }],
      ['thrunt-hypotheses', { innerHTML: '' }],
    ]);
    (globalThis as Record<string, unknown>).document = {
      getElementById(id: string) {
        return elements.get(id) ?? null;
      },
      addEventListener(type: string, listener: () => void) {
        listeners.set(type, listener);
      },
      dispatchEvent(event: { type: string }) {
        listeners.get(event.type)?.();
      },
    };

    globalThis.fetch = (async () => new Response(JSON.stringify({
      view: {
        case: {
          title: '<img src=x onerror=alert(1)>',
          status: 'Open',
        },
        progress: {
          currentPhase: 1,
          totalPhases: 3,
          percent: 33,
          lastActivity: '<script>alert(1)</script>',
        },
        recentQueries: [
          {
            queryId: 'QRY-1',
            title: '<svg onload=alert(1)>',
            connectorId: 'splunk',
            eventCount: 7,
            executedAt: '2026-04-12T12:00:00Z',
          },
        ],
        hypotheses: [
          { status: 'Open', id: 'HYP-1', assertion: '<iframe src=javascript:alert(1)></iframe>' },
        ],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof globalThis.fetch;

    const moduleUrl = new URL(`./thrunt_bridge.js?test=${Date.now()}`, import.meta.url).href;
    await import(moduleUrl);
    ((globalThis as Record<string, unknown>).document as { dispatchEvent(event: { type: string }): void }).dispatchEvent({ type: 'DOMContentLoaded' });
    await Bun.sleep(0);

    expect(elements.get('thrunt-case-status')?.innerHTML).not.toContain('<img src=x onerror=alert(1)>');
    expect(elements.get('thrunt-hypotheses')?.innerHTML).not.toContain('<iframe src=javascript:alert(1)></iframe>');
    expect(elements.get('thrunt-case-status')?.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(elements.get('thrunt-recent-queries')?.innerHTML).toContain('&lt;svg onload=alert(1)&gt;');
    expect(elements.get('thrunt-hypotheses')?.innerHTML).toContain('&lt;iframe src=javascript:alert(1)&gt;&lt;/iframe&gt;');
  });
});
