'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

// Resolve better-sqlite3 from mcp-hunt-intel's own dependencies (or monorepo root)
const Database = require('better-sqlite3');

// ─── Defaults (overridable via openIntelDb opts) ────────────────────────────

const INTEL_DB_DIR = path.join(os.homedir(), '.thrunt');
const INTEL_DB_PATH = path.join(INTEL_DB_DIR, 'intel.db');

// Data file paths (relative to this file's location in mcp-hunt-intel/lib/)
const TECHNIQUES_DATA = path.join(__dirname, '..', '..', 'thrunt-god', 'data', 'mitre-attack-enterprise.json');
const GROUPS_DATA = path.join(__dirname, '..', '..', 'thrunt-god', 'data', 'mitre-attack-groups.json');

// ─── Schema ─────────────────────────────────────────────────────────────────

/**
 * Create all tables idempotently.
 * Uses regular FTS5 (NOT external content) since intel.db data is
 * write-once/immutable after population. This avoids sync issues.
 *
 * @param {import('better-sqlite3').Database} db
 */
function ensureIntelSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS techniques (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      tactics TEXT,
      platforms TEXT,
      data_sources TEXT,
      url TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS techniques_fts USING fts5(
      name, description, id,
      tokenize='porter unicode61'
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      aliases TEXT,
      description TEXT,
      url TEXT
    );

    CREATE TABLE IF NOT EXISTS group_techniques (
      group_id TEXT NOT NULL REFERENCES groups(id),
      technique_id TEXT NOT NULL,
      PRIMARY KEY (group_id, technique_id)
    );

    CREATE TABLE IF NOT EXISTS group_software (
      group_id TEXT NOT NULL,
      software_id TEXT NOT NULL,
      PRIMARY KEY (group_id, software_id)
    );

    CREATE TABLE IF NOT EXISTS software (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS software_techniques (
      software_id TEXT NOT NULL REFERENCES software(id),
      technique_id TEXT NOT NULL,
      PRIMARY KEY (software_id, technique_id)
    );

    CREATE INDEX IF NOT EXISTS idx_gt_tid ON group_techniques(technique_id);
    CREATE INDEX IF NOT EXISTS idx_st_tid ON software_techniques(technique_id);
  `);
}

// ─── Population ─────────────────────────────────────────────────────────────

/**
 * Build the ATT&CK technique URL from an ID.
 * T1059 -> https://attack.mitre.org/techniques/T1059/
 * T1059.001 -> https://attack.mitre.org/techniques/T1059/001/
 *
 * @param {string} id
 * @returns {string}
 */
function buildTechniqueUrl(id) {
  return `https://attack.mitre.org/techniques/${id.replace('.', '/')}/`;
}

/**
 * Populate the database from bundled JSON files if empty.
 * Uses BEGIN IMMEDIATE to prevent concurrent population races.
 * Idempotent: skips if techniques already exist.
 *
 * @param {import('better-sqlite3').Database} db
 */
function populateIfEmpty(db) {
  const doPopulate = db.transaction(() => {
    // Check if already populated
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM techniques').get().cnt;
    if (count > 0) return; // Already populated -- no-op

    // ── Load and insert techniques ──────────────────────────────────────
    const techRaw = fs.readFileSync(TECHNIQUES_DATA, 'utf8');
    const techData = JSON.parse(techRaw);

    const insertTechnique = db.prepare(
      'INSERT OR IGNORE INTO techniques (id, name, description, tactics, platforms, data_sources, url) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const insertFts = db.prepare(
      'INSERT INTO techniques_fts (name, description, id) VALUES (?, ?, ?)'
    );

    for (const t of techData.techniques) {
      const platforms = Array.isArray(t.platforms) ? t.platforms.join(', ') : (t.platforms || '');
      const dataSources = Array.isArray(t.data_sources) ? t.data_sources.join(', ') : (t.data_sources || '');
      const url = buildTechniqueUrl(t.id);

      // Insert parent technique
      insertTechnique.run(t.id, t.name, t.description, t.tactic, platforms, dataSources, url);
      insertFts.run(t.name, t.description, t.id);

      // Insert sub-techniques
      if (Array.isArray(t.sub_techniques)) {
        for (const sub of t.sub_techniques) {
          const subUrl = buildTechniqueUrl(sub.id);
          // Sub-techniques inherit parent's description, tactic, platforms, data_sources
          insertTechnique.run(sub.id, sub.name, t.description, t.tactic, platforms, dataSources, subUrl);
          insertFts.run(sub.name, t.description, sub.id);
        }
      }
    }

    // ── Load and insert groups & software ────────────────────────────────
    const groupsRaw = fs.readFileSync(GROUPS_DATA, 'utf8');
    const groupsData = JSON.parse(groupsRaw);

    const insertGroup = db.prepare(
      'INSERT OR IGNORE INTO groups (id, name, aliases, description, url) VALUES (?, ?, ?, ?, ?)'
    );
    const insertGroupTechnique = db.prepare(
      'INSERT OR IGNORE INTO group_techniques (group_id, technique_id) VALUES (?, ?)'
    );
    const insertGroupSoftware = db.prepare(
      'INSERT OR IGNORE INTO group_software (group_id, software_id) VALUES (?, ?)'
    );

    for (const g of groupsData.groups) {
      insertGroup.run(g.id, g.name, g.aliases || '', g.description || '', g.url || '');

      if (Array.isArray(g.technique_ids)) {
        for (const tid of g.technique_ids) {
          insertGroupTechnique.run(g.id, tid);
        }
      }

      if (Array.isArray(g.software_ids)) {
        for (const sid of g.software_ids) {
          insertGroupSoftware.run(g.id, sid);
        }
      }
    }

    const insertSoftware = db.prepare(
      'INSERT OR IGNORE INTO software (id, name, type, description) VALUES (?, ?, ?, ?)'
    );
    const insertSoftwareTechnique = db.prepare(
      'INSERT OR IGNORE INTO software_techniques (software_id, technique_id) VALUES (?, ?)'
    );

    for (const s of groupsData.software) {
      insertSoftware.run(s.id, s.name, s.type || '', s.description || '');

      if (Array.isArray(s.technique_ids)) {
        for (const tid of s.technique_ids) {
          insertSoftwareTechnique.run(s.id, tid);
        }
      }
    }
  });

  // BEGIN IMMEDIATE to avoid write-upgrade deadlock
  doPopulate.immediate();
}

// ─── Database Lifecycle ─────────────────────────────────────────────────────

/**
 * Open (or create) the global intel.db database.
 * Accepts opts.dbDir and opts.dbPath for testing (to avoid touching ~/.thrunt/).
 *
 * @param {{ dbDir?: string, dbPath?: string }} [opts={}]
 * @returns {import('better-sqlite3').Database}
 */
function openIntelDb(opts = {}) {
  const dbDir = opts.dbDir || INTEL_DB_DIR;
  const dbPath = opts.dbPath || path.join(dbDir, 'intel.db');

  fs.mkdirSync(dbDir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  ensureIntelSchema(db);
  populateIfEmpty(db);

  return db;
}

// ─── Query Functions ────────────────────────────────────────────────────────

/**
 * Look up a technique by ID (e.g., "T1059" or "T1059.001").
 * Case-insensitive. Returns the technique row or null.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} id
 * @returns {object|null}
 */
function lookupTechnique(db, id) {
  if (!id || typeof id !== 'string') return null;
  const normalised = id.toUpperCase().trim();

  const row = db.prepare('SELECT * FROM techniques WHERE id = ? COLLATE NOCASE').get(normalised);
  if (!row) return null;

  // If sub-technique, also query parent for additional context
  if (normalised.includes('.')) {
    const parentId = normalised.split('.')[0];
    const parent = db.prepare('SELECT id, name FROM techniques WHERE id = ?').get(parentId);
    if (parent) {
      row.parent_id = parent.id;
      row.parent_name = parent.name;
    }
  }

  return row;
}

/**
 * Full-text search across technique names and descriptions.
 * Results are ranked by BM25 relevance.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} query
 * @param {{ tactic?: string, platform?: string, limit?: number }} [opts={}]
 * @returns {object[]}
 */
function searchTechniques(db, query, opts = {}) {
  if (!query || typeof query !== 'string' || query.trim() === '') return [];

  const limit = opts.limit || 20;

  try {
    // Build query with optional filters
    let sql = `
      SELECT t.*
      FROM techniques t
      INNER JOIN (
        SELECT id, rank FROM techniques_fts WHERE techniques_fts MATCH ? ORDER BY rank
      ) AS fts ON t.id = fts.id
    `;
    const params = [query];
    const conditions = [];

    if (opts.tactic) {
      conditions.push('t.tactics LIKE ?');
      params.push(`%${opts.tactic}%`);
    }

    if (opts.platform) {
      conditions.push('t.platforms LIKE ?');
      params.push(`%${opts.platform}%`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' LIMIT ?';
    params.push(limit);

    return db.prepare(sql).all(...params);
  } catch {
    // Return empty on malformed FTS query or other errors
    return [];
  }
}

/**
 * Look up a group by ID (e.g., "G0007").
 * Case-insensitive. Returns the group row or null.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} id
 * @returns {object|null}
 */
function lookupGroup(db, id) {
  if (!id || typeof id !== 'string') return null;
  const normalised = id.toUpperCase().trim();

  const row = db.prepare('SELECT * FROM groups WHERE id = ? COLLATE NOCASE').get(normalised);
  return row || null;
}

/**
 * Get all technique IDs associated with a group.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} groupId
 * @returns {string[]}
 */
function getGroupTechniques(db, groupId) {
  if (!groupId || typeof groupId !== 'string') return [];

  const rows = db.prepare(
    'SELECT technique_id FROM group_techniques WHERE group_id = ?'
  ).all(groupId.toUpperCase().trim());

  return rows.map(r => r.technique_id);
}

/**
 * Get all software entries associated with a group.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} groupId
 * @returns {object[]}
 */
function getGroupSoftware(db, groupId) {
  if (!groupId || typeof groupId !== 'string') return [];

  return db.prepare(
    'SELECT s.* FROM software s JOIN group_software gs ON s.id = gs.software_id WHERE gs.group_id = ?'
  ).all(groupId.toUpperCase().trim());
}

/**
 * Get all techniques that have the given tactic.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} tactic
 * @returns {object[]}
 */
function getTechniquesByTactic(db, tactic) {
  if (!tactic || typeof tactic !== 'string') return [];

  return db.prepare(
    'SELECT * FROM techniques WHERE tactics LIKE ?'
  ).all(`%${tactic}%`);
}

/**
 * Get all unique tactic names from the techniques table, sorted.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {string[]}
 */
function getAllTactics(db) {
  const rows = db.prepare('SELECT DISTINCT tactics FROM techniques').all();
  const tacticSet = new Set();

  for (const row of rows) {
    if (!row.tactics) continue;
    const parts = row.tactics.split(',').map(s => s.trim());
    for (const t of parts) {
      if (t) tacticSet.add(t);
    }
  }

  return [...tacticSet].sort();
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  openIntelDb,
  lookupTechnique,
  searchTechniques,
  lookupGroup,
  getGroupTechniques,
  getGroupSoftware,
  getTechniquesByTactic,
  getAllTactics,
  INTEL_DB_DIR,
  INTEL_DB_PATH,
};
