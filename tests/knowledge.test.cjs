'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function makeTempDir() {
  const dir = path.join(os.tmpdir(), `thrunt-kg-test-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeProgramDb(dir) {
  const dbPath = path.join(dir, 'program.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  return db;
}

function makeIntelDb(dir) {
  const { openIntelDb } = require('../mcp-hunt-intel/lib/intel.cjs');
  return openIntelDb({ dbDir: dir });
}

let knowledge;
function loadKnowledge() {
  if (!knowledge) knowledge = require('../mcp-hunt-intel/lib/knowledge.cjs');
  return knowledge;
}

describe('knowledge.cjs - ensureKnowledgeSchema', () => {
  let tmpDir, db;

  beforeEach(() => {
    tmpDir = makeTempDir();
    db = makeProgramDb(tmpDir);
  });

  afterEach(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates kg_entities table with correct columns', () => {
    const { ensureKnowledgeSchema } = loadKnowledge();
    ensureKnowledgeSchema(db);

    const cols = db.prepare("PRAGMA table_info('kg_entities')").all();
    const colNames = cols.map(c => c.name);
    assert.ok(colNames.includes('id'));
    assert.ok(colNames.includes('type'));
    assert.ok(colNames.includes('name'));
    assert.ok(colNames.includes('description'));
    assert.ok(colNames.includes('metadata'));
    assert.ok(colNames.includes('created_at'));
    assert.ok(colNames.includes('source'));

    const idCol = cols.find(c => c.name === 'id');
    assert.equal(idCol.type, 'TEXT');
    assert.equal(idCol.pk, 1);
  });

  it('creates kg_relations table with correct columns', () => {
    const { ensureKnowledgeSchema } = loadKnowledge();
    ensureKnowledgeSchema(db);

    const cols = db.prepare("PRAGMA table_info('kg_relations')").all();
    const colNames = cols.map(c => c.name);
    assert.ok(colNames.includes('id'));
    assert.ok(colNames.includes('from_entity'));
    assert.ok(colNames.includes('to_entity'));
    assert.ok(colNames.includes('relation_type'));
    assert.ok(colNames.includes('metadata'));
    assert.ok(colNames.includes('created_at'));
    assert.ok(colNames.includes('source'));

    const idCol = cols.find(c => c.name === 'id');
    assert.equal(idCol.type, 'INTEGER');
    assert.equal(idCol.pk, 1);
  });

  it('creates kg_decisions table with correct columns', () => {
    const { ensureKnowledgeSchema } = loadKnowledge();
    ensureKnowledgeSchema(db);

    const cols = db.prepare("PRAGMA table_info('kg_decisions')").all();
    const colNames = cols.map(c => c.name);
    assert.ok(colNames.includes('id'));
    assert.ok(colNames.includes('case_slug'));
    assert.ok(colNames.includes('technique_id'));
    assert.ok(colNames.includes('decision'));
    assert.ok(colNames.includes('reasoning'));
    assert.ok(colNames.includes('context'));
    assert.ok(colNames.includes('created_at'));
  });

  it('creates kg_learnings table with correct columns', () => {
    const { ensureKnowledgeSchema } = loadKnowledge();
    ensureKnowledgeSchema(db);

    const cols = db.prepare("PRAGMA table_info('kg_learnings')").all();
    const colNames = cols.map(c => c.name);
    assert.ok(colNames.includes('id'));
    assert.ok(colNames.includes('topic'));
    assert.ok(colNames.includes('pattern'));
    assert.ok(colNames.includes('detail'));
    assert.ok(colNames.includes('technique_ids'));
    assert.ok(colNames.includes('created_at'));
    assert.ok(colNames.includes('case_slug'));
  });

  it('creates kg_entities_fts FTS5 virtual table', () => {
    const { ensureKnowledgeSchema } = loadKnowledge();
    ensureKnowledgeSchema(db);

    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='kg_entities_fts'"
    ).get();
    assert.ok(row);
  });

  it('idempotent -- calling twice does not throw', () => {
    const { ensureKnowledgeSchema } = loadKnowledge();
    ensureKnowledgeSchema(db);
    ensureKnowledgeSchema(db);

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);
    assert.ok(tables.includes('kg_entities'));
    assert.ok(tables.includes('kg_relations'));
    assert.ok(tables.includes('kg_decisions'));
    assert.ok(tables.includes('kg_learnings'));
  });
});

describe('knowledge.cjs - addEntity / getEntity', () => {
  let tmpDir, db;

  beforeEach(() => {
    tmpDir = makeTempDir();
    db = makeProgramDb(tmpDir);
    const { ensureKnowledgeSchema } = loadKnowledge();
    ensureKnowledgeSchema(db);
  });

  afterEach(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('addEntity inserts row and returns entity with generated id', () => {
    const { addEntity } = loadKnowledge();
    const entity = addEntity(db, {
      type: 'threat_actor',
      name: 'APT28',
      description: 'Russian military intelligence',
    });

    assert.ok(entity);
    assert.ok(entity.id);
    assert.equal(entity.type, 'threat_actor');
    assert.equal(entity.name, 'APT28');
    assert.equal(entity.description, 'Russian military intelligence');

    const row = db.prepare('SELECT * FROM kg_entities WHERE id = ?').get(entity.id);
    assert.ok(row);
  });

  it('addEntity with all 7 valid types succeeds', () => {
    const { addEntity } = loadKnowledge();
    const types = ['threat_actor', 'technique', 'detection', 'campaign', 'tool', 'vulnerability', 'data_source'];

    for (const type of types) {
      const entity = addEntity(db, { type, name: `test-${type}`, description: `Test ${type}` });
      assert.ok(entity, `failed for type ${type}`);
      assert.equal(entity.type, type);
    }

    const count = db.prepare('SELECT COUNT(*) AS cnt FROM kg_entities').get().cnt;
    assert.equal(count, 7);
  });

  it('getEntity returns the entity by id', () => {
    const { addEntity, getEntity } = loadKnowledge();
    const added = addEntity(db, { type: 'threat_actor', name: 'APT28', description: 'Russian group' });
    const found = getEntity(db, added.id);

    assert.ok(found);
    assert.equal(found.id, added.id);
    assert.equal(found.name, 'APT28');
    assert.equal(found.type, 'threat_actor');
  });

  it('getEntity with nonexistent id returns null', () => {
    const { getEntity } = loadKnowledge();
    const result = getEntity(db, 'nonexistent-id');
    assert.equal(result, null);
  });

  it('addEntity upserts on duplicate id', () => {
    const { addEntity, getEntity } = loadKnowledge();

    const first = addEntity(db, { type: 'threat_actor', name: 'APT28', description: 'Original description' });
    const second = addEntity(db, { type: 'threat_actor', name: 'APT28', description: 'Updated description' });

    assert.equal(first.id, second.id);

    const count = db.prepare('SELECT COUNT(*) AS cnt FROM kg_entities WHERE id = ?').get(first.id).cnt;
    assert.equal(count, 1);

    const entity = getEntity(db, first.id);
    assert.equal(entity.description, 'Updated description');
  });

  it('addEntity populates created_at and source fields', () => {
    const { addEntity, getEntity } = loadKnowledge();
    const entity = addEntity(db, { type: 'threat_actor', name: 'APT28', description: 'Test' });

    const found = getEntity(db, entity.id);
    assert.ok(found.created_at);
    assert.match(found.created_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(found.source);
    assert.equal(found.source, 'manual');
  });
});

describe('knowledge.cjs - addRelation / getRelations', () => {
  let tmpDir, db;

  beforeEach(() => {
    tmpDir = makeTempDir();
    db = makeProgramDb(tmpDir);
    const { ensureKnowledgeSchema, addEntity } = loadKnowledge();
    ensureKnowledgeSchema(db);

    addEntity(db, { type: 'threat_actor', name: 'APT28', description: 'Russian group' });
    addEntity(db, { type: 'technique', name: 'Spearphishing', description: 'Email phishing' });
  });

  afterEach(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('addRelation inserts row', () => {
    const { addRelation } = loadKnowledge();
    const relation = addRelation(db, {
      from_entity: 'threat_actor--apt28',
      to_entity: 'technique--spearphishing',
      relation_type: 'uses',
    });

    assert.ok(relation);
    assert.ok(relation.id);
    assert.equal(relation.relation_type, 'uses');

    const row = db.prepare('SELECT * FROM kg_relations WHERE id = ?').get(relation.id);
    assert.ok(row);
  });

  it('getRelations returns relations where entity is from or to', () => {
    const { addRelation, getRelations } = loadKnowledge();
    addRelation(db, { from_entity: 'threat_actor--apt28', to_entity: 'technique--spearphishing', relation_type: 'uses' });

    const fromResults = getRelations(db, 'threat_actor--apt28');
    assert.ok(fromResults.length >= 1);

    const toResults = getRelations(db, 'technique--spearphishing');
    assert.ok(toResults.length >= 1);
  });

  it('getRelations direction=outgoing returns only from_entity matches', () => {
    const { addRelation, getRelations } = loadKnowledge();
    addRelation(db, { from_entity: 'threat_actor--apt28', to_entity: 'technique--spearphishing', relation_type: 'uses' });

    const outgoing = getRelations(db, 'threat_actor--apt28', { direction: 'outgoing' });
    assert.ok(outgoing.length >= 1);

    const noOutgoing = getRelations(db, 'technique--spearphishing', { direction: 'outgoing' });
    assert.equal(noOutgoing.length, 0);
  });

  it('getRelations direction=incoming returns only to_entity matches', () => {
    const { addRelation, getRelations } = loadKnowledge();
    addRelation(db, { from_entity: 'threat_actor--apt28', to_entity: 'technique--spearphishing', relation_type: 'uses' });

    const incoming = getRelations(db, 'technique--spearphishing', { direction: 'incoming' });
    assert.ok(incoming.length >= 1);

    const noIncoming = getRelations(db, 'threat_actor--apt28', { direction: 'incoming' });
    assert.equal(noIncoming.length, 0);
  });

  it('getRelations for nonexistent entity returns empty array', () => {
    const { getRelations } = loadKnowledge();
    const results = getRelations(db, 'nonexistent-entity');
    assert.deepEqual(results, []);
  });
});

describe('knowledge.cjs - searchEntities', () => {
  let tmpDir, db;

  beforeEach(() => {
    tmpDir = makeTempDir();
    db = makeProgramDb(tmpDir);
    const { ensureKnowledgeSchema, addEntity } = loadKnowledge();
    ensureKnowledgeSchema(db);

    addEntity(db, { type: 'threat_actor', name: 'APT28', description: 'Russian military intelligence group' });
    addEntity(db, { type: 'threat_actor', name: 'APT29', description: 'Russian intelligence SVR' });
    addEntity(db, { type: 'technique', name: 'Spearphishing', description: 'Email phishing attachment' });
    addEntity(db, { type: 'tool', name: 'Mimikatz', description: 'Credential dumping tool' });
  });

  afterEach(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finds entities by description via FTS5', () => {
    const { searchEntities } = loadKnowledge();
    const results = searchEntities(db, 'russian');
    assert.ok(results.length >= 1);
    const names = results.map(r => r.name);
    assert.ok(names.includes('APT28') || names.includes('APT29'));
  });

  it('type filter limits results', () => {
    const { searchEntities } = loadKnowledge();
    const filtered = searchEntities(db, 'russian', { type: 'threat_actor' });
    assert.ok(filtered.length >= 1);
    for (const r of filtered) {
      assert.equal(r.type, 'threat_actor');
    }
  });

  it('empty query returns empty array', () => {
    const { searchEntities } = loadKnowledge();
    assert.deepEqual(searchEntities(db, ''), []);
    assert.deepEqual(searchEntities(db, null), []);
    assert.deepEqual(searchEntities(db, undefined), []);
  });

  it('returns results ranked by BM25', () => {
    const { searchEntities } = loadKnowledge();
    const results = searchEntities(db, 'russian');
    assert.ok(results.length >= 2);
    assert.ok(results[0].name);
  });
});

describe('knowledge.cjs - findEntities', () => {
  let tmpDir, db;

  beforeEach(() => {
    tmpDir = makeTempDir();
    db = makeProgramDb(tmpDir);
    const { ensureKnowledgeSchema, addEntity } = loadKnowledge();
    ensureKnowledgeSchema(db);

    addEntity(db, { type: 'threat_actor', name: 'APT28', description: 'Russian group' });
    addEntity(db, { type: 'technique', name: 'Spearphishing', description: 'Email phishing' });
    addEntity(db, { type: 'technique', name: 'Brute Force', description: 'Password guessing' });
  });

  afterEach(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('type filter returns matching entities', () => {
    const { findEntities } = loadKnowledge();
    const techniques = findEntities(db, { type: 'technique' });
    assert.equal(techniques.length, 2);
    for (const t of techniques) {
      assert.equal(t.type, 'technique');
    }
  });

  it('name filter returns exact match', () => {
    const { findEntities } = loadKnowledge();
    const results = findEntities(db, { name: 'APT28' });
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'APT28');
  });

  it('empty filter returns all entities', () => {
    const { findEntities } = loadKnowledge();
    const all = findEntities(db, {});
    assert.equal(all.length, 3);
  });
});

describe('knowledge.cjs - logDecision / getDecisions', () => {
  let tmpDir, db;

  beforeEach(() => {
    tmpDir = makeTempDir();
    db = makeProgramDb(tmpDir);
    const { ensureKnowledgeSchema } = loadKnowledge();
    ensureKnowledgeSchema(db);
  });

  afterEach(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logDecision inserts row with all fields', () => {
    const { logDecision } = loadKnowledge();
    const result = logDecision(db, {
      case_slug: 'case-1',
      technique_id: 'T1059',
      decision: 'Use PowerShell hunting',
      reasoning: 'Most prevalent',
      context: 'Initial triage',
    });

    assert.ok(result);

    const row = db.prepare('SELECT * FROM kg_decisions WHERE case_slug = ?').get('case-1');
    assert.ok(row);
    assert.equal(row.technique_id, 'T1059');
    assert.equal(row.decision, 'Use PowerShell hunting');
    assert.equal(row.reasoning, 'Most prevalent');
    assert.equal(row.context, 'Initial triage');
    assert.ok(row.created_at);
  });

  it('getDecisions by technique_id returns matching decisions', () => {
    const { logDecision, getDecisions } = loadKnowledge();
    logDecision(db, { case_slug: 'case-1', technique_id: 'T1059', decision: 'Hunt PS', reasoning: 'Prevalent' });
    logDecision(db, { case_slug: 'case-2', technique_id: 'T1059', decision: 'Monitor PS', reasoning: 'Follow-up' });
    logDecision(db, { case_slug: 'case-3', technique_id: 'T1078', decision: 'Check creds', reasoning: 'Valid accounts' });

    const decisions = getDecisions(db, { technique_id: 'T1059' });
    assert.equal(decisions.length, 2);
  });

  it('getDecisions by case_slug returns matching decisions', () => {
    const { logDecision, getDecisions } = loadKnowledge();
    logDecision(db, { case_slug: 'case-1', technique_id: 'T1059', decision: 'Hunt PS' });
    logDecision(db, { case_slug: 'case-1', technique_id: 'T1078', decision: 'Check creds' });
    logDecision(db, { case_slug: 'case-2', technique_id: 'T1059', decision: 'Monitor PS' });

    const decisions = getDecisions(db, { case_slug: 'case-1' });
    assert.equal(decisions.length, 2);
  });

  it('getDecisions with no match returns empty array', () => {
    const { getDecisions } = loadKnowledge();
    const decisions = getDecisions(db, { technique_id: 'T9999' });
    assert.deepEqual(decisions, []);
  });
});

describe('knowledge.cjs - logLearning / getLearnings', () => {
  let tmpDir, db;

  beforeEach(() => {
    tmpDir = makeTempDir();
    db = makeProgramDb(tmpDir);
    const { ensureKnowledgeSchema } = loadKnowledge();
    ensureKnowledgeSchema(db);
  });

  afterEach(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logLearning inserts row with all fields', () => {
    const { logLearning } = loadKnowledge();
    const result = logLearning(db, {
      topic: 'powershell',
      pattern: 'encoded commands',
      detail: 'Base64 encoded -enc flag common',
      technique_ids: 'T1059.001,T1027',
      case_slug: 'case-1',
    });

    assert.ok(result);

    const row = db.prepare('SELECT * FROM kg_learnings WHERE topic = ?').get('powershell');
    assert.ok(row);
    assert.equal(row.pattern, 'encoded commands');
    assert.equal(row.detail, 'Base64 encoded -enc flag common');
    assert.equal(row.technique_ids, 'T1059.001,T1027');
    assert.equal(row.case_slug, 'case-1');
    assert.ok(row.created_at);
  });

  it('getLearnings by topic returns matching learnings', () => {
    const { logLearning, getLearnings } = loadKnowledge();
    logLearning(db, { topic: 'powershell', pattern: 'encoded commands', detail: 'Test 1', technique_ids: 'T1059.001' });
    logLearning(db, { topic: 'powershell', pattern: 'download cradles', detail: 'Test 2', technique_ids: 'T1059.001' });
    logLearning(db, { topic: 'lateral-movement', pattern: 'pass-the-hash', detail: 'Test 3', technique_ids: 'T1550.002' });

    const learnings = getLearnings(db, { topic: 'powershell' });
    assert.equal(learnings.length, 2);
  });

  it('getLearnings by technique_id returns matching learnings', () => {
    const { logLearning, getLearnings } = loadKnowledge();
    logLearning(db, { topic: 'powershell', pattern: 'encoded', detail: 'Test', technique_ids: 'T1059.001,T1027' });
    logLearning(db, { topic: 'creds', pattern: 'dumping', detail: 'Test', technique_ids: 'T1003.001' });

    const learnings = getLearnings(db, { technique_id: 'T1059.001' });
    assert.equal(learnings.length, 1);
    assert.equal(learnings[0].topic, 'powershell');
  });

  it('getLearnings with no match returns empty array', () => {
    const { getLearnings } = loadKnowledge();
    const learnings = getLearnings(db, { topic: 'nonexistent' });
    assert.deepEqual(learnings, []);
  });
});

describe('knowledge.cjs - importStixFromIntel', () => {
  let tmpDir, intelDir, programDb, intelDb;

  before(() => {
    tmpDir = makeTempDir();
    intelDir = makeTempDir();
    programDb = makeProgramDb(tmpDir);
    const { ensureKnowledgeSchema } = loadKnowledge();
    ensureKnowledgeSchema(programDb);
    intelDb = makeIntelDb(intelDir);
  });

  after(() => {
    if (programDb) programDb.close();
    if (intelDb) intelDb.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(intelDir, { recursive: true, force: true });
  });

  it('creates threat_actor entities for each group in intel.db', () => {
    const { importStixFromIntel } = loadKnowledge();
    importStixFromIntel(programDb, intelDb);

    const groupCount = intelDb.prepare('SELECT COUNT(*) AS cnt FROM groups').get().cnt;
    const threatActors = programDb.prepare(
      "SELECT COUNT(*) AS cnt FROM kg_entities WHERE type = 'threat_actor' AND source = 'att&ck-stix'"
    ).get().cnt;

    assert.equal(threatActors, groupCount, `should have ${groupCount} threat_actor entities`);
  });

  it('creates tool entities for each software entry in intel.db', () => {
    const { importStixFromIntel } = loadKnowledge();
    importStixFromIntel(programDb, intelDb);

    const softwareCount = intelDb.prepare('SELECT COUNT(*) AS cnt FROM software').get().cnt;
    const tools = programDb.prepare(
      "SELECT COUNT(*) AS cnt FROM kg_entities WHERE type = 'tool' AND source = 'att&ck-stix'"
    ).get().cnt;

    assert.equal(tools, softwareCount, `should have ${softwareCount} tool entities`);
  });

  it('creates uses relations for group_techniques rows', () => {
    const { importStixFromIntel } = loadKnowledge();
    importStixFromIntel(programDb, intelDb);

    const gtCount = intelDb.prepare('SELECT COUNT(*) AS cnt FROM group_techniques').get().cnt;
    const gtRelations = programDb.prepare(
      "SELECT COUNT(*) AS cnt FROM kg_relations WHERE relation_type = 'uses' AND source = 'att&ck-stix' AND from_entity LIKE 'threat_actor--%'"
    ).get().cnt;

    assert.ok(gtRelations >= gtCount, `expected >= ${gtCount} group->technique relations, got ${gtRelations}`);
  });

  it('creates uses relations for group_software rows', () => {
    const { importStixFromIntel } = loadKnowledge();
    importStixFromIntel(programDb, intelDb);

    const gsCount = intelDb.prepare('SELECT COUNT(*) AS cnt FROM group_software').get().cnt;
    const gsRelations = programDb.prepare(
      "SELECT COUNT(*) AS cnt FROM kg_relations WHERE relation_type = 'uses' AND source = 'att&ck-stix' AND from_entity LIKE 'threat_actor--%' AND to_entity LIKE 'tool--%'"
    ).get().cnt;

    assert.equal(gsRelations, gsCount, `should have ${gsCount} group->software relations, got ${gsRelations}`);
  });

  it('creates uses relations for software_techniques rows', () => {
    const { importStixFromIntel } = loadKnowledge();
    importStixFromIntel(programDb, intelDb);

    const stCount = intelDb.prepare('SELECT COUNT(*) AS cnt FROM software_techniques').get().cnt;
    const stRelations = programDb.prepare(
      "SELECT COUNT(*) AS cnt FROM kg_relations WHERE relation_type = 'uses' AND source = 'att&ck-stix' AND from_entity LIKE 'tool--%'"
    ).get().cnt;

    assert.equal(stRelations, stCount, `should have ${stCount} software->technique relations, got ${stRelations}`);
  });

  it('idempotent -- running twice does not duplicate rows', () => {
    const { importStixFromIntel } = loadKnowledge();

    importStixFromIntel(programDb, intelDb);

    const entityCount = programDb.prepare(
      "SELECT COUNT(*) AS cnt FROM kg_entities WHERE source = 'att&ck-stix'"
    ).get().cnt;
    const relationCount = programDb.prepare(
      "SELECT COUNT(*) AS cnt FROM kg_relations WHERE source = 'att&ck-stix'"
    ).get().cnt;

    importStixFromIntel(programDb, intelDb);

    const entityCountAfter = programDb.prepare(
      "SELECT COUNT(*) AS cnt FROM kg_entities WHERE source = 'att&ck-stix'"
    ).get().cnt;
    const relationCountAfter = programDb.prepare(
      "SELECT COUNT(*) AS cnt FROM kg_relations WHERE source = 'att&ck-stix'"
    ).get().cnt;

    assert.equal(entityCount, entityCountAfter, 'entity count should not change on re-import');
    assert.equal(relationCount, relationCountAfter, 'relation count should not change on re-import');
  });

  it('STIX-imported entities have source att&ck-stix', () => {
    const { importStixFromIntel } = loadKnowledge();
    importStixFromIntel(programDb, intelDb);

    const stixEntities = programDb.prepare(
      "SELECT * FROM kg_entities WHERE source = 'att&ck-stix' LIMIT 5"
    ).all();
    assert.ok(stixEntities.length > 0);
    for (const e of stixEntities) {
      assert.equal(e.source, 'att&ck-stix', 'source should be att&ck-stix');
    }
  });
});
