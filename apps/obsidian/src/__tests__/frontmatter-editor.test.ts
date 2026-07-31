import { describe, it, expect } from 'vitest';
import { updateFrontmatter, addToArray } from '../frontmatter-editor';

// ---------------------------------------------------------------------------
// updateFrontmatter tests
// ---------------------------------------------------------------------------

describe('updateFrontmatter', () => {
  // --- Basic value updates ---

  it('updates an existing unquoted key value', () => {
    const content = `---
verdict: unknown
---
# Entity
`;
    const result = updateFrontmatter(content, { verdict: 'suspicious' });
    expect(result).toContain('verdict: suspicious');
    expect(result).not.toContain('verdict: unknown');
  });

  it('updates an existing double-quoted value preserving double quotes', () => {
    const content = `---
verdict: "unknown"
---
# Entity
`;
    const result = updateFrontmatter(content, { verdict: 'suspicious' });
    expect(result).toContain('verdict: "suspicious"');
  });

  it('updates an existing single-quoted value preserving single quotes', () => {
    const content = `---
verdict: 'unknown'
---
# Entity
`;
    const result = updateFrontmatter(content, { verdict: 'suspicious' });
    expect(result).toContain("verdict: 'suspicious'");
  });

  it('updates an empty unquoted value (key with no value)', () => {
    const content = `---
verdict:
---
# Entity
`;
    const result = updateFrontmatter(content, { verdict: 'suspicious' });
    expect(result).toContain('verdict: suspicious');
  });

  it('updates an empty double-quoted value', () => {
    const content = `---
verdict: ""
---
# Entity
`;
    const result = updateFrontmatter(content, { verdict: 'suspicious' });
    expect(result).toContain('verdict: "suspicious"');
  });

  it('updates an empty single-quoted value', () => {
    const content = `---
verdict: ''
---
# Entity
`;
    const result = updateFrontmatter(content, { verdict: 'suspicious' });
    expect(result).toContain("verdict: 'suspicious'");
  });

  // --- Numeric and boolean values ---

  it('handles numeric values', () => {
    const content = `---
hunt_count: 0
---
# Entity
`;
    const result = updateFrontmatter(content, { hunt_count: 5 });
    expect(result).toContain('hunt_count: 5');
    expect(result).not.toContain('hunt_count: 0');
  });

  it('handles boolean values', () => {
    const content = `---
active: false
---
# Entity
`;
    const result = updateFrontmatter(content, { active: true });
    expect(result).toContain('active: true');
  });

  // --- Missing key insertion ---

  it('inserts a missing key before closing ---', () => {
    const content = `---
type: ioc/ip
verdict: ""
---
# Entity
`;
    const result = updateFrontmatter(content, { schema_version: 1 });
    expect(result).toContain('schema_version: 1');
    // Inserted key must be before closing ---
    const lines = result.split('\n');
    const schemaLine = lines.findIndex(l => l.startsWith('schema_version:'));
    const closingLine = lines.findIndex((l, i) => i > 0 && l === '---');
    expect(schemaLine).toBeGreaterThan(0);
    expect(schemaLine).toBeLessThan(closingLine);
  });

  // --- Preservation ---

  it('preserves YAML comments', () => {
    const content = `---
# this is a comment
type: ioc/ip
verdict: ""
---
# Entity
`;
    const result = updateFrontmatter(content, { verdict: 'suspicious' });
    expect(result).toContain('# this is a comment');
    expect(result).toContain('verdict: "suspicious"');
  });

  it('preserves key ordering', () => {
    const content = `---
type: ioc/ip
value: "192.168.1.1"
verdict: ""
confidence: ""
---
# Entity
`;
    const result = updateFrontmatter(content, { verdict: 'suspicious', confidence: 'high' });
    const lines = result.split('\n');
    const typeIdx = lines.findIndex(l => l.startsWith('type:'));
    const valueIdx = lines.findIndex(l => l.startsWith('value:'));
    const verdictIdx = lines.findIndex(l => l.startsWith('verdict:'));
    const confIdx = lines.findIndex(l => l.startsWith('confidence:'));
    expect(typeIdx).toBeLessThan(valueIdx);
    expect(valueIdx).toBeLessThan(verdictIdx);
    expect(verdictIdx).toBeLessThan(confIdx);
  });

  it('preserves markdown body after frontmatter', () => {
    const body = `# Entity

## Sightings

- Seen in RCT-001

## Related

Some related info.
`;
    const content = `---
verdict: ""
---
${body}`;
    const result = updateFrontmatter(content, { verdict: 'suspicious' });
    expect(result).toContain(body);
  });

  // --- Multiple updates ---

  it('applies multiple updates in a single call', () => {
    const content = `---
verdict: ""
confidence: ""
hunt_count: 0
---
# Entity
`;
    const result = updateFrontmatter(content, {
      verdict: 'suspicious',
      confidence: 'high',
      hunt_count: 3,
    });
    expect(result).toContain('verdict: "suspicious"');
    expect(result).toContain('confidence: "high"');
    expect(result).toContain('hunt_count: 3');
  });

  // --- Malformed / no frontmatter ---

  it('returns content unchanged if no frontmatter (does not start with ---)', () => {
    const content = `# No Frontmatter
Just content.
`;
    const result = updateFrontmatter(content, { verdict: 'suspicious' });
    expect(result).toBe(content);
  });

  it('returns content unchanged if malformed frontmatter (no closing ---)', () => {
    const content = `---
verdict: ""
# Entity
`;
    const result = updateFrontmatter(content, { verdict: 'suspicious' });
    expect(result).toBe(content);
  });

  // --- Mix of existing and new keys ---

  it('updates existing keys and inserts new ones in a single call', () => {
    const content = `---
type: ioc/ip
verdict: ""
---
# Entity
`;
    const result = updateFrontmatter(content, {
      verdict: 'suspicious',
      schema_version: 1,
    });
    expect(result).toContain('verdict: "suspicious"');
    expect(result).toContain('schema_version: 1');
    // type should be unchanged
    expect(result).toContain('type: ioc/ip');
  });

  // --- Edge cases ---

  it('handles value with colon in it', () => {
    const content = `---
value: "http://evil.com"
---
# Entity
`;
    const result = updateFrontmatter(content, { value: 'http://new-evil.com' });
    expect(result).toContain('value: "http://new-evil.com"');
  });

  it('does not modify array values (they should use addToArray)', () => {
    const content = `---
hunt_refs: [ref1, ref2]
verdict: ""
---
# Entity
`;
    // updateFrontmatter with a string value on an array key should replace the line
    const result = updateFrontmatter(content, { verdict: 'suspicious' });
    expect(result).toContain('hunt_refs: [ref1, ref2]');
    expect(result).toContain('verdict: "suspicious"');
  });
});

// ---------------------------------------------------------------------------
// addToArray tests
// ---------------------------------------------------------------------------

describe('addToArray', () => {
  // --- Inline arrays ---

  it('appends to an inline array with existing items', () => {
    const content = `---
hunt_refs: [ref1]
---
# Entity
`;
    const result = addToArray(content, 'hunt_refs', 'ref2');
    expect(result).toContain('hunt_refs: [ref1, ref2]');
  });

  it('appends to an empty inline array', () => {
    const content = `---
hunt_refs: []
---
# Entity
`;
    const result = addToArray(content, 'hunt_refs', 'ref1');
    expect(result).toContain('hunt_refs: [ref1]');
  });

  it('preserves quoting in inline arrays with double-quoted items', () => {
    const content = `---
hunt_refs: ["ref1"]
---
# Entity
`;
    const result = addToArray(content, 'hunt_refs', 'ref2');
    expect(result).toContain('hunt_refs: ["ref1", "ref2"]');
  });

  it('preserves quoting in inline arrays with single-quoted items', () => {
    const content = `---
hunt_refs: ['ref1']
---
# Entity
`;
    const result = addToArray(content, 'hunt_refs', 'ref2');
    expect(result).toContain("hunt_refs: ['ref1', 'ref2']");
  });

  it('handles inline array with multiple existing items', () => {
    const content = `---
hunt_refs: [ref1, ref2, ref3]
---
# Entity
`;
    const result = addToArray(content, 'hunt_refs', 'ref4');
    expect(result).toContain('hunt_refs: [ref1, ref2, ref3, ref4]');
  });

  // --- Multiline arrays ---

  it('appends to a multiline array', () => {
    const content = `---
platforms:
  - Windows
  - Linux
---
# Entity
`;
    const result = addToArray(content, 'platforms', 'macOS');
    expect(result).toContain('  - Windows');
    expect(result).toContain('  - Linux');
    expect(result).toContain('  - macOS');
  });

  it('appends to a multiline array preserving indent style', () => {
    const content = `---
data_sources:
- Source A
- Source B
---
# Entity
`;
    const result = addToArray(content, 'data_sources', 'Source C');
    expect(result).toContain('- Source A');
    expect(result).toContain('- Source B');
    expect(result).toContain('- Source C');
  });

  // --- No-op / error cases ---

  it('returns content unchanged if key not found in frontmatter', () => {
    const content = `---
type: ioc/ip
---
# Entity
`;
    const result = addToArray(content, 'hunt_refs', 'ref1');
    expect(result).toBe(content);
  });

  it('returns content unchanged if no frontmatter', () => {
    const content = `# No Frontmatter
Just content.
`;
    const result = addToArray(content, 'hunt_refs', 'ref1');
    expect(result).toBe(content);
  });

  it('returns content unchanged if malformed frontmatter', () => {
    const content = `---
hunt_refs: [ref1]
# No closing fence
`;
    const result = addToArray(content, 'hunt_refs', 'ref2');
    expect(result).toBe(content);
  });

  it('handles key with non-array value gracefully (no-op)', () => {
    const content = `---
verdict: suspicious
---
# Entity
`;
    const result = addToArray(content, 'verdict', 'new_value');
    // Non-array value: should be a no-op (can't append to non-array)
    expect(result).toBe(content);
  });

  // --- Preserves rest of content ---

  it('preserves markdown body when appending to array', () => {
    const body = `# Entity

## Sightings

- Seen in RCT-001
`;
    const content = `---
hunt_refs: [ref1]
---
${body}`;
    const result = addToArray(content, 'hunt_refs', 'ref2');
    expect(result).toContain(body);
    expect(result).toContain('hunt_refs: [ref1, ref2]');
  });
});
