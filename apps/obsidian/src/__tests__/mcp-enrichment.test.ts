import { describe, it, expect } from 'vitest';
import {
  mergeEnrichment,
  buildCoverageReport,
  formatDecisionEntry,
  formatLearningEntry,
} from '../mcp-enrichment';
import type { EnrichmentData, CoverageTactic } from '../types';

// ---------------------------------------------------------------------------
// mergeEnrichment
// ---------------------------------------------------------------------------

describe('mergeEnrichment', () => {
  const sampleData: EnrichmentData = {
    description: 'Adversaries may abuse PowerShell commands and scripts for execution.',
    groups: ['APT28', 'APT29', 'Lazarus Group'],
    detectionSources: ['Process monitoring', 'Script block logging'],
    relatedTechniques: ['T1059.001', 'T1059.003'],
  };

  it('appends ## MCP Enrichment section when none exists', () => {
    const existing = `---
type: ttp
mitre_id: T1059
---
# T1059

## Sightings

- **RCT-001** (2026-04-10): Some sighting [[RCT-001.md]]
`;

    const result = mergeEnrichment(existing, sampleData);

    // Original content preserved
    expect(result).toContain('# T1059');
    expect(result).toContain('## Sightings');
    expect(result).toContain('**RCT-001**');

    // New section appended
    expect(result).toContain('## MCP Enrichment');
    expect(result).toContain('**Description:** Adversaries may abuse PowerShell');
    expect(result).toContain('**Groups:** APT28, APT29, Lazarus Group');
    expect(result).toContain('**Detection Sources:** Process monitoring, Script block logging');
    expect(result).toContain('**Related Techniques:** [[T1059.001]], [[T1059.003]]');
  });

  it('replaces existing ## MCP Enrichment section content', () => {
    const existing = `---
type: ttp
---
# T1059

## MCP Enrichment

**Description:** Old description.

**Groups:** OldGroup

## Sightings

- **RCT-001** (2026-04-10): Some sighting [[RCT-001.md]]
`;

    const result = mergeEnrichment(existing, sampleData);

    // Old content replaced
    expect(result).not.toContain('Old description');
    expect(result).not.toContain('OldGroup');

    // New content present
    expect(result).toContain('**Description:** Adversaries may abuse PowerShell');
    expect(result).toContain('**Groups:** APT28, APT29, Lazarus Group');

    // Content after ## MCP Enrichment (the ## Sightings) preserved
    expect(result).toContain('## Sightings');
    expect(result).toContain('**RCT-001**');
  });

  it('preserves analyst content above ## MCP Enrichment', () => {
    const existing = `---
type: ttp
---
# T1059

Analyst notes: This technique is critical to our environment.

## Analysis

Key findings from the investigation.
`;

    const result = mergeEnrichment(existing, sampleData);

    expect(result).toContain('Analyst notes: This technique is critical');
    expect(result).toContain('## Analysis');
    expect(result).toContain('Key findings from the investigation.');
    expect(result).toContain('## MCP Enrichment');
  });

  it('handles empty data fields gracefully', () => {
    const emptyData: EnrichmentData = {
      description: '',
      groups: [],
      detectionSources: [],
      relatedTechniques: [],
    };

    const existing = '# T1059\n';

    const result = mergeEnrichment(existing, emptyData);

    expect(result).toContain('**Description:** No description available.');
    expect(result).toContain('**Groups:** None');
    expect(result).toContain('**Detection Sources:** None');
    expect(result).toContain('**Related Techniques:** None');
  });

  it('replaces enrichment at end of file (no subsequent heading)', () => {
    const existing = `# T1059

## MCP Enrichment

**Description:** Old stuff.

**Groups:** OldGroup
`;

    const result = mergeEnrichment(existing, sampleData);

    expect(result).not.toContain('Old stuff');
    expect(result).not.toContain('OldGroup');
    expect(result).toContain('**Description:** Adversaries may abuse PowerShell');
  });
});

// ---------------------------------------------------------------------------
// buildCoverageReport
// ---------------------------------------------------------------------------

describe('buildCoverageReport', () => {
  it('produces correct table with 2 tactics', () => {
    const tactics: CoverageTactic[] = [
      { tactic: 'Initial Access', total: 10, hunted: 3, percentage: 30.0 },
      { tactic: 'Execution', total: 14, hunted: 7, percentage: 50.0 },
    ];

    const report = buildCoverageReport(tactics, 24, 10, 41.7, ['T1190', 'T1133']);

    expect(report).toContain('# Detection Coverage Report');
    expect(report).toContain('| Tactic | Total | Hunted | Coverage |');
    expect(report).toContain('| Initial Access | 10 | 3 | 30% |');
    expect(report).toContain('| Execution | 14 | 7 | 50% |');
    expect(report).toContain('**Overall: 10/24 (41.7%)**');
    expect(report).toContain('## Detection Gaps');
    expect(report).toContain('- [[T1190]]');
    expect(report).toContain('- [[T1133]]');
    expect(report).toMatch(/_Generated: \d{4}-\d{2}-\d{2}T/);
  });

  it('shows "No detection gaps identified." when gaps is empty', () => {
    const tactics: CoverageTactic[] = [
      { tactic: 'Initial Access', total: 10, hunted: 10, percentage: 100.0 },
    ];

    const report = buildCoverageReport(tactics, 10, 10, 100.0, []);

    expect(report).toContain('## Detection Gaps');
    expect(report).toContain('No detection gaps identified.');
    expect(report).not.toContain('- [[');
  });

  it('contains a generated timestamp', () => {
    const report = buildCoverageReport([], 0, 0, 0, []);
    expect(report).toMatch(/_Generated: \d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// formatDecisionEntry
// ---------------------------------------------------------------------------

describe('formatDecisionEntry', () => {
  it('produces expected markdown with timestamp', () => {
    const entry = formatDecisionEntry(
      'T1059.001',
      'Prioritize for detection',
      'High frequency in our environment based on recent sightings.',
    );

    // ISO date prefix
    expect(entry).toMatch(/^### \d{4}-\d{2}-\d{2} - T1059\.001/);
    expect(entry).toContain('**Decision:** Prioritize for detection');
    expect(entry).toContain('**Rationale:** High frequency in our environment');
  });
});

// ---------------------------------------------------------------------------
// formatLearningEntry
// ---------------------------------------------------------------------------

describe('formatLearningEntry', () => {
  it('produces expected markdown with timestamp', () => {
    const entry = formatLearningEntry(
      'PowerShell Detection',
      'Script block logging provides the most reliable detection signal for T1059.001.',
    );

    expect(entry).toMatch(/^### \d{4}-\d{2}-\d{2} - PowerShell Detection/);
    expect(entry).toContain('Script block logging provides the most reliable');
  });
});
