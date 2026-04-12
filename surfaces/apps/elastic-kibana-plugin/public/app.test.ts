import { afterEach, describe, expect, test } from 'bun:test';
import { renderApp } from './app.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Kibana app shell', () => {
  test('escapes bridge data before rendering it into the DOM', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      view: {
        case: {
          title: '<img src=x onerror=alert(1)>',
          status: 'open',
        },
        progress: {
          currentPhase: 1,
          totalPhases: 3,
          percent: 33,
        },
        hypotheses: [
          { status: 'open', id: 'HYP-1', assertion: '<script>alert(1)</script>' },
        ],
        recentQueries: [
          { queryId: 'QRY-1', title: '<svg onload=alert(1)>', eventCount: 7 },
        ],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof globalThis.fetch;

    const container = { innerHTML: '' };
    const root = {
      innerHTML: '',
      querySelector(selector: string) {
        return selector === '#thrunt-case-view' ? container : null;
      },
    };

    renderApp({ element: root as unknown as HTMLElement });
    await Bun.sleep(0);

    expect(container.innerHTML).not.toContain('<img src=x onerror=alert(1)>');
    expect(container.innerHTML).not.toContain('<script>alert(1)</script>');
    expect(container.innerHTML).not.toContain('<svg onload=alert(1)>');
    expect(container.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(container.innerHTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(container.innerHTML).toContain('&lt;svg onload=alert(1)&gt;');
  });
});
