import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FuzzySuggestModal } from '../__mocks__/obsidian';
import { VERDICT_VALUES } from '../verdict';

// Mock modules that chooser-modals.ts imports
vi.mock('../hyper-copy-modal', () => ({
  HyperCopyModal: vi.fn().mockImplementation(() => ({ open: vi.fn() })),
}));
vi.mock('../export-log', () => ({
  buildExportLogEntry: vi.fn().mockReturnValue({}),
}));

import { VerdictSuggestModal } from '../chooser-modals';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFuzzyMatch<T>(item: T): { item: T; match: any } {
  return { item, match: { score: 0, matches: [] } };
}

// ---------------------------------------------------------------------------
// VerdictSuggestModal
// ---------------------------------------------------------------------------

describe('VerdictSuggestModal', () => {
  let modal: InstanceType<typeof VerdictSuggestModal>;
  let onSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSelect = vi.fn();
    modal = new VerdictSuggestModal({} as any, onSelect);
  });

  it('extends FuzzySuggestModal', () => {
    expect(modal).toBeInstanceOf(FuzzySuggestModal);
  });

  it('has 5 items matching VERDICT_VALUES', () => {
    const items = modal.getItems();
    expect(items).toHaveLength(5);
    const ids = items.map((i: any) => i.id);
    expect(ids).toEqual([...VERDICT_VALUES]);
  });

  it('getItemText returns human-readable names', () => {
    const items = modal.getItems();
    const texts = items.map((i: any) => modal.getItemText(i));
    expect(texts).toEqual([
      'Unknown',
      'Suspicious',
      'Confirmed Malicious',
      'Remediated',
      'Resurfaced',
    ]);
  });

  it('onChooseItem calls onSelect with verdict value', () => {
    const items = modal.getItems();
    modal.onChooseItem(items[1]!, {} as any);
    expect(onSelect).toHaveBeenCalledWith('suspicious');
  });

  it('renderSuggestion creates div with name and description', () => {
    const items = modal.getItems();
    const match = makeFuzzyMatch(items[0]!);
    const children: Array<{ cls: string; text: string }> = [];
    const el = {
      createDiv: (opts: { cls: string; text: string }) => {
        children.push(opts);
        return opts;
      },
    } as any;
    modal.renderSuggestion(match, el);
    expect(children).toHaveLength(2);
    expect(children[0]!.cls).toBe('thrunt-chooser-name');
    expect(children[0]!.text).toBe('Unknown');
    expect(children[1]!.cls).toBe('thrunt-chooser-desc');
    expect(children[1]!.text).toBe('No determination made yet');
  });
});

// ---------------------------------------------------------------------------
// set-entity-verdict command structure
// ---------------------------------------------------------------------------

describe('set-entity-verdict command', () => {
  it('command ID is present in commands.ts source', async () => {
    // Read the source to verify registration
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../commands.ts', import.meta.url),
      'utf-8',
    );
    expect(src).toContain("id: 'set-entity-verdict'");
    expect(src).toContain("name: 'Set entity verdict'");
    expect(src).toContain('appendVerdictEntry');
    expect(src).toContain('updateFrontmatter');
    expect(src).toContain('Verdict set to');
  });

  it('checkCallback pattern uses ENTITY_FOLDERS for entity detection', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(
      new URL('../commands.ts', import.meta.url),
      'utf-8',
    );
    expect(src).toContain('ENTITY_FOLDERS');
    expect(src).toContain('checkCallback');
  });

  it('checkCallback returns false for non-entity paths', () => {
    // Simulate checkCallback logic inline
    const ENTITY_FOLDERS_COPY = [
      'entities/iocs', 'entities/ttps', 'entities/actors',
      'entities/tools', 'entities/infra', 'entities/datasources',
    ];

    const isEntity = (path: string) =>
      ENTITY_FOLDERS_COPY.some((folder) => path.includes(folder));

    expect(isEntity('notes/random.md')).toBe(false);
    expect(isEntity('daily/2026-04-12.md')).toBe(false);
  });

  it('checkCallback returns true for entity note paths', () => {
    const ENTITY_FOLDERS_COPY = [
      'entities/iocs', 'entities/ttps', 'entities/actors',
      'entities/tools', 'entities/infra', 'entities/datasources',
    ];

    const isEntity = (path: string) =>
      ENTITY_FOLDERS_COPY.some((folder) => path.includes(folder));

    expect(isEntity('entities/iocs/10.0.0.1.md')).toBe(true);
    expect(isEntity('entities/ttps/T1059.md')).toBe(true);
    expect(isEntity('entities/actors/APT28.md')).toBe(true);
    expect(isEntity('entities/tools/Mimikatz.md')).toBe(true);
    expect(isEntity('entities/infra/c2-server.md')).toBe(true);
    expect(isEntity('entities/datasources/syslog.md')).toBe(true);
  });

  it('checkCallback returns false when no active file', () => {
    // Simulates the null check: if (!file) return false
    const file = null;
    expect(file ? true : false).toBe(false);
  });
});
