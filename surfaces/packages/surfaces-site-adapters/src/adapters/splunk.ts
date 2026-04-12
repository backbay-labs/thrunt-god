import type { SiteAdapter, VendorPageContext, ExtractedQuery, ExtractedTable, ExtractedEntity, CaptureAction } from '@thrunt-surfaces/contracts';

export function createSplunkAdapter(): SiteAdapter {
  return {
    id: 'splunk',
    displayName: 'Splunk Enterprise / Cloud',
    urlPatterns: [
      'splunkcloud.com',
      'splunk.com',
      '/en-US/app/',
      '/en-US/search',
    ],

    detect(): boolean {
      return false;
    },

    extractContext(): VendorPageContext {
      return {
        vendorId: 'splunk',
        consoleName: 'Splunk',
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
      return ['clip_query', 'clip_table', 'clip_entity', 'attach_page_context'];
    },
  };
}
