import { describe, it, expect } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  extractSchemaVersion,
  hasFrontmatterKey,
  previewMigration,
  applyMigration,
} from '../schema-migration';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

/** Entity note with NO schema_version (pre-versioning) */
const OLD_NOTE = `---
type: ioc/ip
value: "192.168.1.100"
first_seen: "2024-01-15"
last_seen: ""
hunt_refs: [hunt-001]
confidence: "high"
verdict: ""
---
# 192.168.1.100

## Sightings

- 2024-01-15: Seen in hunt-001 log analysis

## Related

- [[T1059.001]]
`;

/** Entity note at schema version 1 (needs v2 migration) */
const V1_NOTE = `---
schema_version: 1
type: ioc/ip
value: "192.168.1.100"
first_seen: "2024-01-15"
last_seen: ""
hunt_refs: [hunt-001]
confidence: "high"
verdict: unknown
---
# 192.168.1.100

## Verdict History

_No verdict changes recorded._

## Sightings

- 2024-01-15: Seen in hunt-001 log analysis

## Related

- [[T1059.001]]
`;

/** Entity note at current schema version v2 (needs v3 migration) */
const V2_NOTE = `---
schema_version: 2
type: ioc/ip
value: "192.168.1.100"
first_seen: "2024-01-15"
last_seen: ""
hunt_refs: [hunt-001]
confidence: "high"
verdict: unknown
confidence_score: 0
source_count: 0
reliability: 0
corroboration: 0
days_since_validation: 0
confidence_factors: {source_count: 0, reliability: 0, corroboration: 0, days_since_validation: 0}
---
# 192.168.1.100

## Verdict History

_No verdict changes recorded._

## Hunt History

_No hunt references found._

## Related Infrastructure

_No co-occurring entities found (2+ shared hunts required)._

## Sightings

- 2024-01-15: Seen in hunt-001 log analysis

## Related

- [[T1059.001]]
`;

/** Entity note already at current schema version (v3) */
const CURRENT_NOTE = `---
schema_version: 3
type: ioc/ip
value: "192.168.1.100"
first_seen: "2024-01-15"
last_seen: ""
hunt_refs: [hunt-001]
confidence: "high"
verdict: unknown
confidence_score: 0
source_count: 0
reliability: 0
corroboration: 0
days_since_validation: 0
confidence_factors: {source_count: 0, reliability: 0, corroboration: 0, days_since_validation: 0}
coverage_status: stale
fp_count: 0
---
# 192.168.1.100

## Verdict History

_No verdict changes recorded._

## Hunt History

_No hunt references found._

## Related Infrastructure

_No co-occurring entities found (2+ shared hunts required)._

## Known False Positives

_No false positives recorded._

## Sightings

- 2024-01-15: Seen in hunt-001 log analysis

## Related

- [[T1059.001]]
`;

/** Entity note with NO verdict field and NO Verdict History section */
const OLD_NOTE_NO_VERDICT = `---
type: ttp
mitre_id: "T1059.001"
tactic: "Execution"
platforms: [Windows, Linux]
data_sources: []
hunt_count: 3
last_hunted: "2024-02-10"
---
# T1059.001

## Sightings

- 2024-02-10: Used in hunt-005

## Related

- [[APT28]]
`;

/** Minimal note with just type field */
const MINIMAL_NOTE = `---
type: actor
aliases: []
---
# APT28

## Sightings

_No sightings recorded yet._

## Related

`;

// ---------------------------------------------------------------------------
// extractSchemaVersion
// ---------------------------------------------------------------------------

describe('extractSchemaVersion', () => {
  it('returns 0 for content without schema_version', () => {
    expect(extractSchemaVersion(OLD_NOTE)).toBe(0);
  });

  it('returns 1 for content with schema_version: 1', () => {
    expect(extractSchemaVersion(V1_NOTE)).toBe(1);
  });

  it('returns 2 for content with schema_version: 2', () => {
    expect(extractSchemaVersion(V2_NOTE)).toBe(2);
  });

  it('returns 3 for content with schema_version: 3', () => {
    expect(extractSchemaVersion(CURRENT_NOTE)).toBe(3);
  });

  it('returns correct version for higher schema versions', () => {
    const note = `---
schema_version: 5
type: ioc/ip
---
# Test
`;
    expect(extractSchemaVersion(note)).toBe(5);
  });

  it('returns 0 for content with no frontmatter', () => {
    expect(extractSchemaVersion('# Just a heading\n\nSome content')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// hasFrontmatterKey
// ---------------------------------------------------------------------------

describe('hasFrontmatterKey', () => {
  it('returns true for existing key', () => {
    expect(hasFrontmatterKey(OLD_NOTE, 'type')).toBe(true);
    expect(hasFrontmatterKey(OLD_NOTE, 'verdict')).toBe(true);
    expect(hasFrontmatterKey(OLD_NOTE, 'confidence')).toBe(true);
  });

  it('returns false for missing key', () => {
    expect(hasFrontmatterKey(OLD_NOTE, 'schema_version')).toBe(false);
    expect(hasFrontmatterKey(OLD_NOTE_NO_VERDICT, 'verdict')).toBe(false);
  });

  it('returns false for content without frontmatter', () => {
    expect(hasFrontmatterKey('# heading', 'type')).toBe(false);
  });

  it('does not match keys in body text', () => {
    const note = `---
type: ioc/ip
---
# Note

schema_version: 1
`;
    expect(hasFrontmatterKey(note, 'schema_version')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// previewMigration
// ---------------------------------------------------------------------------

describe('previewMigration', () => {
  it('returns null for note at current version', () => {
    const result = previewMigration(CURRENT_NOTE, 'entities/iocs/192.168.1.100.md');
    expect(result).toBeNull();
  });

  it('returns preview with fieldsToAdd for note at version 0', () => {
    const result = previewMigration(OLD_NOTE, 'entities/iocs/192.168.1.100.md');
    expect(result).not.toBeNull();
    expect(result!.currentVersion).toBe(0);
    expect(result!.targetVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result!.filePath).toBe('entities/iocs/192.168.1.100.md');
    expect(result!.fieldsToAdd).toContain('schema_version');
  });

  it('identifies missing verdict field', () => {
    const result = previewMigration(OLD_NOTE_NO_VERDICT, 'entities/ttps/T1059.001.md');
    expect(result).not.toBeNull();
    expect(result!.fieldsToAdd).toContain('verdict');
  });

  it('does not list verdict in fieldsToAdd if already present', () => {
    const result = previewMigration(OLD_NOTE, 'entities/iocs/192.168.1.100.md');
    expect(result).not.toBeNull();
    // OLD_NOTE has verdict: "" -- field is present, should not be in fieldsToAdd
    expect(result!.fieldsToAdd).not.toContain('verdict');
  });

  it('identifies missing ## Verdict History section', () => {
    const result = previewMigration(OLD_NOTE, 'entities/iocs/192.168.1.100.md');
    expect(result).not.toBeNull();
    expect(result!.sectionsToAdd).toContain('## Verdict History');
  });

  it('does not list Verdict History if already present', () => {
    const result = previewMigration(CURRENT_NOTE, 'entities/iocs/192.168.1.100.md');
    // Should be null (already at current version) so section check is moot
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// applyMigration
// ---------------------------------------------------------------------------

describe('applyMigration', () => {
  it('adds schema_version and verdict fields to old note without verdict', () => {
    const result = applyMigration(OLD_NOTE_NO_VERDICT);
    // Both migrations apply: schema_version goes to 2 (current)
    expect(result).toContain('schema_version: 3');
    expect(result).toContain('verdict: unknown');
  });

  it('adds schema_version to old note that already has verdict', () => {
    const result = applyMigration(OLD_NOTE);
    expect(result).toContain('schema_version: 3');
    // Should NOT duplicate verdict since it already exists
    const verdictMatches = result.match(/^verdict:/gm);
    expect(verdictMatches).toHaveLength(1);
  });

  it('adds ## Verdict History section before ## Sightings', () => {
    const result = applyMigration(OLD_NOTE);
    expect(result).toContain('## Verdict History');
    const historyIdx = result.indexOf('## Verdict History');
    const sightingsIdx = result.indexOf('## Sightings');
    expect(historyIdx).toBeLessThan(sightingsIdx);
  });

  it('preserves existing frontmatter fields unchanged', () => {
    const result = applyMigration(OLD_NOTE);
    expect(result).toContain('type: ioc/ip');
    expect(result).toContain('value: "192.168.1.100"');
    expect(result).toContain('first_seen: "2024-01-15"');
    expect(result).toContain('hunt_refs: [hunt-001]');
    expect(result).toContain('confidence: "high"');
  });

  it('preserves existing markdown body content', () => {
    const result = applyMigration(OLD_NOTE);
    expect(result).toContain('## Sightings');
    expect(result).toContain('- 2024-01-15: Seen in hunt-001 log analysis');
    expect(result).toContain('## Related');
    expect(result).toContain('- [[T1059.001]]');
  });

  it('is idempotent (running twice produces same result)', () => {
    const first = applyMigration(OLD_NOTE);
    const second = applyMigration(first);
    expect(second).toBe(first);
  });

  it('is idempotent on note without verdict field', () => {
    const first = applyMigration(OLD_NOTE_NO_VERDICT);
    const second = applyMigration(first);
    expect(second).toBe(first);
  });

  it('returns current-version note unchanged', () => {
    const result = applyMigration(CURRENT_NOTE);
    expect(result).toBe(CURRENT_NOTE);
  });

  it('updates verdict from "" to unknown via migration', () => {
    const result = applyMigration(OLD_NOTE);
    // The old note has verdict: "" -- migration should update it to unknown
    // updateFrontmatter preserves existing quoting style, so "unknown" is valid
    expect(result).toMatch(/verdict:\s*"?unknown"?/);
    expect(result).not.toMatch(/verdict:\s*""\s*$/m);
  });

  it('handles minimal note with just type and aliases', () => {
    const result = applyMigration(MINIMAL_NOTE);
    expect(result).toContain('schema_version: 3');
    expect(result).toContain('verdict: unknown');
    expect(result).toContain('## Verdict History');
    // v2 sections too
    expect(result).toContain('## Hunt History');
    expect(result).toContain('## Related Infrastructure');
    // v3 sections too
    expect(result).toContain('## Known False Positives');
    expect(result).toContain('coverage_status: stale');
    expect(result).toContain('fp_count: 0');
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('CURRENT_SCHEMA_VERSION', () => {
  it('equals 3', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(3);
  });
});

describe('MIGRATIONS', () => {
  it('has exactly 3 entries for versions 1, 2, and 3', () => {
    expect(MIGRATIONS).toHaveLength(3);
    expect(MIGRATIONS[0]!.version).toBe(1);
    expect(MIGRATIONS[1]!.version).toBe(2);
    expect(MIGRATIONS[2]!.version).toBe(3);
  });

  it('version 1 migration adds schema_version and verdict fields', () => {
    const m = MIGRATIONS[0]!;
    const fieldKeys = m.addFields.map((f) => f.key);
    expect(fieldKeys).toContain('schema_version');
    expect(fieldKeys).toContain('verdict');
  });

  it('version 1 migration adds Verdict History section', () => {
    const m = MIGRATIONS[0]!;
    expect(m.addSections).toBeDefined();
    const sectionHeadings = m.addSections!.map((s) => s.heading);
    expect(sectionHeadings).toContain('## Verdict History');
  });

  it('version 2 migration adds confidence fields', () => {
    const m = MIGRATIONS[1]!;
    const fieldKeys = m.addFields.map((f) => f.key);
    expect(fieldKeys).toContain('confidence_score');
    expect(fieldKeys).toContain('source_count');
    expect(fieldKeys).toContain('reliability');
    expect(fieldKeys).toContain('corroboration');
    expect(fieldKeys).toContain('days_since_validation');
    expect(fieldKeys).toContain('confidence_factors');
  });

  it('version 2 migration adds Hunt History and Related Infrastructure sections', () => {
    const m = MIGRATIONS[1]!;
    expect(m.addSections).toBeDefined();
    const sectionHeadings = m.addSections!.map((s) => s.heading);
    expect(sectionHeadings).toContain('## Hunt History');
    expect(sectionHeadings).toContain('## Related Infrastructure');
  });

  it('version 3 migration adds coverage_status and fp_count fields', () => {
    const m = MIGRATIONS[2]!;
    const fieldKeys = m.addFields.map((f) => f.key);
    expect(fieldKeys).toContain('coverage_status');
    expect(fieldKeys).toContain('fp_count');
  });

  it('version 3 migration adds Known False Positives section', () => {
    const m = MIGRATIONS[2]!;
    expect(m.addSections).toBeDefined();
    const sectionHeadings = m.addSections!.map((s) => s.heading);
    expect(sectionHeadings).toContain('## Known False Positives');
  });
});

// ---------------------------------------------------------------------------
// v2 migration integration tests
// ---------------------------------------------------------------------------

describe('applyMigration v1 -> v3 (applies v2 + v3)', () => {
  it('adds v2 confidence fields and v3 coverage fields to v1 note', () => {
    const result = applyMigration(V1_NOTE);
    // v2 fields
    expect(result).toContain('confidence_score: 0');
    expect(result).toContain('source_count: 0');
    expect(result).toContain('reliability: 0');
    expect(result).toContain('corroboration: 0');
    expect(result).toContain('days_since_validation: 0');
    expect(result).toContain('confidence_factors:');
    // v3 fields
    expect(result).toContain('coverage_status: stale');
    expect(result).toContain('fp_count: 0');
    expect(result).toContain('schema_version: 3');
  });

  it('inserts Hunt History, Related Infrastructure, and Known False Positives sections before ## Sightings', () => {
    const result = applyMigration(V1_NOTE);
    expect(result).toContain('## Hunt History');
    expect(result).toContain('## Related Infrastructure');
    expect(result).toContain('## Known False Positives');
    const huntHistoryIdx = result.indexOf('## Hunt History');
    const relatedInfraIdx = result.indexOf('## Related Infrastructure');
    const knownFPIdx = result.indexOf('## Known False Positives');
    const sightingsIdx = result.indexOf('## Sightings');
    expect(huntHistoryIdx).toBeLessThan(sightingsIdx);
    expect(relatedInfraIdx).toBeLessThan(sightingsIdx);
    expect(knownFPIdx).toBeLessThan(sightingsIdx);
  });

  it('preserves existing Verdict History section', () => {
    const result = applyMigration(V1_NOTE);
    expect(result).toContain('## Verdict History');
    expect(result).toContain('_No verdict changes recorded._');
  });
});

describe('applyMigration v0 -> v3', () => {
  it('applies all three migrations in sequence', () => {
    const result = applyMigration(OLD_NOTE);
    // v1 fields
    expect(result).toContain('schema_version: 3');
    expect(result).toContain('## Verdict History');
    // v2 fields
    expect(result).toContain('confidence_score: 0');
    expect(result).toContain('source_count: 0');
    expect(result).toContain('## Hunt History');
    expect(result).toContain('## Related Infrastructure');
    // v3 fields
    expect(result).toContain('coverage_status: stale');
    expect(result).toContain('fp_count: 0');
    expect(result).toContain('## Known False Positives');
  });
});

describe('applyMigration v2 -> v3', () => {
  it('adds coverage_status, fp_count fields, and Known False Positives section to v2 note', () => {
    const result = applyMigration(V2_NOTE);
    expect(result).toContain('coverage_status: stale');
    expect(result).toContain('fp_count: 0');
    expect(result).toContain('## Known False Positives');
    expect(result).toContain('_No false positives recorded._');
    expect(result).toContain('schema_version: 3');
  });

  it('inserts Known False Positives section before ## Sightings', () => {
    const result = applyMigration(V2_NOTE);
    const knownFPIdx = result.indexOf('## Known False Positives');
    const sightingsIdx = result.indexOf('## Sightings');
    expect(knownFPIdx).toBeLessThan(sightingsIdx);
  });

  it('preserves existing v2 sections', () => {
    const result = applyMigration(V2_NOTE);
    expect(result).toContain('## Verdict History');
    expect(result).toContain('## Hunt History');
    expect(result).toContain('## Related Infrastructure');
  });
});

describe('applyMigration v3 idempotent', () => {
  it('returns already-v3 notes unchanged', () => {
    const v3Note = applyMigration(V1_NOTE);
    const second = applyMigration(v3Note);
    expect(second).toBe(v3Note);
  });

  it('returns CURRENT_NOTE (v3) unchanged', () => {
    const result = applyMigration(CURRENT_NOTE);
    expect(result).toBe(CURRENT_NOTE);
  });
});
