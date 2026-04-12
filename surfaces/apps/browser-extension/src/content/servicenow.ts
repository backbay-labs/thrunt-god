/**
 * ServiceNow content script adapter.
 *
 * DOM selectors are best-effort stubs. ServiceNow uses both the classic UI
 * (with iframes and nav_to.do URLs) and the Next Experience (Now Platform
 * UI Framework / Seismic). The classic UI renders forms inside iframes which
 * limits content script access. These selectors target common patterns but
 * will need periodic maintenance.
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

export function createServiceNowAdapter(): SiteAdapter {
  return {
    id: 'servicenow',
    displayName: 'ServiceNow',
    urlPatterns: ['service-now.com', 'servicenow.com'],

    detect(): boolean {
      return !!(
        // Next Experience (Now Platform UI Framework)
        document.querySelector('sn-polaris-layout') ||
        document.querySelector('[class*="sn-polaris"]') ||
        document.querySelector('now-workspace') ||
        // Classic UI
        document.querySelector('#nav_west_center') ||
        document.querySelector('.navpage-header') ||
        // ServiceNow Workspace (Agent Workspace, SecOps)
        document.querySelector('[class*="snc-workspace"]') ||
        document.querySelector('[data-testid="workspace-layout"]')
      );
    },

    extractContext(): VendorPageContext {
      let pageType: VendorPageContext['pageType'] = 'unknown';
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();

      if (path.includes('/nav_to.do') || path.includes('/now/sow/')) {
        // Classic nav — try to determine from the URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        const uri = urlParams.get('uri')?.toLowerCase() ?? '';
        if (uri.includes('incident') || hash.includes('incident')) {
          pageType = 'incident';
        } else if (uri.includes('syslog') || uri.includes('event')) {
          pageType = 'log_viewer';
        } else if (uri.includes('dashboard') || uri.includes('$pa_dashboard')) {
          pageType = 'dashboard';
        }
      } else if (path.includes('/now/workspace/')) {
        // Agent Workspace
        pageType = 'incident';
      }

      // Extract instance name from hostname (e.g., acme.service-now.com -> acme)
      const instanceMatch = window.location.hostname.match(/^([^.]+)\.(service-now|servicenow)/);
      const instanceName = instanceMatch ? instanceMatch[1] : 'unknown';

      return {
        vendorId: 'servicenow',
        consoleName: 'ServiceNow',
        pageType,
        pageUrl: window.location.href,
        pageTitle: document.title,
        metadata: {
          instanceName,
          isNextExperience: !!document.querySelector('sn-polaris-layout'),
          isWorkspace: path.includes('/now/workspace/'),
        },
      };
    },

    extractQuery(): ExtractedQuery | null {
      // ServiceNow doesn't have a traditional query editor in the main UI.
      // The list view has an encoded query in the URL but not a visible editor.
      return null;
    },

    extractTable(): ExtractedTable | null {
      // Next Experience list view or classic list view
      const table = document.querySelector('[class*="sn-list"] table') ??
        document.querySelector('[data-testid="list-component"] table') ??
        document.querySelector('.list2_body table') ??
        document.querySelector('.list_table');
      if (!table) return null;

      const headerCells = table.querySelectorAll('thead th, .list_header_cell');
      if (headerCells.length === 0) return null;

      const headers = Array.from(headerCells).map((el) => el.textContent?.trim() ?? '');
      const bodyRows = table.querySelectorAll('tbody tr, .list_row');
      const maxRows = 200;
      const rows: string[][] = [];

      for (let i = 0; i < Math.min(bodyRows.length, maxRows); i++) {
        const cells = bodyRows[i].querySelectorAll('td, .list_cell');
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

      // Record number (INC, CHG, RITM, SCTASK, SIR, etc.)
      const numberEl = document.querySelector(
        '[data-testid="record-number"], .form_header .number, [id="sys_display.x_"][readonly]'
      );
      const recordNumber = numberEl?.textContent?.trim() ??
        (numberEl as HTMLInputElement)?.value?.trim();
      if (recordNumber) {
        entities.push({ type: 'other', value: recordNumber, context: 'servicenow-record-number' });
      }

      // Assigned to / Caller / Opened by fields
      const userFields = ['assigned_to', 'caller_id', 'opened_by', 'u_affected_user'];
      for (const field of userFields) {
        const el = document.querySelector(
          `[id="sys_display.${field}"], [data-testid="field-${field}"] .value`
        );
        const value = el?.textContent?.trim() ?? (el as HTMLInputElement)?.value?.trim();
        if (value) {
          entities.push({ type: 'user', value, context: `servicenow-${field}` });
        }
      }

      // Short description
      const descEl = document.querySelector(
        '[id="incident.short_description"], [data-testid="field-short_description"] .value'
      );
      const desc = descEl?.textContent?.trim() ?? (descEl as HTMLInputElement)?.value?.trim();
      if (desc) {
        entities.push({ type: 'other', value: desc, context: 'servicenow-short-description' });
      }

      // CI / Configuration Item
      const ciEl = document.querySelector(
        '[id="sys_display.cmdb_ci"], [data-testid="field-cmdb_ci"] .value'
      );
      const ciValue = ciEl?.textContent?.trim() ?? (ciEl as HTMLInputElement)?.value?.trim();
      if (ciValue) {
        entities.push({ type: 'host', value: ciValue, context: 'servicenow-ci' });
      }

      return deduplicateEntities(entities);
    },

    supportedActions(): CaptureAction[] {
      return ['attach_page_context', 'clip_entity'];
    },
  };
}

// --- helpers ---


// --- bootstrap ---
initializeAdapter(createServiceNowAdapter());
