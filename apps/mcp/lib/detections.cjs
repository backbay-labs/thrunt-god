'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const toml = require('smol-toml');

const ATTACK_TACTIC_DISPLAY_NAMES = new Map([
  ['reconnaissance', 'Reconnaissance'],
  ['resource development', 'Resource Development'],
  ['initial access', 'Initial Access'],
  ['execution', 'Execution'],
  ['persistence', 'Persistence'],
  ['privilege escalation', 'Privilege Escalation'],
  ['defense evasion', 'Defense Evasion'],
  ['credential access', 'Credential Access'],
  ['discovery', 'Discovery'],
  ['lateral movement', 'Lateral Movement'],
  ['collection', 'Collection'],
  ['command and control', 'Command and Control'],
  ['exfiltration', 'Exfiltration'],
  ['impact', 'Impact'],
]);

function normalizeAttackTacticTag(tag) {
  const normalised = String(tag || '')
    .replace(/^attack\./i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();

  if (!normalised) {
    return '';
  }

  const canonical = ATTACK_TACTIC_DISPLAY_NAMES.get(normalised);
  if (canonical) {
    return canonical;
  }

  return normalised
    .split(/\s+/)
    .map((word) => (word === 'and'
      ? 'and'
      : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

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

/**
 * @param {string} yamlText - Raw YAML text of a Sigma rule
 * @param {string} filePath - File path of the rule (stored in row)
 * @returns {DetectionRow|null} Normalized DetectionRow or null if malformed
 */
function parseSigmaRule(yamlText, filePath) {
  try {
    const doc = yaml.load(yamlText);
    if (!doc || !doc.title) return null;

    const tags = Array.isArray(doc.tags) ? doc.tags : [];

    const techniqueIds = tags
      .filter(t => /^attack\.t\d{4}/i.test(t))
      .map(t => t.replace(/^attack\./i, '').toUpperCase())
      .filter((v, i, a) => a.indexOf(v) === i); // deduplicate

    const tactics = tags
      .filter(t => /^attack\./i.test(t) && !/^attack\.t\d{4}/i.test(t))
      .map(normalizeAttackTacticTag)
      .filter(Boolean)
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

/**
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

/**
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

    const threats = Array.isArray(rule.threat) ? rule.threat : [];
    for (const threat of threats) {
      if (threat.tactic && threat.tactic.name) {
        const tName = threat.tactic.name.trim();
        if (!tacticNames.includes(tName)) {
          tacticNames.push(tName);
        }
      }

      const techniques = Array.isArray(threat.technique) ? threat.technique : [];
      for (const tech of techniques) {
        if (tech.id) {
          const tid = tech.id.toUpperCase().trim();
          if (!techniqueIds.includes(tid)) {
            techniqueIds.push(tid);
          }
        }

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

function extractKqlTechniqueIds(mdText, title) {
  const candidates = [];
  if (title) {
    candidates.push(...(String(title).match(TECHNIQUE_REGEX) || []));
  }

  const lines = String(mdText || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^#{1,6}\s+/.test(trimmed)) continue;
    const normalized = trimmed.replace(/^[-*]\s+/, '');
    if (/^Related\b/i.test(normalized)) continue;
    if (!/^(?:MITRE\s+ATT&CK|ATT&CK|Techniques?:)/i.test(normalized)) continue;
    candidates.push(...(normalized.match(TECHNIQUE_REGEX) || []));
  }

  return [...new Set(candidates.map(id => String(id).toUpperCase()))];
}

function buildKqlRuleId(filePath, sourcePath) {
  const digest = crypto
    .createHash('sha1')
    .update(path.resolve(String(sourcePath || filePath || '')))
    .digest('hex')
    .slice(0, 12);
  return `kql:${filePath}:${digest}`;
}

/**
 * @param {string} mdText - Raw markdown text of a KQL detection
 * @param {string} filePath - File path (basename used for ID)
 * @param {string} [sourcePath] - Source path used to make IDs unique across indexed roots
 * @returns {DetectionRow|null}
 */
function parseKqlRule(mdText, filePath, sourcePath) {
  try {
    const headingMatch = mdText.match(/^#{1,2}\s+(.+)$/m);
    let title = headingMatch ? headingMatch[1].trim() : null;

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

    const techniqueIds = extractKqlTechniqueIds(mdText, title);

    const tableMatches = query.match(MS_TABLE_REGEX) || [];
    const tables = [...new Set(tableMatches)];

    const logsource = tables.join(', ');

    const stripped = mdText.replace(/```[\s\S]*?```/g, '').trim();
    const description = stripped.substring(0, 500).trim();

    const id = buildKqlRuleId(filePath, sourcePath);

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

/**
 * Build a SQL clause that matches a technique ID exactly inside a comma-separated list.
 *
 * @param {string} column
 * @param {string} techniqueId
 * @returns {{ clause: string, params: string[] }}
 */
function buildTechniqueIdMatchClause(column, techniqueId) {
  const normalisedId = String(techniqueId || '').toUpperCase().trim();
  const normalisedColumn = `UPPER(REPLACE(COALESCE(${column}, ''), ' ', ''))`;

  return {
    clause: `(${normalisedColumn} = ? OR ${normalisedColumn} LIKE ? OR ${normalisedColumn} LIKE ? OR ${normalisedColumn} LIKE ?)`,
    params: [
      normalisedId,
      `${normalisedId},%`,
      `%,${normalisedId},%`,
      `%,${normalisedId}`,
    ],
  };
}

/** @param {import('better-sqlite3').Database} db */
function ensureDetectionsFtsSchema(db) {
  const row = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'detections_fts'"
  ).get();
  const hasStableId = row && /\bid\s+UNINDEXED\b/i.test(row.sql || '');
  if (hasStableId) return;

  const rebuildFts = db.transaction(() => {
    db.exec('DROP TABLE IF EXISTS detections_fts');
    db.exec(`
      CREATE VIRTUAL TABLE detections_fts USING fts5(
        title, description, query, technique_ids, id UNINDEXED,
        tokenize='porter unicode61'
      )
    `);

    const insertFts = db.prepare(
      'INSERT INTO detections_fts (title, description, query, technique_ids, id) VALUES (?, ?, ?, ?, ?)'
    );
    const rows = db.prepare(
      'SELECT id, title, description, query, technique_ids FROM detections'
    ).all();

    for (const existing of rows) {
      insertFts.run(
        existing.title,
        existing.description || '',
        existing.query || '',
        existing.technique_ids || '',
        existing.id
      );
    }
  });

  rebuildFts.immediate();
}

/** @param {import('better-sqlite3').Database} db */
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

    CREATE INDEX IF NOT EXISTS idx_det_source ON detections(source_format);
    CREATE INDEX IF NOT EXISTS idx_det_severity ON detections(severity);

    CREATE TABLE IF NOT EXISTS detection_env_index_state (
      env_key TEXT NOT NULL,
      dir_path TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      PRIMARY KEY (env_key, dir_path)
    );

    CREATE TABLE IF NOT EXISTS detection_env_files (
      env_key TEXT NOT NULL,
      dir_path TEXT NOT NULL,
      source_path TEXT NOT NULL,
      file_path TEXT NOT NULL,
      detection_id TEXT NOT NULL,
      source_format TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      PRIMARY KEY (env_key, dir_path, source_path)
    );

    CREATE INDEX IF NOT EXISTS idx_detection_env_files_detection_id
      ON detection_env_files(detection_id);
  `);

  ensureDetectionsFtsSchema(db);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {DetectionRow} row
 * @returns {number} 1 if inserted/updated, 0 if unchanged
 */
function insertDetection(db, row) {
  if (!row.id) return 0; // Skip rows with no ID (malformed rules)

  const existing = db.prepare(`
    SELECT title, source_format, technique_ids, tactics, severity, logsource, query, description, metadata, file_path
    FROM detections
    WHERE id = ?
  `).get(row.id);
  const nextValues = [
    row.title,
    row.source_format,
    row.technique_ids,
    row.tactics,
    row.severity,
    row.logsource,
    row.query,
    row.description,
    row.metadata,
    row.file_path,
  ];

  if (existing) {
    const currentValues = [
      existing.title,
      existing.source_format,
      existing.technique_ids,
      existing.tactics,
      existing.severity,
      existing.logsource,
      existing.query,
      existing.description,
      existing.metadata,
      existing.file_path,
    ];
    const changed = nextValues.some((value, index) => value !== currentValues[index]);
    if (!changed) return 0;

    db.prepare(`
      UPDATE detections
      SET title = ?, source_format = ?, technique_ids = ?, tactics = ?, severity = ?,
          logsource = ?, query = ?, description = ?, metadata = ?, file_path = ?
      WHERE id = ?
    `).run(...nextValues, row.id);
  } else {
    db.prepare(`
      INSERT INTO detections
        (id, title, source_format, technique_ids, tactics, severity, logsource, query, description, metadata, file_path)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id,
      row.title,
      row.source_format,
      row.technique_ids,
      row.tactics,
      row.severity,
      row.logsource,
      row.query,
      row.description,
      row.metadata,
      row.file_path
    );
  }

  db.prepare('DELETE FROM detections_fts WHERE id = ?').run(row.id);
  db.prepare(
    'INSERT INTO detections_fts (title, description, query, technique_ids, id) VALUES (?, ?, ?, ?, ?)'
  ).run(row.title, row.description, row.query, row.technique_ids, row.id);

  return 1;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} dirPath
 * @returns {number} Count of rules indexed
 */
function indexSigmaDirectory(db, dirPath, opts) {
  return indexDirectory(db, dirPath, /\.(yml|yaml)$/i, parseSigmaRule, 'sigma', opts);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} dirPath
 * @returns {number} Count of rules indexed
 */
function indexEscuDirectory(db, dirPath, opts) {
  return indexDirectory(db, dirPath, /\.(yml|yaml)$/i, parseEscuRule, 'escu', opts);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} dirPath
 * @returns {number} Count of rules indexed
 */
function indexElasticDirectory(db, dirPath, opts) {
  return indexDirectory(db, dirPath, /\.toml$/i, parseElasticRule, 'elastic', opts);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} dirPath
 * @returns {number} Count of rules indexed
 */
function indexKqlDirectory(db, dirPath, opts) {
  return indexDirectory(db, dirPath, /\.md$/i, parseKqlRule, 'kql', opts);
}

/** @returns {number} Count of rules indexed */
function indexDirectory(db, dirPath, extPattern, parseFn, format, opts = {}) {
  let count = 0;
  const files = scanDetectionFiles(dirPath, extPattern, format);
  if (!files) return 0;

  for (const file of files) {
    try {
      const content = fs.readFileSync(file.fullPath, 'utf8');
      const row = parseFn(content, file.relPath, file.fullPath);

      if (!row) continue;
      // Skip empty IDs (e.g., sigma: with no actual id)
      if (row.id === `${format}:`) continue;

      const changes = insertDetection(db, row);
      if (changes > 0) count++;
      if (typeof opts.onIndexed === 'function') {
        opts.onIndexed({ row, fullPath: file.fullPath, relPath: file.relPath, changed: changes > 0 });
      }
    } catch (err) {
      process.stderr.write(`[detections] Warning: failed to index ${format} file ${file.fullPath}: ${err.message}\n`);
    }
  }

  return count;
}

/**
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
        SELECT id, rank FROM detections_fts WHERE detections_fts MATCH ? ORDER BY rank
      ) AS fts ON d.id = fts.id
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
      const techniqueMatch = buildTechniqueIdMatchClause('d.technique_ids', opts.technique_id);
      conditions.push(techniqueMatch.clause);
      params.push(...techniqueMatch.params);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' LIMIT ?';
    params.push(limit);

    return db.prepare(sql).all(...params);
  } catch {
    return [];
  }
}

function scanDetectionFiles(dirPath, extPattern, format) {
  try {
    const entries = [];
    const pending = [''];

    while (pending.length > 0) {
      const relDir = pending.pop();
      const absDir = relDir ? path.join(dirPath, relDir) : dirPath;
      const children = fs.readdirSync(absDir, { withFileTypes: true });

      for (const child of children) {
        const childRelPath = relDir ? path.join(relDir, child.name) : child.name;
        if (child.isDirectory()) {
          pending.push(childRelPath);
          continue;
        }
        entries.push(childRelPath);
      }
    }

    const files = [];
    for (const relFile of entries) {
      const nativeRel = typeof relFile === 'string' ? relFile : relFile.toString();
      if (!extPattern.test(nativeRel)) continue;

      const fullPath = path.join(dirPath, nativeRel);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (!stat.isFile()) continue;
      files.push({
        fullPath: path.resolve(fullPath),
        relPath: nativeRel.replace(/\\/g, '/'),
        size: stat.size,
        mtimeMs: Math.floor(stat.mtimeMs),
      });
    }

    files.sort((a, b) => a.relPath.localeCompare(b.relPath));
    return files;
  } catch (err) {
    process.stderr.write(`[detections] Warning: failed to read ${format} directory ${dirPath}: ${err.message}\n`);
    return null;
  }
}

/** @returns {string|null} */
function computeDirectoryFingerprint(files) {
  try {
    const entries = files.map(file => `${file.relPath}\0${file.size}\0${file.mtimeMs}`);
    const hasher = crypto.createHash('sha256');
    for (const entry of entries.sort()) {
      hasher.update(entry);
      hasher.update('\n');
    }
    return hasher.digest('hex');
  } catch {
    return null;
  }
}

function getEnvPathMappingCount(db, envKey, dirPath) {
  return db.prepare(
    'SELECT COUNT(*) AS cnt FROM detection_env_files WHERE env_key = ? AND dir_path = ?'
  ).get(envKey, dirPath).cnt;
}

function isEnvPathFingerprintCurrent(db, envKey, dirPath, fingerprint, fileCount) {
  const row = db.prepare(
    'SELECT fingerprint FROM detection_env_index_state WHERE env_key = ? AND dir_path = ?'
  ).get(envKey, dirPath);
  return !!row && row.fingerprint === fingerprint && getEnvPathMappingCount(db, envKey, dirPath) === fileCount;
}

function rememberEnvPathFingerprint(db, envKey, dirPath, fingerprint) {
  db.prepare(`
    INSERT OR REPLACE INTO detection_env_index_state (env_key, dir_path, fingerprint, indexed_at)
    VALUES (?, ?, ?, ?)
  `).run(envKey, dirPath, fingerprint, new Date().toISOString());
}

function deleteDetectionById(db, detectionId) {
  db.prepare('DELETE FROM detections_fts WHERE id = ?').run(detectionId);
  db.prepare('DELETE FROM detections WHERE id = ?').run(detectionId);
}

function pruneUnreferencedDetection(db, detectionId) {
  const remainingRefs = db.prepare(
    'SELECT COUNT(*) AS cnt FROM detection_env_files WHERE detection_id = ?'
  ).get(detectionId).cnt;
  if (remainingRefs === 0) {
    deleteDetectionById(db, detectionId);
  }
}

function rememberEnvFileIndex(db, mapping) {
  const previous = db.prepare(`
    SELECT detection_id
    FROM detection_env_files
    WHERE env_key = ? AND dir_path = ? AND source_path = ?
  `).get(mapping.env_key, mapping.dir_path, mapping.source_path);

  db.prepare(`
    INSERT INTO detection_env_files (
      env_key, dir_path, source_path, file_path, detection_id, source_format, indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(env_key, dir_path, source_path) DO UPDATE SET
      file_path = excluded.file_path,
      detection_id = excluded.detection_id,
      source_format = excluded.source_format,
      indexed_at = excluded.indexed_at
  `).run(
    mapping.env_key,
    mapping.dir_path,
    mapping.source_path,
    mapping.file_path,
    mapping.detection_id,
    mapping.source_format,
    new Date().toISOString()
  );

  if (previous && previous.detection_id !== mapping.detection_id) {
    pruneUnreferencedDetection(db, previous.detection_id);
  }
}

function pruneDeletedEnvFileMappings(db, envKey, dirPath, currentSourcePaths) {
  let rows;
  if (currentSourcePaths.length === 0) {
    rows = db.prepare(`
      SELECT source_path, detection_id
      FROM detection_env_files
      WHERE env_key = ? AND dir_path = ?
    `).all(envKey, dirPath);
  } else {
    const placeholders = currentSourcePaths.map(() => '?').join(',');
    rows = db.prepare(`
      SELECT source_path, detection_id
      FROM detection_env_files
      WHERE env_key = ? AND dir_path = ?
        AND source_path NOT IN (${placeholders})
    `).all(envKey, dirPath, ...currentSourcePaths);
  }

  for (const row of rows) {
    db.prepare(`
      DELETE FROM detection_env_files
      WHERE env_key = ? AND dir_path = ? AND source_path = ?
    `).run(envKey, dirPath, row.source_path);
    pruneUnreferencedDetection(db, row.detection_id);
  }
}

function pruneRemovedEnvDirectories(db, envKey, currentDirs) {
  const rows = db.prepare(
    'SELECT DISTINCT dir_path FROM detection_env_index_state WHERE env_key = ?'
  ).all(envKey);
  const currentSet = new Set(currentDirs);

  for (const row of rows) {
    if (currentSet.has(row.dir_path)) continue;
    pruneDeletedEnvFileMappings(db, envKey, row.dir_path, []);
    db.prepare(
      'DELETE FROM detection_env_index_state WHERE env_key = ? AND dir_path = ?'
    ).run(envKey, row.dir_path);
  }
}

/** @returns {number} Total count of rules indexed */
function indexEnvPaths(db, envKey, indexFn, extPattern) {
  const envVal = process.env[envKey];
  if (!envVal) {
    pruneRemovedEnvDirectories(db, envKey, []);
    return 0;
  }

  let count = 0;
  const dirs = envVal.split(path.delimiter).filter(Boolean).map(dir => path.resolve(dir));
  pruneRemovedEnvDirectories(db, envKey, dirs);

  for (const dir of dirs) {
    const resolvedDir = dir;
    if (!fs.existsSync(resolvedDir)) {
      pruneDeletedEnvFileMappings(db, envKey, resolvedDir, []);
      db.prepare(
        'DELETE FROM detection_env_index_state WHERE env_key = ? AND dir_path = ?'
      ).run(envKey, resolvedDir);
      continue;
    }

    const files = scanDetectionFiles(resolvedDir, extPattern, envKey.toLowerCase());
    if (!files) continue;
    const fingerprint = computeDirectoryFingerprint(files);
    if (fingerprint && isEnvPathFingerprintCurrent(db, envKey, resolvedDir, fingerprint, files.length)) continue;

    const currentSourcePaths = files.map(file => file.fullPath);
    count += indexFn(db, resolvedDir, {
      onIndexed: ({ row, fullPath, relPath }) => {
        rememberEnvFileIndex(db, {
          env_key: envKey,
          dir_path: resolvedDir,
          source_path: fullPath,
          file_path: relPath,
          detection_id: row.id,
          source_format: row.source_format,
        });
      },
    });
    pruneDeletedEnvFileMappings(db, envKey, resolvedDir, currentSourcePaths);
    if (fingerprint) {
      rememberEnvPathFingerprint(db, envKey, resolvedDir, fingerprint);
    }
  }

  return count;
}

/** @param {import('better-sqlite3').Database} db */
function populateDetectionsIfEmpty(db) {
  const doPopulate = db.transaction(() => {
    const count = db.prepare('SELECT COUNT(*) AS cnt FROM detections').get().cnt;

    if (count === 0) {
      const bundledSigmaDir = path.join(__dirname, '..', 'data', 'sigma-core', 'rules');
      if (fs.existsSync(bundledSigmaDir)) {
        indexSigmaDirectory(db, bundledSigmaDir);
      }

      const bundledKqlDir = path.join(__dirname, '..', 'data', 'kql');
      if (fs.existsSync(bundledKqlDir)) {
        indexKqlDirectory(db, bundledKqlDir);
      }
    }

    indexEnvPaths(db, 'SIGMA_PATHS', indexSigmaDirectory, /\.(yml|yaml)$/i);
    indexEnvPaths(db, 'SPLUNK_PATHS', indexEscuDirectory, /\.(yml|yaml)$/i);
    indexEnvPaths(db, 'ELASTIC_PATHS', indexElasticDirectory, /\.toml$/i);
    indexEnvPaths(db, 'KQL_PATHS', indexKqlDirectory, /\.md$/i);
  });

  doPopulate.immediate();
}

module.exports = {
  parseSigmaRule,
  parseEscuRule,
  parseElasticRule,
  parseKqlRule,
  extractKqlTechniqueIds,
  buildTechniqueIdMatchClause,
  ensureDetectionsSchema,
  insertDetection,
  indexSigmaDirectory,
  indexEscuDirectory,
  indexElasticDirectory,
  indexKqlDirectory,
  searchDetections,
  populateDetectionsIfEmpty,
};
