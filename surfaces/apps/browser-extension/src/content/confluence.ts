/**
 * Confluence content script adapter.
 *
 * DOM selectors are best-effort stubs. Confluence Cloud uses Atlassian Design
 * System components with data-testid attributes. Confluence Server/DC uses
 * different selectors. These target Cloud patterns primarily but will need
 * periodic maintenance.
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

export function createConfluenceAdapter(): SiteAdapter {
  return {
    id: 'confluence',
    displayName: 'Atlassian Confluence',
    urlPatterns: ['atlassian.net/wiki'],

    detect(): boolean {
      return !!(
        // Confluence Cloud viewer / editor
        document.querySelector('[data-testid="confluence-page-header"]') ||
        document.querySelector('#content-body') ||
        document.querySelector('.ak-renderer-document') ||
        document.querySelector('[data-testid="page-layout"]') ||
        // Confluence editor
        document.querySelector('.ProseMirror') ||
        document.querySelector('[data-testid="editor-appearance-full-width"]') ||
        // Confluence Server/DC fallback
        document.querySelector('#main-content') &&
          window.location.pathname.includes('/wiki/')
      );
    },

    extractContext(): VendorPageContext {
      let pageType: VendorPageContext['pageType'] = 'unknown';
      const path = window.location.pathname.toLowerCase();

      if (path.includes('/edit') || document.querySelector('.ProseMirror')) {
        pageType = 'unknown'; // Editing mode
      } else if (path.includes('/wiki/spaces/') || path.includes('/pages/')) {
        pageType = 'entity_detail'; // Viewing a page
      } else if (path.includes('/wiki/home') || path.includes('/wiki/discover')) {
        pageType = 'dashboard';
      }

      // Extract space key and page title
      const spaceKeyMatch = path.match(/\/wiki\/spaces\/([^/]+)/);
      const spaceKey = spaceKeyMatch ? spaceKeyMatch[1] : null;

      const pageTitleEl = document.querySelector(
        '[data-testid="title-text"] span, #title-text'
      );
      const pageTitle = pageTitleEl?.textContent?.trim() ?? document.title;

      return {
        vendorId: 'confluence',
        consoleName: 'Confluence',
        pageType,
        pageUrl: window.location.href,
        pageTitle,
        metadata: {
          spaceKey,
          isCloud: window.location.hostname.includes('atlassian.net'),
          isEditing: !!document.querySelector('.ProseMirror'),
        },
      };
    },

    extractQuery(): ExtractedQuery | null {
      // Confluence doesn't have a query editor
      return null;
    },

    extractTable(): ExtractedTable | null {
      return null;
    },

    extractEntities(): ExtractedEntity[] {
      const entities: ExtractedEntity[] = [];

      // Page author / contributor
      const authorEl = document.querySelector(
        '[data-testid="page-metadata-author"] a, .page-metadata .author a'
      );
      const author = authorEl?.textContent?.trim();
      if (author) {
        entities.push({ type: 'user', value: author, context: 'confluence-page-author' });
      }

      // Space name
      const spaceEl = document.querySelector(
        '[data-testid="breadcrumb-current-space"] a, .breadcrumbs-segment a[href*="/spaces/"]'
      );
      const space = spaceEl?.textContent?.trim();
      if (space) {
        entities.push({ type: 'other', value: space, context: 'confluence-space' });
      }

      // Labels on the page
      const labelElements = document.querySelectorAll(
        '[data-testid="label-item"] span, .label-list .label a'
      );
      for (const el of labelElements) {
        const value = el.textContent?.trim();
        if (value) {
          entities.push({ type: 'other', value, context: 'confluence-label' });
        }
      }

      return deduplicateEntities(entities);
    },

    supportedActions(): CaptureAction[] {
      return ['attach_page_context'];
    },
  };
}

// --- helpers ---

function deduplicateEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  const seen = new Set<string>();
  return entities.filter((e) => {
    const key = `${e.type}:${e.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// --- bootstrap ---
initializeAdapter(createConfluenceAdapter());
