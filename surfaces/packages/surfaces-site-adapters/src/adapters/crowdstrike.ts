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
  inferEntityType,
  normalizeWhitespace,
} from '../helpers.ts';

const BASE_ACTIONS: CaptureAction[] = ['clip_query', 'clip_table', 'clip_entity', 'clip_screenshot_metadata', 'attach_page_context'];

export function createCrowdStrikeAdapter(): SiteAdapter {
  return {
    id: 'crowdstrike',
    displayName: 'CrowdStrike Falcon',
    urlPatterns: [
      'falcon.crowdstrike.com',
      'falcon.us-2.crowdstrike.com',
      'falcon.eu-1.crowdstrike.com',
      'falcon.laggar.gcw.crowdstrike.com',
    ],

    detect(): boolean {
      return !!(
        document.querySelector('#falcon-app') ||
        document.querySelector('[data-testid="falcon-shell"]') ||
        document.querySelector('[class*="falcon-chrome"]') ||
        document.querySelector('nav[aria-label="Falcon navigation"]') ||
        document.querySelector('[data-testid="event-search"]')
      );
    },

    extractContext(): VendorPageContext {
      const detected = this.detect();
      const pageType = detected ? classifyCrowdStrikePage() : 'unknown';
      const query = extractCrowdStrikeQuery();
      const table = extractCrowdStrikeTable();
      const entities = extractCrowdStrikeEntities();

      const supported = detected && pageType !== 'unknown';
      const failureReasons: string[] = [];
      if (!supported) {
        failureReasons.push('This Falcon page is not a supported CrowdStrike surface');
      } else {
        if (!query && pageType === 'search') {
          failureReasons.push('No FQL query editor detected');
        }
        if (!table && pageType === 'search') {
          failureReasons.push('No events table detected');
        }
        if (!query && pageType === 'alert_detail') {
          failureReasons.push('No FQL query editor detected on detection page');
        }
      }

      const extraction = buildAssessment({
        supported,
        pageType,
        failureReasons,
        detectedSignals: [
          pageType !== 'unknown' ? `page:${pageType}` : '',
          document.querySelector('[data-testid="event-search"]') ? 'app:event-search' : '',
          document.querySelector('[data-testid="falcon-shell"]') ? 'shell:falcon' : '',
          query ? 'editor:fql' : '',
          table ? 'data:table' : '',
        ].filter(Boolean),
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
        vendorId: 'crowdstrike',
        consoleName: 'CrowdStrike Falcon',
        pageType,
        pageUrl: window.location.href,
        pageTitle: document.title,
        metadata: {
          section: path.split('/').filter(Boolean)[0] ?? null,
          cloudRegion: extractFalconRegion(),
          timeRange: firstText(['[data-testid="time-range-display"]']),
          supportedActions,
        },
      }, extraction);
    },

    extractQuery(): ExtractedQuery | null {
      return extractCrowdStrikeQuery();
    },

    extractTable(): ExtractedTable | null {
      return extractCrowdStrikeTable();
    },

    extractEntities(): ExtractedEntity[] {
      return extractCrowdStrikeEntities();
    },

    supportedActions(): CaptureAction[] {
      return computeCrowdStrikeSupportedActions();
    },
  };
}

function classifyCrowdStrikePage(): VendorPageType {
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();

  if (path.includes('/investigate/events') || hash.includes('event-search')) return 'search';
  if (path.includes('/dashboards') || path.includes('/activity/dashboard')) return 'dashboard';
  if (path.includes('/detects') || path.includes('/alerts')) return 'alert_detail';
  if (path.includes('/incidents')) return 'incident';
  if (path.includes('/hosts/') || path.includes('/users/')) return 'entity_detail';
  return 'unknown';
}

function extractCrowdStrikeQuery(): ExtractedQuery | null {
  const queryInput =
    document.querySelector<HTMLTextAreaElement>('[data-testid="event-search-query"] textarea') ??
    document.querySelector<HTMLTextAreaElement>('[data-testid="query-editor"] textarea') ??
    document.querySelector<HTMLInputElement>('input[placeholder*="Search events"]');

  const statement = queryInput?.value?.trim();
  if (!statement) return null;

  const timeEl = document.querySelector('[data-testid="time-range-display"]') ??
    document.querySelector('[class*="TimeRangePicker"] button');
  const displayTimeRange = timeEl?.textContent?.trim() ?? undefined;

  return {
    language: 'fql',
    statement: normalizeWhitespace(statement),
    parameters: displayTimeRange ? { displayTimeRange } : undefined,
  };
}

function extractCrowdStrikeTable(): ExtractedTable | null {
  return extractTableFromSelectors([
    '[data-testid="events-table"] table',
    '[data-testid="detections-table"] table',
    '[role="grid"] table',
  ]);
}

function extractCrowdStrikeEntities(): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  const hostEl = document.querySelector('[data-testid="host-name"], [class*="HostName"]');
  if (hostEl?.textContent?.trim()) {
    entities.push({ type: 'host', value: hostEl.textContent.trim(), context: 'falcon-detection' });
  }

  const userEl = document.querySelector('[data-testid="user-name"], [class*="UserName"]');
  if (userEl?.textContent?.trim()) {
    entities.push({ type: 'user', value: userEl.textContent.trim(), context: 'falcon-detection' });
  }

  const hashElements = document.querySelectorAll('[data-testid*="hash"], [class*="FileHash"]');
  for (const el of hashElements) {
    const value = el.textContent?.trim();
    if (value && /^[a-fA-F0-9]{32,128}$/.test(value)) {
      entities.push({ type: 'hash', value, context: 'falcon-detection-hash' });
    }
  }

  const ipElements = document.querySelectorAll('[data-testid*="ip-address"], [class*="IpAddress"]');
  for (const el of ipElements) {
    const value = el.textContent?.trim();
    if (value) {
      entities.push({ type: 'ip', value, context: 'falcon-network' });
    }
  }

  return dedupeEntities(entities);
}

function extractFalconRegion(): string | null {
  const hostname = window.location.hostname;
  const regionMatch = hostname.match(/falcon\.([^.]+)\.crowdstrike\.com/);
  return regionMatch ? regionMatch[1] : null;
}

function computeCrowdStrikeSupportedActions(): CaptureAction[] {
  const detected = !!(
    document.querySelector('#falcon-app') ||
    document.querySelector('[data-testid="falcon-shell"]') ||
    document.querySelector('[class*="falcon-chrome"]') ||
    document.querySelector('nav[aria-label="Falcon navigation"]') ||
    document.querySelector('[data-testid="event-search"]')
  );
  const pageType = detected ? classifyCrowdStrikePage() : 'unknown';
  const query = extractCrowdStrikeQuery();
  const table = extractCrowdStrikeTable();
  const entities = extractCrowdStrikeEntities();

  const extraction = buildAssessment({
    supported: detected && pageType !== 'unknown',
    pageType,
    failureReasons: (() => {
      const reasons: string[] = [];
      if (pageType === 'unknown' || !detected) {
        reasons.push('This Falcon page is not a supported CrowdStrike surface');
      } else {
        if (!query && pageType === 'search') reasons.push('No FQL query editor detected');
        if (!table && pageType === 'search') reasons.push('No events table detected');
        if (!query && pageType === 'alert_detail') reasons.push('No FQL query editor detected on detection page');
      }
      return reasons;
    })(),
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
