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
  hasAnySelector,
  normalizeWhitespace,
} from '../helpers.ts';

const BASE_ACTIONS: CaptureAction[] = ['clip_query', 'clip_table', 'clip_entity', 'attach_page_context'];

export function createAwsAdapter(): SiteAdapter {
  return {
    id: 'aws',
    displayName: 'AWS Console (CloudTrail / Athena / CloudWatch)',
    urlPatterns: [
      'console.aws.amazon.com',
      '.aws.amazon.com/cloudtrail',
      '.aws.amazon.com/securityhub',
      '.aws.amazon.com/guardduty',
      '.aws.amazon.com/cloudwatch',
    ],

    detect(): boolean {
      return Boolean(
        window.location.hostname.includes('aws.amazon.com') &&
        hasAnySelector(['#awsui-app-layout', '[data-testid="awsc-nav-header"]', '#awsc-navigation']),
      );
    },

    extractContext(): VendorPageContext {
      const pageType = classifyAwsPage();
      const query = extractAwsQuery();
      const table = extractAwsTable();
      const entities = extractAwsEntities(table);
      const accountId = extractAwsAccountId();
      const region = extractAwsRegion();

      const supported = pageType === 'log_viewer' || pageType === 'search' || pageType === 'alert_detail';
      const failureReasons: string[] = [];
      if (!supported) {
        failureReasons.push('This AWS page type is not supported for structured extraction');
      } else if (!table && pageType === 'search') {
        failureReasons.push('No results table detected for the current AWS page');
      }

      const extraction = buildAssessment({
        supported,
        pageType,
        failureReasons,
        detectedSignals: [
          pageType !== 'unknown' ? `page:${pageType}` : '',
          document.querySelector('[data-testid="awsc-nav-header"]') ? 'shell:aws-nav' : '',
          query ? `query:${query.language}` : '',
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
        vendorId: 'aws',
        consoleName: 'AWS Console',
        pageType,
        pageUrl: window.location.href,
        pageTitle: document.title,
        metadata: {
          service: extractAwsService(),
          region,
          accountId,
          supportedActions,
        },
      }, extraction);
    },

    extractQuery(): ExtractedQuery | null {
      return extractAwsQuery();
    },

    extractTable(): ExtractedTable | null {
      return extractAwsTable();
    },

    extractEntities(): ExtractedEntity[] {
      return extractAwsEntities(extractAwsTable());
    },

    supportedActions(): CaptureAction[] {
      return computeAwsSupportedActions();
    },
  };
}

function classifyAwsPage(): VendorPageContext['pageType'] {
  const url = `${window.location.pathname} ${window.location.hash}`.toLowerCase();
  const title = `${document.title} ${firstText(['h1']) ?? ''}`.toLowerCase();

  if (url.includes('cloudtrail') || title.includes('cloudtrail event history')) return 'log_viewer';
  if (url.includes('logs-insights') || title.includes('logs insights') || url.includes('athena')) return 'search';
  if (url.includes('guardduty') || url.includes('finding')) return 'alert_detail';
  return 'unknown';
}

function extractAwsService(): string | null {
  const path = window.location.pathname.toLowerCase();
  if (path.includes('/cloudtrail')) return 'cloudtrail';
  if (path.includes('/cloudwatch')) return 'cloudwatch';
  if (path.includes('/athena')) return 'athena';
  if (path.includes('/guardduty')) return 'guardduty';
  return firstText(['h1'])?.toLowerCase() ?? null;
}

function extractAwsRegion(): string | null {
  const hostMatch = window.location.hostname.match(/([a-z]{2}-[a-z]+-\d)/i);
  if (hostMatch) return hostMatch[1];
  return firstText(['[data-testid="awsc-nav-regions-menu-button"]']);
}

function extractAwsAccountId(): string | null {
  const accountText = firstText(['[data-testid="awsc-nav-account-menu-button"]']);
  return accountText?.match(/(\d{12})/)?.[1] ?? null;
}

function extractAwsQuery(): ExtractedQuery | null {
  const cloudWatch = firstValue([
    '.logs-insights textarea',
    '[data-testid="logs-insights-query-editor"] textarea',
  ]);
  if (cloudWatch) {
    return {
      language: 'cloudwatch-insights',
      statement: normalizeWhitespace(cloudWatch),
    };
  }

  const cloudTrailLake = firstValue(['[data-testid="query-editor"] textarea']);
  if (cloudTrailLake) {
    return {
      language: 'cloudtrail-lake-sql',
      statement: normalizeWhitespace(cloudTrailLake),
    };
  }

  return null;
}

function extractAwsTable(): ExtractedTable | null {
  return extractTableFromSelectors([
    '[class*="awsui_table"] table',
    '[data-testid="events-table"] table',
    '.awsui-table table',
  ]);
}

function extractAwsEntities(table: ExtractedTable | null): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  const accountId = extractAwsAccountId();
  if (accountId) {
    entities.push({ type: 'other', value: accountId, context: 'aws-account-id' });
  }

  const region = extractAwsRegion();
  if (region) {
    entities.push({ type: 'other', value: region, context: 'aws-region' });
  }

  entities.push(...collectColumnEntities(table, [
    { headerIncludes: ['user name', 'user'], context: 'aws-table-user' },
    { headerIncludes: ['source ip'], type: 'ip', context: 'aws-table-ip' },
  ]));

  for (const row of document.querySelectorAll('.awsui_key-value-pair, .detail-panel dl')) {
    const label = normalizeWhitespace(row.querySelector('dt, .label')?.textContent ?? '').toLowerCase();
    const value = normalizeWhitespace(row.querySelector('dd, .value')?.textContent ?? '');
    if (!label || !value) continue;

    if (label.includes('source ip')) {
      entities.push({ type: 'ip', value, context: 'aws-detail-ip' });
    } else if (label.includes('user arn') || label.includes('arn')) {
      entities.push({ type: 'other', value, context: 'aws-detail-arn' });
    } else if (label.includes('user')) {
      entities.push({ type: 'user', value, context: 'aws-detail-user' });
    }
  }

  return dedupeEntities(entities);
}

function computeAwsSupportedActions(): CaptureAction[] {
  const pageType = classifyAwsPage();
  const query = extractAwsQuery();
  const table = extractAwsTable();
  const entities = extractAwsEntities(table);
  const extraction = buildAssessment({
    supported: pageType === 'log_viewer' || pageType === 'search' || pageType === 'alert_detail',
    pageType,
    failureReasons:
      pageType === 'unknown'
        ? ['This AWS page type is not supported for structured extraction']
        : !table && pageType === 'search'
          ? ['No results table detected for the current AWS page']
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
