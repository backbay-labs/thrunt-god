import type { SiteAdapter, VendorPageContext, ExtractedQuery, ExtractedTable, ExtractedEntity, CaptureAction } from '@thrunt-surfaces/contracts';

export function createGcpAdapter(): SiteAdapter {
  return {
    id: 'gcp',
    displayName: 'Google Cloud Console (Chronicle / SCC)',
    urlPatterns: [
      'console.cloud.google.com',
      'chronicle.security',
      'cloud.google.com/security-command-center',
    ],

    detect(): boolean {
      return false;
    },

    extractContext(): VendorPageContext {
      return {
        vendorId: 'gcp',
        consoleName: 'Google Cloud Console',
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
