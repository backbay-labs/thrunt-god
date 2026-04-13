import { describe, it, expect } from 'vitest';
import { parseState, stripFrontmatter } from '../../parsers/state';

// ---------------------------------------------------------------------------
// stripFrontmatter
// ---------------------------------------------------------------------------

describe('stripFrontmatter', () => {
  it('returns input unchanged when no frontmatter present', () => {
    const input = '# State\n\n## Current phase\nRecon';
    expect(stripFrontmatter(input)).toBe(input);
  });

  it('strips valid YAML frontmatter', () => {
    const input = '---\nthrunt-artifact: state\nhunt-id: ""\n---\n\n# State\n\n## Current phase\nRecon';
    const result = stripFrontmatter(input);
    expect(result).toBe('# State\n\n## Current phase\nRecon');
  });

  it('returns input unchanged for incomplete frontmatter (opening --- but no closing)', () => {
    const input = '---\nthrunt-artifact: state\nhunt-id: ""\nSome content';
    expect(stripFrontmatter(input)).toBe(input);
  });
});

// ---------------------------------------------------------------------------
// parseState
// ---------------------------------------------------------------------------

describe('parseState', () => {
  it('parses well-formed file with all 3 sections', () => {
    const input = [
      '# State',
      '',
      '## Current phase',
      '',
      'Lateral movement analysis',
      '',
      '## Blockers',
      '',
      '- Waiting on EDR access',
      '',
      '## Next actions',
      '',
      '- Query PsExec artifacts',
    ].join('\n');

    const result = parseState(input);
    expect(result).toEqual({
      currentPhase: 'Lateral movement analysis',
      blockers: ['Waiting on EDR access'],
      nextActions: ['Query PsExec artifacts'],
    });
  });

  it('returns fallback values for empty string', () => {
    const result = parseState('');
    expect(result).toEqual({
      currentPhase: 'unknown',
      blockers: [],
      nextActions: [],
    });
  });

  it('returns fallback values when no ## headings present', () => {
    const input = '# State\n\nSome text';
    const result = parseState(input);
    expect(result).toEqual({
      currentPhase: 'unknown',
      blockers: [],
      nextActions: [],
    });
  });

  it('returns currentPhase "unknown" when current phase section heading exists but has no content', () => {
    const input = '## Current phase\n\n## Blockers\n- x';
    const result = parseState(input);
    expect(result.currentPhase).toBe('unknown');
    expect(result.blockers).toEqual(['x']);
    expect(result.nextActions).toEqual([]);
  });

  it('captures multiple blockers with - and * prefixes', () => {
    const input = [
      '## Blockers',
      '',
      '- EDR access pending',
      '- Need analyst review',
      '* Credential dump incomplete',
    ].join('\n');

    const result = parseState(input);
    expect(result.blockers).toEqual([
      'EDR access pending',
      'Need analyst review',
      'Credential dump incomplete',
    ]);
  });

  it('returns empty blockers array when section has prose but no list items', () => {
    const input = '## Blockers\nJust prose';
    const result = parseState(input);
    expect(result.blockers).toEqual([]);
  });

  it('treats ### heading inside a section as content, not a boundary', () => {
    // ### does NOT match /^##\s+(.+)$/ regex, so "### Sub" is content
    // First non-empty line in "current phase" section is "### Sub"
    const input = '## Current phase\n### Sub\nPhase 1\n## Blockers';
    const result = parseState(input);
    expect(result.currentPhase).toBe('### Sub');
  });

  it('matches heading with extra spaces like "##  Current phase"', () => {
    const input = '##  Current phase\nRecon';
    const result = parseState(input);
    expect(result.currentPhase).toBe('Recon');
  });

  it('parses file with all 3 sections fully populated', () => {
    const input = [
      '## Current phase',
      'Initial reconnaissance',
      '',
      '## Blockers',
      '- Waiting on EDR access',
      '- No credential dump yet',
      '* Analyst on vacation',
      '',
      '## Next actions',
      '- Enumerate service accounts',
      '- Review DNS logs',
    ].join('\n');

    const result = parseState(input);
    expect(result.currentPhase).toBe('Initial reconnaissance');
    expect(result.blockers).toHaveLength(3);
    expect(result.nextActions).toHaveLength(2);
  });

  it('strips YAML frontmatter before parsing', () => {
    const input = [
      '---',
      'thrunt-artifact: state',
      'hunt-id: ""',
      'updated: ""',
      '---',
      '',
      '## Current phase',
      '',
      'Recon',
      '',
      '## Blockers',
      '',
      '- Waiting on access',
      '',
      '## Next actions',
      '',
      '- Run query',
    ].join('\n');

    const result = parseState(input);
    expect(result).toEqual({
      currentPhase: 'Recon',
      blockers: ['Waiting on access'],
      nextActions: ['Run query'],
    });
  });

  it('does NOT capture numbered list items (only - and * recognized)', () => {
    const input = '## Next actions\n1. First\n2. Second';
    const result = parseState(input);
    expect(result.nextActions).toEqual([]);
  });

  it('produces same results with Windows line endings (\\r\\n)', () => {
    const unix = [
      '## Current phase',
      '',
      'Lateral movement analysis',
      '',
      '## Blockers',
      '',
      '- Waiting on EDR access',
      '',
      '## Next actions',
      '',
      '- Query PsExec artifacts',
    ].join('\n');

    const windows = unix.replace(/\n/g, '\r\n');
    expect(parseState(windows)).toEqual(parseState(unix));
  });

  it('returns fallback values for whitespace-only input', () => {
    const result = parseState('   \n  \n  ');
    expect(result).toEqual({
      currentPhase: 'unknown',
      blockers: [],
      nextActions: [],
    });
  });
});
