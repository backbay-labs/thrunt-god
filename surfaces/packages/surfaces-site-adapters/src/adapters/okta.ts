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

export function createOktaAdapter(): SiteAdapter {
  return {
    id: 'okta',
    displayName: 'Okta Admin Console',
    urlPatterns: [
      '-admin.okta.com',
      '.okta.com/admin',
      '.oktapreview.com/admin',
    ],

    detect(): boolean {
      return Boolean(
        /okta(?:preview)?\.com$/i.test(window.location.hostname) &&
        (
          window.location.pathname.includes('/admin') ||
          /\/report\/system[_-]log/i.test(window.location.pathname) ||
          hasAnySelector([
            '[data-se="admin-nav"]',
            '#admin-header',
            '.admin-syslog',
            '.admin-console-shell',
            '[aria-label="System Log Header"]',
          ])
        ),
      );
    },

    extractContext(): VendorPageContext {
      const pageType = classifyOktaPage();
      const table = extractOktaTable();
      const query = extractOktaQuery();
      const entities = extractOktaEntities(table);
      const orgName = extractOktaOrgName();
      const detectionSignals = [
        pageType !== 'unknown' ? `page:${pageType}` : '',
        /\/report\/system[_-]log/i.test(window.location.pathname) ? 'route:system-log' : '',
        document.querySelector('[data-se="admin-nav"]') ? 'shell:admin-nav' : '',
        document.querySelector('[data-se="system-log-filter"]') ? 'filter:system-log' : '',
        findLabeledInputValue('search') ? 'filter:search' : '',
        table ? 'data:table' : '',
      ].filter(Boolean);

      const unsupported = pageType === 'settings' || pageType === 'unknown';
      const failureReasons: string[] = [];
      if (unsupported) {
        failureReasons.push('This Okta page type is not supported for structured extraction');
      } else if (!table && pageType === 'log_viewer') {
        failureReasons.push('No result table detected for the current Okta page');
      }

      const extraction = buildAssessment({
        supported: !unsupported,
        pageType,
        failureReasons,
        detectedSignals: detectionSignals,
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
        vendorId: 'okta',
        consoleName: 'Okta',
        pageType,
        pageUrl: window.location.href,
        pageTitle: document.title,
        metadata: {
          orgName,
          resultCount: table?.totalRows ?? 0,
          filterExpression: query?.statement ?? null,
          queryLanguage: query?.language ?? null,
          queryParameters: query?.parameters ?? null,
          entities,
          supportedActions,
        },
      }, extraction);
    },

    extractQuery(): ExtractedQuery | null {
      return extractOktaQuery();
    },

    extractTable(): ExtractedTable | null {
      return extractOktaTable();
    },

    extractEntities(): ExtractedEntity[] {
      return extractOktaEntities(extractOktaTable());
    },

    supportedActions(): CaptureAction[] {
      return computeOktaSupportedActions();
    },
  };
}

function classifyOktaPage(): VendorPageContext['pageType'] {
  const path = window.location.pathname.toLowerCase();
  const title = `${document.title} ${firstText(['[data-se="page-title"]', 'h1']) ?? ''}`.toLowerCase();

  if (
    path.includes('/reports/system-log') ||
    path.includes('/admin/syslog') ||
    /\/report\/system[_-]log/i.test(path) ||
    title.includes('system log') ||
    hasAnySelector(['[aria-label="System Log Header"]'])
  ) {
    return 'log_viewer';
  }
  if (/\/admin\/(?:user|people|directory)/.test(path) || hasAnySelector(['[data-se="user-email"]', '[data-se="user-name"]'])) {
    return 'entity_detail';
  }
  if (path.includes('/admin/dashboard') || title.includes('dashboard')) {
    return 'dashboard';
  }
  if (path.includes('/admin/settings') || title.includes('customization') || title.includes('branding')) {
    return 'settings';
  }
  return 'unknown';
}

function extractOktaOrgName(): string | null {
  const match = window.location.hostname.match(/^([^.]+?)(?:-admin)?\.okta/i);
  return match?.[1] ?? firstText(['[data-se="org-label"]']);
}

function extractOktaQuery(): ExtractedQuery | null {
  const statement =
    firstValue(['[data-se="system-log-filter"]', '#filter-expression']) ||
    findLabeledInputValue('search') ||
    new URLSearchParams(window.location.search).get('search')?.trim() ||
    null;
  if (!statement) return null;

  const params = new URLSearchParams(window.location.search);
  return {
    language: 'okta-filter',
    statement,
    parameters: {
      fromTime: params.get('fromTime') ?? undefined,
      toTime: params.get('toTime') ?? undefined,
      locale: params.get('locale') ?? undefined,
    },
  };
}

function extractOktaTable(): ExtractedTable | null {
  return extractTableFromSelectors([
    '.data-list-table table',
    '[data-se="admin-table"] table',
    '.syslog-events table',
    'main table',
  ]) ?? extractLikelyOktaResultsTable();
}

function extractOktaEntities(table: ExtractedTable | null): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  const userEmail = firstText(['[data-se="user-email"]']);
  if (userEmail) {
    entities.push({ type: 'email', value: userEmail, context: 'okta-user-email' });
  }

  const userName = firstText(['[data-se="user-name"]']);
  if (userName) {
    entities.push({ type: 'user', value: userName, context: 'okta-user-name' });
  }

  entities.push(...collectColumnEntities(table, [
    { headerIncludes: ['actor'], context: 'okta-table-actor' },
    { headerIncludes: ['ip'], type: 'ip', context: 'okta-table-ip' },
    { headerIncludes: ['target'], context: 'okta-table-target' },
  ]));

  for (const selector of ['.syslog-actor', '.event-actor-name', '.syslog-ip']) {
    const matches = document.querySelectorAll(selector);
    for (const match of matches) {
      const value = normalizeWhitespace(match.textContent ?? '');
      if (!value) continue;
      entities.push({
        type: selector.includes('ip') ? 'ip' : value.includes('@') ? 'email' : 'user',
        value,
        context: 'okta-inline',
      });
    }
  }

  return dedupeEntities(entities);
}

function computeOktaSupportedActions(): CaptureAction[] {
  const pageType = classifyOktaPage();
  const table = extractOktaTable();
  const query = extractOktaQuery();
  const entities = extractOktaEntities(table);
  const extraction = buildAssessment({
    supported: pageType !== 'settings' && pageType !== 'unknown',
    pageType,
    failureReasons: pageType === 'settings' || pageType === 'unknown'
      ? ['This Okta page type is not supported for structured extraction']
      : !table && pageType === 'log_viewer'
        ? ['No result table detected for the current Okta page']
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

function extractLikelyOktaResultsTable(): ExtractedTable | null {
  const tables = Array.from(document.querySelectorAll<HTMLTableElement>('table'));
  let bestMatch: ExtractedTable | null = null;
  let bestScore = 0;

  for (const table of tables) {
    const extracted = extractSingleTable(table);
    if (!extracted) continue;

    const headers = extracted.headers.map((header) => header.toLowerCase());
    const score =
      (headers.some((header) => header.includes('time')) ? 1 : 0) +
      (headers.some((header) => header.includes('actor')) ? 1 : 0) +
      (headers.some((header) => header.includes('event')) ? 1 : 0) +
      (headers.some((header) => header.includes('target')) ? 1 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = extracted;
    }
  }

  return bestScore >= 2 ? bestMatch : null;
}

function extractSingleTable(table: HTMLTableElement): ExtractedTable | null {
  const headers = Array.from(table.querySelectorAll('thead th'))
    .map((cell) => normalizeWhitespace(cell.textContent ?? ''))
    .filter(Boolean);
  if (headers.length === 0) return null;

  const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
  return {
    headers,
    rows: bodyRows.map((row) => (
      Array.from(row.querySelectorAll('td')).map((cell) => normalizeWhitespace(cell.textContent ?? ''))
    )),
    totalRows: bodyRows.length,
    truncated: false,
  };
}

function findLabeledInputValue(labelText: string): string | null {
  const labels = Array.from(document.querySelectorAll('label'));
  const normalizedLabelText = labelText.trim().toLowerCase();

  for (const label of labels) {
    if (normalizeWhitespace(label.textContent ?? '').toLowerCase() !== normalizedLabelText) continue;

    const forId = label.getAttribute('for');
    if (forId) {
      const control = document.getElementById(forId) as HTMLInputElement | HTMLTextAreaElement | null;
      const value = control?.value?.trim();
      if (value) return value;
    }

    const siblingInput = label.parentElement?.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null;
    const siblingValue = siblingInput?.value?.trim();
    if (siblingValue) return siblingValue;
  }

  return null;
}
