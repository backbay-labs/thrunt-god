'use strict';

/**
 * MITRE ATT&CK data module tests.
 *
 * Covers: data loading, ID search, name search, tactic filter,
 * platform filter, multi-select parsing, and getAllTactics.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  loadAttackData,
  getTechniqueById,
  searchTechniques,
  filterByTactic,
  filterByPlatform,
  parseMultiSelect,
  getAllTactics,
} = require('../thrunt-god/bin/lib/mitre-data.cjs');

// ---------------------------------------------------------------------------
// Suite 1: Data Loading
// ---------------------------------------------------------------------------

describe('loadAttackData', () => {
  it('returns object with version, generated, and techniques array', () => {
    const data = loadAttackData();
    assert.strictEqual(typeof data.version, 'string');
    assert.strictEqual(typeof data.generated, 'string');
    assert.ok(Array.isArray(data.techniques));
  });

  it('techniques array has 50+ entries', () => {
    const data = loadAttackData();
    assert.ok(data.techniques.length >= 50, `Expected 50+ techniques, got ${data.techniques.length}`);
  });

  it('each technique has required fields', () => {
    const data = loadAttackData();
    for (const t of data.techniques) {
      assert.strictEqual(typeof t.id, 'string', `Missing id`);
      assert.strictEqual(typeof t.name, 'string', `Missing name for ${t.id}`);
      assert.strictEqual(typeof t.tactic, 'string', `Missing tactic for ${t.id}`);
      assert.strictEqual(typeof t.description, 'string', `Missing description for ${t.id}`);
      assert.ok(Array.isArray(t.platforms), `Missing platforms for ${t.id}`);
      assert.ok(Array.isArray(t.data_sources), `Missing data_sources for ${t.id}`);
    }
  });

  it('sub-techniques have id and name fields', () => {
    const data = loadAttackData();
    for (const t of data.techniques) {
      for (const sub of t.sub_techniques) {
        assert.strictEqual(typeof sub.id, 'string', `Sub-technique missing id in ${t.id}`);
        assert.strictEqual(typeof sub.name, 'string', `Sub-technique missing name in ${t.id}`);
      }
    }
  });

  it('returns cached data on subsequent calls', () => {
    const d1 = loadAttackData();
    const d2 = loadAttackData();
    assert.strictEqual(d1, d2, 'Expected same reference (singleton cache)');
  });
});

// ---------------------------------------------------------------------------
// Suite 2: ID Search
// ---------------------------------------------------------------------------

describe('getTechniqueById', () => {
  it('returns Valid Accounts for T1078', () => {
    const t = getTechniqueById('T1078');
    assert.ok(t, 'Expected T1078 to exist');
    assert.strictEqual(t.name, 'Valid Accounts');
  });

  it('returns sub-technique with parent_id for T1078.002', () => {
    const t = getTechniqueById('T1078.002');
    assert.ok(t, 'Expected T1078.002 to exist');
    assert.strictEqual(t.id, 'T1078.002');
    assert.strictEqual(t.name, 'Domain Accounts');
    assert.strictEqual(t.parent_id, 'T1078');
    assert.strictEqual(t.parent_name, 'Valid Accounts');
    assert.ok(Array.isArray(t.platforms), 'Sub-technique should inherit platforms');
  });

  it('returns null for T9999', () => {
    const t = getTechniqueById('T9999');
    assert.strictEqual(t, null);
  });

  it('works case-insensitive', () => {
    const t = getTechniqueById('t1078');
    assert.ok(t, 'Expected case-insensitive match');
    assert.strictEqual(t.name, 'Valid Accounts');
  });

  it('returns null for null/undefined input', () => {
    assert.strictEqual(getTechniqueById(null), null);
    assert.strictEqual(getTechniqueById(undefined), null);
    assert.strictEqual(getTechniqueById(''), null);
  });

  it('returns null for sub-technique with nonexistent parent', () => {
    const t = getTechniqueById('T9999.001');
    assert.strictEqual(t, null);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Name Search
// ---------------------------------------------------------------------------

describe('searchTechniques', () => {
  it('returns array containing T1078 for "Valid Accounts"', () => {
    const results = searchTechniques('Valid Accounts');
    assert.ok(results.length > 0);
    assert.ok(results.some(r => r.id === 'T1078'));
  });

  it('returns multiple matches for "valid"', () => {
    const results = searchTechniques('valid');
    assert.ok(results.length > 0);
    // "Valid Accounts" should be among results
    assert.ok(results.some(r => r.id === 'T1078'));
  });

  it('returns exact ID match first for "T1078"', () => {
    const results = searchTechniques('T1078');
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].id, 'T1078');
  });

  it('returns sub-technique matches for ID search', () => {
    const results = searchTechniques('T1078.002');
    assert.ok(results.length > 0);
    assert.strictEqual(results[0].id, 'T1078.002');
    assert.strictEqual(results[0].parent_id, 'T1078');
  });

  it('returns empty array for "xyznonexistent"', () => {
    const results = searchTechniques('xyznonexistent');
    assert.strictEqual(results.length, 0);
  });

  it('returns empty array for empty/null input', () => {
    assert.strictEqual(searchTechniques('').length, 0);
    assert.strictEqual(searchTechniques(null).length, 0);
    assert.strictEqual(searchTechniques(undefined).length, 0);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Tactic Filter
// ---------------------------------------------------------------------------

describe('filterByTactic', () => {
  it('returns non-empty array for "Initial Access"', () => {
    const results = filterByTactic('Initial Access');
    assert.ok(results.length > 0);
  });

  it('all results contain "Initial Access" in tactic', () => {
    const results = filterByTactic('Initial Access');
    for (const r of results) {
      assert.ok(
        r.tactic.toLowerCase().includes('initial access'),
        `${r.id} tactic "${r.tactic}" missing "Initial Access"`
      );
    }
  });

  it('returns empty array for nonexistent tactic', () => {
    const results = filterByTactic('Nonexistent Tactic');
    assert.strictEqual(results.length, 0);
  });

  it('is case-insensitive', () => {
    const r1 = filterByTactic('Initial Access');
    const r2 = filterByTactic('initial access');
    assert.strictEqual(r1.length, r2.length);
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Platform Filter
// ---------------------------------------------------------------------------

describe('filterByPlatform', () => {
  it('returns non-empty array for "Cloud"', () => {
    const results = filterByPlatform('Cloud');
    assert.ok(results.length > 0);
  });

  it('returns non-empty array for "Windows"', () => {
    const results = filterByPlatform('Windows');
    assert.ok(results.length > 0);
  });

  it('all results have the queried platform', () => {
    const results = filterByPlatform('Cloud');
    for (const r of results) {
      assert.ok(
        r.platforms.some(p => p.toLowerCase() === 'cloud'),
        `${r.id} platforms ${JSON.stringify(r.platforms)} missing "Cloud"`
      );
    }
  });

  it('is case-insensitive', () => {
    const r1 = filterByPlatform('Cloud');
    const r2 = filterByPlatform('cloud');
    assert.strictEqual(r1.length, r2.length);
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Multi-Select Parsing
// ---------------------------------------------------------------------------

describe('parseMultiSelect', () => {
  it('parses comma-separated ATT&CK IDs', () => {
    const ids = parseMultiSelect('T1078,T1195');
    assert.deepStrictEqual(ids, ['T1078', 'T1195']);
  });

  it('parses numeric indices into results array', () => {
    const results = [
      { id: 'T1195', name: 'Supply Chain Compromise' },
      { id: 'T1195.001', name: 'Compromise Software Dependencies' },
      { id: 'T1195.002', name: 'Compromise Software Supply Chain' },
    ];
    const ids = parseMultiSelect('1,3', results);
    assert.deepStrictEqual(ids, ['T1195', 'T1195.002']);
  });

  it('handles whitespace: " T1078 , T1195 "', () => {
    const ids = parseMultiSelect(' T1078 , T1195 ');
    assert.deepStrictEqual(ids, ['T1078', 'T1195']);
  });

  it('"a" returns all result IDs when results provided', () => {
    const results = [
      { id: 'T1195', name: 'Supply Chain Compromise' },
      { id: 'T1195.001', name: 'Compromise Software Dependencies' },
    ];
    const ids = parseMultiSelect('a', results);
    assert.deepStrictEqual(ids, ['T1195', 'T1195.001']);
  });

  it('"all" returns all result IDs when results provided', () => {
    const results = [
      { id: 'T1195', name: 'Supply Chain Compromise' },
      { id: 'T1195.001', name: 'Compromise Software Dependencies' },
    ];
    const ids = parseMultiSelect('all', results);
    assert.deepStrictEqual(ids, ['T1195', 'T1195.001']);
  });

  it('skips invalid ATT&CK IDs that do not exist in bundle', () => {
    const ids = parseMultiSelect('T1078,T9999');
    // T9999 doesn't exist in the bundle, should be skipped
    assert.deepStrictEqual(ids, ['T1078']);
  });

  it('returns empty array for null/empty input', () => {
    assert.deepStrictEqual(parseMultiSelect(''), []);
    assert.deepStrictEqual(parseMultiSelect(null), []);
  });
});

// ---------------------------------------------------------------------------
// Suite 7: getAllTactics
// ---------------------------------------------------------------------------

describe('getAllTactics', () => {
  it('returns sorted array of unique tactic names', () => {
    const tactics = getAllTactics();
    assert.ok(Array.isArray(tactics));
    // Check sorted
    const sorted = [...tactics].sort();
    assert.deepStrictEqual(tactics, sorted);
    // Check uniqueness
    assert.strictEqual(tactics.length, new Set(tactics).size);
  });

  it('contains all 14 ATT&CK Enterprise tactics', () => {
    const tactics = getAllTactics();
    const expected = [
      'Collection',
      'Command and Control',
      'Credential Access',
      'Defense Evasion',
      'Discovery',
      'Execution',
      'Exfiltration',
      'Impact',
      'Initial Access',
      'Lateral Movement',
      'Persistence',
      'Privilege Escalation',
      'Reconnaissance',
      'Resource Development',
    ];
    assert.strictEqual(tactics.length, 14, `Expected 14 tactics, got ${tactics.length}`);
    for (const e of expected) {
      assert.ok(tactics.includes(e), `Missing tactic: "${e}"`);
    }
  });
});
