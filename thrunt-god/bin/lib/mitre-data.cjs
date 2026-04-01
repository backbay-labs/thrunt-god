/**
 * MITRE ATT&CK data — loading, search, filtering, and multi-select parsing.
 *
 * Provides access to the bundled Enterprise ATT&CK technique database
 * used by the pack authoring CLI's technique picker (Step 3 of 8-step flow).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ATTACK_ID_PATTERN = /^T\d{4}(?:\.\d{3})?$/i;
const ATTACK_ID_PREFIX_PATTERN = /^T\d{1,4}/i;
const DATA_PATH = path.join(__dirname, '..', '..', 'data', 'mitre-attack-enterprise.json');

/** @type {{ version: string, generated: string, techniques: object[] } | null} */
let _cache = null;

/**
 * Load and cache the ATT&CK Enterprise technique database.
 * Uses a lazy singleton pattern — the JSON is only read once.
 *
 * @returns {{ version: string, generated: string, techniques: object[] }}
 */
function loadAttackData() {
  if (_cache) return _cache;
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  _cache = JSON.parse(raw);
  return _cache;
}

/**
 * Look up a technique by its ATT&CK ID (e.g. "T1078" or "T1078.002").
 * Case-insensitive. For sub-technique IDs, resolves from the parent's
 * sub_techniques array and returns a merged object with parent context.
 *
 * @param {string} id - ATT&CK technique ID
 * @returns {object|null} Technique object, or null if not found
 */
function getTechniqueById(id) {
  if (!id || typeof id !== 'string') return null;
  const normalised = id.toUpperCase().trim();
  const data = loadAttackData();

  // Check if this is a sub-technique ID (contains a dot)
  if (normalised.includes('.')) {
    // Extract parent ID: T1078.002 -> T1078
    const parentId = normalised.split('.')[0];
    const parent = data.techniques.find(t => t.id.toUpperCase() === parentId);
    if (!parent) return null;

    const sub = parent.sub_techniques.find(s => s.id.toUpperCase() === normalised);
    if (!sub) return null;

    return {
      id: sub.id,
      name: sub.name,
      parent_id: parent.id,
      parent_name: parent.name,
      tactic: parent.tactic,
      platforms: parent.platforms,
      data_sources: parent.data_sources,
    };
  }

  // Top-level technique lookup
  const technique = data.techniques.find(t => t.id.toUpperCase() === normalised);
  return technique || null;
}

/**
 * Search techniques by query string.
 * - If the query looks like an ATT&CK ID (starts with T + digits), performs
 *   ID prefix matching (e.g. "T107" matches T1070, T1078, etc.).
 * - Otherwise, performs case-insensitive substring matching on technique name.
 * Results are sorted by relevance: exact ID match first, then alphabetical.
 *
 * @param {string} query - Search query
 * @returns {object[]} Array of matching technique objects
 */
function searchTechniques(query) {
  if (!query || typeof query !== 'string') return [];
  const q = query.trim();
  if (!q) return [];

  const data = loadAttackData();
  const qUpper = q.toUpperCase();

  // ID-based search: query starts with T followed by digit(s)
  if (ATTACK_ID_PREFIX_PATTERN.test(q)) {
    const results = [];

    for (const technique of data.techniques) {
      const tid = technique.id.toUpperCase();

      // Exact technique match
      if (tid === qUpper) {
        results.unshift(technique); // exact match first
        continue;
      }

      // Prefix match on technique ID
      if (tid.startsWith(qUpper)) {
        results.push(technique);
        continue;
      }

      // Also check sub-techniques for prefix match
      for (const sub of technique.sub_techniques) {
        if (sub.id.toUpperCase() === qUpper) {
          results.unshift({
            id: sub.id,
            name: sub.name,
            parent_id: technique.id,
            parent_name: technique.name,
            tactic: technique.tactic,
            platforms: technique.platforms,
            data_sources: technique.data_sources,
          });
        } else if (sub.id.toUpperCase().startsWith(qUpper)) {
          results.push({
            id: sub.id,
            name: sub.name,
            parent_id: technique.id,
            parent_name: technique.name,
            tactic: technique.tactic,
            platforms: technique.platforms,
            data_sources: technique.data_sources,
          });
        }
      }
    }

    return results;
  }

  // Name-based search: case-insensitive substring match
  const qLower = q.toLowerCase();
  const results = [];

  for (const technique of data.techniques) {
    if (technique.name.toLowerCase().includes(qLower)) {
      results.push(technique);
    }
  }

  // Sort alphabetically by name for stable ordering
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

/**
 * Filter techniques whose tactic field contains the given tactic name.
 * Case-insensitive match.
 *
 * @param {string} tacticName - Tactic name (e.g. "Initial Access")
 * @returns {object[]} Matching techniques
 */
function filterByTactic(tacticName) {
  if (!tacticName || typeof tacticName !== 'string') return [];
  const data = loadAttackData();
  const needle = tacticName.toLowerCase().trim();

  return data.techniques.filter(t => {
    const tactics = t.tactic.toLowerCase().split(',').map(s => s.trim());
    return tactics.some(tc => tc === needle);
  });
}

/**
 * Filter techniques whose platforms array contains the given platform.
 * Case-insensitive match.
 *
 * @param {string} platform - Platform name (e.g. "Cloud", "Windows")
 * @returns {object[]} Matching techniques
 */
function filterByPlatform(platform) {
  if (!platform || typeof platform !== 'string') return [];
  const data = loadAttackData();
  const needle = platform.toLowerCase().trim();

  return data.techniques.filter(t =>
    t.platforms.some(p => p.toLowerCase() === needle)
  );
}

/**
 * Parse comma-separated multi-select input from the technique picker.
 *
 * Accepts three kinds of input:
 * 1. ATT&CK IDs: "T1078,T1195.002" -> ["T1078", "T1195.002"]
 * 2. Numeric indices (1-based) into a results array: "1,3" -> IDs at [0],[2]
 * 3. "a" or "all" with a results array -> all result IDs
 *
 * Validates that all returned IDs exist in the data bundle.
 *
 * @param {string} input - Comma-separated user input
 * @param {object[]} [results] - Optional results array for index-based selection
 * @returns {string[]} Array of validated technique IDs
 */
function parseMultiSelect(input, results) {
  if (!input || typeof input !== 'string') return [];
  const trimmed = input.trim().toLowerCase();

  // Handle "a" or "all" — return all result IDs
  if ((trimmed === 'a' || trimmed === 'all') && Array.isArray(results)) {
    return results.map(r => r.id);
  }

  const parts = input.split(',').map(s => s.trim()).filter(Boolean);
  const ids = [];

  for (const part of parts) {
    // Check if it's a numeric index (1-based)
    const num = parseInt(part, 10);
    if (!isNaN(num) && String(num) === part && Array.isArray(results)) {
      const idx = num - 1; // convert 1-based to 0-based
      if (idx >= 0 && idx < results.length) {
        ids.push(results[idx].id);
      }
      continue;
    }

    // Otherwise treat as ATT&CK ID
    const upper = part.toUpperCase();
    if (ATTACK_ID_PATTERN.test(upper)) {
      // Validate the ID exists in the data bundle
      const found = getTechniqueById(upper);
      if (found) {
        ids.push(upper);
      }
    }
  }

  return ids;
}

/**
 * Get all unique tactic names extracted from the technique database.
 *
 * @returns {string[]} Sorted array of unique tactic names
 */
function getAllTactics() {
  const data = loadAttackData();
  const tacticSet = new Set();

  for (const technique of data.techniques) {
    const tactics = technique.tactic.split(',').map(s => s.trim());
    for (const t of tactics) {
      if (t) tacticSet.add(t);
    }
  }

  return [...tacticSet].sort();
}

module.exports = {
  loadAttackData,
  getTechniqueById,
  searchTechniques,
  filterByTactic,
  filterByPlatform,
  parseMultiSelect,
  getAllTactics,
};
