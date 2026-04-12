/**
 * Base content script adapter — shared logic for all vendor content scripts.
 *
 * Each vendor adapter imports this and provides vendor-specific selectors.
 */

import type { SiteAdapter, VendorPageContext } from '@thrunt-surfaces/contracts';
import { sendToBackground } from '../lib/message-bus.ts';

/**
 * Strip sensitive elements from snapshot HTML before transmission.
 * Removes active content, common secret carriers, and remote-loading attributes
 * so stored certification snapshots stay inert.
 */
function sanitizeSnapshot(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Remove active elements that can execute or load external resources.
  doc.querySelectorAll('script, iframe, frame, frameset, object, embed, portal, base, link').forEach(el => el.remove());

  // Remove refresh redirects.
  doc.querySelectorAll('meta[http-equiv]').forEach((el) => {
    if (el.getAttribute('http-equiv')?.toLowerCase() === 'refresh') {
      el.remove();
    }
  });

  // Remove hidden inputs (CSRF tokens, session data)
  doc.querySelectorAll('input[type="hidden"]').forEach(el => el.remove());

  // Remove meta tags that may contain tokens
  doc.querySelectorAll('meta[name*="csrf"], meta[name*="token"], meta[name*="nonce"]').forEach(el => el.remove());

  // Remove elements with common sensitive data attributes
  doc.querySelectorAll('[data-csrf], [data-token], [data-session]').forEach(el => el.remove());

  // Strip inline event handlers and remote-loading attributes.
  const urlAttributes = ['action', 'background', 'data', 'formaction', 'href', 'poster', 'src', 'srcdoc', 'srcset'];
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.getAttributeNames()]) {
      if (attr.toLowerCase().startsWith('on')) {
        el.removeAttribute(attr);
      }
    }
    for (const attr of urlAttributes) {
      if (el.hasAttribute(attr)) {
        el.removeAttribute(attr);
      }
    }
  });

  return doc.documentElement.outerHTML;
}

export function initializeAdapter(adapter: SiteAdapter): void {
  let currentContext: VendorPageContext | null = null;
  let lastContextSignature: string | null = null;
  let scheduledRefresh: number | null = null;

  const refreshContext = () => {
    if (!adapter.detect()) return;

    const nextContext = adapter.extractContext();
    const signature = JSON.stringify(nextContext);
    if (signature === lastContextSignature) return;

    currentContext = nextContext;
    lastContextSignature = signature;
    sendToBackground({
      type: 'adapter:detected',
      vendorId: adapter.id,
      context: nextContext,
    });
  };

  const scheduleRefresh = () => {
    if (scheduledRefresh !== null) {
      window.clearTimeout(scheduledRefresh);
    }

    scheduledRefresh = window.setTimeout(() => {
      scheduledRefresh = null;
      refreshContext();
    }, 250);
  };

  refreshContext();
  setupCaptureListeners(adapter, () => currentContext);

  const observer = new MutationObserver(() => {
    scheduleRefresh();
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }

  window.addEventListener('load', scheduleRefresh);
  window.addEventListener('hashchange', scheduleRefresh);
  window.addEventListener('popstate', scheduleRefresh);
}

function setupCaptureListeners(adapter: SiteAdapter, getContext: () => VendorPageContext | null): void {
  // Listen for capture commands from the extension
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'capture:request') {
      const action = message.action;
      const context = getContext() ?? (adapter.detect() ? adapter.extractContext() : null);
      if (!context) return;

      if (action === 'clip_query') {
        const query = adapter.extractQuery();
        if (query) {
          sendToBackground({ type: 'capture:query', vendorId: adapter.id, query, context });
        }
      }

      if (action === 'clip_table') {
        const table = adapter.extractTable();
        if (table) {
          sendToBackground({
            type: 'capture:table',
            vendorId: adapter.id,
            table,
            query: adapter.extractQuery(),
            context,
          });
        }
      }

      if (action === 'clip_entity') {
        const query = adapter.extractQuery();
        const entities = adapter.extractEntities();
        for (const entity of entities) {
          sendToBackground({ type: 'capture:entity', vendorId: adapter.id, entity, query, context });
        }
      }

      if (action === 'attach_page_context') {
        sendToBackground({ type: 'capture:page_context', context: adapter.extractContext() });
      }

      if (action === 'capture_live_snapshot') {
        const rawHtml = document.documentElement.outerHTML;
        const sanitizedHtml = sanitizeSnapshot(rawHtml);
        sendToBackground({
          type: 'capture:live_snapshot',
          vendorId: adapter.id,
          context: adapter.extractContext(),
          snapshot: {
            html: sanitizedHtml,
            query: adapter.extractQuery(),
            table: adapter.extractTable(),
            entities: adapter.extractEntities(),
            supportedActions: adapter.supportedActions(),
          },
        });
      }
    }
  });
}
