import { describe, it, expect } from 'vitest';
import { parseHypotheses } from '../../parsers/hypotheses';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ZERO = { total: 0, validated: 0, pending: 0, rejected: 0, unknown: 0 };

function table(headers: string[], separator: string[], ...rows: string[][]): string {
  const lines: string[] = [];
  lines.push('| ' + headers.join(' | ') + ' |');
  lines.push('| ' + separator.join(' | ') + ' |');
  for (const row of rows) {
    lines.push('| ' + row.join(' | ') + ' |');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseHypotheses', () => {
  it('parses well-formed table with 4 rows into correct buckets', () => {
    const input = [
      '# Hypotheses',
      '',
      '| Hypothesis | Status | Notes |',
      '| --- | --- | --- |',
      '| Lateral movement via PsExec | validated | Confirmed in EDR |',
      '| C2 over DNS | pending | Testing query |',
      '| Data staging in temp dirs | active | Analyst reviewing |',
      '| Credential dumping via Mimikatz | rejected | No evidence |',
    ].join('\n');

    expect(parseHypotheses(input)).toEqual({
      total: 4,
      validated: 1,
      pending: 2,
      rejected: 1,
      unknown: 0,
    });
  });

  it('returns zero snapshot for empty string', () => {
    expect(parseHypotheses('')).toEqual(ZERO);
  });

  it('returns zero snapshot when no table present', () => {
    const input = '# Hypotheses\n\nSome notes about the hunt.';
    expect(parseHypotheses(input)).toEqual(ZERO);
  });

  it('returns zero snapshot when table has no Status column', () => {
    const input = [
      '| Hypothesis | Notes |',
      '| --- | --- |',
      '| H1 | note |',
    ].join('\n');
    expect(parseHypotheses(input)).toEqual(ZERO);
  });

  it('correctly buckets mixed-case statuses', () => {
    const input = table(
      ['Hypothesis', 'Status', 'Notes'],
      ['---', '---', '---'],
      ['H1', 'Validated', 'n1'],
      ['H2', 'PENDING', 'n2'],
      ['H3', 'Rejected', 'n3'],
    );

    const result = parseHypotheses(input);
    expect(result.validated).toBe(1);
    expect(result.pending).toBe(1);
    expect(result.rejected).toBe(1);
    expect(result.total).toBe(3);
  });

  it('maps testing, draft, and active to pending bucket', () => {
    const input = table(
      ['Hypothesis', 'Status'],
      ['---', '---'],
      ['H1', 'testing'],
      ['H2', 'draft'],
      ['H3', 'active'],
    );

    const result = parseHypotheses(input);
    expect(result.pending).toBe(3);
    expect(result.total).toBe(3);
  });

  it('maps disproved to rejected bucket', () => {
    const input = table(
      ['Hypothesis', 'Status'],
      ['---', '---'],
      ['H1', 'disproved'],
    );

    const result = parseHypotheses(input);
    expect(result.rejected).toBe(1);
    expect(result.total).toBe(1);
  });

  it('maps unrecognized status to unknown bucket', () => {
    const input = table(
      ['Hypothesis', 'Status'],
      ['---', '---'],
      ['H1', 'investigating'],
    );

    const result = parseHypotheses(input);
    expect(result.unknown).toBe(1);
    expect(result.total).toBe(1);
  });

  it('maps empty status cell to unknown', () => {
    const input = [
      '| Hypothesis | Status | Notes |',
      '| --- | --- | --- |',
      '| H1 |  | note |',
    ].join('\n');

    const result = parseHypotheses(input);
    expect(result.unknown).toBe(1);
    expect(result.total).toBe(1);
  });

  it('parses table with extra columns beyond Status', () => {
    const input = [
      '| ID | Hypothesis | Status | Notes | Source |',
      '| --- | --- | --- | --- | --- |',
      '| 1 | H1 | validated | n1 | EDR |',
      '| 2 | H2 | pending | n2 | DNS |',
    ].join('\n');

    const result = parseHypotheses(input);
    expect(result.validated).toBe(1);
    expect(result.pending).toBe(1);
    expect(result.total).toBe(2);
  });

  it('finds table that appears after prose paragraphs', () => {
    const input = [
      '# Hypotheses',
      '',
      'These are our current hypotheses for the lateral movement investigation.',
      'We have identified several potential attack paths.',
      '',
      '| Hypothesis | Status |',
      '| --- | --- |',
      '| Lateral movement | validated |',
    ].join('\n');

    const result = parseHypotheses(input);
    expect(result.validated).toBe(1);
    expect(result.total).toBe(1);
  });

  it('parses frontmatter + table (standard Phase 2 case)', () => {
    const input = [
      '---',
      'thrunt-artifact: hypotheses',
      'hunt-id: ""',
      'updated: ""',
      '---',
      '',
      '# Hypotheses',
      '',
      '| Hypothesis | Status | Notes |',
      '| --- | --- | --- |',
      '| Lateral movement via PsExec | validated | Confirmed |',
    ].join('\n');

    expect(parseHypotheses(input)).toEqual({
      total: 1,
      validated: 1,
      pending: 0,
      rejected: 0,
      unknown: 0,
    });
  });

  it('handles alignment markers in separator row', () => {
    const input = [
      '| Hypothesis | Status | Notes |',
      '| :--- | :---: | ---: |',
      '| H1 | validated | n1 |',
    ].join('\n');

    const result = parseHypotheses(input);
    expect(result.validated).toBe(1);
    expect(result.total).toBe(1);
  });

  it('skips row with fewer cells than header (missing Status column)', () => {
    const input = [
      '| Hypothesis | Status | Notes |',
      '| --- | --- | --- |',
      '| H1 | validated | n1 |',
      '| H2 |',
      '| H3 | pending | n3 |',
    ].join('\n');

    const result = parseHypotheses(input);
    // H1 = validated, H2 = skipped (fewer cells), H3 = pending
    expect(result.validated).toBe(1);
    expect(result.pending).toBe(1);
    expect(result.total).toBe(2);
  });

  it('produces same results with Windows line endings (\\r\\n)', () => {
    const unix = [
      '| Hypothesis | Status | Notes |',
      '| --- | --- | --- |',
      '| H1 | validated | Confirmed |',
      '| H2 | pending | Testing |',
    ].join('\n');

    const windows = unix.replace(/\n/g, '\r\n');
    expect(parseHypotheses(windows)).toEqual(parseHypotheses(unix));
  });

  it('returns zero snapshot for whitespace-only input', () => {
    expect(parseHypotheses('   \n  \n  ')).toEqual(ZERO);
  });

  it('returns a new object each call (no shared mutation)', () => {
    const a = parseHypotheses('');
    const b = parseHypotheses('');
    expect(a).toEqual(b);
    expect(a).not.toBe(b); // different object references
  });
});
