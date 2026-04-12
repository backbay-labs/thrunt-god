import { describe, it, expect } from 'vitest';
import {
  type CoverageStatus,
  computeCoverageStatus,
  extractLastHuntedDate,
} from '../coverage-staleness';

// ---------------------------------------------------------------------------
// computeCoverageStatus
// ---------------------------------------------------------------------------

describe('computeCoverageStatus', () => {
  it('returns stale when lastHuntedDate is null (never hunted)', () => {
    const result = computeCoverageStatus(null, 90);
    expect(result).toBe('stale');
  });

  it('returns stale when lastHuntedDate is empty string', () => {
    const result = computeCoverageStatus('', 90);
    expect(result).toBe('stale');
  });

  it('returns current when within threshold (31 days < 90)', () => {
    const result = computeCoverageStatus(
      '2026-01-01',
      90,
      new Date('2026-02-01'),
    );
    expect(result).toBe('current');
  });

  it('returns stale when past threshold (151 days > 90)', () => {
    const result = computeCoverageStatus(
      '2026-01-01',
      90,
      new Date('2026-06-01'),
    );
    expect(result).toBe('stale');
  });

  it('returns stale when past custom threshold (45 days > 30)', () => {
    const result = computeCoverageStatus(
      '2026-01-01',
      30,
      new Date('2026-02-15'),
    );
    expect(result).toBe('stale');
  });

  it('returns current when exactly at threshold boundary', () => {
    // 90 days from 2026-01-01 is 2026-04-01
    const result = computeCoverageStatus(
      '2026-01-01',
      90,
      new Date('2026-04-01'),
    );
    expect(result).toBe('current');
  });

  it('returns stale when one day past threshold', () => {
    // 91 days from 2026-01-01 is 2026-04-02
    const result = computeCoverageStatus(
      '2026-01-01',
      90,
      new Date('2026-04-02'),
    );
    expect(result).toBe('stale');
  });

  it('returns current with very recent hunt (0 days)', () => {
    const result = computeCoverageStatus(
      '2026-01-01',
      90,
      new Date('2026-01-01'),
    );
    expect(result).toBe('current');
  });
});

// ---------------------------------------------------------------------------
// extractLastHuntedDate
// ---------------------------------------------------------------------------

describe('extractLastHuntedDate', () => {
  it('returns most recent date from Hunt History entries', () => {
    const content = [
      '## Hunt History',
      '',
      '- **HUNT-001** (2026-01-15) -- queries: 3, data_sources: [Sysmon], outcome: TP',
      '- **HUNT-002** (2026-03-10) -- queries: 1, data_sources: [Process], outcome: FP',
      '- **HUNT-003** (2026-02-01) -- queries: 5, data_sources: [Command], outcome: inconclusive',
      '',
    ].join('\n');
    const result = extractLastHuntedDate(content);
    expect(result).toBe('2026-03-10');
  });

  it('returns null when no ## Hunt History section', () => {
    const content = [
      '## Sightings',
      '',
      '_No hunts have targeted this technique yet._',
      '',
    ].join('\n');
    const result = extractLastHuntedDate(content);
    expect(result).toBeNull();
  });

  it('returns null when Hunt History has no entries (placeholder only)', () => {
    const content = [
      '## Hunt History',
      '',
      '_No hunts have targeted this technique yet._',
      '',
    ].join('\n');
    const result = extractLastHuntedDate(content);
    expect(result).toBeNull();
  });

  it('returns the single date from a single entry', () => {
    const content = [
      '## Hunt History',
      '',
      '- **HUNT-001** (2026-05-20) -- queries: 2, data_sources: [Sysmon], outcome: TP',
      '',
    ].join('\n');
    const result = extractLastHuntedDate(content);
    expect(result).toBe('2026-05-20');
  });

  it('handles content with frontmatter and multiple sections', () => {
    const content = [
      '---',
      'type: ttp',
      'mitre_id: "T1053"',
      '---',
      '# T1053 -- Scheduled Task/Job',
      '',
      '## Sub-Techniques',
      '',
      '## Hunt History',
      '',
      '- **HUNT-001** (2026-01-15) -- queries: 3, data_sources: [Sysmon], outcome: TP',
      '- **HUNT-002** (2026-04-20) -- queries: 1, data_sources: [Process], outcome: FP',
      '',
      '## Sightings',
      '',
    ].join('\n');
    const result = extractLastHuntedDate(content);
    expect(result).toBe('2026-04-20');
  });
});
