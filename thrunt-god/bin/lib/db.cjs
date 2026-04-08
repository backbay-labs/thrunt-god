'use strict';

const path = require('path');
const fs = require('fs');

// Lazy-load better-sqlite3 with helpful error message
let Database;
try {
  Database = require('better-sqlite3');
} catch (err) {
  const msg = 'better-sqlite3 native module not found. ' +
    'Run `npm rebuild better-sqlite3` or ensure Node.js build tools are installed.';
  throw new Error(msg);
}

const { planningRoot } = require('./core.cjs');
const { extractFrontmatter } = require('./frontmatter.cjs');

// Lazy-load knowledge graph module (Phase 56)
let _knowledge;
function getKnowledge() {
  if (!_knowledge) _knowledge = require('../../../mcp-hunt-intel/lib/knowledge.cjs');
  return _knowledge;
}

let _intel;
function getIntel() {
  if (!_intel) _intel = require('../../../mcp-hunt-intel/lib/intel.cjs');
  return _intel;
}

// ─── Regex patterns ─────────────────────────────────────────────────────────

// Technique IDs: T1078, T1078.002, t1059.001 (case-insensitive)
const TECHNIQUE_RE = /T\d{4}(?:\.\d{3})?/gi;

// IOC patterns (targeted, not comprehensive)
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const MD5_RE = /\b[a-fA-F0-9]{32}\b/g;
const SHA1_RE = /\b[a-fA-F0-9]{40}\b/g;
const SHA256_RE = /\b[a-fA-F0-9]{64}\b/g;

// ─── Helper exports ─────────────────────────────────────────────────────────

/**
 * Extract unique uppercase technique IDs from text.
 * @param {string} text
 * @returns {string[]}
 */
function extractTechniqueIds(text) {
  if (!text) return [];
  const matches = text.match(TECHNIQUE_RE) || [];
  return [...new Set(matches.map(t => t.toUpperCase()))];
}

/**
 * Extract IOCs (IPv4, MD5, SHA1, SHA256) from text.
 * @param {string} text
 * @returns {{ ips: string[], md5s: string[], sha1s: string[], sha256s: string[] }}
 */
function extractIOCs(text) {
  if (!text) return { ips: [], md5s: [], sha1s: [], sha256s: [] };

  // Extract SHA256 first (longest), then SHA1, then MD5 to avoid substring collisions
  const sha256s = [...new Set(text.match(SHA256_RE) || [])];

  // Remove SHA256 matches from text before SHA1 extraction to avoid partial matches
  let reduced = text;
  for (const h of sha256s) reduced = reduced.replace(h, '');

  const sha1s = [...new Set(reduced.match(SHA1_RE) || [])];

  // Remove SHA1 matches before MD5 extraction
  for (const h of sha1s) reduced = reduced.replace(h, '');

  const md5s = [...new Set(reduced.match(MD5_RE) || [])];

  const ips = [...new Set(text.match(IPV4_RE) || [])];

  return { ips, md5s, sha1s, sha256s };
}

// ─── Schema ─────────────────────────────────────────────────────────────────

/**
 * Create all tables idempotently.
 * Tables: case_index, case_artifacts, case_artifacts_fts (FTS5), case_techniques
 * @param {import('better-sqlite3').Database} db
 */
function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS case_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'closed',
      opened_at TEXT,
      closed_at TEXT,
      outcome_summary TEXT
    );

    CREATE TABLE IF NOT EXISTS case_artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL REFERENCES case_index(id) ON DELETE CASCADE,
      artifact_type TEXT NOT NULL CHECK(artifact_type IN ('finding','hypothesis','technique','ioc')),
      content TEXT NOT NULL,
      technique_ids TEXT DEFAULT ''
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS case_artifacts_fts USING fts5(
      content,
      artifact_type,
      content='case_artifacts',
      content_rowid='id',
      tokenize='porter unicode61'
    );

    CREATE TABLE IF NOT EXISTS case_techniques (
      case_id INTEGER NOT NULL REFERENCES case_index(id) ON DELETE CASCADE,
      technique_id TEXT NOT NULL,
      PRIMARY KEY (case_id, technique_id)
    );

    CREATE INDEX IF NOT EXISTS idx_case_techniques_tid
      ON case_techniques(technique_id);
  `);
}

// ─── Database lifecycle ─────────────────────────────────────────────────────

/**
 * Open (or create) the program SQLite database.
 * Returns null if .planning/ directory does not exist.
 * @param {string} cwd
 * @returns {import('better-sqlite3').Database | null}
 */
function openProgramDb(cwd) {
  const root = planningRoot(cwd);

  // No .planning directory means no program — return null instead of throwing
  if (!fs.existsSync(root)) {
    return null;
  }

  const dbPath = path.join(root, 'program.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  ensureSchema(db);

  // Phase 56: Knowledge graph tables
  try {
    const kg = getKnowledge();
    kg.ensureKnowledgeSchema(db);

    // Auto-import STIX relationships on first open (when kg_entities is empty)
    const entityCount = db.prepare('SELECT COUNT(*) AS cnt FROM kg_entities').get().cnt;
    if (entityCount === 0) {
      try {
        const intel = getIntel();
        const intelDb = intel.openIntelDb();
        kg.importStixFromIntel(db, intelDb);
        intelDb.close();
      } catch (e) {
        // Non-fatal: intel.db may not exist yet (first run without MCP)
      }
    }
  } catch (e) {
    // Non-fatal: knowledge.cjs may not be available in minimal installs
  }

  return db;
}

// ─── Indexing ───────────────────────────────────────────────────────────────

/**
 * Parse HYPOTHESES.md into individual hypothesis sections.
 * Splits on ## or ### headings.
 * @param {string} content
 * @returns {string[]}
 */
function parseHypotheses(content) {
  if (!content) return [];

  const sections = [];
  const lines = content.split('\n');
  let current = [];
  let inHypothesis = false;

  for (const line of lines) {
    if (/^#{2,3}\s+/.test(line)) {
      if (inHypothesis && current.length > 0) {
        sections.push(current.join('\n').trim());
      }
      current = [line];
      inHypothesis = true;
    } else if (inHypothesis) {
      current.push(line);
    }
  }

  // Push the last section
  if (inHypothesis && current.length > 0) {
    sections.push(current.join('\n').trim());
  }

  return sections.filter(s => s.length > 0);
}

/**
 * Read a case's STATE.md frontmatter for metadata.
 * @param {string} caseDir
 * @returns {{ name: string, status: string, opened_at: string|null, closed_at: string|null, outcome_summary: string|null }}
 */
function readCaseMetadata(caseDir) {
  const statePath = path.join(caseDir, 'STATE.md');
  const defaults = { name: path.basename(caseDir), status: 'closed', opened_at: null, closed_at: null, outcome_summary: null };

  if (!fs.existsSync(statePath)) return defaults;

  const content = fs.readFileSync(statePath, 'utf-8');
  const fm = extractFrontmatter(content);

  return {
    name: fm.title || defaults.name,
    status: fm.status || defaults.status,
    opened_at: fm.opened_at || defaults.opened_at,
    closed_at: fm.closed_at || defaults.closed_at,
    outcome_summary: fm.outcome_summary || defaults.outcome_summary,
  };
}

/**
 * Index a case's artifacts into the program database.
 * Idempotent: re-indexing replaces existing entries.
 * Uses BEGIN IMMEDIATE transaction to avoid write-upgrade deadlock.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} slug
 * @param {string} caseDir
 */
function indexCase(db, slug, caseDir) {
  const doIndex = db.transaction((slug, caseDir) => {
    // Read case metadata
    const meta = readCaseMetadata(caseDir);

    // ── Upsert case_index row ──────────────────────────────────────────────
    let caseRow = db.prepare('SELECT id FROM case_index WHERE slug = ?').get(slug);

    if (caseRow) {
      // Update existing row
      db.prepare(
        'UPDATE case_index SET name = ?, status = ?, opened_at = ?, closed_at = ?, outcome_summary = ? WHERE id = ?'
      ).run(meta.name, meta.status, meta.opened_at, meta.closed_at, meta.outcome_summary, caseRow.id);

      // ── Delete existing FTS entries BEFORE content rows (Pitfall 2 mitigation) ──
      const existingArtifacts = db.prepare(
        'SELECT id, content, artifact_type FROM case_artifacts WHERE case_id = ?'
      ).all(caseRow.id);

      const delFts = db.prepare(
        "INSERT INTO case_artifacts_fts(case_artifacts_fts, rowid, content, artifact_type) VALUES('delete', ?, ?, ?)"
      );
      for (const a of existingArtifacts) {
        delFts.run(a.id, a.content, a.artifact_type);
      }

      // Now delete content rows and techniques
      db.prepare('DELETE FROM case_artifacts WHERE case_id = ?').run(caseRow.id);
      db.prepare('DELETE FROM case_techniques WHERE case_id = ?').run(caseRow.id);
    } else {
      // Insert new case_index row
      const info = db.prepare(
        'INSERT INTO case_index (slug, name, status, opened_at, closed_at, outcome_summary) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(slug, meta.name, meta.status, meta.opened_at, meta.closed_at, meta.outcome_summary);
      caseRow = { id: info.lastInsertRowid };
    }

    const caseId = caseRow.id;

    // ── Prepared statements for artifact insertion ──────────────────────────
    const insertArtifact = db.prepare(
      'INSERT INTO case_artifacts (case_id, artifact_type, content, technique_ids) VALUES (?, ?, ?, ?)'
    );
    const insertFts = db.prepare(
      'INSERT INTO case_artifacts_fts(rowid, content, artifact_type) VALUES (?, ?, ?)'
    );
    const insertTechnique = db.prepare(
      'INSERT OR IGNORE INTO case_techniques (case_id, technique_id) VALUES (?, ?)'
    );

    // Collect all text for technique/IOC extraction
    let allText = '';

    // ── Read FINDINGS.md ──────────────────────────────────────────────────
    const findingsPath = path.join(caseDir, 'FINDINGS.md');
    if (fs.existsSync(findingsPath)) {
      const findings = fs.readFileSync(findingsPath, 'utf-8');
      allText += findings + '\n';

      const info = insertArtifact.run(caseId, 'finding', findings, '');
      insertFts.run(info.lastInsertRowid, findings, 'finding');
    }

    // ── Read and parse HYPOTHESES.md ──────────────────────────────────────
    const hypothesesPath = path.join(caseDir, 'HYPOTHESES.md');
    if (fs.existsSync(hypothesesPath)) {
      const hypothesesContent = fs.readFileSync(hypothesesPath, 'utf-8');
      allText += hypothesesContent + '\n';

      const sections = parseHypotheses(hypothesesContent);
      if (sections.length > 0) {
        for (const section of sections) {
          const info = insertArtifact.run(caseId, 'hypothesis', section, '');
          insertFts.run(info.lastInsertRowid, section, 'hypothesis');
        }
      } else {
        // Index the whole file as one hypothesis artifact if no sections found
        const info = insertArtifact.run(caseId, 'hypothesis', hypothesesContent, '');
        insertFts.run(info.lastInsertRowid, hypothesesContent, 'hypothesis');
      }
    }

    // ── Extract and insert technique IDs ──────────────────────────────────
    const techIds = extractTechniqueIds(allText);
    for (const tid of techIds) {
      insertTechnique.run(caseId, tid);
    }

    // ── Extract and insert IOCs ───────────────────────────────────────────
    const iocs = extractIOCs(allText);
    const iocParts = [];
    for (const ip of iocs.ips) iocParts.push(`ip:${ip}`);
    for (const md5 of iocs.md5s) iocParts.push(`md5:${md5}`);
    for (const sha1 of iocs.sha1s) iocParts.push(`sha1:${sha1}`);
    for (const sha256 of iocs.sha256s) iocParts.push(`sha256:${sha256}`);

    if (iocParts.length > 0) {
      const iocContent = iocParts.join('\n');
      const info = insertArtifact.run(caseId, 'ioc', iocContent, '');
      insertFts.run(info.lastInsertRowid, iocContent, 'ioc');
    }
  });

  // BEGIN IMMEDIATE to avoid write-upgrade deadlock
  doIndex.immediate(slug, caseDir);
}

// ─── Search ─────────────────────────────────────────────────────────────────

/**
 * Full-text search across all indexed cases.
 * Returns ranked results with FTS5 snippets joined to case_index metadata.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} query
 * @param {{ limit?: number }} [options={}]
 * @returns {Array<{ slug: string, name: string, status: string, opened_at: string|null, closed_at: string|null, outcome_summary: string|null, artifact_type: string, match_snippet: string, relevance_score: number }>}
 */
function searchCases(db, query, options = {}) {
  if (!query || typeof query !== 'string' || query.trim() === '') return [];

  const limit = options.limit || 10;

  try {
    const stmt = db.prepare(`
      SELECT
        ci.slug,
        ci.name,
        ci.status,
        ci.opened_at,
        ci.closed_at,
        ci.outcome_summary,
        ca.artifact_type,
        snippet(case_artifacts_fts, 0, '**', '**', '...', 32) AS match_snippet,
        bm25(case_artifacts_fts, 5.0, 1.0) AS relevance_score
      FROM case_artifacts_fts fts
      JOIN case_artifacts ca ON ca.id = fts.rowid
      JOIN case_index ci ON ci.id = ca.case_id
      WHERE case_artifacts_fts MATCH ?
      ORDER BY relevance_score
      LIMIT ?
    `);
    return stmt.all(query, limit);
  } catch {
    // Return empty array on error (malformed query, empty DB, etc.)
    return [];
  }
}

// ─── Technique Overlap ──────────────────────────────────────────────────────

/**
 * Find cases that share technique IDs with the given list.
 * Uses B-tree case_techniques table for exact matching (not FTS5).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string[]|null} techniqueIds
 * @returns {Array<{ slug: string, name: string, status: string, outcome_summary: string|null, overlapping_techniques: string, overlap_count: number }>}
 */
function findTechniqueOverlap(db, techniqueIds) {
  if (!techniqueIds || techniqueIds.length === 0) return [];

  const placeholders = techniqueIds.map(() => '?').join(',');
  const stmt = db.prepare(`
    SELECT
      ci.slug,
      ci.name,
      ci.status,
      ci.outcome_summary,
      GROUP_CONCAT(DISTINCT ct.technique_id) AS overlapping_techniques,
      COUNT(DISTINCT ct.technique_id) AS overlap_count
    FROM case_techniques ct
    JOIN case_index ci ON ci.id = ct.case_id
    WHERE ct.technique_id IN (${placeholders})
    GROUP BY ct.case_id
    ORDER BY overlap_count DESC
  `);

  return stmt.all(...techniqueIds);
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  openProgramDb,
  ensureSchema,
  indexCase,
  searchCases,
  findTechniqueOverlap,
  extractTechniqueIds,
  extractIOCs,
};
