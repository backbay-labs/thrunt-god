'use strict';

const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const toml = require('smol-toml');

// ─── DetectionRow JSDoc ────────────────────────────────────────────────────
/**
 * @typedef {Object} DetectionRow
 * @property {string} id - Composite key: 'source_format:original_id' (e.g., sigma:abc123)
 * @property {string} title
 * @property {string} source_format - 'sigma' | 'escu' | 'elastic' | 'kql'
 * @property {string} technique_ids - Comma-separated, uppercase (T1059,T1059.001)
 * @property {string} tactics - Comma-separated (Execution, Persistence)
 * @property {string} severity - Normalized: informational|low|medium|high|critical
 * @property {string} logsource - Format-specific source info
 * @property {string} query - Detection logic/query text
 * @property {string} description
 * @property {string} metadata - JSON string of format-specific extras
 * @property {string} file_path - Original file path
 */

// ─── Sigma YAML Parser ────────────────────────────────────────────────────

/**
 * Parse a Sigma rule YAML string into a DetectionRow.
 *
 * @param {string} yamlText - Raw YAML text of a Sigma rule
 * @param {string} filePath - File path of the rule (stored in row)
 * @returns {DetectionRow|null} Normalized DetectionRow or null if malformed
 */
function parseSigmaRule(yamlText, filePath) {
  try {
    const doc = yaml.load(yamlText);
    if (!doc || !doc.title) return null;

    const tags = Array.isArray(doc.tags) ? doc.tags : [];

    // Extract MITRE technique IDs: tags matching attack.tXXXX
    const techniqueIds = tags
      .filter(t => /^attack\.t\d{4}/i.test(t))
      .map(t => t.replace(/^attack\./i, '').toUpperCase())
      .filter((v, i, a) => a.indexOf(v) === i); // deduplicate

    // Extract tactics: attack.* tags that are NOT technique IDs
    const tactics = tags
      .filter(t => /^attack\./.test(t) && !/^attack\.t\d{4}/i.test(t))
      .map(t =>
        t.replace(/^attack\./, '')
          .replace(/_/g, ' ')
          .replace(/-/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase())
      )
      .filter((v, i, a) => a.indexOf(v) === i); // deduplicate

    return {
      id: doc.id ? `sigma:${doc.id}` : null,
      title: (doc.title || '').trim(),
      source_format: 'sigma',
      technique_ids: techniqueIds.join(','),
      tactics: tactics.join(','),
      severity: (doc.level || 'medium').toLowerCase().trim(),
      logsource: JSON.stringify(doc.logsource || {}),
      query: typeof doc.detection === 'object' ? JSON.stringify(doc.detection) : (doc.detection || ''),
      description: (doc.description || '').trim(),
      metadata: JSON.stringify({
        status: doc.status || null,
        author: doc.author || null,
        date: doc.date || null,
        modified: doc.modified || null,
        references: doc.references || null,
        falsepositives: doc.falsepositives || null,
        related: doc.related || null,
      }),
      file_path: filePath,
    };
  } catch (err) {
    process.stderr.write(`[detections] Warning: failed to parse Sigma rule ${filePath}: ${err.message}\n`);
    return null;
  }
}

// ─── ESCU YAML Parser ──────────────────────────────────────────────────────

/**
 * Parse an ESCU (Splunk Enterprise Security Content Update) YAML string into a DetectionRow.
 *
 * @param {string} yamlText - Raw YAML text of an ESCU rule
 * @param {string} filePath - File path of the rule
 * @returns {DetectionRow|null} Normalized DetectionRow or null if malformed
 */
function parseEscuRule(yamlText, filePath) {
  try {
    const doc = yaml.load(yamlText);
    if (!doc || !doc.name) return null;

    const tags = doc.tags || {};
    const techniqueIds = Array.isArray(tags.mitre_attack_id)
      ? tags.mitre_attack_id.map(t => t.toUpperCase().trim()).filter((v, i, a) => a.indexOf(v) === i)
      : [];

    const dataSources = Array.isArray(doc.data_source) ? doc.data_source.join(', ') : (doc.data_source || '');

    // Extract risk score from rba.risk_objects[0].score
    let riskScore = null;
    if (doc.rba && Array.isArray(doc.rba.risk_objects) && doc.rba.risk_objects.length > 0) {
      riskScore = doc.rba.risk_objects[0].score || null;
    }

    return {
      id: `escu:${doc.id || ''}`,
      title: (doc.name || '').trim(),
      source_format: 'escu',
      technique_ids: techniqueIds.join(','),
      tactics: '', // ESCU uses risk_score instead of severity/tactics
      severity: '', // ESCU uses risk_score instead
      logsource: dataSources,
      query: (doc.search || '').trim(),
      description: (doc.description || '').trim(),
      metadata: JSON.stringify({
        analytic_story: tags.analytic_story || null,
        asset_type: tags.asset_type || null,
        security_domain: tags.security_domain || null,
        product: tags.product || null,
        data_models: tags.data_models || null,
        risk_score: riskScore,
        known_false_positives: doc.known_false_positives || null,
        how_to_implement: doc.how_to_implement || null,
        references: doc.references || null,
        type: doc.type || null,
        status: doc.status || null,
      }),
      file_path: filePath,
    };
  } catch (err) {
    process.stderr.write(`[detections] Warning: failed to parse ESCU rule ${filePath}: ${err.message}\n`);
    return null;
  }
}

// ─── Elastic TOML Parser ──────────────────────────────────────────────────

/**
 * Parse an Elastic detection rule TOML string into a DetectionRow.
 *
 * @param {string} tomlText - Raw TOML text of an Elastic rule
 * @param {string} filePath - File path of the rule
 * @returns {DetectionRow|null} Normalized DetectionRow or null if malformed
 */
function parseElasticRule(tomlText, filePath) {
  try {
    const doc = toml.parse(tomlText);
    const rule = doc.rule || {};
    const meta = doc.metadata || {};

    if (!rule.name) return null;

    const techniqueIds = [];
    const tacticNames = [];

    // Iterate all [[rule.threat]] entries
    const threats = Array.isArray(rule.threat) ? rule.threat : [];
    for (const threat of threats) {
      // Extract tactic
      if (threat.tactic && threat.tactic.name) {
        const tName = threat.tactic.name.trim();
        if (!tacticNames.includes(tName)) {
          tacticNames.push(tName);
        }
      }

      // Extract techniques
      const techniques = Array.isArray(threat.technique) ? threat.technique : [];
      for (const tech of techniques) {
        if (tech.id) {
          const tid = tech.id.toUpperCase().trim();
          if (!techniqueIds.includes(tid)) {
            techniqueIds.push(tid);
          }
        }

        // Extract subtechniques
        const subtechniques = Array.isArray(tech.subtechnique) ? tech.subtechnique : [];
        for (const sub of subtechniques) {
          if (sub.id) {
            const sid = sub.id.toUpperCase().trim();
            if (!techniqueIds.includes(sid)) {
              techniqueIds.push(sid);
            }
          }
        }
      }
    }

    return {
      id: `elastic:${rule.rule_id || ''}`,
      title: (rule.name || '').trim(),
      source_format: 'elastic',
      technique_ids: techniqueIds.join(','),
      tactics: tacticNames.join(','),
      severity: (rule.severity || '').toLowerCase().trim(),
      logsource: Array.isArray(rule.index) ? rule.index.join(', ') : (rule.index || ''),
      query: (rule.query || '').trim(),
      description: (rule.description || '').trim(),
      metadata: JSON.stringify({
        maturity: meta.maturity || null,
        creation_date: meta.creation_date || null,
        updated_date: meta.updated_date || null,
        integration: meta.integration || null,
        risk_score: rule.risk_score || null,
        rule_type: rule.type || null,
        language: rule.language || null,
        tags: rule.tags || null,
        references: rule.references || null,
        license: rule.license || null,
      }),
      file_path: filePath,
    };
  } catch (err) {
    process.stderr.write(`[detections] Warning: failed to parse Elastic rule ${filePath}: ${err.message}\n`);
    return null;
  }
}

// ─── KQL Markdown Parser ──────────────────────────────────────────────────

// Microsoft table names that appear in KQL queries
const MS_TABLES = [
  'DeviceEvents', 'DeviceProcessEvents', 'DeviceNetworkEvents',
  'DeviceFileEvents', 'DeviceRegistryEvents', 'DeviceImageLoadEvents',
  'DeviceLogonEvents', 'IdentityDirectoryEvents', 'IdentityLogonEvents',
  'IdentityQueryEvents', 'EmailEvents', 'EmailAttachmentInfo',
  'CloudAppEvents', 'AADSignInEventsBeta', 'AlertEvidence', 'AlertInfo',
  'SecurityEvent', 'Syslog', 'SigninLogs', 'AuditLogs',
];

const MS_TABLE_REGEX = new RegExp(`\\b(${MS_TABLES.join('|')})\\b`, 'g');
const TECHNIQUE_REGEX = /\bT\d{4}(?:\.\d{3})?\b/g;
const KQL_HEURISTIC = /\b(where|project|summarize|extend|DeviceEvents|DeviceProcessEvents)\b/;

/**
 * Parse a KQL markdown file into a DetectionRow.
 *
 * @param {string} mdText - Raw markdown text of a KQL detection
 * @param {string} filePath - File path (basename used for ID)
 * @returns {DetectionRow|null} Normalized DetectionRow or null if no KQL code blocks found
 */
function parseKqlRule(mdText, filePath) {
  try {
    // Extract title from first H1 or H2 heading
    const headingMatch = mdText.match(/^#{1,2}\s+(.+)$/m);
    let title = headingMatch ? headingMatch[1].trim() : null;

    // Fallback to filename without extension
    if (!title) {
      const basename = path.basename(filePath, path.extname(filePath));
      title = basename;
    }

    // Extract KQL code blocks: ```kql, ```kusto, ```csl
    const kqlBlocks = [];
    const codeBlockRegex = /```(kql|kusto|csl)?\s*\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(mdText)) !== null) {
      const lang = match[1] || '';
      const code = match[2].trim();
      if (lang === 'kql' || lang === 'kusto' || lang === 'csl') {
        kqlBlocks.push(code);
      } else if (!lang && KQL_HEURISTIC.test(code)) {
        // Generic code block with KQL heuristic
        kqlBlocks.push(code);
      }
    }

    if (kqlBlocks.length === 0) return null;

    const query = kqlBlocks.join('\n\n');

    // Extract technique IDs from full text
    const techniqueMatches = mdText.match(TECHNIQUE_REGEX) || [];
    const techniqueIds = [...new Set(techniqueMatches)];

    // Extract Microsoft table names from query
    const tableMatches = query.match(MS_TABLE_REGEX) || [];
    const tables = [...new Set(tableMatches)];

    // Build logsource from tables
    const logsource = tables.join(', ');

    // Build description: first 500 chars of markdown with code blocks stripped
    const stripped = mdText.replace(/```[\s\S]*?```/g, '').trim();
    const description = stripped.substring(0, 500).trim();

    // ID from kql: + filePath (relative from dir root)
    const id = `kql:${filePath}`;

    return {
      id,
      title,
      source_format: 'kql',
      technique_ids: techniqueIds.join(','),
      tactics: '', // KQL markdown doesn't have structured tactic info
      severity: '', // KQL markdown doesn't have structured severity
      logsource,
      query,
      description,
      metadata: JSON.stringify({
        tables,
        code_block_count: kqlBlocks.length,
      }),
      file_path: filePath,
    };
  } catch (err) {
    process.stderr.write(`[detections] Warning: failed to parse KQL rule ${filePath}: ${err.message}\n`);
    return null;
  }
}

// ─── Schema ────────────────────────────────────────────────────────────────

/**
 * Create detections and detections_fts tables idempotently.
 *
 * @param {import('better-sqlite3').Database} db
 */
function ensureDetectionsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS detections (
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

    CREATE VIRTUAL TABLE IF NOT EXISTS detections_fts USING fts5(
      title, description, query, technique_ids,
      tokenize='porter unicode61'
    );

    CREATE INDEX IF NOT EXISTS idx_det_source ON detections(source_format);
    CREATE INDEX IF NOT EXISTS idx_det_severity ON detections(severity);
  `);
}

// ─── Insert ────────────────────────────────────────────────────────────────

/**
 * Insert a DetectionRow into both detections and detections_fts tables.
 * Duplicate IDs are silently skipped (INSERT OR IGNORE).
 *
 * @param {import('better-sqlite3').Database} db
 * @param {DetectionRow} row
 * @returns {number} 1 if inserted, 0 if duplicate
 */
function insertDetection(db, row) {
  if (!row.id) return 0; // Skip rows with no ID (malformed rules)
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO detections
      (id, title, source_format, technique_ids, tactics, severity, logsource, query, description, metadata, file_path)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    row.id, row.title, row.source_format, row.technique_ids,
    row.tactics, row.severity, row.logsource, row.query,
    row.description, row.metadata, row.file_path
  );

  if (result.changes > 0) {
    // Also insert into FTS table
    db.prepare(
      'INSERT INTO detections_fts (title, description, query, technique_ids) VALUES (?, ?, ?, ?)'
    ).run(row.title, row.description, row.query, row.technique_ids);
  }

  return result.changes;
}

// ─── Directory Indexers ────────────────────────────────────────────────────

/**
 * Recursively index a directory of Sigma YAML rules.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} dirPath
 * @returns {number} Count of rules indexed
 */
function indexSigmaDirectory(db, dirPath) {
  return indexDirectory(db, dirPath, /\.(yml|yaml)$/i, parseSigmaRule, 'sigma');
}

/**
 * Recursively index a directory of ESCU YAML rules.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} dirPath
 * @returns {number} Count of rules indexed
 */
function indexEscuDirectory(db, dirPath) {
  return indexDirectory(db, dirPath, /\.(yml|yaml)$/i, parseEscuRule, 'escu');
}

/**
 * Recursively index a directory of Elastic TOML rules.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} dirPath
 * @returns {number} Count of rules indexed
 */
function indexElasticDirectory(db, dirPath) {
  return indexDirectory(db, dirPath, /\.toml$/i, parseElasticRule, 'elastic');
}

/**
 * Recursively index a directory of KQL markdown rules.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} dirPath
 * @returns {number} Count of rules indexed
 */
function indexKqlDirectory(db, dirPath) {
  return indexDirectory(db, dirPath, /\.md$/i, parseKqlRule, 'kql');
}

/**
 * Generic directory indexer -- recursively reads files matching a pattern,
 * parses each with the given parser, and inserts valid rows.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} dirPath
 * @param {RegExp} extPattern
 * @param {Function} parseFn
 * @param {string} format - Source format name (for log messages)
 * @returns {number} Count of rules indexed
 */
function indexDirectory(db, dirPath, extPattern, parseFn, format) {
  let count = 0;

  try {
    const files = fs.readdirSync(dirPath, { recursive: true });

    for (const relFile of files) {
      const rel = typeof relFile === 'string' ? relFile : relFile.toString();
      if (!extPattern.test(rel)) continue;

      const fullPath = path.join(dirPath, rel);

      // Skip directories that match the extension pattern
      try {
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;
      } catch {
        continue;
      }

      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const row = parseFn(content, rel);

        if (!row) continue;
        // Skip empty IDs (e.g., sigma: with no actual id)
        if (row.id === `${format}:`) continue;

        const changes = insertDetection(db, row);
        if (changes > 0) count++;
      } catch (err) {
        process.stderr.write(`[detections] Warning: failed to index ${format} file ${fullPath}: ${err.message}\n`);
      }
    }
  } catch (err) {
    process.stderr.write(`[detections] Warning: failed to read ${format} directory ${dirPath}: ${err.message}\n`);
  }

  return count;
}

// ─── Search ────────────────────────────────────────────────────────────────

/**
 * Full-text search across detection rules.
 * Results are ranked by BM25 relevance.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} query - FTS5 query string
 * @param {{ source_format?: string, severity?: string, technique_id?: string, limit?: number }} [opts={}]
 * @returns {DetectionRow[]}
 */
function searchDetections(db, query, opts = {}) {
  if (!query || typeof query !== 'string' || query.trim() === '') return [];

  const limit = opts.limit || 20;

  try {
    let sql = `
      SELECT d.*
      FROM detections d
      INNER JOIN (
        SELECT rowid, rank FROM detections_fts WHERE detections_fts MATCH ? ORDER BY rank
      ) AS fts ON d.rowid = fts.rowid
    `;
    const params = [query];
    const conditions = [];

    if (opts.source_format) {
      conditions.push('d.source_format = ?');
      params.push(opts.source_format);
    }

    if (opts.severity) {
      conditions.push('d.severity = ?');
      params.push(opts.severity);
    }

    if (opts.technique_id) {
      conditions.push('d.technique_ids LIKE ?');
      params.push(`%${opts.technique_id}%`);
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

// ─── Population ────────────────────────────────────────────────────────────

/**
 * Helper: index directories from an environment variable.
 * Env var is expected to be a path.delimiter-separated list of directories.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} envKey - Environment variable name
 * @param {Function} indexFn - Directory indexer function
 * @returns {number} Total count of rules indexed
 */
function indexEnvPaths(db, envKey, indexFn) {
  const envVal = process.env[envKey];
  if (!envVal) return 0;

  let count = 0;
  const dirs = envVal.split(path.delimiter).filter(Boolean);

  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      count += indexFn(db, dir);
    }
  }

  return count;
}

/**
 * Populate the detections table if empty.
 * Indexes bundled sigma-core rules and any directories specified by env vars.
 * Uses BEGIN IMMEDIATE transaction for safety.
 *
 * @param {import('better-sqlite3').Database} db
 */
function populateDetectionsIfEmpty(db) {
  const doPopulate = db.transaction(() => {
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM detections').get().cnt;
    if (count > 0) return; // Already populated

    // Index bundled sigma-core rules
    const bundledSigmaDir = path.join(__dirname, '..', 'data', 'sigma-core', 'rules');
    if (fs.existsSync(bundledSigmaDir)) {
      indexSigmaDirectory(db, bundledSigmaDir);
    }

    // Index env var paths
    indexEnvPaths(db, 'SIGMA_PATHS', indexSigmaDirectory);
    indexEnvPaths(db, 'SPLUNK_PATHS', indexEscuDirectory);
    indexEnvPaths(db, 'ELASTIC_PATHS', indexElasticDirectory);
  });

  doPopulate.immediate();
}

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  parseSigmaRule,
  parseEscuRule,
  parseElasticRule,
  parseKqlRule,
  ensureDetectionsSchema,
  insertDetection,
  indexSigmaDirectory,
  indexEscuDirectory,
  indexElasticDirectory,
  indexKqlDirectory,
  searchDetections,
  populateDetectionsIfEmpty,
};
