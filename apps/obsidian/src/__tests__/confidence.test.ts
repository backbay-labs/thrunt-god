import { describe, it, expect } from 'vitest';
import {
  normalizeSourceCount,
  normalizeCorroboration,
  computeDecayFactor,
  computeConfidence,
  formatConfidenceFactors,
  parseConfidenceFactors,
  type ConfidenceFactors,
} from '../confidence';
import { parseEntityNote } from '../entity-utils';

// ---------------------------------------------------------------------------
// normalizeSourceCount
// ---------------------------------------------------------------------------

describe('normalizeSourceCount', () => {
  it('returns 0 for count 0', () => {
    expect(normalizeSourceCount(0)).toBe(0);
  });

  it('returns approximately 0.5 for count 1', () => {
    const result = normalizeSourceCount(1);
    expect(result).toBeCloseTo(0.5, 1);
  });

  it('returns approximately 1.0 for count 3', () => {
    const result = normalizeSourceCount(3);
    expect(result).toBeCloseTo(1.0, 1);
  });

  it('returns 1.0 for count 10 (capped)', () => {
    expect(normalizeSourceCount(10)).toBe(1);
  });

  it('returns 0 for negative count', () => {
    expect(normalizeSourceCount(-5)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// normalizeCorroboration
// ---------------------------------------------------------------------------

describe('normalizeCorroboration', () => {
  it('returns 0 for count 0', () => {
    expect(normalizeCorroboration(0)).toBe(0);
  });

  it('returns approximately 0.5 for count 1', () => {
    const result = normalizeCorroboration(1);
    expect(result).toBeCloseTo(0.5, 1);
  });

  it('returns approximately 1.0 for count 3', () => {
    const result = normalizeCorroboration(3);
    expect(result).toBeCloseTo(1.0, 1);
  });
});

// ---------------------------------------------------------------------------
// computeDecayFactor
// ---------------------------------------------------------------------------

describe('computeDecayFactor', () => {
  it('returns 1.0 for 0 days', () => {
    expect(computeDecayFactor(0, 90)).toBe(1.0);
  });

  it('returns 0.5 for one half-life', () => {
    expect(computeDecayFactor(90, 90)).toBeCloseTo(0.5, 5);
  });

  it('returns 0.25 for two half-lives', () => {
    expect(computeDecayFactor(180, 90)).toBeCloseTo(0.25, 5);
  });

  it('returns 1.0 for negative days', () => {
    expect(computeDecayFactor(-10, 90)).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// computeConfidence
// ---------------------------------------------------------------------------

describe('computeConfidence', () => {
  it('returns 0 for all-zero factors', () => {
    const factors: ConfidenceFactors = {
      source_count: 0,
      reliability: 0,
      corroboration: 0,
      days_since_validation: 0,
    };
    expect(computeConfidence(factors)).toBe(0);
  });

  it('returns high value (~0.8+) for strong factors with 0 decay', () => {
    const factors: ConfidenceFactors = {
      source_count: 3,
      reliability: 1.0,
      corroboration: 3,
      days_since_validation: 0,
    };
    const result = computeConfidence(factors);
    expect(result).toBeGreaterThanOrEqual(0.8);
    expect(result).toBeLessThanOrEqual(1.0);
  });

  it('returns approximately half for same factors but one half-life', () => {
    const factors0: ConfidenceFactors = {
      source_count: 3,
      reliability: 1.0,
      corroboration: 3,
      days_since_validation: 0,
    };
    const factors90: ConfidenceFactors = {
      source_count: 3,
      reliability: 1.0,
      corroboration: 3,
      days_since_validation: 90,
    };
    const score0 = computeConfidence(factors0);
    const score90 = computeConfidence(factors90);
    // score90 should be significantly lower due to decay
    expect(score90).toBeLessThan(score0);
    // The decay factor at 90 days is 0.5, so score90 should be roughly half
    expect(score90).toBeCloseTo(score0 * 0.5, 1);
  });

  it('respects custom half_life_days config', () => {
    const factors: ConfidenceFactors = {
      source_count: 3,
      reliability: 1.0,
      corroboration: 3,
      days_since_validation: 45,
    };
    const scoreDefault = computeConfidence(factors, { half_life_days: 90 });
    const scoreShort = computeConfidence(factors, { half_life_days: 45 });
    // With half_life_days=45, 45 days is one full half-life, so decay is stronger
    expect(scoreShort).toBeLessThan(scoreDefault);
  });

  it('clamps reliability to [0, 1]', () => {
    const factors: ConfidenceFactors = {
      source_count: 1,
      reliability: 5.0, // out of range
      corroboration: 1,
      days_since_validation: 0,
    };
    const clamped: ConfidenceFactors = {
      source_count: 1,
      reliability: 1.0,
      corroboration: 1,
      days_since_validation: 0,
    };
    expect(computeConfidence(factors)).toBe(computeConfidence(clamped));
  });

  it('returns value rounded to 2 decimal places', () => {
    const factors: ConfidenceFactors = {
      source_count: 2,
      reliability: 0.7,
      corroboration: 1,
      days_since_validation: 30,
    };
    const result = computeConfidence(factors);
    // Should be exactly 2 decimal places
    expect(result.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
  });
});

// ---------------------------------------------------------------------------
// formatConfidenceFactors / parseConfidenceFactors
// ---------------------------------------------------------------------------

describe('formatConfidenceFactors', () => {
  it('produces single-line inline YAML', () => {
    const factors: ConfidenceFactors = {
      source_count: 3,
      reliability: 0.8,
      corroboration: 2,
      days_since_validation: 15,
    };
    const result = formatConfidenceFactors(factors);
    expect(result).toBe(
      '{source_count: 3, reliability: 0.8, corroboration: 2, days_since_validation: 15}',
    );
  });
});

describe('parseConfidenceFactors', () => {
  it('round-trips correctly from formatConfidenceFactors', () => {
    const original: ConfidenceFactors = {
      source_count: 3,
      reliability: 0.8,
      corroboration: 2,
      days_since_validation: 15,
    };
    const formatted = formatConfidenceFactors(original);
    const parsed = parseConfidenceFactors(formatted);
    expect(parsed).toEqual(original);
  });

  it('returns null for invalid format', () => {
    expect(parseConfidenceFactors('not a valid format')).toBeNull();
  });

  it('defaults missing fields to 0', () => {
    const result = parseConfidenceFactors('{source_count: 3, reliability: 0.5}');
    expect(result).not.toBeNull();
    expect(result!.source_count).toBe(3);
    expect(result!.reliability).toBe(0.5);
    expect(result!.corroboration).toBe(0);
    expect(result!.days_since_validation).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// parseEntityNote -- confidence fields extraction
// ---------------------------------------------------------------------------

describe('parseEntityNote confidence fields', () => {
  it('extracts source_count from frontmatter', () => {
    const content = `---
type: ioc/ip
source_count: 5
---
# Entity
`;
    const note = parseEntityNote(content, 'test.md');
    expect(note.frontmatter['source_count']).toBe(5);
  });

  it('extracts reliability from frontmatter', () => {
    const content = `---
type: ioc/ip
reliability: 0.85
---
# Entity
`;
    const note = parseEntityNote(content, 'test.md');
    expect(note.frontmatter['reliability']).toBe(0.85);
  });

  it('extracts corroboration from frontmatter', () => {
    const content = `---
type: ioc/ip
corroboration: 3
---
# Entity
`;
    const note = parseEntityNote(content, 'test.md');
    expect(note.frontmatter['corroboration']).toBe(3);
  });

  it('extracts days_since_validation from frontmatter', () => {
    const content = `---
type: ioc/ip
days_since_validation: 45
---
# Entity
`;
    const note = parseEntityNote(content, 'test.md');
    expect(note.frontmatter['days_since_validation']).toBe(45);
  });

  it('extracts confidence_score from frontmatter', () => {
    const content = `---
type: ioc/ip
confidence_score: 0.73
---
# Entity
`;
    const note = parseEntityNote(content, 'test.md');
    expect(note.frontmatter['confidence_score']).toBe(0.73);
  });

  it('extracts all 5 confidence fields together', () => {
    const content = `---
type: ioc/ip
source_count: 3
reliability: 0.8
corroboration: 2
days_since_validation: 15
confidence_score: 0.65
---
# Entity
`;
    const note = parseEntityNote(content, 'test.md');
    expect(note.frontmatter['source_count']).toBe(3);
    expect(note.frontmatter['reliability']).toBe(0.8);
    expect(note.frontmatter['corroboration']).toBe(2);
    expect(note.frontmatter['days_since_validation']).toBe(15);
    expect(note.frontmatter['confidence_score']).toBe(0.65);
  });
});
