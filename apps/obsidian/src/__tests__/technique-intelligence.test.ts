import { describe, it, expect } from 'vitest';
import {
  refreshTechniqueIntelligence,
  type TechniqueRefreshInput,
} from '../technique-intelligence';
import type { TechniqueHuntEntry } from '../technique-hunt-history';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TECHNIQUE_CONTENT = `---
type: ttp
mitre_id: "T1053"
tactic: "Execution"
name: "Scheduled Task/Job"
platforms: ["Windows", "Linux", "macOS"]
data_sources: ["Process", "Command"]
hunt_count: 0
last_hunted: ""
---
# T1053 -- Scheduled Task/Job

Adversaries may abuse task scheduling functionality to facilitate initial or recurring execution of malicious code.

## Sub-Techniques

- **T1053.005** Scheduled Task

## Sightings

_No hunts have targeted this technique yet._

## Detections

## Related

`;

const TECHNIQUE_WITH_FP = `---
type: ttp
mitre_id: "T1053"
tactic: "Execution"
name: "Scheduled Task/Job"
hunt_count: 0
last_hunted: ""
---
# T1053 -- Scheduled Task/Job

## Sub-Techniques

- **T1053.005** Scheduled Task

## Known False Positives

- **pattern**: Legitimate admin PsExec -- added: 2026-03-10, hunt: HUNT-042
- **pattern**: Backup scheduled task -- added: 2026-04-01, hunt: HUNT-050

## Sightings

_No hunts have targeted this technique yet._

## Detections

## Related

`;

const HUNT_ENTRIES: TechniqueHuntEntry[] = [
  {
    huntId: 'HUNT-001',
    date: '2026-01-15',
    queryCount: 3,
    dataSources: ['Sysmon', 'Windows Event Log'],
    outcome: 'TP',
  },
  {
    huntId: 'HUNT-002',
    date: '2026-03-20',
    queryCount: 1,
    dataSources: ['Process'],
    outcome: 'FP',
  },
];

function makeInput(overrides?: Partial<TechniqueRefreshInput>): TechniqueRefreshInput {
  return {
    techniqueContent: TECHNIQUE_CONTENT,
    techniqueName: 'T1053 -- Scheduled Task-Job',
    huntEntries: HUNT_ENTRIES,
    staleCoverageDays: 90,
    now: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('refreshTechniqueIntelligence', () => {
  it('inserts Hunt History section with correct entries', () => {
    const result = refreshTechniqueIntelligence(makeInput());
    expect(result.content).toContain('## Hunt History');
    expect(result.content).toContain(
      '**HUNT-001** (2026-01-15) -- queries: 3, data_sources: [Sysmon, Windows Event Log], outcome: TP',
    );
    expect(result.content).toContain(
      '**HUNT-002** (2026-03-20) -- queries: 1, data_sources: [Process], outcome: FP',
    );
    expect(result.huntHistoryCount).toBe(2);
  });

  it('returns placeholder Hunt History and stale status with empty huntEntries', () => {
    const result = refreshTechniqueIntelligence(
      makeInput({ huntEntries: [] }),
    );
    expect(result.content).toContain('## Hunt History');
    expect(result.content).toContain('_No hunts have targeted this technique yet._');
    expect(result.coverageStatus).toBe('stale');
    expect(result.huntHistoryCount).toBe(0);
  });

  it('updates frontmatter with hunt_count, last_hunted, coverage_status', () => {
    const result = refreshTechniqueIntelligence(makeInput());
    expect(result.content).toContain('hunt_count: 2');
    // last_hunted preserves existing quoting style (was "" in fixture)
    expect(result.content).toContain('last_hunted: "2026-03-20"');
    expect(result.content).toContain('coverage_status: current');
  });

  it('sets coverage_status to stale when hunt entries are old', () => {
    const oldEntries: TechniqueHuntEntry[] = [
      {
        huntId: 'HUNT-001',
        date: '2025-01-15',
        queryCount: 1,
        dataSources: ['Sysmon'],
        outcome: 'TP',
      },
    ];
    const result = refreshTechniqueIntelligence(
      makeInput({
        huntEntries: oldEntries,
        now: new Date('2026-04-01T00:00:00Z'),
      }),
    );
    expect(result.coverageStatus).toBe('stale');
    expect(result.content).toContain('coverage_status: stale');
  });

  it('sets coverage_status to current when hunt is recent', () => {
    const result = refreshTechniqueIntelligence(makeInput());
    // Most recent hunt is 2026-03-20, now is 2026-04-01 = 12 days < 90
    expect(result.coverageStatus).toBe('current');
    expect(result.lastHuntedDate).toBe('2026-03-20');
  });

  it('preserves existing ## Known False Positives section', () => {
    const result = refreshTechniqueIntelligence(
      makeInput({ techniqueContent: TECHNIQUE_WITH_FP }),
    );
    expect(result.content).toContain('## Known False Positives');
    expect(result.content).toContain('**pattern**: Legitimate admin PsExec');
    expect(result.content).toContain('**pattern**: Backup scheduled task');
  });

  it('counts existing FP entries and includes fp_count in frontmatter', () => {
    const result = refreshTechniqueIntelligence(
      makeInput({ techniqueContent: TECHNIQUE_WITH_FP }),
    );
    expect(result.fpCount).toBe(2);
    expect(result.content).toContain('fp_count: 2');
  });

  it('sets fp_count to 0 when no FP entries exist', () => {
    const result = refreshTechniqueIntelligence(makeInput());
    expect(result.fpCount).toBe(0);
    expect(result.content).toContain('fp_count: 0');
  });

  it('uses extractLastHuntedDate when huntEntries is empty but content has history', () => {
    const contentWithHistory = `---
type: ttp
mitre_id: "T1053"
hunt_count: 1
last_hunted: "2026-02-15"
---
# T1053

## Hunt History

- **HUNT-001** (2026-02-15) -- queries: 2, data_sources: [Sysmon], outcome: TP

## Sightings

## Detections

## Related

`;
    const result = refreshTechniqueIntelligence(
      makeInput({
        techniqueContent: contentWithHistory,
        huntEntries: [],
        now: new Date('2026-03-01T00:00:00Z'),
      }),
    );
    // Should read existing date from content since no new entries
    expect(result.lastHuntedDate).toBe('2026-02-15');
    expect(result.coverageStatus).toBe('current'); // 14 days < 90
  });

  it('preserves existing content sections (Sub-Techniques, Sightings, Detections, Related)', () => {
    const result = refreshTechniqueIntelligence(makeInput());
    expect(result.content).toContain('## Sub-Techniques');
    expect(result.content).toContain('- **T1053.005** Scheduled Task');
    expect(result.content).toContain('## Sightings');
    expect(result.content).toContain('## Detections');
    expect(result.content).toContain('## Related');
  });

  it('composes hunt history before Sightings in section order', () => {
    const result = refreshTechniqueIntelligence(makeInput());
    const huntHistoryIdx = result.content.indexOf('## Hunt History');
    const sightingsIdx = result.content.indexOf('## Sightings');
    expect(huntHistoryIdx).toBeGreaterThan(-1);
    expect(sightingsIdx).toBeGreaterThan(-1);
    expect(huntHistoryIdx).toBeLessThan(sightingsIdx);

    // Frontmatter should still contain original fields
    expect(result.content).toContain('type: ttp');
    expect(result.content).toContain('mitre_id: "T1053"');
  });
});
