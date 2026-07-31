import type {
  CaptureAction,
  ExtractedEntity,
  ExtractedQuery,
  ExtractedTable,
  SiteAdapter,
  VendorPageContext,
} from '@thrunt-surfaces/contracts';
import {
  baseContext,
  buildAssessment,
  collectColumnEntities,
  dedupeEntities,
  extractTableFromSelectors,
  filterSupportedActions,
  firstText,
  firstValue,
  inferEntityType,
  normalizeWhitespace,
} from '../helpers.ts';

const BASE_ACTIONS: CaptureAction[] = ['clip_query', 'clip_table', 'clip_entity', 'clip_screenshot_metadata', 'attach_page_context'];

export function createSentinelAdapter(): SiteAdapter {
  return {
    id: 'sentinel',
    displayName: 'Microsoft Sentinel',
    urlPatterns: [
      'portal.azure.com',
      '/providers/Microsoft.SecurityInsights',
      'security.microsoft.com/hunting',
    ],

    detect(): boolean {
      const hash = window.location.hash.toLowerCase();
      const bladeTitles = Array.from(document.querySelectorAll('.fxs-blade-title-titleText'))
        .map((node) => normalizeWhitespace(node.textContent ?? '').toLowerCase())
        .filter(Boolean);
      return Boolean(
        window.location.hostname === 'portal.azure.com' &&
        (
          hash.includes('security_insights') ||
          hash.includes('securityinsights') ||
          bladeTitles.some((title) => (
            title.includes('sentinel') ||
            title.includes('logs') ||
            title.includes('incident') ||
            title.includes('hunting')
          ))
        ),
      );
    },

    extractContext(): VendorPageContext {
      const pageType = classifySentinelPage();
      const query = extractSentinelQuery();
      const table = extractSentinelTable();
      const entities = extractSentinelEntities(table);
      const workspace = firstText(['[data-bind*="workspaceName"]']);
      const subscription = firstText(['[data-bind*="subscriptionName"]']);

      const supported = this.detect() && pageType !== 'unknown';
      const failureReasons: string[] = [];
      if (!supported) {
        failureReasons.push('This Azure portal page is not a supported Microsoft Sentinel surface');
      } else {
        if (!query && pageType === 'search') {
          failureReasons.push('No query editor detected for the current Sentinel page');
        }
        if (!table && pageType === 'search') {
          failureReasons.push('No result table detected for the current Sentinel page');
        }
        if (!query && pageType === 'incident') {
          failureReasons.push('No query editor detected for the current Sentinel page');
        }
      }

      const extraction = buildAssessment({
        supported,
        pageType,
        failureReasons,
        detectedSignals: [
          pageType !== 'unknown' ? `page:${pageType}` : '',
          document.querySelector('.fxs-blade-title-titleText') ? 'blade:title' : '',
          query ? 'editor:kql' : '',
          table ? 'data:table' : '',
        ].filter(Boolean),
        queryPresent: Boolean(query),
        tablePresent: Boolean(table),
        entityCount: entities.length,
      });

      const supportedActions = filterSupportedActions(BASE_ACTIONS, extraction, {
        query: Boolean(query),
        table: Boolean(table),
        entities: entities.length > 0,
      });

      return baseContext({
        vendorId: 'sentinel',
        consoleName: 'Microsoft Sentinel',
        pageType,
        pageUrl: window.location.href,
        pageTitle: document.title,
        metadata: {
          workspace,
          subscription,
          timeRange: firstText(['.fxc-timerange-picker .fxc-timerange-text']),
          supportedActions,
        },
      }, extraction);
    },

    extractQuery(): ExtractedQuery | null {
      return extractSentinelQuery();
    },

    extractTable(): ExtractedTable | null {
      return extractSentinelTable();
    },

    extractEntities(): ExtractedEntity[] {
      return extractSentinelEntities(extractSentinelTable());
    },

    supportedActions(): CaptureAction[] {
      return computeSentinelSupportedActions();
    },
  };
}

function classifySentinelPage(): VendorPageContext['pageType'] {
  const hash = window.location.hash.toLowerCase();
  const bladeTitles = Array.from(document.querySelectorAll('.fxs-blade-title-titleText'))
    .map((node) => normalizeWhitespace(node.textContent ?? '').toLowerCase())
    .filter(Boolean);

  if (hash.includes('logs') || bladeTitles.includes('logs')) return 'search';
  if (hash.includes('incident') || bladeTitles.includes('incident')) return 'incident';
  if (hash.includes('workbook') || bladeTitles.includes('workbook')) return 'dashboard';
  if (hash.includes('alert') || hash.includes('analytics')) return 'alert_detail';
  return 'unknown';
}

function extractSentinelQuery(): ExtractedQuery | null {
  const textareaValue = firstValue(['.monaco-editor textarea']);
  const linesValue = firstText(['.monaco-editor .view-lines']);
  const statement = textareaValue ?? linesValue;
  if (!statement) return null;

  return {
    language: 'kql',
    statement: normalizeWhitespace(statement),
    parameters: {
      displayTimeRange: firstText(['.fxc-timerange-picker .fxc-timerange-text']),
    },
  };
}

function extractSentinelTable(): ExtractedTable | null {
  return extractTableFromSelectors([
    '.result-grid table',
    '[class*="LogsResultsTable"] table',
  ]);
}

function extractSentinelEntities(table: ExtractedTable | null): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  entities.push(...collectColumnEntities(table, [
    { headerIncludes: ['userprincipalname', 'user'], context: 'sentinel-table-user' },
    { headerIncludes: ['ip'], type: 'ip', context: 'sentinel-table-ip' },
    { headerIncludes: ['appdisplayname', 'app'], context: 'sentinel-table-app' },
  ]));

  for (const node of document.querySelectorAll('.entity-panel .entity-value, [class*="EntityDetails"] .value-text')) {
    const value = normalizeWhitespace(node.textContent ?? '');
    if (!value) continue;
    entities.push({
      type: inferEntityType(value),
      value,
      context: 'sentinel-entity-panel',
    });
  }

  const workspace = firstText(['[data-bind*="workspaceName"]']);
  if (workspace) {
    entities.push({ type: 'other', value: workspace, context: 'sentinel-workspace' });
  }

  return dedupeEntities(entities);
}

function computeSentinelSupportedActions(): CaptureAction[] {
  const pageType = classifySentinelPage();
  const query = extractSentinelQuery();
  const table = extractSentinelTable();
  const entities = extractSentinelEntities(table);
  const extraction = buildAssessment({
    supported: pageType !== 'unknown' && window.location.hostname === 'portal.azure.com',
    pageType,
    failureReasons:
      pageType === 'unknown'
        ? ['This Azure portal page is not a supported Microsoft Sentinel surface']
        : !query && pageType === 'search'
          ? ['No query editor detected for the current Sentinel page']
          : !table && pageType === 'search'
            ? ['No result table detected for the current Sentinel page']
            : !query && pageType === 'incident'
              ? ['No query editor detected for the current Sentinel page']
              : [],
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
