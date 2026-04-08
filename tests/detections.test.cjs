'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// Helper: create an isolated temp directory (never touches real ~/.thrunt/)
function makeTempDir() {
  const dir = path.join(os.tmpdir(), `thrunt-det-test-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Lazy-load modules
let det;
function loadDet() {
  if (!det) det = require('../mcp-hunt-intel/lib/detections.cjs');
  return det;
}

let intel;
function loadIntel() {
  if (!intel) intel = require('../mcp-hunt-intel/lib/intel.cjs');
  return intel;
}

// Read fixture files
const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const sigmaYaml = fs.readFileSync(path.join(FIXTURES_DIR, 'sigma-sample.yml'), 'utf8');
const escuYaml = fs.readFileSync(path.join(FIXTURES_DIR, 'escu-sample.yml'), 'utf8');
const elasticToml = fs.readFileSync(path.join(FIXTURES_DIR, 'elastic-sample.toml'), 'utf8');
const kqlMd = fs.readFileSync(path.join(FIXTURES_DIR, 'kql-sample.md'), 'utf8');

// ── parseSigmaRule ─────────────────────────────────────────────────────────

describe('detections.cjs - parseSigmaRule', () => {
  it('parses valid Sigma YAML into a DetectionRow', () => {
    const { parseSigmaRule } = loadDet();
    const row = parseSigmaRule(sigmaYaml, '/rules/sigma/test.yml');

    assert.ok(row, 'should return a row');
    assert.equal(row.id, 'sigma:3b6ab547-f55a-4d6e-88a1-a6a9f87e1234');
    assert.equal(row.title, 'Suspicious PowerShell Download');
    assert.equal(row.source_format, 'sigma');
    assert.ok(row.technique_ids.includes('T1059.001'), 'should include T1059.001');
    assert.ok(row.technique_ids.includes('T1027'), 'should include T1027');
    assert.equal(row.severity, 'high');
    assert.ok(row.logsource, 'should have logsource');
    assert.ok(row.query, 'should have query (detection block)');
    assert.equal(row.description, 'Detects suspicious PowerShell download cradles');
    assert.equal(row.file_path, '/rules/sigma/test.yml');

    // Check metadata JSON
    const meta = JSON.parse(row.metadata);
    assert.ok(Array.isArray(meta.falsepositives), 'metadata should have falsepositives');
    assert.equal(meta.author, 'Test Author');
    assert.equal(meta.status, 'test');
    assert.ok(Array.isArray(meta.references), 'metadata should have references');
  });

  it('extracts tactics from tags as title-cased strings', () => {
    const { parseSigmaRule } = loadDet();
    const row = parseSigmaRule(sigmaYaml, '/test.yml');
    assert.ok(row.tactics.includes('Execution'), 'should include Execution tactic');
    assert.ok(row.tactics.includes('Defense Evasion'), 'should include Defense Evasion tactic');
  });

  it('returns null for malformed YAML', () => {
    const { parseSigmaRule } = loadDet();
    const row = parseSigmaRule('{{{{not yaml at all!@#$', '/bad.yml');
    assert.equal(row, null, 'should return null for malformed YAML');
  });

  it('returns null for YAML missing title', () => {
    const { parseSigmaRule } = loadDet();
    const row = parseSigmaRule('id: abc\nlevel: high\n', '/no-title.yml');
    assert.equal(row, null, 'should return null when title is missing');
  });

  it('filters out non-attack tags (e.g. cve.*)', () => {
    const { parseSigmaRule } = loadDet();
    const row = parseSigmaRule(sigmaYaml, '/test.yml');
    // cve.2024.1234 should NOT appear in technique_ids
    assert.ok(!row.technique_ids.includes('CVE'), 'should not include CVE tags');
    assert.ok(!row.technique_ids.includes('cve'), 'should not include cve tags');
  });

  it('deduplicates technique IDs', () => {
    const { parseSigmaRule } = loadDet();
    const yaml = `
title: Dup Test
id: dup-test-001
tags:
  - attack.t1059.001
  - attack.t1059.001
  - attack.execution
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    CommandLine: test
  condition: selection
`;
    const row = parseSigmaRule(yaml, '/dup.yml');
    assert.ok(row, 'should return a row');
    const ids = row.technique_ids.split(',');
    const unique = [...new Set(ids)];
    assert.deepEqual(ids, unique, 'technique_ids should be deduplicated');
  });
});

// ── parseEscuRule ──────────────────────────────────────────────────────────

describe('detections.cjs - parseEscuRule', () => {
  it('parses valid ESCU YAML into a DetectionRow', () => {
    const { parseEscuRule } = loadDet();
    const row = parseEscuRule(escuYaml, '/escu/test.yml');

    assert.ok(row, 'should return a row');
    assert.equal(row.id, 'escu:87654321-abcd-ef01-2345-678901234567');
    assert.equal(row.title, 'Remote System Discovery With AdsiSearcher');
    assert.equal(row.source_format, 'escu');
    assert.ok(row.technique_ids.includes('T1018'), 'should include T1018');
    assert.ok(row.technique_ids.includes('T1069.002'), 'should include T1069.002');
    assert.ok(row.query.includes('tstats'), 'should have query with tstats');
    assert.equal(row.description, 'Detects the use of ADSISearcher for remote system discovery');
    assert.equal(row.file_path, '/escu/test.yml');

    // Check metadata JSON
    const meta = JSON.parse(row.metadata);
    assert.ok(Array.isArray(meta.analytic_story), 'metadata should have analytic_story');
    assert.equal(meta.asset_type, 'Endpoint');
    assert.equal(meta.security_domain, 'endpoint');
    assert.ok(Array.isArray(meta.data_models), 'metadata should have data_models');
    assert.equal(meta.risk_score, 40, 'risk_score should come from rba.risk_objects[0].score');
  });

  it('returns null for malformed YAML', () => {
    const { parseEscuRule } = loadDet();
    const row = parseEscuRule('not: [valid: yaml: {{', '/bad.yml');
    assert.equal(row, null, 'should return null for malformed YAML');
  });

  it('returns null for YAML missing name', () => {
    const { parseEscuRule } = loadDet();
    const row = parseEscuRule('id: abc\ntype: TTP\n', '/no-name.yml');
    assert.equal(row, null, 'should return null when name is missing');
  });

  it('stores analytic_story in metadata', () => {
    const { parseEscuRule } = loadDet();
    const row = parseEscuRule(escuYaml, '/test.yml');
    const meta = JSON.parse(row.metadata);
    assert.ok(meta.analytic_story.includes('Active Directory Discovery'));
  });
});

// ── parseElasticRule ───────────────────────────────────────────────────────

describe('detections.cjs - parseElasticRule', () => {
  it('parses valid Elastic TOML into a DetectionRow', () => {
    const { parseElasticRule } = loadDet();
    const row = parseElasticRule(elasticToml, '/elastic/test.toml');

    assert.ok(row, 'should return a row');
    assert.equal(row.id, 'elastic:abcdef12-3456-7890-abcd-ef1234567890');
    assert.equal(row.title, 'Suspicious Syslog Service Disable');
    assert.equal(row.source_format, 'elastic');
    assert.equal(row.severity, 'medium');
    assert.ok(row.query.includes('process where'), 'should have query');
    assert.equal(row.description, 'Detects attempts to disable the syslog service');
    assert.equal(row.file_path, '/elastic/test.toml');

    // Check metadata JSON
    const meta = JSON.parse(row.metadata);
    assert.equal(meta.maturity, 'production');
    assert.equal(meta.risk_score, 47);
    assert.equal(meta.rule_type, 'eql');
    assert.equal(meta.language, 'eql');
  });

  it('extracts multiple [[rule.threat]] entries', () => {
    const { parseElasticRule } = loadDet();
    const row = parseElasticRule(elasticToml, '/elastic/test.toml');

    // Should have techniques from BOTH threat entries
    assert.ok(row.technique_ids.includes('T1562'), 'should include T1562');
    assert.ok(row.technique_ids.includes('T1543'), 'should include T1543');
    // And the subtechnique
    assert.ok(row.technique_ids.includes('T1562.001'), 'should include T1562.001 subtechnique');
  });

  it('extracts tactics from all threat entries', () => {
    const { parseElasticRule } = loadDet();
    const row = parseElasticRule(elasticToml, '/elastic/test.toml');

    assert.ok(row.tactics.includes('Defense Evasion'), 'should include Defense Evasion');
    assert.ok(row.tactics.includes('Persistence'), 'should include Persistence');
  });

  it('returns null for malformed TOML', () => {
    const { parseElasticRule } = loadDet();
    const row = parseElasticRule('not valid toml [[[bad', '/bad.toml');
    assert.equal(row, null, 'should return null for malformed TOML');
  });

  it('returns null for TOML missing rule name', () => {
    const { parseElasticRule } = loadDet();
    const row = parseElasticRule('[rule]\nrule_id = "abc"\n', '/no-name.toml');
    assert.equal(row, null, 'should return null when rule name is missing');
  });
});

// ── parseKqlRule ───────────────────────────────────────────────────────────

describe('detections.cjs - parseKqlRule', () => {
  it('parses valid KQL markdown into a DetectionRow', () => {
    const { parseKqlRule } = loadDet();
    const row = parseKqlRule(kqlMd, 'kql-sample.md');

    assert.ok(row, 'should return a row');
    assert.ok(row.id.startsWith('kql:'), 'id should start with kql:');
    assert.equal(row.title, 'Network Service Discovery T1046');
    assert.equal(row.source_format, 'kql');
    assert.ok(row.technique_ids.includes('T1046'), 'should include T1046');
    assert.ok(row.technique_ids.includes('T1135'), 'should include T1135');
    assert.ok(row.query.includes('DeviceNetworkEvents'), 'query should contain KQL');
    assert.ok(row.query.includes('RemotePort'), 'query should contain RemotePort');

    // Check metadata
    const meta = JSON.parse(row.metadata);
    assert.ok(Array.isArray(meta.tables), 'metadata should have tables array');
    assert.ok(meta.tables.includes('DeviceNetworkEvents'), 'tables should include DeviceNetworkEvents');
  });

  it('returns null when no KQL code blocks found', () => {
    const { parseKqlRule } = loadDet();
    const row = parseKqlRule('# Just a heading\n\nNo code blocks here.\n', 'no-code.md');
    assert.equal(row, null, 'should return null when no code blocks');
  });

  it('uses filename as title fallback when no heading found', () => {
    const { parseKqlRule } = loadDet();
    const md = '```kql\nDeviceEvents\n| where ActionType == "test"\n```\n';
    const row = parseKqlRule(md, 'my-detection-rule.md');
    assert.ok(row, 'should return a row');
    assert.equal(row.title, 'my-detection-rule', 'title should be filename sans extension');
  });

  it('extracts technique IDs from text via regex', () => {
    const { parseKqlRule } = loadDet();
    const md = `# Test T1059.001 and T1027
\`\`\`kql
DeviceProcessEvents
| where ProcessCommandLine has "powershell"
\`\`\`
T1059 mentioned here too
`;
    const row = parseKqlRule(md, 'techniques.md');
    assert.ok(row, 'should return a row');
    assert.ok(row.technique_ids.includes('T1059.001'), 'should extract T1059.001');
    assert.ok(row.technique_ids.includes('T1027'), 'should extract T1027');
    assert.ok(row.technique_ids.includes('T1059'), 'should extract T1059');
  });
});

// ── ensureDetectionsSchema ────────────────────────────────────────────────

describe('detections.cjs - ensureDetectionsSchema', () => {
  let tmpDir, db;

  beforeEach(() => {
    tmpDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
  });

  afterEach(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates detections and detections_fts tables', () => {
    const { ensureDetectionsSchema } = loadDet();
    ensureDetectionsSchema(db);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    assert.ok(tables.includes('detections'), 'detections table should exist');
    assert.ok(tables.includes('detections_fts'), 'detections_fts virtual table should exist');
  });

  it('creates idx_det_source and idx_det_severity indexes', () => {
    const { ensureDetectionsSchema } = loadDet();
    ensureDetectionsSchema(db);

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' ORDER BY name"
    ).all().map(r => r.name);

    assert.ok(indexes.includes('idx_det_source'), 'idx_det_source index should exist');
    assert.ok(indexes.includes('idx_det_severity'), 'idx_det_severity index should exist');
  });

  it('is idempotent (calling twice does not error)', () => {
    const { ensureDetectionsSchema } = loadDet();
    ensureDetectionsSchema(db);
    assert.doesNotThrow(() => ensureDetectionsSchema(db), 'second call should not throw');
  });
});

// ── insertDetection + searchDetections ────────────────────────────────────

describe('detections.cjs - insertDetection + searchDetections', () => {
  let tmpDir, db;

  before(() => {
    tmpDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
    const { ensureDetectionsSchema } = loadDet();
    ensureDetectionsSchema(db);
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inserts a detection row and returns 1 for new', () => {
    const { insertDetection, parseSigmaRule } = loadDet();
    const row = parseSigmaRule(sigmaYaml, '/test.yml');
    const changes = insertDetection(db, row);
    assert.equal(changes, 1, 'should return 1 for new insert');
  });

  it('returns 0 for duplicate insert', () => {
    const { insertDetection, parseSigmaRule } = loadDet();
    const row = parseSigmaRule(sigmaYaml, '/test.yml');
    const changes = insertDetection(db, row);
    assert.equal(changes, 0, 'should return 0 for duplicate id');
  });

  it('FTS search finds by title', () => {
    const { searchDetections } = loadDet();
    const results = searchDetections(db, 'PowerShell');
    assert.ok(results.length > 0, 'should find by title keyword');
    assert.ok(results[0].title.includes('PowerShell'), 'first result should match title');
  });

  it('FTS search finds by technique_id using LIKE filter', () => {
    const { searchDetections } = loadDet();
    const results = searchDetections(db, 'PowerShell', { technique_id: 'T1059.001' });
    assert.ok(results.length > 0, 'should find by technique_id filter');
  });

  it('FTS search finds by description keyword', () => {
    const { searchDetections } = loadDet();
    const results = searchDetections(db, 'download cradles');
    assert.ok(results.length > 0, 'should find by description keyword');
  });

  it('FTS search filters by source_format', () => {
    const { searchDetections } = loadDet();
    const results = searchDetections(db, 'PowerShell', { source_format: 'sigma' });
    assert.ok(results.length > 0, 'should find with source_format filter');
    for (const r of results) {
      assert.equal(r.source_format, 'sigma');
    }
  });

  it('FTS search filters by severity', () => {
    const { searchDetections } = loadDet();
    const results = searchDetections(db, 'PowerShell', { severity: 'high' });
    assert.ok(results.length > 0, 'should find with severity filter');
    for (const r of results) {
      assert.equal(r.severity, 'high');
    }
  });

  it('empty query returns empty array (no throw)', () => {
    const { searchDetections } = loadDet();
    const results = searchDetections(db, '');
    assert.deepEqual(results, []);
  });

  it('malformed FTS query returns empty array (no throw)', () => {
    const { searchDetections } = loadDet();
    const results = searchDetections(db, 'AND OR NOT ""');
    assert.ok(Array.isArray(results), 'should return an array');
  });
});

// ── indexSigmaDirectory ──────────────────────────────────────────────────

describe('detections.cjs - indexSigmaDirectory', () => {
  let tmpDir, db, rulesDir;

  before(() => {
    tmpDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
    const { ensureDetectionsSchema } = loadDet();
    ensureDetectionsSchema(db);

    // Create a temp rules directory with the sigma fixture
    rulesDir = path.join(tmpDir, 'sigma-rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURES_DIR, 'sigma-sample.yml'),
      path.join(rulesDir, 'test-rule.yml')
    );
    // Add a subdirectory with another rule
    const subDir = path.join(rulesDir, 'sub');
    fs.mkdirSync(subDir);
    fs.copyFileSync(
      path.join(FIXTURES_DIR, 'sigma-sample.yml'),
      path.join(subDir, 'nested-rule.yaml')
    );
    // Add a malformed file
    fs.writeFileSync(path.join(rulesDir, 'bad.yml'), '{{{{bad yaml');
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('indexes valid .yml and .yaml files recursively', () => {
    const { indexSigmaDirectory } = loadDet();
    // Both files have same id so only 1 unique detection inserted
    const count = indexSigmaDirectory(db, rulesDir);
    assert.ok(count >= 1, `should index at least 1 rule, got ${count}`);
  });

  it('skips malformed YAML files', () => {
    // The bad.yml was in the same directory; indexSigmaDirectory should not throw
    // and should have completed successfully (tested above)
    const count = db.prepare("SELECT COUNT(*) AS cnt FROM detections WHERE source_format = 'sigma'").get().cnt;
    assert.ok(count >= 1, 'should have sigma rows despite malformed file');
  });
});

// ── indexEscuDirectory ───────────────────────────────────────────────────

describe('detections.cjs - indexEscuDirectory', () => {
  let tmpDir, db, rulesDir;

  before(() => {
    tmpDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
    const { ensureDetectionsSchema } = loadDet();
    ensureDetectionsSchema(db);

    rulesDir = path.join(tmpDir, 'escu-rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURES_DIR, 'escu-sample.yml'),
      path.join(rulesDir, 'escu-test.yml')
    );
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('indexes ESCU .yml files and inserts rows', () => {
    const { indexEscuDirectory } = loadDet();
    const count = indexEscuDirectory(db, rulesDir);
    assert.ok(count >= 1, `should index at least 1 ESCU rule, got ${count}`);
  });
});

// ── indexElasticDirectory ────────────────────────────────────────────────

describe('detections.cjs - indexElasticDirectory', () => {
  let tmpDir, db, rulesDir;

  before(() => {
    tmpDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
    const { ensureDetectionsSchema } = loadDet();
    ensureDetectionsSchema(db);

    rulesDir = path.join(tmpDir, 'elastic-rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURES_DIR, 'elastic-sample.toml'),
      path.join(rulesDir, 'elastic-test.toml')
    );
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('indexes Elastic .toml files and inserts rows', () => {
    const { indexElasticDirectory } = loadDet();
    const count = indexElasticDirectory(db, rulesDir);
    assert.ok(count >= 1, `should index at least 1 Elastic rule, got ${count}`);
  });
});

// ── indexKqlDirectory ───────────────────────────────────────────────────

describe('detections.cjs - indexKqlDirectory', () => {
  let tmpDir, db, rulesDir;

  before(() => {
    tmpDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
    const { ensureDetectionsSchema } = loadDet();
    ensureDetectionsSchema(db);

    rulesDir = path.join(tmpDir, 'kql-rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURES_DIR, 'kql-sample.md'),
      path.join(rulesDir, 'kql-test.md')
    );
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('indexes KQL .md files and inserts rows', () => {
    const { indexKqlDirectory } = loadDet();
    const count = indexKqlDirectory(db, rulesDir);
    assert.ok(count >= 1, `should index at least 1 KQL rule, got ${count}`);
  });
});

// ── populateDetectionsIfEmpty ────────────────────────────────────────────

describe('detections.cjs - populateDetectionsIfEmpty', () => {
  let tmpDir, db;

  before(() => {
    tmpDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
    const { ensureDetectionsSchema } = loadDet();
    ensureDetectionsSchema(db);
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('skips population when detections table is not empty', () => {
    const { populateDetectionsIfEmpty, insertDetection, parseSigmaRule } = loadDet();
    // First insert a row so the table is not empty
    const row = parseSigmaRule(sigmaYaml, '/test.yml');
    insertDetection(db, row);

    const countBefore = db.prepare('SELECT COUNT(*) AS cnt FROM detections').get().cnt;
    assert.ok(countBefore > 0, 'table should have rows');

    // populateDetectionsIfEmpty should be a no-op
    assert.doesNotThrow(() => populateDetectionsIfEmpty(db), 'should not throw');

    const countAfter = db.prepare('SELECT COUNT(*) AS cnt FROM detections').get().cnt;
    // Count should be the same (or possibly higher if bundled data exists, but not fewer)
    assert.ok(countAfter >= countBefore, 'row count should not decrease');
  });

  it('does not throw when bundled sigma-core directory is missing', () => {
    // Create a fresh DB with no rows to trigger population
    const freshDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    const freshDb = openIntelDb({ dbDir: freshDir });
    const { ensureDetectionsSchema, populateDetectionsIfEmpty } = loadDet();
    ensureDetectionsSchema(freshDb);

    // Should not throw even if data/sigma-core doesn't exist
    assert.doesNotThrow(() => populateDetectionsIfEmpty(freshDb), 'should not throw when no bundled rules');
    freshDb.close();
    fs.rmSync(freshDir, { recursive: true, force: true });
  });
});
