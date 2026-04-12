import type {
  CaptureAction,
  ExtractedEntity,
  ExtractedQuery,
  ExtractedTable,
  SiteAdapter,
  VendorPageContext,
  VendorPageType,
} from '@thrunt-surfaces/contracts';
import {
  baseContext,
  buildAssessment,
  dedupeEntities,
  extractTableFromSelectors,
  filterSupportedActions,
  firstText,
  firstValue,
  hasAnySelector,
  inferEntityType,
  normalizeWhitespace,
} from '../helpers.ts';

const BASE_ACTIONS: CaptureAction[] = ['clip_query', 'clip_table', 'clip_entity', 'attach_page_context'];

export function createM365DefenderAdapter(): SiteAdapter {
  return {
    id: 'm365-defender',
    displayName: 'Microsoft 365 Defender',
    urlPatterns: [
      'security.microsoft.com',
      'securitycenter.microsoft.com',
      '/v2/advanced-hunting',
    ],

    detect(): boolean {
      return !!(
        hasAnySelector([
          '[data-testid="defender-app"]',
          '.ms-nav-header',
          '#security-center-app',
          '[class*="AdvancedHunting"]',
          '[class*="IncidentQueue"]',
        ]) ||
        (window.location.hostname === 'security.microsoft.com' &&
          document.querySelector('.o365cs-base'))
      );
    },

    extractContext(): VendorPageContext {
      const detected = this.detect();
      const pageType = detected ? classifyM365Page() : 'unknown';
      const query = extractM365Query();
      const table = extractM365Table();
      const entities = extractM365Entities();

      const supported =
        pageType === 'search' ||
        pageType === 'incident' ||
        pageType === 'alert_detail' ||
        pageType === 'entity_detail';

      const failureReasons: string[] = [];
      if (!supported) {
        failureReasons.push('This M365 Defender page type is not supported for structured extraction');
      } else {
        if (!query && (pageType === 'incident' || pageType === 'alert_detail')) {
          failureReasons.push(`No query editor detected on ${pageType} page`);
        }
      }

      const detectedSignals = [
        pageType !== 'unknown' ? `page:${pageType}` : '',
        document.querySelector('[class*="AdvancedHunting"]') ? 'app:hunting' : '',
        document.querySelector('[class*="IncidentQueue"]') ? 'app:incidents' : '',
        query ? 'editor:kql' : '',
        table ? 'data:table' : '',
      ].filter(Boolean);

      const extraction = buildAssessment({
        supported,
        pageType,
        failureReasons,
        detectedSignals,
        queryPresent: Boolean(query),
        tablePresent: Boolean(table),
        entityCount: entities.length,
      });

      const path = window.location.pathname.toLowerCase();
      const supportedActions = filterSupportedActions(BASE_ACTIONS, extraction, {
        query: Boolean(query),
        table: Boolean(table),
        entities: entities.length > 0,
      });

      return baseContext({
        vendorId: 'm365-defender',
        consoleName: 'Microsoft 365 Defender',
        pageType,
        pageUrl: window.location.href,
        pageTitle: document.title,
        metadata: {
          section: path.split('/').filter(Boolean)[0] ?? null,
          supportedActions,
        },
      }, extraction);
    },

    extractQuery(): ExtractedQuery | null {
      return extractM365Query();
    },

    extractTable(): ExtractedTable | null {
      return extractM365Table();
    },

    extractEntities(): ExtractedEntity[] {
      return extractM365Entities();
    },

    supportedActions(): CaptureAction[] {
      return computeM365SupportedActions();
    },
  };
}

function classifyM365Page(): VendorPageType {
  const path = window.location.pathname.toLowerCase();

  if (path.includes('/hunting') || path.includes('/advanced-hunting')) return 'search';
  if (path.includes('/incidents')) return 'incident';
  if (path.includes('/alerts')) return 'alert_detail';
  if (path.includes('/dashboard') || path === '/' || path === '/v2/') return 'dashboard';
  if (path.includes('/user/') || path.includes('/device/') || path.includes('/ip/')) return 'entity_detail';
  return 'unknown';
}

function extractM365Query(): ExtractedQuery | null {
  // Advanced Hunting uses a Monaco editor for KQL
  const statement =
    firstValue(['.monaco-editor textarea']) ??
    firstText(['.monaco-editor .view-lines']);

  if (!statement) return null;

  // Try to read time range from the hunting page time picker
  const timeRange = firstText([
    '[class*="TimeRange"] .ms-Button-label',
    '[data-testid="time-range-picker"]',
  ]);

  return {
    language: 'kql',
    statement: normalizeWhitespace(statement),
    parameters: timeRange ? { displayTimeRange: timeRange } : undefined,
  };
}

function extractM365Table(): ExtractedTable | null {
  return extractTableFromSelectors([
    '[class*="ResultsGrid"] table',
    '[data-testid="results-table"] table',
    '.ms-DetailsList table',
    '[role="grid"] table',
  ]);
}

function extractM365Entities(): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  // Entity pages (user, device, IP) expose identifiers
  const entityTitle = firstText([
    '[class*="EntityTitle"]',
    '[data-testid="entity-name"]',
  ]);
  if (entityTitle) {
    const path = window.location.pathname.toLowerCase();
    let type: ExtractedEntity['type'] = 'other';
    if (path.includes('/user/')) type = 'user';
    else if (path.includes('/device/')) type = 'host';
    else if (path.includes('/ip/')) type = 'ip';
    entities.push({ type, value: entityTitle, context: 'm365-entity-page' });
  }

  // Incident detail -- involved entities
  const involvedEntities = document.querySelectorAll(
    '[class*="InvolvedEntity"], [data-testid*="entity-card"]',
  );
  for (const el of involvedEntities) {
    const value = el.textContent?.trim();
    if (!value) continue;
    entities.push({ type: inferEntityType(value), value, context: 'm365-incident-entity' });
  }

  return dedupeEntities(entities);
}

function computeM365SupportedActions(): CaptureAction[] {
  const detected = !!(
    hasAnySelector([
      '[data-testid="defender-app"]',
      '.ms-nav-header',
      '#security-center-app',
      '[class*="AdvancedHunting"]',
      '[class*="IncidentQueue"]',
    ]) ||
    (window.location.hostname === 'security.microsoft.com' &&
      document.querySelector('.o365cs-base'))
  );
  const pageType = detected ? classifyM365Page() : 'unknown';
  const query = extractM365Query();
  const table = extractM365Table();
  const entities = extractM365Entities();

  const supported =
    pageType === 'search' ||
    pageType === 'incident' ||
    pageType === 'alert_detail' ||
    pageType === 'entity_detail';

  const failureReasons: string[] = [];
  if (!supported) {
    failureReasons.push('This M365 Defender page type is not supported for structured extraction');
  } else {
    if (!query && (pageType === 'incident' || pageType === 'alert_detail')) {
      failureReasons.push(`No query editor detected on ${pageType} page`);
    }
  }

  const extraction = buildAssessment({
    supported,
    pageType,
    failureReasons,
    detectedSignals: [],
    queryPresent: Boolean(query),
    tablePresent: Boolean(table),
    entityCount: entities.length,
  });

  return filterSupportedActions(BASE_ACTIONS, extraction, {
    query: Boolean(query),
    table: Boolean(table),
    entities: entities.length > 0,
  });
}
