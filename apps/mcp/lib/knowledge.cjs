'use strict';

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function makeEntityId(type, name) {
  return `${type}--${slugify(name)}`;
}

function splitCsv(value) {
  if (!value || typeof value !== 'string') return [];
  return value.split(',').map(part => part.trim()).filter(Boolean);
}

function buildAttackDescription(label, attackId, description = '') {
  const prefix = `${label}: ${attackId}.`;
  const trimmed = description.trim();
  return trimmed ? `${prefix} ${trimmed}` : prefix;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ type: string, name: string, description?: string, metadata?: string, source?: string, id?: string }} opts
 * @returns {object}
 */
function upsertEntityRecord(db, opts) {
  if (!db.inTransaction) {
    let entity;
    const doUpsert = db.transaction(() => {
      entity = upsertEntityRecord(db, opts);
    });
    doUpsert.immediate();
    return entity;
  }

  const id = opts.id || makeEntityId(opts.type, opts.name);
  const type = opts.type;
  const name = opts.name;
  const description = opts.description || '';
  const metadata = opts.metadata || '{}';
  const source = opts.source || 'manual';
  const created_at = new Date().toISOString();

  const existing = db.prepare('SELECT rowid FROM kg_entities WHERE id = ?').get(id);
  if (existing) {
    db.prepare('DELETE FROM kg_entities_fts WHERE rowid = ?').run(existing.rowid);
  }

  db.prepare(
    'INSERT OR REPLACE INTO kg_entities (id, type, name, description, metadata, created_at, source) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, type, name, description, metadata, created_at, source);

  const newRow = db.prepare('SELECT rowid FROM kg_entities WHERE id = ?').get(id);
  db.prepare(
    'INSERT INTO kg_entities_fts (rowid, name, description) VALUES (?, ?, ?)'
  ).run(newRow.rowid, name, description);

  return { id, type, name, description, metadata, created_at, source };
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function ensureKnowledgeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kg_entities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      source TEXT DEFAULT 'manual'
    );

    CREATE TABLE IF NOT EXISTS kg_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_entity TEXT NOT NULL,
      to_entity TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      source TEXT DEFAULT 'manual'
    );

    CREATE TABLE IF NOT EXISTS kg_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_slug TEXT,
      technique_id TEXT,
      decision TEXT NOT NULL,
      reasoning TEXT DEFAULT '',
      context TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kg_learnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      pattern TEXT NOT NULL,
      detail TEXT DEFAULT '',
      technique_ids TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      case_slug TEXT DEFAULT ''
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS kg_entities_fts USING fts5(
      name,
      description,
      tokenize='porter unicode61'
    );
  `);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ type: string, name: string, description?: string, metadata?: string, source?: string, id?: string }} opts
 * @returns {object}
 */
function addEntity(db, opts) {
  return upsertEntityRecord(db, opts);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} id
 * @returns {object|null}
 */
function getEntity(db, id) {
  const row = db.prepare('SELECT * FROM kg_entities WHERE id = ?').get(id);
  return row || null;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ type?: string, name?: string, limit?: number }} filters
 * @returns {object[]}
 */
function findEntities(db, filters = {}) {
  const limit = filters.limit || 100;
  const conditions = [];
  const params = [];

  if (filters.type) {
    conditions.push('type = ?');
    params.push(filters.type);
  }

  if (filters.name) {
    conditions.push('name = ?');
    params.push(filters.name);
  }

  let sql = 'SELECT * FROM kg_entities';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ from_entity: string, to_entity: string, relation_type: string, metadata?: string, source?: string }} opts
 * @returns {object}
 */
function addRelation(db, opts) {
  const from_entity = opts.from_entity;
  const to_entity = opts.to_entity;
  const relation_type = opts.relation_type;
  const metadata = opts.metadata || '{}';
  const source = opts.source || 'manual';
  const created_at = new Date().toISOString();

  const info = db.prepare(
    'INSERT INTO kg_relations (from_entity, to_entity, relation_type, metadata, created_at, source) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(from_entity, to_entity, relation_type, metadata, created_at, source);

  return { id: info.lastInsertRowid, from_entity, to_entity, relation_type, metadata, created_at, source };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} entityId
 * @param {{ direction?: 'incoming'|'outgoing', relation_type?: string }} [opts={}]
 * @returns {object[]}
 */
function getRelations(db, entityId, opts = {}) {
  const conditions = [];
  const params = [];

  if (opts.direction === 'outgoing') {
    conditions.push('from_entity = ?');
    params.push(entityId);
  } else if (opts.direction === 'incoming') {
    conditions.push('to_entity = ?');
    params.push(entityId);
  } else {
    conditions.push('(from_entity = ? OR to_entity = ?)');
    params.push(entityId, entityId);
  }

  if (opts.relation_type) {
    conditions.push('relation_type = ?');
    params.push(opts.relation_type);
  }

  let sql = 'SELECT * FROM kg_relations WHERE ' + conditions.join(' AND ');
  if (opts.limit) {
    sql += ' LIMIT ?';
    params.push(opts.limit);
  }
  return db.prepare(sql).all(...params);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} query
 * @param {{ type?: string, limit?: number }} [opts={}]
 * @returns {object[]}
 */
function searchEntities(db, query, opts = {}) {
  if (!query || typeof query !== 'string' || query.trim() === '') return [];

  const limit = opts.limit || 50;
  const normalised = query.trim().toUpperCase();

  if (/^[A-Z]\d{4}(?:\.\d{3})?$/.test(normalised)) {
    const conditions = ['metadata LIKE ?'];
    const params = [`%"attack_id":"${normalised}"%`];

    if (opts.type) {
      conditions.push('type = ?');
      params.push(opts.type);
    }

    const exactMatches = db.prepare(
      `SELECT * FROM kg_entities WHERE ${conditions.join(' AND ')} LIMIT ?`
    ).all(...params, limit);

    if (exactMatches.length > 0) {
      return exactMatches;
    }
  }

  try {
    let sql = `
      SELECT e.*
      FROM kg_entities e
      INNER JOIN (
        SELECT rowid, rank FROM kg_entities_fts WHERE kg_entities_fts MATCH ? ORDER BY rank
      ) AS fts ON e.rowid = fts.rowid
    `;
    const params = [query];
    const conditions = [];

    if (opts.type) {
      conditions.push('e.type = ?');
      params.push(opts.type);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY fts.rank LIMIT ?';
    params.push(limit);

    return db.prepare(sql).all(...params);
  } catch {
    return [];
  }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ case_slug: string, technique_id: string, decision: string, reasoning?: string, context?: string }} opts
 * @returns {object}
 */
function logDecision(db, opts) {
  const case_slug = opts.case_slug || '';
  const technique_id = opts.technique_id || '';
  const decision = opts.decision;
  const reasoning = opts.reasoning || '';
  const context = opts.context || '';
  const created_at = new Date().toISOString();

  const info = db.prepare(
    'INSERT INTO kg_decisions (case_slug, technique_id, decision, reasoning, context, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(case_slug, technique_id, decision, reasoning, context, created_at);

  return { id: info.lastInsertRowid, case_slug, technique_id, decision, reasoning, context, created_at };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ technique_id?: string, case_slug?: string, limit?: number }} [filters={}]
 * @returns {object[]}
 */
function getDecisions(db, filters = {}) {
  const limit = filters.limit || 100;
  const conditions = [];
  const params = [];

  if (filters.technique_id) {
    conditions.push('technique_id = ?');
    params.push(filters.technique_id);
  }

  if (filters.case_slug) {
    conditions.push('case_slug = ?');
    params.push(filters.case_slug);
  }

  let sql = 'SELECT * FROM kg_decisions';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ topic: string, pattern: string, detail?: string, technique_ids?: string, case_slug?: string }} opts
 * @returns {object}
 */
function logLearning(db, opts) {
  const topic = opts.topic;
  const pattern = opts.pattern;
  const detail = opts.detail || '';
  const technique_ids = opts.technique_ids || '';
  const case_slug = opts.case_slug || '';
  const created_at = new Date().toISOString();

  const info = db.prepare(
    'INSERT INTO kg_learnings (topic, pattern, detail, technique_ids, created_at, case_slug) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(topic, pattern, detail, technique_ids, created_at, case_slug);

  return { id: info.lastInsertRowid, topic, pattern, detail, technique_ids, created_at, case_slug };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ topic?: string, technique_id?: string, case_slug?: string, limit?: number }} [filters={}]
 * @returns {object[]}
 */
function getLearnings(db, filters = {}) {
  const limit = filters.limit || 100;
  const conditions = [];
  const params = [];

  if (filters.topic) {
    conditions.push('topic = ?');
    params.push(filters.topic);
  }

  if (filters.technique_id) {
    conditions.push('technique_ids LIKE ?');
    params.push(`%${filters.technique_id}%`);
  }

  if (filters.case_slug) {
    conditions.push('case_slug = ?');
    params.push(filters.case_slug);
  }

  let sql = 'SELECT * FROM kg_learnings';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params);
}

/**
 * @param {import('better-sqlite3').Database} programDb
 * @param {import('better-sqlite3').Database} intelDb
 * @returns {boolean}
 */
function hasCompleteStixImport(programDb, intelDb) {
  const expectedTechniqueCount = intelDb.prepare('SELECT COUNT(*) AS cnt FROM techniques').get().cnt;
  const expectedGroupCount = intelDb.prepare('SELECT COUNT(*) AS cnt FROM groups').get().cnt;
  const expectedToolCount = intelDb.prepare('SELECT COUNT(*) AS cnt FROM software').get().cnt;
  const expectedRelationCount =
    intelDb.prepare(`
      SELECT COUNT(*) AS cnt
      FROM group_techniques gt
      INNER JOIN techniques t ON UPPER(t.id) = UPPER(gt.technique_id)
    `).get().cnt +
    intelDb.prepare('SELECT COUNT(*) AS cnt FROM group_software').get().cnt +
    intelDb.prepare(`
      SELECT COUNT(*) AS cnt
      FROM software_techniques st
      INNER JOIN techniques t ON UPPER(t.id) = UPPER(st.technique_id)
    `).get().cnt;

  const actualTechniqueCount = programDb.prepare(
    "SELECT COUNT(*) AS cnt FROM kg_entities WHERE source = 'att&ck-stix' AND type = 'technique'"
  ).get().cnt;
  const actualGroupCount = programDb.prepare(
    "SELECT COUNT(*) AS cnt FROM kg_entities WHERE source = 'att&ck-stix' AND type = 'threat_actor'"
  ).get().cnt;
  const actualToolCount = programDb.prepare(
    "SELECT COUNT(*) AS cnt FROM kg_entities WHERE source = 'att&ck-stix' AND type = 'tool'"
  ).get().cnt;
  const actualRelationCount = programDb.prepare(
    "SELECT COUNT(*) AS cnt FROM kg_relations WHERE source = 'att&ck-stix'"
  ).get().cnt;
  const danglingRelationCount = programDb.prepare(`
    SELECT COUNT(*) AS cnt
    FROM kg_relations r
    LEFT JOIN kg_entities src ON src.id = r.from_entity
    LEFT JOIN kg_entities dst ON dst.id = r.to_entity
    WHERE r.source = 'att&ck-stix'
      AND (src.id IS NULL OR dst.id IS NULL)
  `).get().cnt;

  return (
    actualTechniqueCount === expectedTechniqueCount &&
    actualGroupCount === expectedGroupCount &&
    actualToolCount === expectedToolCount &&
    actualRelationCount === expectedRelationCount &&
    danglingRelationCount === 0
  );
}

/**
 * Import ATT&CK STIX relationships from intel.db into the knowledge graph.
 * Idempotent: upserts entities, deletes and re-inserts STIX relations.
 * When intelDb is omitted, programDb is used as both the ATT&CK source and
 * knowledge-graph target. The MCP server uses that embedded mode inside
 * intel.db; the CLI passes a separate program.db target.
 *
 * @param {import('better-sqlite3').Database} programDb
 * @param {import('better-sqlite3').Database | { force?: boolean }} [intelDbOrOpts]
 * @param {{ force?: boolean }} [opts={}]
 */
function importStixFromIntel(programDb, intelDbOrOpts, opts = {}) {
  const intelDb = intelDbOrOpts && typeof intelDbOrOpts.prepare === 'function'
    ? intelDbOrOpts
    : programDb;
  const effectiveOpts = intelDb === intelDbOrOpts ? opts : (intelDbOrOpts || {});

  if (!effectiveOpts.force && hasCompleteStixImport(programDb, intelDb)) {
    return { imported: false };
  }

  const techniques = intelDb.prepare('SELECT * FROM techniques').all();
  const groups = intelDb.prepare('SELECT * FROM groups').all();
  const software = intelDb.prepare('SELECT * FROM software').all();
  const groupTechniques = intelDb.prepare('SELECT * FROM group_techniques').all();
  const groupSoftware = intelDb.prepare('SELECT * FROM group_software').all();
  const softwareTechniques = intelDb.prepare('SELECT * FROM software_techniques').all();
  const techniqueIds = new Set(techniques.map(t => String(t.id).toUpperCase()));

  const groupMap = new Map();
  for (const g of groups) groupMap.set(g.id, g);

  const softwareMap = new Map();
  for (const s of software) softwareMap.set(s.id, s);

  const doImport = programDb.transaction(() => {
    programDb.prepare("DELETE FROM kg_relations WHERE source = 'att&ck-stix'").run();

    for (const t of techniques) {
      addEntityDirect(programDb, {
        id: `technique--${String(t.id).toLowerCase()}`,
        type: 'technique',
        name: t.name,
        description: buildAttackDescription('ATT&CK Technique ID', t.id, t.description || ''),
        metadata: JSON.stringify({
          attack_id: t.id,
          tactics: splitCsv(t.tactics),
          platforms: splitCsv(t.platforms),
          data_sources: splitCsv(t.data_sources),
          url: t.url || '',
        }),
        source: 'att&ck-stix',
      });
    }

    for (const g of groups) {
      addEntityDirect(programDb, {
        type: 'threat_actor',
        name: g.name,
        description: buildAttackDescription('ATT&CK Group ID', g.id, g.description || ''),
        metadata: JSON.stringify({
          attack_id: g.id,
          aliases: splitCsv(g.aliases),
          url: g.url || '',
        }),
        source: 'att&ck-stix',
      });
    }

    for (const s of software) {
      addEntityDirect(programDb, {
        type: 'tool',
        name: s.name,
        description: buildAttackDescription('ATT&CK Software ID', s.id, s.description || ''),
        metadata: JSON.stringify({
          attack_id: s.id,
          software_type: s.type || '',
        }),
        source: 'att&ck-stix',
      });
    }

    const insertRelation = programDb.prepare(
      'INSERT INTO kg_relations (from_entity, to_entity, relation_type, metadata, created_at, source) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const now = new Date().toISOString();

    for (const gt of groupTechniques) {
      const group = groupMap.get(gt.group_id);
      if (!group || !techniqueIds.has(String(gt.technique_id).toUpperCase())) continue;
      const fromId = makeEntityId('threat_actor', group.name);
      const toId = `technique--${String(gt.technique_id).toLowerCase()}`;
      insertRelation.run(fromId, toId, 'uses', '{}', now, 'att&ck-stix');
    }

    for (const gs of groupSoftware) {
      const group = groupMap.get(gs.group_id);
      const sw = softwareMap.get(gs.software_id);
      if (!group || !sw) continue;
      const fromId = makeEntityId('threat_actor', group.name);
      const toId = makeEntityId('tool', sw.name);
      insertRelation.run(fromId, toId, 'uses', '{}', now, 'att&ck-stix');
    }

    for (const st of softwareTechniques) {
      const sw = softwareMap.get(st.software_id);
      if (!sw || !techniqueIds.has(String(st.technique_id).toUpperCase())) continue;
      const fromId = makeEntityId('tool', sw.name);
      const toId = `technique--${String(st.technique_id).toLowerCase()}`;
      insertRelation.run(fromId, toId, 'uses', '{}', now, 'att&ck-stix');
    }
  });

  doImport.immediate();
  return { imported: true };
}

function addEntityDirect(db, opts) {
  return upsertEntityRecord(db, opts);
}

module.exports = {
  ensureKnowledgeSchema,
  addEntity,
  addRelation,
  getEntity,
  findEntities,
  getRelations,
  searchEntities,
  logDecision,
  logLearning,
  getDecisions,
  getLearnings,
  importStixFromIntel,
};
