'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

function makeTempDir() {
  const dir = path.join(os.tmpdir(), `thrunt-det-test-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let det;
function loadDet() {
  if (!det) det = require('../apps/mcp/lib/detections.cjs');
  return det;
}

let intel;
function loadIntel() {
  if (!intel) intel = require('../apps/mcp/lib/intel.cjs');
  return intel;
}

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const sigmaYaml = fs.readFileSync(path.join(FIXTURES_DIR, 'sigma-sample.yml'), 'utf8');
const escuYaml = fs.readFileSync(path.join(FIXTURES_DIR, 'escu-sample.yml'), 'utf8');
const elasticToml = fs.readFileSync(path.join(FIXTURES_DIR, 'elastic-sample.toml'), 'utf8');
const kqlMd = fs.readFileSync(path.join(FIXTURES_DIR, 'kql-sample.md'), 'utf8');

describe('detections.cjs - parseSigmaRule', () => {
  it('parses valid Sigma YAML into a DetectionRow', () => {
    const { parseSigmaRule } = loadDet();
    const row = parseSigmaRule(sigmaYaml, '/rules/sigma/test.yml');

    assert.ok(row);
    assert.equal(row.id, 'sigma:3b6ab547-f55a-4d6e-88a1-a6a9f87e1234');
    assert.equal(row.title, 'Suspicious PowerShell Download');
    assert.equal(row.source_format, 'sigma');
    assert.ok(row.technique_ids.includes('T1059.001'));
    assert.ok(row.technique_ids.includes('T1027'));
    assert.equal(row.severity, 'high');
    assert.ok(row.logsource);
    assert.ok(row.query);
    assert.equal(row.description, 'Detects suspicious PowerShell download cradles');
    assert.equal(row.file_path, '/rules/sigma/test.yml');

    const meta = JSON.parse(row.metadata);
    assert.ok(Array.isArray(meta.falsepositives));
    assert.equal(meta.author, 'Test Author');
    assert.equal(meta.status, 'test');
    assert.ok(Array.isArray(meta.references));
  });

  it('extracts tactics from tags as title-cased strings', () => {
    const { parseSigmaRule } = loadDet();
    const row = parseSigmaRule(sigmaYaml, '/test.yml');
    assert.ok(row.tactics.includes('Execution'));
    assert.ok(row.tactics.includes('Defense Evasion'));
  });

  it('returns null for malformed YAML', () => {
    const { parseSigmaRule } = loadDet();
    const row = parseSigmaRule('{{{{not yaml at all!@#$', '/bad.yml');
    assert.equal(row, null);
  });

  it('returns null for YAML missing title', () => {
    const { parseSigmaRule } = loadDet();
    const row = parseSigmaRule('id: abc\nlevel: high\n', '/no-title.yml');
    assert.equal(row, null);
  });

  it('filters out non-attack tags (e.g. cve.*)', () => {
    const { parseSigmaRule } = loadDet();
    const row = parseSigmaRule(sigmaYaml, '/test.yml');
    assert.ok(!row.technique_ids.includes('CVE'));
    assert.ok(!row.technique_ids.includes('cve'));
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
    assert.ok(row);
    const ids = row.technique_ids.split(',');
    const unique = [...new Set(ids)];
    assert.deepEqual(ids, unique);
  });
});

describe('detections.cjs - parseEscuRule', () => {
  it('parses valid ESCU YAML into a DetectionRow', () => {
    const { parseEscuRule } = loadDet();
    const row = parseEscuRule(escuYaml, '/escu/test.yml');

    assert.ok(row);
    assert.equal(row.id, 'escu:87654321-abcd-ef01-2345-678901234567');
    assert.equal(row.title, 'Remote System Discovery With AdsiSearcher');
    assert.equal(row.source_format, 'escu');
    assert.ok(row.technique_ids.includes('T1018'));
    assert.ok(row.technique_ids.includes('T1069.002'));
    assert.ok(row.query.includes('tstats'));
    assert.equal(row.description, 'Detects the use of ADSISearcher for remote system discovery');
    assert.equal(row.file_path, '/escu/test.yml');

    const meta = JSON.parse(row.metadata);
    assert.ok(Array.isArray(meta.analytic_story));
    assert.equal(meta.asset_type, 'Endpoint');
    assert.equal(meta.security_domain, 'endpoint');
    assert.ok(Array.isArray(meta.data_models));
    assert.equal(meta.risk_score, 40, 'risk_score should come from rba.risk_objects[0].score');
  });

  it('returns null for malformed YAML', () => {
    const { parseEscuRule } = loadDet();
    const row = parseEscuRule('not: [valid: yaml: {{', '/bad.yml');
    assert.equal(row, null);
  });

  it('returns null for YAML missing name', () => {
    const { parseEscuRule } = loadDet();
    const row = parseEscuRule('id: abc\ntype: TTP\n', '/no-name.yml');
    assert.equal(row, null);
  });

  it('stores analytic_story in metadata', () => {
    const { parseEscuRule } = loadDet();
    const row = parseEscuRule(escuYaml, '/test.yml');
    const meta = JSON.parse(row.metadata);
    assert.ok(meta.analytic_story.includes('Active Directory Discovery'));
  });
});

describe('detections.cjs - parseElasticRule', () => {
  it('parses valid Elastic TOML into a DetectionRow', () => {
    const { parseElasticRule } = loadDet();
    const row = parseElasticRule(elasticToml, '/elastic/test.toml');

    assert.ok(row);
    assert.equal(row.id, 'elastic:abcdef12-3456-7890-abcd-ef1234567890');
    assert.equal(row.title, 'Suspicious Syslog Service Disable');
    assert.equal(row.source_format, 'elastic');
    assert.equal(row.severity, 'medium');
    assert.ok(row.query.includes('process where'));
    assert.equal(row.description, 'Detects attempts to disable the syslog service');
    assert.equal(row.file_path, '/elastic/test.toml');

    const meta = JSON.parse(row.metadata);
    assert.equal(meta.maturity, 'production');
    assert.equal(meta.risk_score, 47);
    assert.equal(meta.rule_type, 'eql');
    assert.equal(meta.language, 'eql');
  });

  it('extracts multiple [[rule.threat]] entries', () => {
    const { parseElasticRule } = loadDet();
    const row = parseElasticRule(elasticToml, '/elastic/test.toml');

    assert.ok(row.technique_ids.includes('T1562'));
    assert.ok(row.technique_ids.includes('T1543'));
    assert.ok(row.technique_ids.includes('T1562.001'));
  });

  it('extracts tactics from all threat entries', () => {
    const { parseElasticRule } = loadDet();
    const row = parseElasticRule(elasticToml, '/elastic/test.toml');

    assert.ok(row.tactics.includes('Defense Evasion'));
    assert.ok(row.tactics.includes('Persistence'));
  });

  it('returns null for malformed TOML', () => {
    const { parseElasticRule } = loadDet();
    const row = parseElasticRule('not valid toml [[[bad', '/bad.toml');
    assert.equal(row, null);
  });

  it('returns null for TOML missing rule name', () => {
    const { parseElasticRule } = loadDet();
    const row = parseElasticRule('[rule]\nrule_id = "abc"\n', '/no-name.toml');
    assert.equal(row, null);
  });
});

describe('detections.cjs - parseKqlRule', () => {
  it('parses valid KQL markdown into a DetectionRow', () => {
    const { parseKqlRule } = loadDet();
    const row = parseKqlRule(kqlMd, 'kql-sample.md');

    assert.ok(row);
    assert.ok(row.id.startsWith('kql:'));
    assert.equal(row.title, 'Network Service Discovery T1046');
    assert.equal(row.source_format, 'kql');
    assert.ok(row.technique_ids.includes('T1046'));
    assert.ok(row.technique_ids.includes('T1135'));
    assert.ok(row.query.includes('DeviceNetworkEvents'));
    assert.ok(row.query.includes('RemotePort'));

    const meta = JSON.parse(row.metadata);
    assert.ok(Array.isArray(meta.tables));
    assert.ok(meta.tables.includes('DeviceNetworkEvents'));
  });

  it('returns null when no KQL code blocks found', () => {
    const { parseKqlRule } = loadDet();
    const row = parseKqlRule('# Just a heading\n\nNo code blocks here.\n', 'no-code.md');
    assert.equal(row, null);
  });

  it('uses filename as title fallback when no heading found', () => {
    const { parseKqlRule } = loadDet();
    const md = '```kql\nDeviceEvents\n| where ActionType == "test"\n```\n';
    const row = parseKqlRule(md, 'my-detection-rule.md');
    assert.ok(row);
    assert.equal(row.title, 'my-detection-rule');
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
    assert.ok(row);
    assert.ok(row.technique_ids.includes('T1059.001'));
    assert.ok(row.technique_ids.includes('T1027'));
    assert.ok(row.technique_ids.includes('T1059'));
  });
});

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

    assert.ok(tables.includes('detections'));
    assert.ok(tables.includes('detections_fts'));
  });

  it('creates idx_det_source and idx_det_severity indexes', () => {
    const { ensureDetectionsSchema } = loadDet();
    ensureDetectionsSchema(db);

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' ORDER BY name"
    ).all().map(r => r.name);

    assert.ok(indexes.includes('idx_det_source'));
    assert.ok(indexes.includes('idx_det_severity'));
  });

  it('is idempotent (calling twice does not error)', () => {
    const { ensureDetectionsSchema } = loadDet();
    ensureDetectionsSchema(db);
    assert.doesNotThrow(() => ensureDetectionsSchema(db));
  });
});

describe('detections.cjs - legacy detections_fts migration', () => {
  let tmpDir, db;

  beforeEach(() => {
    tmpDir = makeTempDir();
    const Database = require('better-sqlite3');
    db = new Database(path.join(tmpDir, 'legacy-detections.db'));
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE detections (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        source_format TEXT NOT NULL,
        technique_ids TEXT,
        tactics TEXT,
        severity TEXT,
        logsource TEXT,
        query TEXT,
        description TEXT,
        metadata TEXT,
        file_path TEXT
      );

      CREATE VIRTUAL TABLE detections_fts USING fts5(
        title, description, query, technique_ids,
        tokenize='porter unicode61'
      );
    `);
    db.prepare(`
      INSERT INTO detections
        (id, title, source_format, technique_ids, tactics, severity, logsource, query, description, metadata, file_path)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'sigma:legacy-detection',
      'Legacy PowerShell Detection',
      'sigma',
      'T1059.001',
      'Execution',
      'high',
      '{}',
      'legacy powershell query',
      'Legacy rule inserted before migration',
      '{}',
      'legacy.yml'
    );
    db.prepare(
      'INSERT INTO detections_fts (title, description, query, technique_ids) VALUES (?, ?, ?, ?)'
    ).run(
      'Legacy PowerShell Detection',
      'Legacy rule inserted before migration',
      'legacy powershell query',
      'T1059.001'
    );
  });

  afterEach(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rebuilds detections_fts with stable ids and preserves searchable rows', () => {
    const { ensureDetectionsSchema, searchDetections } = loadDet();
    ensureDetectionsSchema(db);

    const ftsSql = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'detections_fts'"
    ).get().sql;
    assert.match(ftsSql, /\bid\s+UNINDEXED\b/i);

    const rows = searchDetections(db, 'PowerShell', { technique_id: 'T1059.001' });
    assert.ok(rows.some(row => row.id === 'sigma:legacy-detection'));
  });
});

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
    assert.equal(changes, 1);
  });

  it('returns 0 for duplicate insert', () => {
    const { insertDetection, parseSigmaRule } = loadDet();
    const row = parseSigmaRule(sigmaYaml, '/test.yml');
    const changes = insertDetection(db, row);
    assert.equal(changes, 0);
  });

  it('FTS search finds by title', () => {
    const { searchDetections } = loadDet();
    const results = searchDetections(db, 'PowerShell');
    assert.ok(results.length > 0);
    assert.ok(results.some(r => r.title.includes('PowerShell')));
  });

  it('FTS search finds by technique_id using exact technique matching', () => {
    const { searchDetections } = loadDet();
    const results = searchDetections(db, 'PowerShell', { technique_id: 'T1059.001' });
    assert.ok(results.length > 0);
  });

  it('does not match parent technique filters against sub-technique-only detections', () => {
    const { insertDetection, searchDetections } = loadDet();
    insertDetection(db, {
      id: 'sigma:subtechnique-only',
      title: 'Sub-technique Only Rule',
      source_format: 'sigma',
      technique_ids: 'T1003.001',
      tactics: 'Credential Access',
      severity: 'medium',
      logsource: '{}',
      query: 'lsass access',
      description: 'Should not be returned for T1003 exact filters',
      metadata: '{}',
      file_path: 'subtechnique.yml',
    });

    const results = searchDetections(db, 'Rule', { technique_id: 'T1003' });
    assert.ok(!results.some(row => row.id === 'sigma:subtechnique-only'));
  });

  it('FTS search finds by description keyword', () => {
    const { searchDetections } = loadDet();
    const results = searchDetections(db, 'download cradles');
    assert.ok(results.length > 0);
  });

  it('FTS search filters by source_format', () => {
    const { searchDetections } = loadDet();
    const results = searchDetections(db, 'PowerShell', { source_format: 'sigma' });
    assert.ok(results.length > 0);
    for (const r of results) {
      assert.equal(r.source_format, 'sigma');
    }
  });

  it('FTS search filters by severity', () => {
    const { searchDetections } = loadDet();
    const results = searchDetections(db, 'PowerShell', { severity: 'high' });
    assert.ok(results.length > 0);
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
    assert.ok(Array.isArray(results));
  });
});

describe('detections.cjs - indexSigmaDirectory', () => {
  let tmpDir, db, rulesDir;

  before(() => {
    tmpDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
    const { ensureDetectionsSchema } = loadDet();
    ensureDetectionsSchema(db);

    rulesDir = path.join(tmpDir, 'sigma-rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.copyFileSync(
      path.join(FIXTURES_DIR, 'sigma-sample.yml'),
      path.join(rulesDir, 'test-rule.yml')
    );
    const subDir = path.join(rulesDir, 'sub');
    fs.mkdirSync(subDir);
    fs.copyFileSync(
      path.join(FIXTURES_DIR, 'sigma-sample.yml'),
      path.join(subDir, 'nested-rule.yaml')
    );
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
    const count = db.prepare("SELECT COUNT(*) AS cnt FROM detections WHERE source_format = 'sigma'").get().cnt;
    assert.ok(count >= 1);
  });
});

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
    const row = parseSigmaRule(sigmaYaml, '/test.yml');
    insertDetection(db, row);

    const countBefore = db.prepare('SELECT COUNT(*) AS cnt FROM detections').get().cnt;
    assert.ok(countBefore > 0);

    assert.doesNotThrow(() => populateDetectionsIfEmpty(db));

    const countAfter = db.prepare('SELECT COUNT(*) AS cnt FROM detections').get().cnt;
    assert.ok(countAfter >= countBefore);
  });

  it('does not throw when bundled sigma-core directory is missing', () => {
    const freshDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    const freshDb = openIntelDb({ dbDir: freshDir });
    const { ensureDetectionsSchema, populateDetectionsIfEmpty } = loadDet();
    ensureDetectionsSchema(freshDb);

    assert.doesNotThrow(() => populateDetectionsIfEmpty(freshDb));
    freshDb.close();
    fs.rmSync(freshDir, { recursive: true, force: true });
  });
});

describe('detections.cjs - openIntelDb integration', () => {
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

  it('openIntelDb creates detections table alongside techniques table', () => {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    assert.ok(tables.includes('techniques'));
    assert.ok(tables.includes('detections'));
    assert.ok(tables.includes('detections_fts'));
  });

  it('openIntelDb populates bundled Sigma rules on first run', () => {
    const count = db.prepare(
      "SELECT COUNT(*) AS cnt FROM detections WHERE source_format = 'sigma'"
    ).get().cnt;
    assert.ok(count >= 3, `expected at least 3 bundled sigma rules, got ${count}`);
  });

  it('openIntelDb populates bundled KQL rules on first run', () => {
    const count = db.prepare(
      "SELECT COUNT(*) AS cnt FROM detections WHERE source_format = 'kql'"
    ).get().cnt;
    assert.ok(count >= 1, `expected at least 1 bundled KQL rule, got ${count}`);
  });

  it('populateDetectionsIfEmpty is idempotent', () => {
    const countBefore = db.prepare('SELECT COUNT(*) AS cnt FROM detections').get().cnt;
    assert.ok(countBefore > 0);

    const { populateDetectionsIfEmpty } = loadDet();
    populateDetectionsIfEmpty(db);

    const countAfter = db.prepare('SELECT COUNT(*) AS cnt FROM detections').get().cnt;
    assert.equal(countAfter, countBefore);
  });
});

describe('detections.cjs - env var path indexing', () => {
  let tmpDir, db;
  const savedEnv = {};

  beforeEach(() => {
    tmpDir = makeTempDir();
    // Save env vars before test
    savedEnv.SIGMA_PATHS = process.env.SIGMA_PATHS;
    savedEnv.SPLUNK_PATHS = process.env.SPLUNK_PATHS;
    savedEnv.ELASTIC_PATHS = process.env.ELASTIC_PATHS;
    savedEnv.KQL_PATHS = process.env.KQL_PATHS;
  });

  afterEach(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Restore env vars
    if (savedEnv.SIGMA_PATHS === undefined) delete process.env.SIGMA_PATHS;
    else process.env.SIGMA_PATHS = savedEnv.SIGMA_PATHS;
    if (savedEnv.SPLUNK_PATHS === undefined) delete process.env.SPLUNK_PATHS;
    else process.env.SPLUNK_PATHS = savedEnv.SPLUNK_PATHS;
    if (savedEnv.ELASTIC_PATHS === undefined) delete process.env.ELASTIC_PATHS;
    else process.env.ELASTIC_PATHS = savedEnv.ELASTIC_PATHS;
    if (savedEnv.KQL_PATHS === undefined) delete process.env.KQL_PATHS;
    else process.env.KQL_PATHS = savedEnv.KQL_PATHS;
  });

  it('SIGMA_PATHS indexes custom directory', () => {
    const customDir = path.join(tmpDir, 'custom-sigma');
    fs.mkdirSync(customDir, { recursive: true });
    const customYaml = sigmaYaml.replace(
      '3b6ab547-f55a-4d6e-88a1-a6a9f87e1234',
      'custom-sigma-env-test-001'
    );
    fs.writeFileSync(path.join(customDir, 'custom-rule.yml'), customYaml);

    process.env.SIGMA_PATHS = customDir;

    const { ensureDetectionsSchema, populateDetectionsIfEmpty } = loadDet();
    const Database = require('better-sqlite3');
    const dbPath = path.join(tmpDir, 'env-test.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    ensureDetectionsSchema(db);
    populateDetectionsIfEmpty(db);

    const row = db.prepare(
      "SELECT * FROM detections WHERE id = 'sigma:custom-sigma-env-test-001'"
    ).get();
    assert.ok(row);
    assert.equal(row.source_format, 'sigma');
  });

  it('SPLUNK_PATHS indexes ESCU directory', () => {
    const customDir = path.join(tmpDir, 'custom-escu');
    fs.mkdirSync(customDir, { recursive: true });
    const customYaml = escuYaml.replace(
      '87654321-abcd-ef01-2345-678901234567',
      'custom-escu-env-test-001'
    );
    fs.writeFileSync(path.join(customDir, 'custom-escu.yml'), customYaml);

    process.env.SPLUNK_PATHS = customDir;

    const { ensureDetectionsSchema, populateDetectionsIfEmpty } = loadDet();
    const Database = require('better-sqlite3');
    const dbPath = path.join(tmpDir, 'escu-env-test.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    ensureDetectionsSchema(db);
    populateDetectionsIfEmpty(db);

    const row = db.prepare(
      "SELECT * FROM detections WHERE id = 'escu:custom-escu-env-test-001'"
    ).get();
    assert.ok(row);
    assert.equal(row.source_format, 'escu');
  });

  it('ELASTIC_PATHS indexes Elastic directory', () => {
    const customDir = path.join(tmpDir, 'custom-elastic');
    fs.mkdirSync(customDir, { recursive: true });
    const customToml = elasticToml.replace(
      'abcdef12-3456-7890-abcd-ef1234567890',
      'custom-elastic-env-test-001'
    );
    fs.writeFileSync(path.join(customDir, 'custom-elastic.toml'), customToml);

    process.env.ELASTIC_PATHS = customDir;

    const { ensureDetectionsSchema, populateDetectionsIfEmpty } = loadDet();
    const Database = require('better-sqlite3');
    const dbPath = path.join(tmpDir, 'elastic-env-test.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    ensureDetectionsSchema(db);
    populateDetectionsIfEmpty(db);

    const row = db.prepare(
      "SELECT * FROM detections WHERE id = 'elastic:custom-elastic-env-test-001'"
    ).get();
    assert.ok(row);
    assert.equal(row.source_format, 'elastic');
  });

  it('KQL_PATHS indexes KQL directory', () => {
    const customDir = path.join(tmpDir, 'custom-kql');
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(path.join(customDir, 'custom-kql.md'), kqlMd);

    process.env.KQL_PATHS = customDir;

    const { ensureDetectionsSchema, populateDetectionsIfEmpty } = loadDet();
    const Database = require('better-sqlite3');
    const dbPath = path.join(tmpDir, 'kql-env-test.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    ensureDetectionsSchema(db);
    populateDetectionsIfEmpty(db);

    const row = db.prepare(
      "SELECT * FROM detections WHERE id = 'kql:custom-kql.md'"
    ).get();
    assert.ok(row);
    assert.equal(row.source_format, 'kql');
  });

  it('indexes custom paths on later startups after bundled detections already exist', () => {
    const customDir = path.join(tmpDir, 'delayed-sigma');
    fs.mkdirSync(customDir, { recursive: true });
    const customYaml = sigmaYaml.replace(
      '3b6ab547-f55a-4d6e-88a1-a6a9f87e1234',
      'custom-sigma-delayed-startup-001'
    );
    fs.writeFileSync(path.join(customDir, 'delayed-rule.yml'), customYaml);

    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });

    process.env.SIGMA_PATHS = customDir;

    const { populateDetectionsIfEmpty } = loadDet();
    populateDetectionsIfEmpty(db);

    const row = db.prepare(
      "SELECT * FROM detections WHERE id = 'sigma:custom-sigma-delayed-startup-001'"
    ).get();
    assert.ok(row, 'custom detection should be indexed even after bundled rules already exist');
  });

  it('skips re-reading unchanged custom env directories on later startups', () => {
    const customDir = path.join(tmpDir, 'cached-sigma');
    fs.mkdirSync(customDir, { recursive: true });
    const rulePath = path.join(customDir, 'cached-rule.yml');
    const customYaml = sigmaYaml.replace(
      '3b6ab547-f55a-4d6e-88a1-a6a9f87e1234',
      'custom-sigma-cached-startup-001'
    );
    fs.writeFileSync(rulePath, customYaml);

    process.env.SIGMA_PATHS = customDir;

    const { ensureDetectionsSchema, populateDetectionsIfEmpty } = loadDet();
    const Database = require('better-sqlite3');
    const dbPath = path.join(tmpDir, 'cached-env-test.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    ensureDetectionsSchema(db);
    populateDetectionsIfEmpty(db);

    const originalReadFileSync = fs.readFileSync;
    let rereadCount = 0;
    fs.readFileSync = function(filePath, ...args) {
      if (path.resolve(filePath) === path.resolve(rulePath)) rereadCount++;
      return originalReadFileSync.call(this, filePath, ...args);
    };

    try {
      populateDetectionsIfEmpty(db);
    } finally {
      fs.readFileSync = originalReadFileSync;
    }

    assert.equal(rereadCount, 0, 'unchanged custom env directories should not be reparsed on every startup');
  });

  it('re-indexes custom env directories when rule files change', () => {
    const customDir = path.join(tmpDir, 'updated-sigma');
    fs.mkdirSync(customDir, { recursive: true });
    const rulePath = path.join(customDir, 'updated-rule.yml');
    const customYaml = sigmaYaml.replace(
      '3b6ab547-f55a-4d6e-88a1-a6a9f87e1234',
      'custom-sigma-updated-startup-001'
    );
    fs.writeFileSync(rulePath, customYaml);

    process.env.SIGMA_PATHS = customDir;

    const { ensureDetectionsSchema, populateDetectionsIfEmpty } = loadDet();
    const Database = require('better-sqlite3');
    const dbPath = path.join(tmpDir, 'updated-env-test.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    ensureDetectionsSchema(db);
    populateDetectionsIfEmpty(db);

    fs.appendFileSync(rulePath, '\n# touch');

    const originalReadFileSync = fs.readFileSync;
    let rereadCount = 0;
    fs.readFileSync = function(filePath, ...args) {
      if (path.resolve(filePath) === path.resolve(rulePath)) rereadCount++;
      return originalReadFileSync.call(this, filePath, ...args);
    };

    try {
      populateDetectionsIfEmpty(db);
    } finally {
      fs.readFileSync = originalReadFileSync;
    }

    assert.ok(rereadCount > 0, 'changed custom env directories should be reparsed');
  });

  it('nonexistent env var path logs warning but does not throw', () => {
    process.env.SIGMA_PATHS = '/nonexistent/path/that/does/not/exist';

    const { ensureDetectionsSchema, populateDetectionsIfEmpty } = loadDet();
    const Database = require('better-sqlite3');
    const dbPath = path.join(tmpDir, 'nopath-test.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    ensureDetectionsSchema(db);

    assert.doesNotThrow(() => populateDetectionsIfEmpty(db));
  });
});

describe('detections.cjs - end-to-end search', () => {
  let tmpDir, db;

  before(() => {
    tmpDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('search finds Sigma rule by technique ID', () => {
    const { searchDetections } = loadDet();
    const results = searchDetections(db, 'T1059', { technique_id: 'T1059' });
    assert.ok(results.length > 0);
    assert.ok(results.some(r => r.source_format === 'sigma'));
  });

  it('search finds rule by keyword in title', () => {
    const { searchDetections } = loadDet();
    const results = searchDetections(db, 'suspicious');
    assert.ok(results.length > 0);
  });
});
