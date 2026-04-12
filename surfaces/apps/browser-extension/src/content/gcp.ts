/**
 * GCP Console content script adapter.
 *
 * DOM selectors are best-effort stubs. Google Cloud Console uses Angular
 * Material components with data attributes that vary between Cloud Logging,
 * Chronicle, and Security Command Center. These selectors will need periodic
 * maintenance as GCP evolves its console.
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

export function createGcpAdapter(): SiteAdapter {
  return {
    id: 'gcp',
    displayName: 'Google Cloud Console',
    urlPatterns: ['console.cloud.google.com'],

    detect(): boolean {
      return !!(
        document.querySelector('[data-product-id]') ||
        document.querySelector('cfc-shell') ||
        document.querySelector('.cfc-panel-container') ||
        // Cloud Shell
        document.querySelector('#cloud-shell') ||
        // Logs Explorer
        document.querySelector('[class*="logs-viewer"]') ||
        document.querySelector('[data-test-id="logs-viewer"]')
      );
    },

    extractContext(): VendorPageContext {
      let pageType: VendorPageContext['pageType'] = 'unknown';
      const path = window.location.pathname.toLowerCase();

      if (path.includes('/logs') || path.includes('/query')) {
        pageType = 'search';
      } else if (path.includes('/monitoring/dashboards')) {
        pageType = 'dashboard';
      } else if (path.includes('/security/findings') || path.includes('/scc/')) {
        pageType = 'alert_detail';
      } else if (path.includes('/iam') || path.includes('/compute/instances')) {
        pageType = 'entity_detail';
      }

      // Extract project ID from URL
      const projectMatch = window.location.search.match(/project=([^&]+)/) ??
        window.location.pathname.match(/\/projects\/([^/]+)/);
      const projectId = projectMatch ? projectMatch[1] : null;

      return {
        vendorId: 'gcp',
        consoleName: 'Google Cloud Console',
        pageType,
        pageUrl: window.location.href,
        pageTitle: document.title,
        metadata: {
          projectId,
          service: extractGcpService(path),
        },
      };
    },

    extractQuery(): ExtractedQuery | null {
      // Cloud Logging (Logs Explorer) query editor
      const logsQueryEditor =
        document.querySelector<HTMLTextAreaElement>('[data-test-id="logs-query-input"] textarea') ??
        document.querySelector<HTMLTextAreaElement>('[class*="logs-query-editor"] textarea') ??
        document.querySelector<HTMLTextAreaElement>('.query-editor-container textarea');

      if (logsQueryEditor?.value) {
        return {
          language: 'logging-query',
          statement: logsQueryEditor.value,
        };
      }

      // BigQuery editor (for security analytics)
      const bqEditor = document.querySelector<HTMLTextAreaElement>(
        '[class*="query-editor"] .monaco-editor textarea'
      );
      const bqLines = document.querySelector('[class*="query-editor"] .monaco-editor .view-lines');
      const bqStatement = bqEditor?.value || bqLines?.textContent?.trim();

      if (bqStatement) {
        return {
          language: 'bigquery-sql',
          statement: bqStatement,
        };
      }

      return null;
    },

    extractTable(): ExtractedTable | null {
      // Logs Explorer results table or generic GCP table
      const table = document.querySelector('[data-test-id="logs-table"] table') ??
        document.querySelector('[class*="logs-viewer"] table') ??
        document.querySelector('cfc-table table, mat-table');
      if (!table) return null;

      const headerCells = table.querySelectorAll('thead th, mat-header-cell, [role="columnheader"]');
      if (headerCells.length === 0) return null;

      const headers = Array.from(headerCells).map((el) => el.textContent?.trim() ?? '');
      const bodyRows = table.querySelectorAll('tbody tr, mat-row, [role="row"]:not(:first-child)');
      const maxRows = 200;
      const rows: string[][] = [];

      for (let i = 0; i < Math.min(bodyRows.length, maxRows); i++) {
        const cells = bodyRows[i].querySelectorAll('td, mat-cell, [role="gridcell"]');
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

      // Project ID from the project selector
      const projectEl = document.querySelector('[data-test-id="project-selector"]') ??
        document.querySelector('[class*="project-selector"] .selected-project');
      const projectId = projectEl?.textContent?.trim();
      if (projectId) {
        entities.push({ type: 'other', value: projectId, context: 'gcp-project-id' });
      }

      // Log entry details — extract IPs, principals, resource names
      const logDetails = document.querySelectorAll(
        '[class*="log-entry-detail"] .field-value, [data-test-id="log-field-value"]'
      );
      for (const el of logDetails) {
        const value = el.textContent?.trim();
        if (!value) continue;
        entities.push({ type: inferEntityType(value), value, context: 'gcp-log-entry' });
      }

      // SCC finding details
      const findingFields = document.querySelectorAll(
        '[class*="finding-detail"] .value, [class*="SecurityFinding"] .field-value'
      );
      for (const el of findingFields) {
        const value = el.textContent?.trim();
        if (!value) continue;
        entities.push({ type: inferEntityType(value), value, context: 'gcp-scc-finding' });
      }

      return deduplicateEntities(entities);
    },

    supportedActions(): CaptureAction[] {
      return ['clip_query', 'clip_entity', 'attach_page_context'];
    },
  };
}

// --- helpers ---

function extractGcpService(path: string): string | null {
  // GCP paths typically have the service name after /
  const match = path.match(/console\.cloud\.google\.com\/([a-z-]+)/);
  if (match) return match[1];
  const segments = path.split('/').filter(Boolean);
  return segments.length > 0 ? segments[0] : null;
}



// --- bootstrap ---
initializeAdapter(createGcpAdapter());
