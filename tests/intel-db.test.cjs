'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

function makeTempIntelDir() {
  const dir = path.join(os.tmpdir(), `thrunt-intel-test-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let intel;
function loadIntel() {
  if (!intel) intel = require('../mcp-hunt-intel/lib/intel.cjs');
  return intel;
}

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
    assert.ok(db);

    const dbPath = path.join(tmpDir, 'intel.db');
    assert.ok(fs.existsSync(dbPath));
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

    assert.ok(tables.includes('techniques'));
    assert.ok(tables.includes('techniques_fts'));
    assert.ok(tables.includes('groups'));
    assert.ok(tables.includes('group_techniques'));
    assert.ok(tables.includes('group_software'));
    assert.ok(tables.includes('software'));
    assert.ok(tables.includes('software_techniques'));
    assert.ok(tables.includes('detections'));
    assert.ok(tables.includes('detections_fts'));
    db.close();
  });

  it('accepts custom dbPath override', () => {
    const { openIntelDb } = loadIntel();
    const customPath = path.join(tmpDir, 'custom.db');
    const db = openIntelDb({ dbDir: tmpDir, dbPath: customPath });
    assert.ok(fs.existsSync(customPath));
    db.close();
  });
});

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
    assert.ok(count > 0);
  });

  it('populates group_software junction table', () => {
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM group_software').get().cnt;
    assert.ok(count > 0);
  });

  it('populates software table from mitre-attack-groups.json', () => {
    const softwareCount = db.prepare('SELECT COUNT(*) AS cnt FROM software').get().cnt;
    assert.ok(softwareCount >= 10, `expected at least 10 software, got ${softwareCount}`);
  });

  it('populates software_techniques junction table', () => {
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM software_techniques').get().cnt;
    assert.ok(count > 0);
  });

  it('is idempotent - second openIntelDb call does not duplicate rows', () => {
    const countBefore = db.prepare('SELECT COUNT(*) AS cnt FROM techniques').get().cnt;

    const { openIntelDb } = loadIntel();
    const db2 = openIntelDb({ dbDir: tmpDir });
    const countAfter = db2.prepare('SELECT COUNT(*) AS cnt FROM techniques').get().cnt;

    assert.equal(countBefore, countAfter);
    db2.close();
  });

  it('stores technique URLs in correct format', () => {
    const row = db.prepare("SELECT url FROM techniques WHERE id = 'T1059'").get();
    assert.ok(row);
    assert.ok(row.url.includes('attack.mitre.org/techniques/T1059'));
  });

  it('stores sub-technique URLs in correct format', () => {
    const row = db.prepare("SELECT url FROM techniques WHERE id = 'T1059.001'").get();
    assert.ok(row);
    assert.ok(row.url.includes('attack.mitre.org/techniques/T1059/001'));
  });
});

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
    assert.ok(result);
    assert.equal(result.id, 'T1059');
    assert.equal(result.name, 'Command and Scripting Interpreter');
    assert.ok(result.description);
    assert.ok(result.tactics);
    assert.ok(result.platforms);
    assert.ok(result.data_sources);
    assert.ok(result.url);
  });

  it('returns a sub-technique by ID with parent context', () => {
    const { lookupTechnique } = loadIntel();
    const result = lookupTechnique(db, 'T1059.001');
    assert.ok(result);
    assert.equal(result.id, 'T1059.001');
    assert.ok(result.name);
  });

  it('is case-insensitive', () => {
    const { lookupTechnique } = loadIntel();
    const result = lookupTechnique(db, 't1059');
    assert.ok(result);
    assert.equal(result.id, 'T1059');
  });

  it('returns null for non-existent technique', () => {
    const { lookupTechnique } = loadIntel();
    const result = lookupTechnique(db, 'T9999');
    assert.equal(result, null);
  });
});

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
    assert.ok(results.length > 0);
  });

  it('returns results ranked by BM25 relevance', () => {
    const { searchTechniques } = loadIntel();
    const results = searchTechniques(db, 'credential');
    assert.ok(results.length > 0);
    assert.ok(results[0].id);
  });

  it('filters by tactic', () => {
    const { searchTechniques } = loadIntel();
    const allResults = searchTechniques(db, 'account');
    const filtered = searchTechniques(db, 'account', { tactic: 'Persistence' });
    assert.ok(filtered.length > 0);
    assert.ok(filtered.length <= allResults.length);
    for (const r of filtered) {
      assert.ok(r.tactics.includes('Persistence'), `result ${r.id} should include Persistence tactic`);
    }
  });

  it('filters by platform', () => {
    const { searchTechniques } = loadIntel();
    const filtered = searchTechniques(db, 'phishing', { platform: 'Windows' });
    assert.ok(filtered.length > 0);
    for (const r of filtered) {
      assert.ok(r.platforms.includes('Windows'), `result ${r.id} should include Windows platform`);
    }
  });

  it('respects limit option', () => {
    const { searchTechniques } = loadIntel();
    const results = searchTechniques(db, 'access', { limit: 3 });
    assert.ok(results.length <= 3);
  });

  it('returns empty array for no matches', () => {
    const { searchTechniques } = loadIntel();
    const results = searchTechniques(db, 'zzzznonexistenttermzzzz');
    assert.deepEqual(results, []);
  });
});

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
    assert.ok(result);
    assert.equal(result.id, 'G0007');
    assert.equal(result.name, 'APT28');
    assert.ok(result.aliases);
    assert.ok(result.description);
    assert.ok(result.url);
  });

  it('is case-insensitive', () => {
    const { lookupGroup } = loadIntel();
    const result = lookupGroup(db, 'g0007');
    assert.ok(result);
  });

  it('returns null for non-existent group', () => {
    const { lookupGroup } = loadIntel();
    const result = lookupGroup(db, 'G9999');
    assert.equal(result, null);
  });
});

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
    assert.ok(Array.isArray(techniques));
    assert.ok(techniques.length > 0);
    for (const tid of techniques) {
      assert.ok(typeof tid === 'string');
      assert.match(tid, /^T\d{4}/, 'each entry should look like a technique ID');
    }
  });

  it('returns empty array for non-existent group', () => {
    const { getGroupTechniques } = loadIntel();
    const techniques = getGroupTechniques(db, 'G9999');
    assert.deepEqual(techniques, []);
  });
});

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
    assert.ok(Array.isArray(software));
    assert.ok(software.length > 0);
    for (const s of software) {
      assert.ok(s.id);
      assert.ok(s.name);
    }
  });

  it('returns empty array for non-existent group', () => {
    const { getGroupSoftware } = loadIntel();
    const software = getGroupSoftware(db, 'G9999');
    assert.deepEqual(software, []);
  });
});

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
    assert.ok(results.length > 0);
    for (const r of results) {
      assert.ok(r.tactics.includes('Execution'), `technique ${r.id} should have Execution tactic`);
    }
  });
});

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
    assert.ok(Array.isArray(tactics));
    assert.ok(tactics.length >= 10, `expected at least 10 tactics, got ${tactics.length}`);
    assert.ok(tactics.includes('Execution'));
    assert.ok(tactics.includes('Initial Access'));
    assert.ok(tactics.includes('Persistence'));

    const sorted = [...tactics].sort();
    assert.deepEqual(tactics, sorted);
  });
});
