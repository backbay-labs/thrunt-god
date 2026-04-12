import { describe, it, expect } from 'vitest';
import {
  VERDICT_VALUES,
  type VerdictValue,
  type VerdictEntry,
  appendVerdictEntry,
  formatTimestamp,
} from '../verdict';

// ---------------------------------------------------------------------------
// VERDICT_VALUES
// ---------------------------------------------------------------------------

describe('VERDICT_VALUES', () => {
  it('contains exactly 5 values in correct order', () => {
    expect(VERDICT_VALUES).toEqual([
      'unknown',
      'suspicious',
      'confirmed_malicious',
      'remediated',
      'resurfaced',
    ]);
  });

  it('is readonly (frozen)', () => {
    expect(Object.isFrozen(VERDICT_VALUES)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatTimestamp
// ---------------------------------------------------------------------------

describe('formatTimestamp', () => {
  it('produces zero-padded YYYY-MM-DD HH:mm format', () => {
    // 2026-01-05 09:03
    const date = new Date(2026, 0, 5, 9, 3);
    expect(formatTimestamp(date)).toBe('2026-01-05 09:03');
  });

  it('handles double-digit values correctly', () => {
    const date = new Date(2026, 11, 25, 14, 30);
    expect(formatTimestamp(date)).toBe('2026-12-25 14:30');
  });

  it('handles midnight', () => {
    const date = new Date(2026, 3, 12, 0, 0);
    expect(formatTimestamp(date)).toBe('2026-04-12 00:00');
  });
});

// ---------------------------------------------------------------------------
// appendVerdictEntry
// ---------------------------------------------------------------------------

describe('appendVerdictEntry', () => {
  const baseEntry: VerdictEntry = {
    timestamp: '2026-04-12 14:30',
    verdict: 'suspicious' as VerdictValue,
    rationale: 'Matched known C2 pattern',
    huntId: 'HUNT-042',
  };

  it('appends to existing ## Verdict History section', () => {
    const content = `---
type: ioc/ip
value: "10.0.0.1"
verdict: unknown
---
# 10.0.0.1

## Verdict History

- [2026-04-10 10:00] unknown -- "Initial triage" (hunt: HUNT-040)

## Sightings

_No sightings recorded yet._

## Related

`;
    const result = appendVerdictEntry(content, baseEntry);
    expect(result).toContain('- [2026-04-10 10:00] unknown -- "Initial triage" (hunt: HUNT-040)');
    expect(result).toContain('- [2026-04-12 14:30] suspicious -- "Matched known C2 pattern" (hunt: HUNT-042)');
    // New entry should come after existing entry but before ## Sightings
    const historyIdx = result.indexOf('## Verdict History');
    const newEntryIdx = result.indexOf('- [2026-04-12 14:30]');
    const sightingsIdx = result.indexOf('## Sightings');
    expect(historyIdx).toBeLessThan(newEntryIdx);
    expect(newEntryIdx).toBeLessThan(sightingsIdx);
  });

  it('creates ## Verdict History before ## Sightings when missing', () => {
    const content = `---
type: ioc/ip
value: "10.0.0.1"
verdict: unknown
---
# 10.0.0.1

## Sightings

_No sightings recorded yet._

## Related

`;
    const result = appendVerdictEntry(content, baseEntry);
    expect(result).toContain('## Verdict History');
    expect(result).toContain('- [2026-04-12 14:30] suspicious -- "Matched known C2 pattern" (hunt: HUNT-042)');
    // Verdict History should come before Sightings
    const historyIdx = result.indexOf('## Verdict History');
    const sightingsIdx = result.indexOf('## Sightings');
    expect(historyIdx).toBeLessThan(sightingsIdx);
  });

  it('creates ## Verdict History after frontmatter when no ## Sightings', () => {
    const content = `---
type: ioc/ip
value: "10.0.0.1"
verdict: unknown
---
# 10.0.0.1

## Related

`;
    const result = appendVerdictEntry(content, baseEntry);
    expect(result).toContain('## Verdict History');
    expect(result).toContain('- [2026-04-12 14:30] suspicious -- "Matched known C2 pattern" (hunt: HUNT-042)');
    // Verdict History should come after frontmatter closing ---
    const fmCloseIdx = result.indexOf('---', 3);
    const historyIdx = result.indexOf('## Verdict History');
    expect(fmCloseIdx).toBeLessThan(historyIdx);
  });

  it('removes placeholder text on first real entry', () => {
    const content = `---
type: ioc/ip
value: "10.0.0.1"
verdict: unknown
---
# 10.0.0.1

## Verdict History

_No verdict changes recorded._

## Sightings

_No sightings recorded yet._

## Related

`;
    const result = appendVerdictEntry(content, baseEntry);
    expect(result).not.toContain('_No verdict changes recorded._');
    expect(result).toContain('- [2026-04-12 14:30] suspicious -- "Matched known C2 pattern" (hunt: HUNT-042)');
  });

  it('preserves existing entries -- append-only verification with 3 sequential appends', () => {
    const content = `---
type: ioc/ip
value: "10.0.0.1"
verdict: unknown
---
# 10.0.0.1

## Verdict History

_No verdict changes recorded._

## Sightings

_No sightings recorded yet._
`;
    // Append 1
    const entry1: VerdictEntry = {
      timestamp: '2026-04-10 10:00',
      verdict: 'unknown',
      rationale: 'Initial triage',
      huntId: 'HUNT-040',
    };
    const after1 = appendVerdictEntry(content, entry1);
    expect(after1).toContain('- [2026-04-10 10:00] unknown -- "Initial triage" (hunt: HUNT-040)');

    // Append 2
    const entry2: VerdictEntry = {
      timestamp: '2026-04-11 12:00',
      verdict: 'suspicious',
      rationale: 'C2 beacon detected',
      huntId: 'HUNT-041',
    };
    const after2 = appendVerdictEntry(after1, entry2);
    expect(after2).toContain('- [2026-04-10 10:00] unknown -- "Initial triage" (hunt: HUNT-040)');
    expect(after2).toContain('- [2026-04-11 12:00] suspicious -- "C2 beacon detected" (hunt: HUNT-041)');

    // Append 3
    const entry3: VerdictEntry = {
      timestamp: '2026-04-12 14:30',
      verdict: 'confirmed_malicious',
      rationale: 'Confirmed via sandbox',
      huntId: 'HUNT-042',
    };
    const after3 = appendVerdictEntry(after2, entry3);
    // All 3 entries must be present
    expect(after3).toContain('- [2026-04-10 10:00] unknown -- "Initial triage" (hunt: HUNT-040)');
    expect(after3).toContain('- [2026-04-11 12:00] suspicious -- "C2 beacon detected" (hunt: HUNT-041)');
    expect(after3).toContain('- [2026-04-12 14:30] confirmed_malicious -- "Confirmed via sandbox" (hunt: HUNT-042)');
    // Placeholder should be removed
    expect(after3).not.toContain('_No verdict changes recorded._');
  });

  it('entry format matches locked decision exactly', () => {
    const result = appendVerdictEntry(
      `---
verdict: unknown
---
# Entity

## Verdict History

## Sightings
`,
      baseEntry,
    );
    const expectedLine = '- [2026-04-12 14:30] suspicious -- "Matched known C2 pattern" (hunt: HUNT-042)';
    expect(result).toContain(expectedLine);
  });

  it('handles content with no frontmatter gracefully', () => {
    const content = `# No frontmatter entity

## Sightings

Some sightings here.
`;
    const result = appendVerdictEntry(content, baseEntry);
    // Should still insert verdict history before ## Sightings
    expect(result).toContain('## Verdict History');
    expect(result).toContain('- [2026-04-12 14:30] suspicious');
  });
});
