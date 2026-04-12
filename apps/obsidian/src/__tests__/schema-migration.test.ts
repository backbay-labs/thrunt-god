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

/** Entity note already at current schema version */
const CURRENT_NOTE = `---
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
    expect(extractSchemaVersion(CURRENT_NOTE)).toBe(1);
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
    expect(result).toContain('schema_version: 1');
    expect(result).toContain('verdict: unknown');
  });

  it('adds schema_version to old note that already has verdict', () => {
    const result = applyMigration(OLD_NOTE);
    expect(result).toContain('schema_version: 1');
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
    expect(result).toContain('schema_version: 1');
    expect(result).toContain('verdict: unknown');
    expect(result).toContain('## Verdict History');
  });
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('CURRENT_SCHEMA_VERSION', () => {
  it('equals 1', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });
});

describe('MIGRATIONS', () => {
  it('has exactly 1 entry for version 1', () => {
    expect(MIGRATIONS).toHaveLength(1);
    expect(MIGRATIONS[0]!.version).toBe(1);
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
});
