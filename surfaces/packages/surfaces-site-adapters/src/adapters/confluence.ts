import type { SiteAdapter, VendorPageContext, ExtractedQuery, ExtractedTable, ExtractedEntity, CaptureAction } from '@thrunt-surfaces/contracts';

export function createConfluenceAdapter(): SiteAdapter {
  return {
    id: 'confluence',
    displayName: 'Atlassian Confluence',
    urlPatterns: [
      '.atlassian.net/wiki/',
      'confluence.atlassian.com',
    ],

    detect(): boolean {
      return false;
    },

    extractContext(): VendorPageContext {
      return {
        vendorId: 'confluence',
        consoleName: 'Confluence',
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
      return ['clip_table', 'clip_entity', 'attach_page_context'];
    },
  };
}
