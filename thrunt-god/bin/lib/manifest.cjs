/**
 * EvidenceManifest — Canonical manifest schema, serialization, validation, content hashing,
 * manifest-level integrity hashing, provenance metadata, signature hooks, and integrity verification
 *
 * This module is a pure schema/serialization module with ZERO dependencies on evidence.cjs
 * (avoids circular requires per Research pitfall 3). Evidence.cjs imports from this module,
 * not the other way around.
 *
 * Documented exception: verifyManifestIntegrity requires fs/path for read-only disk I/O
 * to re-read artifacts and verify content hashes. It never writes.
 *
 * Provides:
 * - createEvidenceManifest(input) — builds a canonical manifest from query/receipt data
 * - validateManifest(manifest) — validates manifest against required schema
 * - canonicalSerialize(obj) — deterministic JSON with lexicographic key ordering
 * - sortKeysDeep(value) — recursive key sorting for canonical output
 * - computeContentHash(content) — SHA-256 content hash with "sha256:" prefix
 * - normalizeTimestamp(ts) — converts any ISO-8601 string to UTC with trailing Z
 * - computeManifestHash(manifest) — deterministic SHA-256 of manifest body (excludes manifest_hash, signature)
 * - buildProvenance(options) — structured signer + environment + signed_at metadata
 * - detectRuntimeName() — detect AI coding agent from environment variables
 * - applySignatureHooks(manifest, hooks) — call beforeSign/afterSign hooks in order
 * - verifyManifestIntegrity(manifest, basePath) — on-demand integrity check against disk
 * - MANIFEST_VERSION — schema version constant ("1.1")
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MANIFEST_VERSION = '1.1';

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
// Manifest-Level Hashing (Phase 14)
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic SHA-256 hash of the manifest body.
 * Excludes manifest_hash and signature fields (hash-everything-except-hash pattern).
 *
 * @param {object} manifest — manifest object (may or may not have manifest_hash/signature)
 * @returns {string} "sha256:" + hex digest
 */
function computeManifestHash(manifest) {
  // eslint-disable-next-line no-unused-vars
  const { manifest_hash, signature, ...body } = manifest;
  const serialized = canonicalSerialize(body);
  return computeContentHash(serialized);
}

// ---------------------------------------------------------------------------
// Runtime Agent Detection (Phase 14)
// ---------------------------------------------------------------------------

/**
 * Detect the AI coding agent runtime from environment variables.
 * Checks in priority order: Claude, Gemini, Codex, Cursor.
 * Returns "unknown" if no recognized agent env var is set.
 *
 * @returns {string} "claude" | "gemini" | "codex" | "cursor" | "unknown"
 */
function detectRuntimeName() {
  if (process.env.CLAUDECODE) return 'claude';
  if (process.env.GEMINI_CLI) return 'gemini';
  if (process.env.CODEX_HOME) return 'codex';
  if (process.env.CURSOR_AGENT) return 'cursor';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Provenance Metadata (Phase 14)
// ---------------------------------------------------------------------------

/**
 * Build structured provenance metadata for a manifest.
 * Identifies the signer (type, id, context) and execution environment.
 *
 * @param {object} [options={}] — optional overrides
 * @param {string} [options.signer_type="system"] — signer type
 * @param {string} [options.signer_id="thrunt-runtime"] — signer identifier
 * @param {object} [options.signer_context] — signer context (defaults to { cli_version })
 * @returns {{ signer: object, environment: object, signed_at: string }}
 */
function buildProvenance(options = {}) {
  const pkg = require(path.resolve(__dirname, '..', '..', '..', 'package.json'));
  return {
    signer: {
      signer_type: options.signer_type || 'system',
      signer_id: options.signer_id || 'thrunt-runtime',
      signer_context: options.signer_context || { cli_version: pkg.version },
    },
    environment: {
      os_platform: os.platform(),
      node_version: process.version,
      thrunt_version: pkg.version,
      runtime_name: detectRuntimeName(),
    },
    signed_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Signature Hooks (Phase 14)
// ---------------------------------------------------------------------------

/**
 * Apply optional signature hooks to a manifest.
 * If no hooks are provided, returns the manifest unchanged.
 * Calls beforeSign first, then afterSign, in that order.
 *
 * @param {object} manifest — manifest object
 * @param {object} [hooks={}] — optional hook functions
 * @param {function} [hooks.beforeSign] — called before signing, may return modified manifest
 * @param {function} [hooks.afterSign] — called after signing
 * @returns {object} the (possibly modified) manifest
 */
function applySignatureHooks(manifest, hooks = {}) {
  if (!hooks.beforeSign && !hooks.afterSign) return manifest;

  let result = { ...manifest };

  if (typeof hooks.beforeSign === 'function') {
    result = hooks.beforeSign(result) || result;
  }

  if (typeof hooks.afterSign === 'function') {
    hooks.afterSign(result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Integrity Verification (Phase 14)
// ---------------------------------------------------------------------------

/**
 * Verify manifest integrity by re-computing hashes and checking artifacts on disk.
 * Returns structured failures, never throws. On-demand only.
 *
 * @param {object} manifest — manifest object to verify
 * @param {string} basePath — base directory for resolving artifact paths
 * @returns {{ valid: boolean, failures: Array<{ type: string, ... }> }}
 */
function verifyManifestIntegrity(manifest, basePath) {
  const failures = [];

  // 1. Verify manifest-level hash (skip if absent for pre-Phase-14 manifests)
  const expectedHash = manifest.manifest_hash;
  if (expectedHash) {
    const actualHash = computeManifestHash(manifest);
    if (actualHash !== expectedHash) {
      failures.push({
        type: 'manifest_hash',
        expected: expectedHash,
        actual: actualHash,
        message: 'Manifest-level hash mismatch',
      });
    }
  }

  // 2. Verify each artifact's content_hash against disk
  for (const artifact of manifest.artifacts || []) {
    const artifactPath = path.resolve(basePath, artifact.path);
    try {
      const content = fs.readFileSync(artifactPath, 'utf-8');
      const actualHash = computeContentHash(content);
      if (actualHash !== artifact.content_hash) {
        const stat = fs.statSync(artifactPath);
        failures.push({
          type: 'artifact_hash',
          artifact_id: artifact.id,
          artifact_path: artifact.path,
          expected: artifact.content_hash,
          actual: actualHash,
          last_modified: stat.mtime.toISOString(),
          message: `Artifact content hash mismatch: ${artifact.id}`,
        });
      }
    } catch (err) {
      failures.push({
        type: 'artifact_missing',
        artifact_id: artifact.id,
        artifact_path: artifact.path,
        expected: artifact.content_hash,
        actual: null,
        last_modified: null,
        message: `Artifact not found on disk: ${artifact.path}`,
      });
    }
  }

  return { valid: failures.length === 0, failures };
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
  computeManifestHash,
  buildProvenance,
  detectRuntimeName,
  applySignatureHooks,
  verifyManifestIntegrity,
};
