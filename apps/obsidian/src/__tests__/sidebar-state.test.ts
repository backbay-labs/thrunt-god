import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SIDEBAR_STATE,
  getEffectiveExpandedSections,
} from '../sidebar-state';

describe('DEFAULT_SIDEBAR_STATE', () => {
  it('defaults hunt-status to expanded', () => {
    expect(DEFAULT_SIDEBAR_STATE.expandedSections['hunt-status']).toBe(true);
  });

  it('defaults knowledge-base to expanded', () => {
    expect(DEFAULT_SIDEBAR_STATE.expandedSections['knowledge-base']).toBe(true);
  });

  it('defaults extended-artifacts to collapsed', () => {
    expect(DEFAULT_SIDEBAR_STATE.expandedSections['extended-artifacts']).toBe(false);
  });

  it('defaults receipt-timeline to collapsed', () => {
    expect(DEFAULT_SIDEBAR_STATE.expandedSections['receipt-timeline']).toBe(false);
  });

  it('defaults core-artifacts to collapsed', () => {
    expect(DEFAULT_SIDEBAR_STATE.expandedSections['core-artifacts']).toBe(false);
  });

  it('has exactly 5 section keys', () => {
    const keys = Object.keys(DEFAULT_SIDEBAR_STATE.expandedSections);
    expect(keys).toHaveLength(5);
    expect(keys).toContain('hunt-status');
    expect(keys).toContain('knowledge-base');
    expect(keys).toContain('extended-artifacts');
    expect(keys).toContain('receipt-timeline');
    expect(keys).toContain('core-artifacts');
  });
});

describe('getEffectiveExpandedSections', () => {
  const defaults = { ...DEFAULT_SIDEBAR_STATE.expandedSections };

  it('forces receipt-timeline open for healthy workspace', () => {
    const result = getEffectiveExpandedSections(defaults, 'healthy');
    expect(result['receipt-timeline']).toBe(true);
    // Other sections remain at their default values
    expect(result['hunt-status']).toBe(true);
    expect(result['knowledge-base']).toBe(true);
    expect(result['extended-artifacts']).toBe(false);
    expect(result['core-artifacts']).toBe(false);
  });

  it('forces core-artifacts open for missing workspace', () => {
    const result = getEffectiveExpandedSections(defaults, 'missing');
    expect(result['core-artifacts']).toBe(true);
    // Others stay at defaults
    expect(result['hunt-status']).toBe(true);
    expect(result['extended-artifacts']).toBe(false);
    expect(result['receipt-timeline']).toBe(false);
  });

  it('forces knowledge-base open for partial workspace', () => {
    const result = getEffectiveExpandedSections(defaults, 'partial');
    expect(result['knowledge-base']).toBe(true);
    // Others stay at defaults
    expect(result['hunt-status']).toBe(true);
    expect(result['extended-artifacts']).toBe(false);
    expect(result['receipt-timeline']).toBe(false);
  });

  it('overrides user state: healthy forces receipt-timeline even if user collapsed it', () => {
    const allFalse: Record<string, boolean> = {
      'hunt-status': false,
      'knowledge-base': false,
      'extended-artifacts': false,
      'receipt-timeline': false,
      'core-artifacts': false,
    };
    const result = getEffectiveExpandedSections(allFalse, 'healthy');
    expect(result['receipt-timeline']).toBe(true);
    // Other user overrides remain false
    expect(result['hunt-status']).toBe(false);
    expect(result['knowledge-base']).toBe(false);
    expect(result['extended-artifacts']).toBe(false);
    expect(result['core-artifacts']).toBe(false);
  });

  it('preserves present keys and supplies defaults for missing keys during merge', () => {
    // Simulate a partial stored expandedSections (user only toggled hunt-status)
    const partial: Record<string, boolean> = {
      'hunt-status': false,
    };
    const result = getEffectiveExpandedSections(partial, 'healthy');
    // hunt-status was set by user to false: preserved
    expect(result['hunt-status']).toBe(false);
    // receipt-timeline forced by healthy status
    expect(result['receipt-timeline']).toBe(true);
  });

  it('does not mutate the input persisted object', () => {
    const original = { ...defaults };
    const frozen = { ...original };
    getEffectiveExpandedSections(frozen, 'missing');
    expect(frozen).toEqual(original);
  });
});
