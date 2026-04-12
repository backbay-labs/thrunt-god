import { describe, it, expect } from 'vitest';
import { FuzzySuggestModal } from '../__mocks__/obsidian';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ---------------------------------------------------------------------------
// CanvasTemplateModal -- rebuilt on FuzzySuggestModal
// ---------------------------------------------------------------------------

import { CanvasTemplateModal } from '../modals';

describe('CanvasTemplateModal', () => {
  it('extends FuzzySuggestModal', () => {
    const onSelect = () => {};
    const modal = new CanvasTemplateModal({} as any, onSelect);
    expect(modal).toBeInstanceOf(FuzzySuggestModal);
  });

  it('getItems() returns 4 template items', () => {
    const modal = new CanvasTemplateModal({} as any, () => {});
    const items = modal.getItems();
    expect(items).toHaveLength(4);
    const values = items.map((i: any) => i.value);
    expect(values).toEqual(['kill-chain', 'diamond', 'lateral-movement', 'hunt-progression']);
  });

  it('getItemText() returns item.label for each item', () => {
    const modal = new CanvasTemplateModal({} as any, () => {});
    const items = modal.getItems();
    for (const item of items) {
      expect(typeof modal.getItemText(item)).toBe('string');
      expect(modal.getItemText(item)).toBe((item as any).label);
    }
  });
});

// ---------------------------------------------------------------------------
// HyperCopyModal -- zero inline styles
// ---------------------------------------------------------------------------

describe('HyperCopyModal source', () => {
  const src = readFileSync(
    resolve(__dirname, '../hyper-copy-modal.ts'),
    'utf-8',
  );

  it('has zero occurrences of .style.', () => {
    const matches = src.match(/\.style\./g) || [];
    expect(matches).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// McpSearchModal -- no hardcoded hex colors
// ---------------------------------------------------------------------------

describe('McpSearchModal source', () => {
  const src = readFileSync(
    resolve(__dirname, '../mcp-search-modal.ts'),
    'utf-8',
  );

  it('has no BADGE_COLORS hardcoded hex map', () => {
    expect(src).not.toContain('BADGE_COLORS');
  });

  it('has no hardcoded hex color values', () => {
    // Match any #xxx or #xxxxxx hex color patterns
    const hexColorMatches = src.match(/#[0-9a-fA-F]{3,6}\b/g) || [];
    expect(hexColorMatches).toHaveLength(0);
  });

  it('uses data-entity-type attribute for badge styling', () => {
    expect(src).toContain('data-entity-type');
  });
});

// ---------------------------------------------------------------------------
// styles.css -- CSS classes exist
// ---------------------------------------------------------------------------

describe('styles.css', () => {
  const css = readFileSync(
    resolve(__dirname, '../../styles.css'),
    'utf-8',
  );

  it('contains .thrunt-profile-item class', () => {
    expect(css).toContain('.thrunt-profile-item');
  });

  it('contains .thrunt-search-result class', () => {
    expect(css).toContain('.thrunt-search-result');
  });

  it('contains .thrunt-entity-badge class', () => {
    expect(css).toContain('.thrunt-entity-badge');
  });

  it('contains .thrunt-token-badge class', () => {
    expect(css).toContain('.thrunt-token-badge');
  });

  it('contains .thrunt-token-warning class', () => {
    expect(css).toContain('.thrunt-token-warning');
  });

  it('uses var(--color-red) for warning color instead of hardcoded red', () => {
    expect(css).toContain('var(--color-red)');
  });

  // Verify no hardcoded hex colors in the new modal CSS sections
  it('new modal CSS sections use only CSS variables (no hardcoded hex colors)', () => {
    // Extract lines after .thrunt-profile-item (new modal sections)
    const profileIdx = css.indexOf('.thrunt-profile-item');
    if (profileIdx >= 0) {
      const newSections = css.slice(profileIdx);
      // color-mix() can contain hex-like patterns inside var() references
      // but direct property values should not have hardcoded hex
      // Check that no property value uses a bare hex color (not in a var() or color-mix())
      const lines = newSections.split('\n');
      const hexLines = lines.filter((line) => {
        // Skip comments and selector lines
        if (line.trim().startsWith('/*') || line.trim().startsWith('*') || line.trim().startsWith('.') || line.trim().startsWith('[')) return false;
        // Skip lines that are just closing braces
        if (line.trim() === '}') return false;
        // Check for bare hex colors in property values
        // Allow color-mix() and var() which use CSS variables
        if (line.includes('color-mix') || line.includes('var(--')) return false;
        return /#[0-9a-fA-F]{3,6}\b/.test(line);
      });
      expect(hexLines).toHaveLength(0);
    }
  });
});
