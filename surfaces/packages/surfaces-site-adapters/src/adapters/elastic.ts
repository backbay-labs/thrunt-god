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

export function createElasticAdapter(): SiteAdapter {
  return {
    id: 'elastic',
    displayName: 'Elastic Security / Kibana',
    urlPatterns: [
      'cloud.elastic.co',
      'kb.elastic.co',
      '/app/security',
      '/app/discover',
      '/app/dashboards',
    ],

    detect(): boolean {
      return !!(
        document.querySelector('[data-test-subj="discover-app"]') ||
        document.querySelector('.kibanaChrome') ||
        document.querySelector('[data-test-subj="kibana-chrome"]') ||
        document.querySelector('[data-test-subj="securitySolutionApp"]')
      );
    },

    extractContext(): VendorPageContext {
      const detected = this.detect();
      const rawPageType = classifyElasticPage();
      const pageType = detected ? rawPageType : 'unknown';
      const query = extractElasticQuery();
      const table = extractElasticTable();
      const entities = extractElasticEntities(table);

      const supported = detected && pageType !== 'unknown';
      const failureReasons: string[] = [];
      if (!supported) {
        failureReasons.push('This Kibana page is not a supported Elastic surface');
      } else {
        if (!query && pageType === 'search') {
          failureReasons.push('No query editor detected');
        }
        if (!table && pageType === 'search') {
          failureReasons.push('No result table detected');
        }
        if (!query && pageType === 'alert_detail') {
          failureReasons.push('No query editor detected');
        }
      }

      const extraction = buildAssessment({
        supported,
        pageType,
        failureReasons,
        detectedSignals: [
          pageType !== 'unknown' ? `page:${pageType}` : '',
          document.querySelector('[data-test-subj="discover-app"]') ? 'app:discover' : '',
          document.querySelector('[data-test-subj="securitySolutionApp"]') ? 'app:security' : '',
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

      const path = window.location.pathname + window.location.hash;

      return baseContext({
        vendorId: 'elastic',
        consoleName: 'Elastic Security',
        pageType,
        pageUrl: window.location.href,
        pageTitle: document.title,
        metadata: {
          spaceId: path.match(/\/s\/([^/]+)/)?.[1] ?? 'default',
          kibanaVersion: document.querySelector('meta[name="kbn-version"]')?.getAttribute('content') ?? null,
          timeRange: firstText(['[data-test-subj="superDatePickerShowDatesButton"]']),
          supportedActions,
        },
      }, extraction);
    },

    extractQuery(): ExtractedQuery | null {
      return extractElasticQuery();
    },

    extractTable(): ExtractedTable | null {
      return extractElasticTable();
    },

    extractEntities(): ExtractedEntity[] {
      return extractElasticEntities(extractElasticTable());
    },

    supportedActions(): CaptureAction[] {
      return computeElasticSupportedActions();
    },
  };
}

function classifyElasticPage(): VendorPageContext['pageType'] {
  const path = window.location.pathname + window.location.hash;

  if (path.includes('/app/discover')) return 'search';
  if (path.includes('/app/dashboards') || path.includes('/app/kibana#/dashboard')) return 'dashboard';
  if (path.includes('/app/security/alerts')) return 'alert_detail';
  if (path.includes('/app/security')) return 'search';
  return 'unknown';
}

function extractElasticQuery(): ExtractedQuery | null {
  const textareaValue = firstValue([
    '[data-test-subj="queryInput"] textarea',
    '[data-test-subj="unifiedQueryInput"] textarea',
    '.euiFieldText[data-test-subj="queryInput"]',
  ]);
  const statement = textareaValue;
  if (!statement) return null;

  const langSwitcher = document.querySelector('[data-test-subj="switchQueryLanguageButton"]');
  const language = langSwitcher?.textContent?.trim()?.toLowerCase() === 'lucene' ? 'lucene' : 'kql';

  const displayTimeRange = firstText(['[data-test-subj="superDatePickerShowDatesButton"]']);

  return {
    language,
    statement: normalizeWhitespace(statement),
    parameters: displayTimeRange ? { displayTimeRange } : undefined,
  };
}

function extractElasticTable(): ExtractedTable | null {
  return extractTableFromSelectors([
    '[data-test-subj="docTable"] table',
    '[data-test-subj="discoverDocTable"] table',
    '.euiDataGrid table',
  ]);
}

function extractElasticEntities(table: ExtractedTable | null): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  const fieldValues = document.querySelectorAll(
    '[data-test-subj="formatted-field-value"], .euiFlexItem .field-value',
  );

  for (const el of fieldValues) {
    const value = normalizeWhitespace(el.textContent ?? '');
    if (!value) continue;
    entities.push({
      type: inferEntityType(value),
      value,
      context: 'elastic-field',
    });
  }

  entities.push(...collectColumnEntities(table, [
    { headerIncludes: ['source.ip', 'destination.ip', 'ip'], type: 'ip' as const, context: 'elastic-table-ip' },
    { headerIncludes: ['user.name', 'user'], context: 'elastic-table-user' },
    { headerIncludes: ['host.name', 'hostname'], type: 'host' as const, context: 'elastic-table-host' },
  ]));

  return dedupeEntities(entities);
}

function computeElasticSupportedActions(): CaptureAction[] {
  const detected = !!(
    document.querySelector('[data-test-subj="discover-app"]') ||
    document.querySelector('.kibanaChrome') ||
    document.querySelector('[data-test-subj="kibana-chrome"]') ||
    document.querySelector('[data-test-subj="securitySolutionApp"]')
  );
  const rawPageType = classifyElasticPage();
  const pageType = detected ? rawPageType : 'unknown';
  const query = extractElasticQuery();
  const table = extractElasticTable();
  const entities = extractElasticEntities(table);

  const supported = detected && pageType !== 'unknown';
  const failureReasons: string[] = [];
  if (!supported) {
    failureReasons.push('This Kibana page is not a supported Elastic surface');
  } else {
    if (!query && pageType === 'search') {
      failureReasons.push('No query editor detected');
    }
    if (!table && pageType === 'search') {
      failureReasons.push('No result table detected');
    }
    if (!query && pageType === 'alert_detail') {
      failureReasons.push('No query editor detected');
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
