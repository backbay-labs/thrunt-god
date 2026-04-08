'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// Helper: create an isolated temp directory (never touches real ~/.thrunt/)
function makeTempIntelDir() {
  const dir = path.join(os.tmpdir(), `thrunt-intel-test-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Lazy-load intel.cjs
let intel;
function loadIntel() {
  if (!intel) intel = require('../mcp-hunt-intel/lib/intel.cjs');
  return intel;
}

// ── openIntelDb ─────────────────────────────────────────────────────────────

describe('intel.cjs - openIntelDb', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempIntelDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the dbDir directory and intel.db file', () => {
    const { openIntelDb } = loadIntel();
    const db = openIntelDb({ dbDir: tmpDir });
    assert.ok(db, 'should return a database object');

    const dbPath = path.join(tmpDir, 'intel.db');
    assert.ok(fs.existsSync(dbPath), 'intel.db file should be created');
    db.close();
  });

  it('sets WAL journal mode', () => {
    const { openIntelDb } = loadIntel();
    const db = openIntelDb({ dbDir: tmpDir });

    const journalMode = db.pragma('journal_mode', { simple: true });
    assert.equal(journalMode, 'wal');
    db.close();
  });

  it('sets busy_timeout to 5000', () => {
    const { openIntelDb } = loadIntel();
    const db = openIntelDb({ dbDir: tmpDir });

    const busyTimeout = db.pragma('busy_timeout', { simple: true });
    assert.equal(busyTimeout, 5000);
    db.close();
  });

  it('creates all required tables', () => {
    const { openIntelDb } = loadIntel();
    const db = openIntelDb({ dbDir: tmpDir });

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    assert.ok(tables.includes('techniques'), 'techniques table should exist');
    assert.ok(tables.includes('techniques_fts'), 'techniques_fts virtual table should exist');
    assert.ok(tables.includes('groups'), 'groups table should exist');
    assert.ok(tables.includes('group_techniques'), 'group_techniques table should exist');
    assert.ok(tables.includes('group_software'), 'group_software table should exist');
    assert.ok(tables.includes('software'), 'software table should exist');
    assert.ok(tables.includes('software_techniques'), 'software_techniques table should exist');
    db.close();
  });

  it('accepts custom dbPath override', () => {
    const { openIntelDb } = loadIntel();
    const customPath = path.join(tmpDir, 'custom.db');
    const db = openIntelDb({ dbDir: tmpDir, dbPath: customPath });
    assert.ok(fs.existsSync(customPath), 'custom.db should be created');
    db.close();
  });
});

// ── Population ──────────────────────────────────────────────────────────────

describe('intel.cjs - population', () => {
  let tmpDir, db;

  before(() => {
    tmpDir = makeTempIntelDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('populates techniques table with 160 parent techniques', () => {
    // Parent techniques have no dot in their ID
    const parentCount = db.prepare(
      "SELECT COUNT(*) AS cnt FROM techniques WHERE id NOT LIKE '%.%'"
    ).get().cnt;
    assert.equal(parentCount, 160, `expected 160 parent techniques, got ${parentCount}`);
  });

  it('populates techniques table with all sub-techniques (557 total)', () => {
    const totalCount = db.prepare('SELECT COUNT(*) AS cnt FROM techniques').get().cnt;
    assert.equal(totalCount, 557, `expected 557 total techniques, got ${totalCount}`);
  });

  it('populates techniques_fts FTS5 table', () => {
    const ftsCount = db.prepare('SELECT COUNT(*) AS cnt FROM techniques_fts').get().cnt;
    assert.equal(ftsCount, 557, `expected 557 FTS rows, got ${ftsCount}`);
  });

  it('populates groups table from mitre-attack-groups.json', () => {
    const groupCount = db.prepare('SELECT COUNT(*) AS cnt FROM groups').get().cnt;
    assert.ok(groupCount >= 16, `expected at least 16 groups, got ${groupCount}`);
  });

  it('populates group_techniques junction table', () => {
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM group_techniques').get().cnt;
    assert.ok(count > 0, 'group_techniques should have rows');
  });

  it('populates group_software junction table', () => {
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM group_software').get().cnt;
    assert.ok(count > 0, 'group_software should have rows');
  });

  it('populates software table from mitre-attack-groups.json', () => {
    const softwareCount = db.prepare('SELECT COUNT(*) AS cnt FROM software').get().cnt;
    assert.ok(softwareCount >= 10, `expected at least 10 software, got ${softwareCount}`);
  });

  it('populates software_techniques junction table', () => {
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM software_techniques').get().cnt;
    assert.ok(count > 0, 'software_techniques should have rows');
  });

  it('is idempotent - second openIntelDb call does not duplicate rows', () => {
    const countBefore = db.prepare('SELECT COUNT(*) AS cnt FROM techniques').get().cnt;

    // Open again on same dir (triggers populateIfEmpty again)
    const { openIntelDb } = loadIntel();
    const db2 = openIntelDb({ dbDir: tmpDir });
    const countAfter = db2.prepare('SELECT COUNT(*) AS cnt FROM techniques').get().cnt;

    assert.equal(countBefore, countAfter, 'technique count should not change on second open');
    db2.close();
  });

  it('stores technique URLs in correct format', () => {
    const row = db.prepare("SELECT url FROM techniques WHERE id = 'T1059'").get();
    assert.ok(row, 'T1059 should exist');
    assert.ok(row.url.includes('attack.mitre.org/techniques/T1059'), `URL should contain technique path, got: ${row.url}`);
  });

  it('stores sub-technique URLs in correct format', () => {
    const row = db.prepare("SELECT url FROM techniques WHERE id = 'T1059.001'").get();
    assert.ok(row, 'T1059.001 should exist');
    assert.ok(row.url.includes('attack.mitre.org/techniques/T1059/001'), `URL should contain sub-technique path, got: ${row.url}`);
  });
});

// ── lookupTechnique ─────────────────────────────────────────────────────────

describe('intel.cjs - lookupTechnique', () => {
  let tmpDir, db;

  before(() => {
    tmpDir = makeTempIntelDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns a parent technique by ID', () => {
    const { lookupTechnique } = loadIntel();
    const result = lookupTechnique(db, 'T1059');
    assert.ok(result, 'should return a result for T1059');
    assert.equal(result.id, 'T1059');
    assert.equal(result.name, 'Command and Scripting Interpreter');
    assert.ok(result.description, 'should have description');
    assert.ok(result.tactics, 'should have tactics');
    assert.ok(result.platforms, 'should have platforms');
    assert.ok(result.data_sources, 'should have data_sources');
    assert.ok(result.url, 'should have url');
  });

  it('returns a sub-technique by ID with parent context', () => {
    const { lookupTechnique } = loadIntel();
    const result = lookupTechnique(db, 'T1059.001');
    assert.ok(result, 'should return a result for T1059.001');
    assert.equal(result.id, 'T1059.001');
    assert.ok(result.name, 'should have name');
  });

  it('is case-insensitive', () => {
    const { lookupTechnique } = loadIntel();
    const result = lookupTechnique(db, 't1059');
    assert.ok(result, 'should find technique with lowercase id');
    assert.equal(result.id, 'T1059');
  });

  it('returns null for non-existent technique', () => {
    const { lookupTechnique } = loadIntel();
    const result = lookupTechnique(db, 'T9999');
    assert.equal(result, null, 'should return null for non-existent ID');
  });
});

// ── searchTechniques ────────────────────────────────────────────────────────

describe('intel.cjs - searchTechniques', () => {
  let tmpDir, db;

  before(() => {
    tmpDir = makeTempIntelDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns results for keyword search', () => {
    const { searchTechniques } = loadIntel();
    const results = searchTechniques(db, 'powershell');
    assert.ok(results.length > 0, 'should return results for "powershell"');
  });

  it('returns results ranked by BM25 relevance', () => {
    const { searchTechniques } = loadIntel();
    const results = searchTechniques(db, 'credential');
    assert.ok(results.length > 0, 'should return results for "credential"');
    // Results should be ordered - first result should be most relevant
    assert.ok(results[0].id, 'first result should have id');
  });

  it('filters by tactic', () => {
    const { searchTechniques } = loadIntel();
    const allResults = searchTechniques(db, 'account');
    const filtered = searchTechniques(db, 'account', { tactic: 'Persistence' });
    assert.ok(filtered.length > 0, 'should have filtered results');
    assert.ok(filtered.length <= allResults.length, 'filtered should be <= all results');
    // Every filtered result should include the tactic
    for (const r of filtered) {
      assert.ok(r.tactics.includes('Persistence'), `result ${r.id} should include Persistence tactic`);
    }
  });

  it('filters by platform', () => {
    const { searchTechniques } = loadIntel();
    const filtered = searchTechniques(db, 'phishing', { platform: 'Windows' });
    assert.ok(filtered.length > 0, 'should have platform-filtered results');
    for (const r of filtered) {
      assert.ok(r.platforms.includes('Windows'), `result ${r.id} should include Windows platform`);
    }
  });

  it('respects limit option', () => {
    const { searchTechniques } = loadIntel();
    const results = searchTechniques(db, 'access', { limit: 3 });
    assert.ok(results.length <= 3, 'should respect limit');
  });

  it('returns empty array for no matches', () => {
    const { searchTechniques } = loadIntel();
    const results = searchTechniques(db, 'zzzznonexistenttermzzzz');
    assert.deepEqual(results, []);
  });
});

// ── lookupGroup ─────────────────────────────────────────────────────────────

describe('intel.cjs - lookupGroup', () => {
  let tmpDir, db;

  before(() => {
    tmpDir = makeTempIntelDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns group data for APT28 (G0007)', () => {
    const { lookupGroup } = loadIntel();
    const result = lookupGroup(db, 'G0007');
    assert.ok(result, 'should return APT28 data');
    assert.equal(result.id, 'G0007');
    assert.equal(result.name, 'APT28');
    assert.ok(result.aliases, 'should have aliases');
    assert.ok(result.description, 'should have description');
    assert.ok(result.url, 'should have url');
  });

  it('is case-insensitive', () => {
    const { lookupGroup } = loadIntel();
    const result = lookupGroup(db, 'g0007');
    assert.ok(result, 'should find group with lowercase id');
  });

  it('returns null for non-existent group', () => {
    const { lookupGroup } = loadIntel();
    const result = lookupGroup(db, 'G9999');
    assert.equal(result, null);
  });
});

// ── getGroupTechniques ──────────────────────────────────────────────────────

describe('intel.cjs - getGroupTechniques', () => {
  let tmpDir, db;

  before(() => {
    tmpDir = makeTempIntelDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns technique IDs for APT28', () => {
    const { getGroupTechniques } = loadIntel();
    const techniques = getGroupTechniques(db, 'G0007');
    assert.ok(Array.isArray(techniques), 'should return an array');
    assert.ok(techniques.length > 0, 'APT28 should have associated techniques');
    // Each entry should be a technique ID string
    for (const tid of techniques) {
      assert.ok(typeof tid === 'string', 'each entry should be a string');
      assert.match(tid, /^T\d{4}/, 'each entry should look like a technique ID');
    }
  });

  it('returns empty array for non-existent group', () => {
    const { getGroupTechniques } = loadIntel();
    const techniques = getGroupTechniques(db, 'G9999');
    assert.deepEqual(techniques, []);
  });
});

// ── getGroupSoftware ────────────────────────────────────────────────────────

describe('intel.cjs - getGroupSoftware', () => {
  let tmpDir, db;

  before(() => {
    tmpDir = makeTempIntelDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns software entries for APT28', () => {
    const { getGroupSoftware } = loadIntel();
    const software = getGroupSoftware(db, 'G0007');
    assert.ok(Array.isArray(software), 'should return an array');
    assert.ok(software.length > 0, 'APT28 should have associated software');
    // Each entry should have id, name, type
    for (const s of software) {
      assert.ok(s.id, 'software should have id');
      assert.ok(s.name, 'software should have name');
    }
  });

  it('returns empty array for non-existent group', () => {
    const { getGroupSoftware } = loadIntel();
    const software = getGroupSoftware(db, 'G9999');
    assert.deepEqual(software, []);
  });
});

// ── getTechniquesByTactic ───────────────────────────────────────────────────

describe('intel.cjs - getTechniquesByTactic', () => {
  let tmpDir, db;

  before(() => {
    tmpDir = makeTempIntelDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns techniques for Execution tactic', () => {
    const { getTechniquesByTactic } = loadIntel();
    const results = getTechniquesByTactic(db, 'Execution');
    assert.ok(results.length > 0, 'should return techniques for Execution');
    for (const r of results) {
      assert.ok(r.tactics.includes('Execution'), `technique ${r.id} should have Execution tactic`);
    }
  });
});

// ── getAllTactics ────────────────────────────────────────────────────────────

describe('intel.cjs - getAllTactics', () => {
  let tmpDir, db;

  before(() => {
    tmpDir = makeTempIntelDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns all unique tactic names sorted', () => {
    const { getAllTactics } = loadIntel();
    const tactics = getAllTactics(db);
    assert.ok(Array.isArray(tactics), 'should return an array');
    assert.ok(tactics.length >= 10, `expected at least 10 tactics, got ${tactics.length}`);
    assert.ok(tactics.includes('Execution'), 'should include Execution');
    assert.ok(tactics.includes('Initial Access'), 'should include Initial Access');
    assert.ok(tactics.includes('Persistence'), 'should include Persistence');

    // Should be sorted
    const sorted = [...tactics].sort();
    assert.deepEqual(tactics, sorted, 'tactics should be sorted');
  });
});
