'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function makeTempDir() {
  const dir = path.join(os.tmpdir(), `thrunt-kg-mcp-test-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let knowledge, tools;
function loadKnowledge() {
  if (!knowledge) knowledge = require('../mcp-hunt-intel/lib/knowledge.cjs');
  return knowledge;
}
function loadTools() {
  if (!tools) tools = require('../mcp-hunt-intel/lib/tools.cjs');
  return tools;
}

describe('handleQueryKnowledge', () => {
  let db, tmpDir;

  before(() => {
    tmpDir = makeTempDir();
    db = new Database(path.join(tmpDir, 'test-program.db'));
    db.pragma('journal_mode = WAL');

    const kg = loadKnowledge();
    kg.ensureKnowledgeSchema(db);

    kg.addEntity(db, { type: 'threat_actor', name: 'APT28', description: 'Russian cyber espionage group' });
    kg.addEntity(db, { type: 'threat_actor', name: 'APT29', description: 'Russian intelligence SVR group' });
    kg.addEntity(db, { type: 'tool', name: 'Mimikatz', description: 'Credential dumping tool' });
    kg.addEntity(db, { type: 'vulnerability', name: 'CVE-2021-34527', description: 'PrintNightmare vulnerability' });

    kg.addRelation(db, {
      from_entity: 'threat_actor--apt28',
      to_entity: 'tool--mimikatz',
      relation_type: 'uses',
    });
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns entities matching search query', async () => {
    const { handleQueryKnowledge } = loadTools();
    const result = await handleQueryKnowledge(db, { query: 'APT28' });

    assert.ok(result.content);
    assert.equal(result.content[0].type, 'text');
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.length > 0);
    assert.equal(parsed[0].name, 'APT28');
  });

  it('filters by entity type', async () => {
    const { handleQueryKnowledge } = loadTools();
    const result = await handleQueryKnowledge(db, { query: 'Russian', type: 'threat_actor' });

    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.length >= 1);
    for (const e of parsed) {
      assert.equal(e.type, 'threat_actor');
    }
  });

  it('returns message when no results', async () => {
    const { handleQueryKnowledge } = loadTools();
    const result = await handleQueryKnowledge(db, { query: 'xyznonexistent' });

    assert.ok(result.content);
    assert.ok(result.content[0].text.includes('No knowledge graph entities match query'));
  });

  it('includes relations for each entity', async () => {
    const { handleQueryKnowledge } = loadTools();
    const result = await handleQueryKnowledge(db, { query: 'APT28' });

    const parsed = JSON.parse(result.content[0].text);
    const apt28 = parsed.find(e => e.name === 'APT28');
    assert.ok(apt28);
    assert.ok(Array.isArray(apt28.relations));
    assert.ok(apt28.relations.length > 0);
    assert.equal(apt28.relations[0].relation_type, 'uses');
  });
});

describe('handleLogDecision', () => {
  let db, tmpDir;

  before(() => {
    tmpDir = makeTempDir();
    db = new Database(path.join(tmpDir, 'test-program.db'));
    db.pragma('journal_mode = WAL');

    const kg = loadKnowledge();
    kg.ensureKnowledgeSchema(db);
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logs decision and returns related decisions', async () => {
    const { handleLogDecision } = loadTools();
    const result = await handleLogDecision(db, {
      case_slug: 'case-alpha',
      technique_id: 'T1059',
      decision: 'Escalate to IR team',
      reasoning: 'PowerShell activity matches known patterns',
    });

    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.logged, true);
    assert.equal(parsed.technique_id, 'T1059');
    assert.ok(Array.isArray(parsed.related_decisions));
    assert.ok(parsed.related_decisions.length >= 1);
  });

  it('returns previously logged decisions for same technique', async () => {
    const { handleLogDecision } = loadTools();

    // Log a second decision for same technique
    const result = await handleLogDecision(db, {
      case_slug: 'case-beta',
      technique_id: 'T1059',
      decision: 'Monitor for recurrence',
    });

    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.related_decisions.length >= 2);
    const decisions = parsed.related_decisions.map(d => d.decision);
    assert.ok(decisions.includes('Escalate to IR team'), 'Should include first decision');
    assert.ok(decisions.includes('Monitor for recurrence'), 'Should include second decision');
  });
});

describe('handleLogLearning', () => {
  let db, tmpDir;

  before(() => {
    tmpDir = makeTempDir();
    db = new Database(path.join(tmpDir, 'test-program.db'));
    db.pragma('journal_mode = WAL');

    const kg = loadKnowledge();
    kg.ensureKnowledgeSchema(db);
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logs learning and returns related learnings', async () => {
    const { handleLogLearning } = loadTools();
    const result = await handleLogLearning(db, {
      topic: 'lateral-movement',
      pattern: 'PsExec followed by credential access within 5 minutes',
      detail: 'Observed in 3 cases so far',
      technique_ids: 'T1021.002,T1003',
      case_slug: 'case-gamma',
    });

    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.logged, true);
    assert.equal(parsed.topic, 'lateral-movement');
    assert.ok(Array.isArray(parsed.related_learnings));
    assert.ok(parsed.related_learnings.length >= 1);
  });

  it('returns previously logged learnings for same topic', async () => {
    const { handleLogLearning } = loadTools();

    const result = await handleLogLearning(db, {
      topic: 'lateral-movement',
      pattern: 'WMI execution followed by SMB file transfer',
    });

    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.related_learnings.length >= 2);
  });
});

describe('MCP response shape', () => {
  let db, tmpDir;

  before(() => {
    tmpDir = makeTempDir();
    db = new Database(path.join(tmpDir, 'test-program.db'));
    db.pragma('journal_mode = WAL');

    const kg = loadKnowledge();
    kg.ensureKnowledgeSchema(db);
    kg.addEntity(db, { type: 'tool', name: 'Cobalt Strike', description: 'Commercial red team tool' });
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handleQueryKnowledge returns MCP-shaped response', async () => {
    const { handleQueryKnowledge } = loadTools();
    const result = await handleQueryKnowledge(db, { query: 'Cobalt' });

    assert.ok(result.content);
    assert.ok(Array.isArray(result.content));
    assert.equal(result.content[0].type, 'text');
    assert.equal(typeof result.content[0].text, 'string');
  });

  it('handleLogDecision returns MCP-shaped response', async () => {
    const { handleLogDecision } = loadTools();
    const result = await handleLogDecision(db, {
      case_slug: 'test',
      technique_id: 'T1078',
      decision: 'test decision',
    });

    assert.ok(result.content);
    assert.ok(Array.isArray(result.content));
    assert.equal(result.content[0].type, 'text');
    assert.equal(typeof result.content[0].text, 'string');
  });

  it('handleLogLearning returns MCP-shaped response', async () => {
    const { handleLogLearning } = loadTools();
    const result = await handleLogLearning(db, {
      topic: 'test-topic',
      pattern: 'test pattern',
    });

    assert.ok(result.content);
    assert.ok(Array.isArray(result.content));
    assert.equal(result.content[0].type, 'text');
    assert.equal(typeof result.content[0].text, 'string');
  });
});

describe('openProgramDb knowledge graph integration', () => {
  let db, tmpDir;

  before(() => {
    tmpDir = path.join(os.tmpdir(), `thrunt-kg-opendb-test-${crypto.randomUUID()}`);
    fs.mkdirSync(path.join(tmpDir, '.planning'), { recursive: true });
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('openProgramDb creates kg_entities table', () => {
    const { openProgramDb } = require('../thrunt-god/bin/lib/db.cjs');
    db = openProgramDb(tmpDir);

    assert.ok(db, 'openProgramDb should return a database');

    // Check kg_entities table exists
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'kg_%'"
    ).all();
    const tableNames = tables.map(t => t.name);
    assert.ok(tableNames.includes('kg_entities'), 'kg_entities table should exist');
    assert.ok(tableNames.includes('kg_relations'), 'kg_relations table should exist');
    assert.ok(tableNames.includes('kg_decisions'), 'kg_decisions table should exist');
    assert.ok(tableNames.includes('kg_learnings'), 'kg_learnings table should exist');
  });
});
