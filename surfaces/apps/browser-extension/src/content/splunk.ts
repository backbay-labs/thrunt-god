/**
 * Splunk content script adapter.
 *
 * DOM selectors are best-effort stubs. Splunk's DOM changes across versions
 * (Enterprise, Cloud, classic vs. dashboard studio). These selectors target
 * common patterns but will need periodic maintenance.
 */

import type {
  SiteAdapter,
  VendorPageContext,
  ExtractedQuery,
  ExtractedTable,
  ExtractedEntity,
  CaptureAction,
} from '@thrunt-surfaces/contracts';
import { initializeAdapter } from './base-adapter.ts';
import { inferEntityType, deduplicateEntities } from './shared-helpers.ts';

export function createSplunkAdapter(): SiteAdapter {
  return {
    id: 'splunk',
    displayName: 'Splunk Enterprise / Cloud',
    urlPatterns: ['splunk.com', 'splunkcloud.com', '/en-US/app/'],

    detect(): boolean {
      return !!(
        document.querySelector('.search-bar') ||
        document.querySelector('#search') ||
        document.querySelector('.dashboard-body') ||
        document.querySelector('[data-view="views/search/Master"]')
      );
    },

    extractContext(): VendorPageContext {
      const appMatch = window.location.pathname.match(/\/en-US\/app\/([^/]+)/);
      const app = appMatch ? appMatch[1] : 'unknown';

      let pageType: VendorPageContext['pageType'] = 'unknown';
      if (window.location.pathname.includes('/search')) {
        pageType = 'search';
      } else if (document.querySelector('.dashboard-body')) {
        pageType = 'dashboard';
      } else if (window.location.pathname.includes('/alert')) {
        pageType = 'alert_detail';
      }

      return {
        vendorId: 'splunk',
        consoleName: 'Splunk',
        pageType,
        pageUrl: window.location.href,
        pageTitle: document.title,
        metadata: {
          app,
          splunkVersion: document.querySelector('meta[name="splunk-version"]')?.getAttribute('content') ?? null,
        },
      };
    },

    extractQuery(): ExtractedQuery | null {
      // Try the search bar textarea (Splunk Web classic)
      const textarea =
        document.querySelector<HTMLTextAreaElement>('.search-bar textarea') ??
        document.querySelector<HTMLTextAreaElement>('#searchbar') ??
        document.querySelector<HTMLTextAreaElement>('[data-test="search-input"] textarea');

      if (!textarea?.value) return null;

      // Try to read time range from the time picker
      const earliest = document.querySelector('.time-range-picker .earliest')?.textContent?.trim();
      const latest = document.querySelector('.time-range-picker .latest')?.textContent?.trim();

      return {
        language: 'spl',
        statement: textarea.value,
        timeRange: earliest && latest ? { start: earliest, end: latest } : undefined,
      };
    },

    extractTable(): ExtractedTable | null {
      const table = document.querySelector('.results-table table') ??
        document.querySelector('[data-test="events-viewer"] table');
      if (!table) return null;

      const headerCells = table.querySelectorAll('thead th');
      if (headerCells.length === 0) return null;

      const headers = Array.from(headerCells).map((th) => th.textContent?.trim() ?? '');
      const bodyRows = table.querySelectorAll('tbody tr');
      const maxRows = 200;
      const rows: string[][] = [];

      for (let i = 0; i < Math.min(bodyRows.length, maxRows); i++) {
        const cells = bodyRows[i].querySelectorAll('td');
        rows.push(Array.from(cells).map((td) => td.textContent?.trim() ?? ''));
      }

      return {
        headers,
        rows,
        totalRows: bodyRows.length,
        truncated: bodyRows.length > maxRows,
      };
    },

    extractEntities(): ExtractedEntity[] {
      const entities: ExtractedEntity[] = [];
      const fieldValues = document.querySelectorAll('.field-value');

      for (const el of fieldValues) {
        const value = el.textContent?.trim();
        if (!value) continue;

        const type = inferEntityType(value);
        entities.push({ type, value, context: 'splunk-field-value' });
      }

      return deduplicateEntities(entities);
    },

    supportedActions(): CaptureAction[] {
      return ['clip_query', 'clip_table', 'clip_entity', 'attach_page_context'];
    },
  };
}

// --- helpers ---



// --- bootstrap ---
initializeAdapter(createSplunkAdapter());
