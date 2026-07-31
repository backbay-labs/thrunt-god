import type { SiteAdapter, VendorPageContext, ExtractedQuery, ExtractedTable, ExtractedEntity, CaptureAction } from '@thrunt-surfaces/contracts';

export function createJiraAdapter(): SiteAdapter {
  return {
    id: 'jira',
    displayName: 'Atlassian Jira',
    urlPatterns: [
      '.atlassian.net/browse/',
      '.atlassian.net/jira/',
      'jira.atlassian.com',
    ],

    detect(): boolean {
      return false;
    },

    extractContext(): VendorPageContext {
      return {
        vendorId: 'jira',
        consoleName: 'Jira',
        pageType: 'unknown',
        pageUrl: '',
        pageTitle: '',
        metadata: {},
      };
    },

    extractQuery(): ExtractedQuery | null {
      return null;
    },

    extractTable(): ExtractedTable | null {
      return null;
    },

    extractEntities(): ExtractedEntity[] {
      return [];
    },

    supportedActions(): CaptureAction[] {
      return ['clip_entity', 'attach_page_context'];
    },
  };
}
