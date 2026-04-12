import { describe, it, expect } from 'vitest';
import {
  createJournalNote,
  appendJournalEntry,
  parseTimestampedEntries,
  extractTags,
  buildSummarySection,
  replaceSummarySection,
  type JournalEntry,
  type ExtractedTag,
} from '../journal';

// ---------------------------------------------------------------------------
// createJournalNote
// ---------------------------------------------------------------------------

describe('createJournalNote', () => {
  const now = new Date(2026, 3, 12, 14, 30); // 2026-04-12 14:30

  it('produces valid YAML frontmatter with all 6 required fields', () => {
    const result = createJournalNote('HUNT-042', 'Credential reuse across staging', now);
    expect(result).toContain('hunt_id: HUNT-042');
    expect(result).toContain('hypothesis: "Credential reuse across staging"');
    expect(result).toContain('status: active');
    expect(result).toContain('linked_entities: []');
    expect(result).toContain('created: 2026-04-12');
    expect(result).toContain('updated: 2026-04-12');
  });

  it('wraps hypothesis value in double quotes', () => {
    const result = createJournalNote('HUNT-042', 'Credential reuse across staging', now);
    expect(result).toContain('hypothesis: "Credential reuse across staging"');
  });

  it('defaults status to active', () => {
    const result = createJournalNote('HUNT-042', 'Test hypothesis', now);
    expect(result).toContain('status: active');
  });

  it('defaults linked_entities to empty array', () => {
    const result = createJournalNote('HUNT-042', 'Test hypothesis', now);
    expect(result).toContain('linked_entities: []');
  });

  it('produces ## Reasoning Log section with initial timestamped entry', () => {
    const result = createJournalNote('HUNT-042', 'Credential reuse across staging', now);
    expect(result).toContain('## Reasoning Log');
    expect(result).toContain('### [2026-04-12 14:30]');
    expect(result).toContain('_Initial entry -- describe your starting hypothesis and reasoning._');
  });

  it('produces the exact expected output format', () => {
    const result = createJournalNote('HUNT-042', 'Credential reuse across staging', now);
    const expected = `---
hunt_id: HUNT-042
hypothesis: "Credential reuse across staging"
status: active
linked_entities: []
created: 2026-04-12
updated: 2026-04-12
---

## Reasoning Log

### [2026-04-12 14:30]

_Initial entry -- describe your starting hypothesis and reasoning._
`;
    expect(result).toBe(expected);
  });

  it('uses formatTimestamp for the entry timestamp', () => {
    // midnight edge case
    const midnight = new Date(2026, 0, 5, 0, 0);
    const result = createJournalNote('HUNT-001', 'Test', midnight);
    expect(result).toContain('### [2026-01-05 00:00]');
    expect(result).toContain('created: 2026-01-05');
  });
});

// ---------------------------------------------------------------------------
// parseTimestampedEntries
// ---------------------------------------------------------------------------

describe('parseTimestampedEntries', () => {
  it('parses single timestamped entry', () => {
    const content = `## Reasoning Log

### [2026-04-12 14:30]

Some content here.
`;
    const entries = parseTimestampedEntries(content);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.timestamp).toBe('2026-04-12 14:30');
    expect(entries[0]!.content).toContain('Some content here.');
  });

  it('parses multiple timestamped entries', () => {
    const content = `## Reasoning Log

### [2026-04-12 14:30]

First entry content.

### [2026-04-12 15:00]

Second entry content.
`;
    const entries = parseTimestampedEntries(content);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.timestamp).toBe('2026-04-12 14:30');
    expect(entries[0]!.content).toContain('First entry content.');
    expect(entries[1]!.timestamp).toBe('2026-04-12 15:00');
    expect(entries[1]!.content).toContain('Second entry content.');
  });

  it('stops entry content at next ### [ or ## heading', () => {
    const content = `## Reasoning Log

### [2026-04-12 14:30]

Entry before summary.

## Summary

Summary content here.
`;
    const entries = parseTimestampedEntries(content);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.content).toContain('Entry before summary.');
    expect(entries[0]!.content).not.toContain('Summary content');
  });

  it('returns empty array for content without timestamped entries', () => {
    const content = `## Reasoning Log

No entries here.
`;
    const entries = parseTimestampedEntries(content);
    expect(entries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// extractTags
// ---------------------------------------------------------------------------

describe('extractTags', () => {
  it('extracts #thrunt/h/ tags as hypothesis type', () => {
    const content = `## Reasoning Log

### [2026-04-12 14:30]

Found evidence of #thrunt/h/credential-reuse in the staging environment.
`;
    const tags = extractTags(content);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toEqual({
      type: 'hypothesis',
      value: 'credential-reuse',
      timestamp: '2026-04-12 14:30',
    });
  });

  it('extracts #thrunt/ev/ tags as evidence type', () => {
    const content = `## Reasoning Log

### [2026-04-12 14:30]

Evidence is #thrunt/ev/strong for this hypothesis.
`;
    const tags = extractTags(content);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toEqual({
      type: 'evidence',
      value: 'strong',
      timestamp: '2026-04-12 14:30',
    });
  });

  it('extracts #thrunt/dp/ tags as decision type', () => {
    const content = `## Reasoning Log

### [2026-04-12 14:30]

Decision: #thrunt/dp/escalate to incident response.
`;
    const tags = extractTags(content);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toEqual({
      type: 'decision',
      value: 'escalate',
      timestamp: '2026-04-12 14:30',
    });
  });

  it('extracts multiple tags from one entry', () => {
    const content = `## Reasoning Log

### [2026-04-12 14:30]

Testing #thrunt/h/lateral-movement with #thrunt/ev/moderate evidence, considering #thrunt/dp/continue.
`;
    const tags = extractTags(content);
    expect(tags).toHaveLength(3);
    expect(tags[0]!.type).toBe('hypothesis');
    expect(tags[0]!.value).toBe('lateral-movement');
    expect(tags[1]!.type).toBe('evidence');
    expect(tags[1]!.value).toBe('moderate');
    expect(tags[2]!.type).toBe('decision');
    expect(tags[2]!.value).toBe('continue');
    // All share the same timestamp
    expect(tags.every((t) => t.timestamp === '2026-04-12 14:30')).toBe(true);
  });

  it('skips tags inside fenced code blocks', () => {
    const content = `## Reasoning Log

### [2026-04-12 14:30]

Real tag: #thrunt/h/credential-reuse

\`\`\`
This is a code block with #thrunt/ev/strong that should be ignored.
\`\`\`

After code block.
`;
    const tags = extractTags(content);
    expect(tags).toHaveLength(1);
    expect(tags[0]!.type).toBe('hypothesis');
    expect(tags[0]!.value).toBe('credential-reuse');
  });

  it('skips tags inside inline code', () => {
    const content = `## Reasoning Log

### [2026-04-12 14:30]

Real tag: #thrunt/h/credential-reuse but not \`#thrunt/ev/strong\` in inline code.
`;
    const tags = extractTags(content);
    expect(tags).toHaveLength(1);
    expect(tags[0]!.type).toBe('hypothesis');
    expect(tags[0]!.value).toBe('credential-reuse');
  });

  it('associates tags with their entry timestamp', () => {
    const content = `## Reasoning Log

### [2026-04-12 14:30]

First: #thrunt/h/credential-reuse

### [2026-04-12 15:00]

Second: #thrunt/ev/strong
`;
    const tags = extractTags(content);
    expect(tags).toHaveLength(2);
    expect(tags[0]!.timestamp).toBe('2026-04-12 14:30');
    expect(tags[1]!.timestamp).toBe('2026-04-12 15:00');
  });

  it('returns empty array for content with no tags', () => {
    const content = `## Reasoning Log

### [2026-04-12 14:30]

No tags here, just plain text.
`;
    const tags = extractTags(content);
    expect(tags).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// appendJournalEntry
// ---------------------------------------------------------------------------

describe('appendJournalEntry', () => {
  it('inserts before ## Summary when present', () => {
    const content = `---
hunt_id: HUNT-042
---

## Reasoning Log

### [2026-04-12 14:30]

First entry.

## Summary

### Hypotheses

- **credential-reuse** (first: 2026-04-12 14:30)
`;
    const result = appendJournalEntry(content, '2026-04-12 15:00', 'New evidence found.');
    const lines = result.split('\n');
    const newEntryIdx = lines.findIndex((l) => l === '### [2026-04-12 15:00]');
    const summaryIdx = lines.findIndex((l) => l === '## Summary');
    expect(newEntryIdx).toBeGreaterThan(-1);
    expect(summaryIdx).toBeGreaterThan(-1);
    expect(newEntryIdx).toBeLessThan(summaryIdx);
  });

  it('appends at end of ## Reasoning Log when no ## Summary', () => {
    const content = `---
hunt_id: HUNT-042
---

## Reasoning Log

### [2026-04-12 14:30]

First entry.
`;
    const result = appendJournalEntry(content, '2026-04-12 15:00', 'New evidence found.');
    expect(result).toContain('### [2026-04-12 15:00]');
    expect(result).toContain('New evidence found.');
    // New entry should be after original entry
    const firstEntryIdx = result.indexOf('### [2026-04-12 14:30]');
    const newEntryIdx = result.indexOf('### [2026-04-12 15:00]');
    expect(newEntryIdx).toBeGreaterThan(firstEntryIdx);
  });

  it('appends at end of file when no ## Reasoning Log or ## Summary', () => {
    const content = `---
hunt_id: HUNT-042
---

Some other content here.
`;
    const result = appendJournalEntry(content, '2026-04-12 15:00', 'New entry.');
    expect(result).toContain('### [2026-04-12 15:00]');
    expect(result).toContain('New entry.');
  });

  it('places entry text as body content under the ### heading', () => {
    const content = `---
hunt_id: HUNT-042
---

## Reasoning Log

### [2026-04-12 14:30]

First entry.
`;
    const result = appendJournalEntry(content, '2026-04-12 15:00', 'New evidence found.');
    // Should have blank line between heading and content
    expect(result).toContain('### [2026-04-12 15:00]\n\nNew evidence found.');
  });

  it('appends at end of Reasoning Log before a different ## heading', () => {
    const content = `---
hunt_id: HUNT-042
---

## Reasoning Log

### [2026-04-12 14:30]

First entry.

## Other Section

Other content.
`;
    const result = appendJournalEntry(content, '2026-04-12 15:00', 'New evidence found.');
    const newEntryIdx = result.indexOf('### [2026-04-12 15:00]');
    const otherSectionIdx = result.indexOf('## Other Section');
    expect(newEntryIdx).toBeGreaterThan(-1);
    expect(otherSectionIdx).toBeGreaterThan(-1);
    expect(newEntryIdx).toBeLessThan(otherSectionIdx);
  });

  it('preserves existing entries when appending', () => {
    const content = `---
hunt_id: HUNT-042
---

## Reasoning Log

### [2026-04-12 14:30]

First entry.

### [2026-04-12 14:45]

Second entry.
`;
    const result = appendJournalEntry(content, '2026-04-12 15:00', 'Third entry.');
    expect(result).toContain('### [2026-04-12 14:30]');
    expect(result).toContain('First entry.');
    expect(result).toContain('### [2026-04-12 14:45]');
    expect(result).toContain('Second entry.');
    expect(result).toContain('### [2026-04-12 15:00]');
    expect(result).toContain('Third entry.');
  });
});

// ---------------------------------------------------------------------------
// buildSummarySection
// ---------------------------------------------------------------------------

describe('buildSummarySection', () => {
  it('produces ## Summary with ### Hypotheses, ### Evidence, ### Decisions', () => {
    const tags: ExtractedTag[] = [
      { type: 'hypothesis', value: 'credential-reuse', timestamp: '2026-04-12 14:30' },
      { type: 'evidence', value: 'strong', timestamp: '2026-04-12 15:00' },
      { type: 'decision', value: 'escalate', timestamp: '2026-04-12 16:00' },
    ];
    const result = buildSummarySection(tags);
    expect(result).toContain('## Summary');
    expect(result).toContain('### Hypotheses');
    expect(result).toContain('### Evidence');
    expect(result).toContain('### Decisions');
  });

  it('deduplicates hypotheses by value, showing first occurrence timestamp', () => {
    const tags: ExtractedTag[] = [
      { type: 'hypothesis', value: 'credential-reuse', timestamp: '2026-04-12 14:30' },
      { type: 'hypothesis', value: 'credential-reuse', timestamp: '2026-04-12 15:00' },
      { type: 'hypothesis', value: 'lateral-movement', timestamp: '2026-04-12 16:00' },
    ];
    const result = buildSummarySection(tags);
    // credential-reuse should appear only once with first timestamp
    const matches = result.match(/credential-reuse/g);
    expect(matches).toHaveLength(1);
    expect(result).toContain('**credential-reuse** (first: 2026-04-12 14:30)');
    expect(result).toContain('**lateral-movement** (first: 2026-04-12 16:00)');
  });

  it('shows evidence entries with [timestamp] value format', () => {
    const tags: ExtractedTag[] = [
      { type: 'evidence', value: 'strong', timestamp: '2026-04-12 14:30' },
      { type: 'evidence', value: 'moderate', timestamp: '2026-04-12 15:00' },
    ];
    const result = buildSummarySection(tags);
    expect(result).toContain('- [2026-04-12 14:30] strong');
    expect(result).toContain('- [2026-04-12 15:00] moderate');
  });

  it('shows decision entries with [timestamp] value format', () => {
    const tags: ExtractedTag[] = [
      { type: 'decision', value: 'escalate', timestamp: '2026-04-12 14:30' },
      { type: 'decision', value: 'pivot', timestamp: '2026-04-12 15:00' },
    ];
    const result = buildSummarySection(tags);
    expect(result).toContain('- [2026-04-12 14:30] escalate');
    expect(result).toContain('- [2026-04-12 15:00] pivot');
  });

  it('omits empty tag type subsections', () => {
    const tags: ExtractedTag[] = [
      { type: 'hypothesis', value: 'credential-reuse', timestamp: '2026-04-12 14:30' },
    ];
    const result = buildSummarySection(tags);
    expect(result).toContain('### Hypotheses');
    expect(result).not.toContain('### Evidence');
    expect(result).not.toContain('### Decisions');
  });

  it('returns ## Summary with no subsections for empty tags', () => {
    const result = buildSummarySection([]);
    expect(result).toContain('## Summary');
    expect(result).not.toContain('### Hypotheses');
    expect(result).not.toContain('### Evidence');
    expect(result).not.toContain('### Decisions');
  });
});

// ---------------------------------------------------------------------------
// replaceSummarySection
// ---------------------------------------------------------------------------

describe('replaceSummarySection', () => {
  it('creates ## Summary at end of file when missing', () => {
    const content = `---
hunt_id: HUNT-042
---

## Reasoning Log

### [2026-04-12 14:30]

Some entry.
`;
    const summaryContent = `## Summary\n\n### Hypotheses\n\n- **credential-reuse** (first: 2026-04-12 14:30)\n`;
    const result = replaceSummarySection(content, summaryContent);
    expect(result).toContain('## Summary');
    expect(result).toContain('### Hypotheses');
    expect(result).toContain('**credential-reuse**');
    // Summary should come after the entry content
    const entryIdx = result.indexOf('Some entry.');
    const summaryIdx = result.indexOf('## Summary');
    expect(summaryIdx).toBeGreaterThan(entryIdx);
  });

  it('replaces existing ## Summary content when present', () => {
    const content = `---
hunt_id: HUNT-042
---

## Reasoning Log

### [2026-04-12 14:30]

Some entry.

## Summary

### Hypotheses

- **old-hypothesis** (first: 2026-04-12 14:30)
`;
    const summaryContent = `## Summary\n\n### Hypotheses\n\n- **new-hypothesis** (first: 2026-04-12 15:00)\n`;
    const result = replaceSummarySection(content, summaryContent);
    expect(result).not.toContain('old-hypothesis');
    expect(result).toContain('new-hypothesis');
  });

  it('preserves content before ## Summary when replacing', () => {
    const content = `---
hunt_id: HUNT-042
---

## Reasoning Log

### [2026-04-12 14:30]

Important entry that must stay.

## Summary

Old summary content.
`;
    const summaryContent = `## Summary\n\nNew summary content.\n`;
    const result = replaceSummarySection(content, summaryContent);
    expect(result).toContain('Important entry that must stay.');
    expect(result).toContain('New summary content.');
    expect(result).not.toContain('Old summary content.');
  });

  it('handles ## Summary followed by another ## heading', () => {
    const content = `---
hunt_id: HUNT-042
---

## Reasoning Log

### [2026-04-12 14:30]

Entry.

## Summary

Old summary.

## Other Section

Other content that must be preserved.
`;
    const summaryContent = `## Summary\n\nNew summary.\n`;
    const result = replaceSummarySection(content, summaryContent);
    expect(result).toContain('New summary.');
    expect(result).not.toContain('Old summary.');
    expect(result).toContain('## Other Section');
    expect(result).toContain('Other content that must be preserved.');
  });
});
