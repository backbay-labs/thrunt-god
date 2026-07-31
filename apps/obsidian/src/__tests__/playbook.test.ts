import { describe, it, expect } from 'vitest';
import {
  extractPlaybookData,
  generatePlaybookNote,
  parsePlaybookFrontmatter,
  applyPlaybookToMission,
  buildPlaybookJournalEntries,
  type PlaybookData,
  type DecisionNode,
  type QueryStep,
} from '../playbook';
import type { ReceiptTimelineEntry } from '../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const JOURNAL_CONTENT = `---
hunt_id: HUNT-042
hypothesis: "Credential reuse across staging"
status: active
linked_entities: []
created: 2026-04-12
updated: 2026-04-12
---

## Reasoning Log

### [2026-04-12 14:30]

Investigating #thrunt/h/lateral_movement in the staging environment.
Also noticing potential #thrunt/h/c2_beacon traffic.

### [2026-04-12 15:00]

Decision point: #thrunt/dp/escalate based on evidence so far.
The lateral movement pattern is confirmed across 3 hosts.

### [2026-04-12 15:30]

Pivoting to #thrunt/dp/pivot_analysis after escalation.
Found additional #thrunt/ev/strong evidence.
`;

const RECEIPT_TIMELINE: ReceiptTimelineEntry[] = [
  {
    receipt_id: 'RCT-001',
    claim_status: 'supports',
    claim: 'Lateral movement detected between hosts',
    technique_refs: ['T1021.001', 'T1059.001'],
    hypothesis: 'Credential reuse',
    fileName: 'RCT-001.md',
  },
  {
    receipt_id: 'RCT-002',
    claim_status: 'context',
    claim: 'Normal admin activity observed',
    technique_refs: ['T1059.001'],
    hypothesis: 'Credential reuse',
    fileName: 'RCT-002.md',
  },
  {
    receipt_id: 'RCT-003',
    claim_status: 'disproves',
    claim: 'No C2 beacon found on endpoint',
    technique_refs: ['T1071.001'],
    hypothesis: 'C2 communication',
    fileName: 'RCT-003.md',
  },
];

const ENTITY_TYPES_INPUT = ['ioc/ip', 'actor', 'ioc/ip', 'ttp', 'actor'];

// ---------------------------------------------------------------------------
// extractPlaybookData
// ---------------------------------------------------------------------------

describe('extractPlaybookData', () => {
  it('extracts trigger conditions from #thrunt/h/ tags', () => {
    const data = extractPlaybookData(JOURNAL_CONTENT, [], []);
    expect(data.triggerConditions).toContain('lateral_movement');
    expect(data.triggerConditions).toContain('c2_beacon');
  });

  it('extracts decision tree nodes from #thrunt/dp/ tags chronologically', () => {
    const data = extractPlaybookData(JOURNAL_CONTENT, [], []);
    expect(data.decisionTree).toHaveLength(2);
    expect(data.decisionTree[0]!.timestamp).toBe('2026-04-12 15:00');
    expect(data.decisionTree[0]!.decision).toBe('escalate');
    expect(data.decisionTree[0]!.context).toBeTruthy();
    expect(data.decisionTree[1]!.timestamp).toBe('2026-04-12 15:30');
    expect(data.decisionTree[1]!.decision).toBe('pivot_analysis');
  });

  it('extracts query sequences from receipt timeline', () => {
    const data = extractPlaybookData(JOURNAL_CONTENT, RECEIPT_TIMELINE, []);
    expect(data.querySequences).toHaveLength(3);
    expect(data.querySequences[0]).toEqual({
      receiptId: 'RCT-001',
      claim: 'Lateral movement detected between hosts',
      claimStatus: 'supports',
      techniqueRefs: ['T1021.001', 'T1059.001'],
      hypothesis: 'Credential reuse',
    });
  });

  it('deduplicates entity types', () => {
    const data = extractPlaybookData(JOURNAL_CONTENT, [], ENTITY_TYPES_INPUT);
    expect(data.entityTypes).toEqual(['ioc/ip', 'actor', 'ttp']);
  });

  it('returns empty arrays when journal has no tags or receipts is empty', () => {
    const emptyJournal = `---
hunt_id: HUNT-EMPTY
---

## Reasoning Log

### [2026-04-12 14:30]

No tags in this entry.
`;
    const data = extractPlaybookData(emptyJournal, [], []);
    expect(data.triggerConditions).toEqual([]);
    expect(data.decisionTree).toEqual([]);
    expect(data.querySequences).toEqual([]);
    expect(data.entityTypes).toEqual([]);
  });

  it('strips code blocks before extracting tags', () => {
    const journalWithCode = `---
hunt_id: HUNT-CODE
---

## Reasoning Log

### [2026-04-12 14:30]

Real tag: #thrunt/h/real_hypothesis

\`\`\`
#thrunt/h/fake_in_code should be ignored
\`\`\`
`;
    const data = extractPlaybookData(journalWithCode, [], []);
    expect(data.triggerConditions).toContain('real_hypothesis');
    expect(data.triggerConditions).not.toContain('fake_in_code');
  });

  it('detects huntId from journal frontmatter', () => {
    const data = extractPlaybookData(JOURNAL_CONTENT, [], []);
    expect(data.huntId).toBe('HUNT-042');
  });

  it('collects unique techniques from receipt timeline', () => {
    const data = extractPlaybookData(JOURNAL_CONTENT, RECEIPT_TIMELINE, []);
    expect(data.techniques).toContain('T1021.001');
    expect(data.techniques).toContain('T1059.001');
    expect(data.techniques).toContain('T1071.001');
    // T1059.001 appears in two receipts but should only appear once
    expect(data.techniques).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// generatePlaybookNote
// ---------------------------------------------------------------------------

describe('generatePlaybookNote', () => {
  const now = new Date(2026, 3, 12, 14, 30); // 2026-04-12 14:30

  const sampleData: PlaybookData = {
    huntId: 'HUNT-042',
    triggerConditions: ['lateral_movement', 'c2_beacon'],
    decisionTree: [
      { timestamp: '2026-04-12 15:00', decision: 'escalate', context: 'Evidence confirmed across 3 hosts' },
      { timestamp: '2026-04-12 15:30', decision: 'pivot_analysis', context: 'After escalation review' },
    ],
    querySequences: [
      { receiptId: 'RCT-001', claim: 'Lateral movement detected', claimStatus: 'supports', techniqueRefs: ['T1021.001'], hypothesis: 'Credential reuse' },
    ],
    entityTypes: ['ioc/ip', 'actor'],
    techniques: ['T1021.001', 'T1059.001'],
  };

  it('produces frontmatter with all required fields', () => {
    const result = generatePlaybookNote(sampleData, now);
    expect(result).toContain('source_hunt: HUNT-042');
    expect(result).toContain('trigger_conditions: [lateral_movement, c2_beacon]');
    expect(result).toContain('entity_types: [ioc/ip, actor]');
    expect(result).toContain('techniques: [T1021.001, T1059.001]');
    expect(result).toContain('created: 2026-04-12');
    expect(result).toContain('status: draft');
    expect(result).toContain('applied_count: 0');
    expect(result).toContain('last_applied: ""');
  });

  it('body contains ## Trigger Conditions section', () => {
    const result = generatePlaybookNote(sampleData, now);
    expect(result).toContain('## Trigger Conditions');
    expect(result).toContain('- lateral_movement');
    expect(result).toContain('- c2_beacon');
  });

  it('body contains ## Decision Tree section with IF/THEN entries', () => {
    const result = generatePlaybookNote(sampleData, now);
    expect(result).toContain('## Decision Tree');
    expect(result).toMatch(/IF.*Evidence confirmed.*THEN.*escalate/);
    expect(result).toMatch(/IF.*After escalation.*THEN.*pivot_analysis/);
  });

  it('body contains ## Query Sequences section grouped by hypothesis', () => {
    const result = generatePlaybookNote(sampleData, now);
    expect(result).toContain('## Query Sequences');
    expect(result).toContain('Credential reuse');
    expect(result).toContain('RCT-001');
  });

  it('body contains ## Expected Entity Types section', () => {
    const result = generatePlaybookNote(sampleData, now);
    expect(result).toContain('## Expected Entity Types');
    expect(result).toContain('- ioc/ip');
    expect(result).toContain('- actor');
  });

  it('omits ## Query Sequences section when querySequences is empty', () => {
    const dataNoQueries: PlaybookData = { ...sampleData, querySequences: [] };
    const result = generatePlaybookNote(dataNoQueries, now);
    expect(result).not.toContain('## Query Sequences');
  });

  it('handles empty decision tree gracefully', () => {
    const dataNoDecisions: PlaybookData = { ...sampleData, decisionTree: [] };
    const result = generatePlaybookNote(dataNoDecisions, now);
    expect(result).toContain('## Decision Tree');
    expect(result).toContain('_No decision points recorded._');
  });
});

// ---------------------------------------------------------------------------
// parsePlaybookFrontmatter
// ---------------------------------------------------------------------------

describe('parsePlaybookFrontmatter', () => {
  const PLAYBOOK_CONTENT = `---
source_hunt: HUNT-042
trigger_conditions: [lateral_movement, c2_beacon]
entity_types: [ioc/ip, actor]
techniques: [T1021.001, T1059.001]
created: 2026-04-12
status: draft
applied_count: 0
last_applied: ""
---

## Trigger Conditions

- lateral_movement
- c2_beacon
`;

  it('parses trigger_conditions array from frontmatter', () => {
    const parsed = parsePlaybookFrontmatter(PLAYBOOK_CONTENT);
    expect(parsed.triggerConditions).toEqual(['lateral_movement', 'c2_beacon']);
  });

  it('parses techniques array from frontmatter', () => {
    const parsed = parsePlaybookFrontmatter(PLAYBOOK_CONTENT);
    expect(parsed.techniques).toEqual(['T1021.001', 'T1059.001']);
  });

  it('parses source_hunt string', () => {
    const parsed = parsePlaybookFrontmatter(PLAYBOOK_CONTENT);
    expect(parsed.sourceHunt).toBe('HUNT-042');
  });

  it('returns empty arrays when fields are missing', () => {
    const minimalContent = `---
status: draft
---

Content.
`;
    const parsed = parsePlaybookFrontmatter(minimalContent);
    expect(parsed.triggerConditions).toEqual([]);
    expect(parsed.techniques).toEqual([]);
    expect(parsed.sourceHunt).toBe('');
  });
});

// ---------------------------------------------------------------------------
// applyPlaybookToMission
// ---------------------------------------------------------------------------

describe('applyPlaybookToMission', () => {
  const MISSION_CONTENT = `---
hunt_id: HUNT-NEW
hypothesis: ""
status: planning
---

## Objective

Find evidence of compromise.
`;

  it('updates hypothesis field with first trigger condition', () => {
    const result = applyPlaybookToMission(MISSION_CONTENT, ['lateral_movement', 'c2_beacon']);
    // updateFrontmatter preserves existing quote style (hypothesis: "" -> "lateral_movement")
    expect(result).toContain('hypothesis: "lateral_movement"');
  });

  it('returns original content when no trigger conditions', () => {
    const result = applyPlaybookToMission(MISSION_CONTENT, []);
    expect(result).toBe(MISSION_CONTENT);
  });
});

// ---------------------------------------------------------------------------
// buildPlaybookJournalEntries
// ---------------------------------------------------------------------------

describe('buildPlaybookJournalEntries', () => {
  const now = new Date(2026, 3, 12, 14, 30); // 2026-04-12 14:30

  it('returns timestamped entries with #thrunt/h/ tags from trigger conditions', () => {
    const result = buildPlaybookJournalEntries(['lateral_movement'], now);
    expect(result).toContain('### [2026-04-12 14:30]');
    expect(result).toContain('Starting hunt from playbook. Initial hypothesis: #thrunt/h/lateral_movement');
  });

  it('returns empty string when trigger conditions array is empty', () => {
    const result = buildPlaybookJournalEntries([], now);
    expect(result).toBe('');
  });

  it('creates an entry for each trigger condition', () => {
    const result = buildPlaybookJournalEntries(['lateral_movement', 'c2_beacon'], now);
    expect(result).toContain('#thrunt/h/lateral_movement');
    expect(result).toContain('#thrunt/h/c2_beacon');
    // Should have two ### headings
    const headings = result.match(/### \[/g);
    expect(headings).toHaveLength(2);
  });
});
