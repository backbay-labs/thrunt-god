import type { SiteAdapter, VendorPageContext, ExtractedQuery, ExtractedTable, ExtractedEntity, CaptureAction } from '@thrunt-surfaces/contracts';

export function createServiceNowAdapter(): SiteAdapter {
  return {
    id: 'servicenow',
    displayName: 'ServiceNow (SecOps / ITSM)',
    urlPatterns: [
      '.service-now.com',
      '.servicenow.com',
      '/nav_to.do',
      '/now/sow/',
    ],

    detect(): boolean {
      return false;
    },

    extractContext(): VendorPageContext {
      return {
        vendorId: 'servicenow',
        consoleName: 'ServiceNow',
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
