/**
 * Jira content script adapter.
 *
 * DOM selectors are best-effort stubs. Jira Cloud uses Atlassian Design System
 * components with data-testid attributes. Jira Server/DC uses different
 * selectors. These target Cloud patterns primarily but will need periodic
 * maintenance.
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

export function createJiraAdapter(): SiteAdapter {
  return {
    id: 'jira',
    displayName: 'Atlassian Jira',
    urlPatterns: ['atlassian.net', 'jira.com'],

    detect(): boolean {
      return !!(
        document.querySelector('[data-testid="navigation-apps-sidebar"]') ||
        document.querySelector('#jira-frontend') ||
        document.querySelector('[data-testid="issue.views.issue-base.foundation.breadcrumbs"]') ||
        // Jira Server/DC fallback
        document.querySelector('#jira') ||
        document.querySelector('.aui-header-primary .aui-nav')
      );
    },

    extractContext(): VendorPageContext {
      let pageType: VendorPageContext['pageType'] = 'unknown';
      const path = window.location.pathname.toLowerCase();

      if (path.includes('/browse/') || path.includes('/issue/')) {
        pageType = 'entity_detail'; // Individual issue
      } else if (path.includes('/jira/dashboards') || path.includes('/secure/Dashboard')) {
        pageType = 'dashboard';
      } else if (path.includes('/jira/boards') || path.includes('/secure/RapidBoard')) {
        pageType = 'dashboard'; // Board view
      } else if (path.includes('/jira/settings') || path.includes('/secure/admin')) {
        pageType = 'settings';
      }

      // Extract project key from issue key in URL
      const issueKeyMatch = path.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/i) ??
        window.location.search.match(/selectedIssue=([A-Z][A-Z0-9]+-\d+)/i);
      const issueKey = issueKeyMatch ? issueKeyMatch[1].toUpperCase() : null;
      const projectKey = issueKey?.split('-')[0] ?? null;

      return {
        vendorId: 'jira',
        consoleName: 'Jira',
        pageType,
        pageUrl: window.location.href,
        pageTitle: document.title,
        metadata: {
          issueKey,
          projectKey,
          isCloud: window.location.hostname.includes('atlassian.net'),
        },
      };
    },

    extractQuery(): ExtractedQuery | null {
      // Jira doesn't have a traditional query editor visible in the DOM for
      // most views. JQL is in the filter bar on search pages.
      const jqlInput = document.querySelector<HTMLInputElement>(
        '[data-testid="jql-editor-input"]'
      ) ?? document.querySelector<HTMLInputElement>(
        '#advanced-search, #jql-input'
      );

      if (jqlInput?.value) {
        return {
          language: 'jql',
          statement: jqlInput.value,
        };
      }

      return null;
    },

    extractTable(): ExtractedTable | null {
      return null;
    },

    extractEntities(): ExtractedEntity[] {
      const entities: ExtractedEntity[] = [];

      // Issue key from the page
      const issueKeyEl = document.querySelector(
        '[data-testid="issue.views.issue-base.foundation.breadcrumbs.current-issue.item"] a, #key-val'
      );
      const issueKey = issueKeyEl?.textContent?.trim();
      if (issueKey) {
        entities.push({ type: 'other', value: issueKey, context: 'jira-issue-key' });
      }

      // Assignee / Reporter
      const assigneeEl = document.querySelector(
        '[data-testid="issue.views.field.user.assignee"] span, #assignee-val .user-hover'
      );
      const assignee = assigneeEl?.textContent?.trim();
      if (assignee) {
        entities.push({ type: 'user', value: assignee, context: 'jira-assignee' });
      }

      const reporterEl = document.querySelector(
        '[data-testid="issue.views.field.user.reporter"] span, #reporter-val .user-hover'
      );
      const reporter = reporterEl?.textContent?.trim();
      if (reporter) {
        entities.push({ type: 'user', value: reporter, context: 'jira-reporter' });
      }

      // Issue summary / title for context
      const summaryEl = document.querySelector(
        '[data-testid="issue.views.issue-base.foundation.summary.heading"] h1, #summary-val'
      );
      const summary = summaryEl?.textContent?.trim();
      if (summary) {
        entities.push({ type: 'other', value: summary, context: 'jira-issue-summary' });
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
initializeAdapter(createJiraAdapter());
