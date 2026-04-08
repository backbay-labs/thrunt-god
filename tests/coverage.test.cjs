'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

function makeTempDir() {
  const dir = path.join(os.tmpdir(), `thrunt-coverage-test-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let intel, coverage;
function loadIntel() {
  if (!intel) intel = require('../mcp-hunt-intel/lib/intel.cjs');
  return intel;
}
function loadCoverage() {
  if (!coverage) coverage = require('../mcp-hunt-intel/lib/coverage.cjs');
  return coverage;
}

describe('THREAT_PROFILES constant', () => {
  it('is an object with exactly 6 keys', () => {
    const { THREAT_PROFILES } = loadCoverage();
    assert.ok(typeof THREAT_PROFILES === 'object' && THREAT_PROFILES !== null);
    const keys = Object.keys(THREAT_PROFILES);
    assert.equal(keys.length, 6, `expected 6 profiles, got ${keys.length}: ${keys.join(', ')}`);
  });

  it('has keys: ransomware, apt, initial-access, persistence, credential-access, defense-evasion', () => {
    const { THREAT_PROFILES } = loadCoverage();
    const expected = ['ransomware', 'apt', 'initial-access', 'persistence', 'credential-access', 'defense-evasion'];
    for (const key of expected) {
      assert.ok(key in THREAT_PROFILES, `missing profile key: ${key}`);
    }
  });

  it('each profile value is a non-empty array of technique ID strings', () => {
    const { THREAT_PROFILES } = loadCoverage();
    for (const [name, ids] of Object.entries(THREAT_PROFILES)) {
      assert.ok(Array.isArray(ids), `${name} should be an array`);
      assert.ok(ids.length > 0, `${name} should be non-empty`);
      for (const id of ids) {
        assert.match(id, /^T\d{4}(\.\d{3})?$/, `${name} contains invalid technique ID: ${id}`);
      }
    }
  });

  it('ransomware profile includes T1486 and T1490', () => {
    const { THREAT_PROFILES } = loadCoverage();
    assert.ok(THREAT_PROFILES.ransomware.includes('T1486'), 'ransomware missing T1486 (Data Encrypted for Impact)');
    assert.ok(THREAT_PROFILES.ransomware.includes('T1490'), 'ransomware missing T1490 (Inhibit System Recovery)');
  });

  it('apt profile includes T1566 and T1059', () => {
    const { THREAT_PROFILES } = loadCoverage();
    assert.ok(THREAT_PROFILES.apt.includes('T1566'), 'apt missing T1566 (Phishing)');
    assert.ok(THREAT_PROFILES.apt.includes('T1059'), 'apt missing T1059 (Command and Scripting Interpreter)');
  });

  it('initial-access profile techniques all exist in the techniques table', () => {
    const tmpDir = makeTempDir();
    try {
      const { openIntelDb } = loadIntel();
      const db = openIntelDb({ dbDir: tmpDir });
      const { THREAT_PROFILES } = loadCoverage();

      for (const tid of THREAT_PROFILES['initial-access']) {
        const row = db.prepare('SELECT id FROM techniques WHERE id = ?').get(tid);
        assert.ok(row, `initial-access technique ${tid} not found in techniques table`);
      }
      db.close();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('getThreatProfile', () => {
  it('returns the ransomware technique ID array', () => {
    const { getThreatProfile, THREAT_PROFILES } = loadCoverage();
    const result = getThreatProfile('ransomware');
    assert.deepEqual(result, THREAT_PROFILES.ransomware);
  });

  it('is case-insensitive (RANSOMWARE returns same)', () => {
    const { getThreatProfile } = loadCoverage();
    const lower = getThreatProfile('ransomware');
    const upper = getThreatProfile('RANSOMWARE');
    assert.deepEqual(upper, lower);
  });

  it('returns null for nonexistent profile', () => {
    const { getThreatProfile } = loadCoverage();
    assert.equal(getThreatProfile('nonexistent'), null);
  });

  it('returns null for empty string', () => {
    const { getThreatProfile } = loadCoverage();
    assert.equal(getThreatProfile(''), null);
  });
});

describe('listThreatProfiles', () => {
  it('returns array of 6 strings matching THREAT_PROFILES keys', () => {
    const { listThreatProfiles, THREAT_PROFILES } = loadCoverage();
    const result = listThreatProfiles();
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 6);
    for (const name of result) {
      assert.ok(name in THREAT_PROFILES, `${name} is not a valid profile key`);
    }
  });
});

describe('compareDetections', () => {
  let db, tmpDir;

  before(() => {
    tmpDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });

    db.prepare(`INSERT OR IGNORE INTO detections (id, title, source_format, technique_ids, tactics, severity, logsource, query, description, metadata, file_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'sigma:test-t1059-1', 'Sigma Powershell Execution', 'sigma', 'T1059,T1059.001', 'Execution', 'high', '{}', 'detect powershell', 'Test sigma rule', '{}', 'test/sigma1.yml'
    );
    db.prepare(`INSERT INTO detections_fts (title, description, query, technique_ids) VALUES (?, ?, ?, ?)`).run(
      'Sigma Powershell Execution', 'Test sigma rule', 'detect powershell', 'T1059,T1059.001'
    );

    db.prepare(`INSERT OR IGNORE INTO detections (id, title, source_format, technique_ids, tactics, severity, logsource, query, description, metadata, file_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'elastic:test-t1059-2', 'Elastic Script Execution', 'elastic', 'T1059', 'Execution', 'medium', 'logs-*', 'process where', 'Test elastic rule', '{}', 'test/elastic1.toml'
    );
    db.prepare(`INSERT INTO detections_fts (title, description, query, technique_ids) VALUES (?, ?, ?, ?)`).run(
      'Elastic Script Execution', 'Test elastic rule', 'process where', 'T1059'
    );

    db.prepare(`INSERT OR IGNORE INTO detections (id, title, source_format, technique_ids, tactics, severity, logsource, query, description, metadata, file_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'sigma:test-t1078-1', 'Valid Accounts Usage', 'sigma', 'T1078', 'Persistence', 'medium', '{}', 'detect valid accounts', 'Test sigma rule', '{}', 'test/sigma2.yml'
    );
    db.prepare(`INSERT INTO detections_fts (title, description, query, technique_ids) VALUES (?, ?, ?, ?)`).run(
      'Valid Accounts Usage', 'Test sigma rule', 'detect valid accounts', 'T1078'
    );
  });

  after(() => {
    if (db) db.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns per-source breakdown for technique T1059', () => {
    const { compareDetections } = loadCoverage();
    const result = compareDetections(db, 'T1059');

    assert.ok(result);
    assert.equal(result.technique_id, 'T1059');
    assert.ok(result.technique_name);
    assert.ok(Array.isArray(result.sources));
    assert.ok(typeof result.source_count === 'number');
  });

  it('sources array groups rules by source_format', () => {
    const { compareDetections } = loadCoverage();
    const result = compareDetections(db, 'T1059');

    const sigmaEntries = result.sources.filter(s => s.format === 'sigma');
    assert.ok(sigmaEntries.length > 0);
    for (const entry of sigmaEntries) {
      assert.equal(entry.format, 'sigma');
      assert.ok(entry.rule_id);
      assert.ok(entry.title);
    }
  });

  it('source_count equals distinct source_format count', () => {
    const { compareDetections } = loadCoverage();
    const result = compareDetections(db, 'T1059');

    const formats = new Set(result.sources.map(s => s.format));
    assert.equal(result.source_count, formats.size);
    assert.equal(result.source_count, 2);
  });

  it('returns empty sources for technique with no detections', () => {
    const { compareDetections } = loadCoverage();
    const result = compareDetections(db, 'T1199');

    assert.ok(result);
    assert.equal(result.technique_id, 'T1199');
    assert.deepEqual(result.sources, []);
    assert.equal(result.source_count, 0);
  });

  it('accepts free-text query via FTS', () => {
    const { compareDetections } = loadCoverage();
    const result = compareDetections(db, 'powershell execution');

    assert.ok(result);
  });
});

describe('suggestDetections', () => {
  let db, tmpDir;

  before(() => {
    tmpDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });

    db.prepare(`INSERT OR IGNORE INTO detections (id, title, source_format, technique_ids, tactics, severity, logsource, query, description, metadata, file_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'sigma:suggest-t1059', 'PowerShell Execution Detection', 'sigma', 'T1059', 'Execution', 'high', '{"product":"windows"}', 'detect powershell', 'Sigma detection for powershell', '{}', 'test/suggest-sigma.yml'
    );
    db.prepare(`INSERT INTO detections_fts (title, description, query, technique_ids) VALUES (?, ?, ?, ?)`).run(
      'PowerShell Execution Detection', 'Sigma detection for powershell', 'detect powershell', 'T1059'
    );
  });

  after(() => {
    if (db) db.close();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns suggestions for uncovered technique with tactic-family rules', () => {
    const { suggestDetections } = loadCoverage();
    const result = suggestDetections(db, 'T1047');

    assert.ok(result);
    assert.equal(result.technique_id, 'T1047');
    assert.ok(result.technique_name);
    assert.ok(result.tactic);
    assert.ok(result.suggestion_basis);
    assert.ok(Array.isArray(result.similar_rules));
    assert.ok(Array.isArray(result.data_sources));
  });

  it('similar_rules come from same-tactic techniques with detections', () => {
    const { suggestDetections } = loadCoverage();
    const result = suggestDetections(db, 'T1047');

    if (result.similar_rules.length > 0) {
      for (const rule of result.similar_rules) {
        assert.ok(rule.id);
        assert.ok(rule.title);
        assert.ok(rule.source_format);
      }
    }
  });

  it('data_sources extracted from technique data_sources field', () => {
    const { suggestDetections } = loadCoverage();
    const result = suggestDetections(db, 'T1047');

    assert.ok(Array.isArray(result.data_sources));
  });

  it('suggestion_basis describes why rules are relevant', () => {
    const { suggestDetections } = loadCoverage();
    const result = suggestDetections(db, 'T1047');

    assert.ok(typeof result.suggestion_basis === 'string');
    assert.ok(result.suggestion_basis.length > 0);
  });

  it('returns similar_rules even for technique with existing coverage', () => {
    const { suggestDetections } = loadCoverage();
    const result = suggestDetections(db, 'T1059');

    assert.ok(result);
    assert.equal(result.technique_id, 'T1059');
    assert.ok(Array.isArray(result.similar_rules));
  });
});
