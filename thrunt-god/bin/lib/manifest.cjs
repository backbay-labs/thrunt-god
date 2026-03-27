/**
 * EvidenceManifest — Canonical manifest schema, serialization, validation, and content hashing
 *
 * This module is a pure schema/serialization module with ZERO dependencies on evidence.cjs
 * (avoids circular requires per Research pitfall 3). Evidence.cjs imports from this module,
 * not the other way around.
 *
 * Provides:
 * - createEvidenceManifest(input) — builds a canonical manifest from query/receipt data
 * - validateManifest(manifest) — validates manifest against required schema
 * - canonicalSerialize(obj) — deterministic JSON with lexicographic key ordering
 * - sortKeysDeep(value) — recursive key sorting for canonical output
 * - computeContentHash(content) — SHA-256 content hash with "sha256:" prefix
 * - normalizeTimestamp(ts) — converts any ISO-8601 string to UTC with trailing Z
 * - MANIFEST_VERSION — schema version constant ("1.0")
 */

'use strict';

const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIFEST_VERSION = '1.0';

// ---------------------------------------------------------------------------
// Internal Helpers (not exported)
// ---------------------------------------------------------------------------

/**
 * Generate a manifest ID following the runtime.cjs makeId pattern.
 * Defined locally since makeId is not exported from runtime.cjs.
 * Format: MAN-{YYYYMMDDHHMMSS}-{RANDOM8}
 */
function makeManifestId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `MAN-${stamp}-${suffix}`;
}

/**
 * Current UTC timestamp in ISO-8601 format.
 */
function nowUtc() {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Canonicalization
// ---------------------------------------------------------------------------

/**
 * Recursively sort object keys lexicographically at all nesting levels.
 * Arrays are preserved in order but their object elements are sorted.
 * Primitives and null pass through unchanged.
 */
function sortKeysDeep(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortKeysDeep(value[key]);
  }
  return sorted;
}

/**
 * Canonical JSON serialization: sort keys then stringify with 2-space indent.
 * This is the ONLY way manifests should be serialized — deterministic key
 * ordering for Phase 14 hashing.
 */
function canonicalSerialize(obj) {
  return JSON.stringify(sortKeysDeep(obj), null, 2);
}

// ---------------------------------------------------------------------------
// Content Hashing
// ---------------------------------------------------------------------------

/**
 * Compute SHA-256 content hash of a string.
 * Returns "sha256:" + hex digest.
 */
function computeContentHash(content) {
  const hex = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  return `sha256:${hex}`;
}

// ---------------------------------------------------------------------------
// Timestamp Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize any ISO-8601 timestamp string to UTC with trailing Z.
 * Converts offset timestamps (e.g., "+05:30") to UTC.
 * Returns null for falsy input.
 */
function normalizeTimestamp(ts) {
  if (!ts) return null;
  return new Date(ts).toISOString();
}

// ---------------------------------------------------------------------------
// Schema Creation
// ---------------------------------------------------------------------------

/**
 * Build a canonical EvidenceManifest object from input data.
 *
 * @param {object} input
 * @param {string} input.connector_id — connector identifier
 * @param {string} input.dataset — dataset kind
 * @param {object} input.execution — execution metadata
 * @param {Array} input.artifacts — array of artifact entries, each with:
 *   id, type, path, content (string for hashing), and optional
 *   receipt_ids (for query_log type) or query_ids (for receipt type)
 * @param {string[]|null} [input.hypothesis_ids] — optional hypothesis references
 * @param {string[]|null} [input.tags] — optional tags
 * @param {object|null} [input.raw_metadata] — optional connector-specific metadata
 *
 * @returns {object} A fully-formed EvidenceManifest object
 */
function createEvidenceManifest(input) {
  const artifacts = (input.artifacts || []).map(artifact => {
    const entry = {
      id: artifact.id,
      type: artifact.type,
      path: artifact.path,
      content_hash: computeContentHash(artifact.content),
    };

    // Bidirectional links: query_log -> receipt_ids, receipt -> query_ids
    if (artifact.receipt_ids) {
      entry.receipt_ids = artifact.receipt_ids;
    }
    if (artifact.query_ids) {
      entry.query_ids = artifact.query_ids;
    }

    return entry;
  });

  return {
    manifest_version: MANIFEST_VERSION,
    manifest_id: makeManifestId(),
    created_at: nowUtc(),
    connector_id: input.connector_id,
    dataset: input.dataset,
    execution: {
      profile: input.execution.profile,
      query_id: input.execution.query_id,
      request_id: input.execution.request_id,
      status: input.execution.status,
      started_at: normalizeTimestamp(input.execution.started_at),
      completed_at: normalizeTimestamp(input.execution.completed_at),
      duration_ms: input.execution.duration_ms,
      dry_run: input.execution.dry_run,
    },
    artifacts,
    hypothesis_ids: input.hypothesis_ids !== undefined ? input.hypothesis_ids : null,
    tags: input.tags !== undefined ? input.tags : null,
    raw_metadata: input.raw_metadata !== undefined ? input.raw_metadata : null,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a manifest object against the required schema.
 *
 * @param {object} manifest — manifest to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['manifest must be a non-null object'] };
  }

  // Required top-level fields
  if (!manifest.manifest_version) {
    errors.push('missing required field: manifest_version');
  }
  if (!manifest.manifest_id) {
    errors.push('missing required field: manifest_id');
  }
  if (!manifest.created_at) {
    errors.push('missing required field: created_at');
  }

  // Artifacts validation
  if (!Array.isArray(manifest.artifacts)) {
    errors.push('missing required field: artifacts (must be a non-empty array)');
  } else if (manifest.artifacts.length === 0) {
    errors.push('artifacts array must contain at least one entry');
  } else {
    for (let i = 0; i < manifest.artifacts.length; i++) {
      const artifact = manifest.artifacts[i];
      const prefix = `artifacts[${i}]`;
      if (!artifact.id) errors.push(`${prefix}: missing required field: id`);
      if (!artifact.type) errors.push(`${prefix}: missing required field: type`);
      if (!artifact.path) errors.push(`${prefix}: missing required field: path`);
      if (!artifact.content_hash) errors.push(`${prefix}: missing required field: content_hash`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  MANIFEST_VERSION,
  createEvidenceManifest,
  validateManifest,
  canonicalSerialize,
  sortKeysDeep,
  computeContentHash,
  normalizeTimestamp,
};
