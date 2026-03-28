/**
 * Evidence Export Bundles — ZIP construction, artifact discovery, bundle creation,
 * and bundle verification for THRUNT evidence handoff.
 *
 * Enables operators to package manifests, receipts, and query logs into
 * self-describing ZIP bundles with integrity hashes, chain-of-custody summaries,
 * selective filtering, and redaction support.
 *
 * Zero external dependencies — uses node:zlib (deflateRawSync, inflateRawSync, crc32)
 * and node:crypto for ZIP construction and hashing.
 *
 * Provides:
 * - createExportBundle(cwd, options) — discover artifacts, build ZIP, write to disk
 * - verifyBundle(bundlePath) — re-hash all entries, compare against bundle.json
 * - cmdBundleExport(cwd, options, raw) — CLI entry point for bundle export
 * - cmdBundleVerify(cwd, bundlePath, raw) — CLI entry point for bundle verify
 * - buildZip(entries) — build a ZIP buffer from array of { filename, data } (exported for testing)
 * - readZipEntries(zipBuffer) — parse ZIP buffer into array of { filename, data } (exported for testing)
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const {
  computeContentHash,
  canonicalSerialize,
} = require('./manifest.cjs');

const {
  planningPaths,
  output,
  error,
  toPosixPath,
  PLANNING_DIR_NAME,
} = require('./core.cjs');

const { requireSafePath } = require('./security.cjs');

// ---------------------------------------------------------------------------
// Bundle ID Generation
// ---------------------------------------------------------------------------

/**
 * Generate a bundle ID following the manifest.cjs makeManifestId pattern.
 * Format: BDL-{YYYYMMDDHHMMSS}-{RANDOM8HEX}
 */
function makeBundleId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `BDL-${stamp}-${suffix}`;
}

function stripKnownPlanningPrefix(artifactPath = '') {
  const normalized = toPosixPath(String(artifactPath));
  const prefixes = [`${PLANNING_DIR_NAME}/`, '.planning/'];
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      return normalized.slice(prefix.length);
    }
  }
  return normalized;
}

function artifactLookupAliases(artifactPath = '') {
  const relativePath = stripKnownPlanningPrefix(artifactPath);
  return Array.from(new Set([
    relativePath,
    `${PLANNING_DIR_NAME}/${relativePath}`,
    `.planning/${relativePath}`,
  ]));
}

// ---------------------------------------------------------------------------
// ZIP Primitives (internal helpers, also exported for testing)
// ---------------------------------------------------------------------------

/**
 * Create a single ZIP local file header + compressed data.
 *
 * @param {string} filename - Entry filename (forward slashes)
 * @param {Buffer} data - Uncompressed file data
 * @returns {{ lfh: Buffer, compressed: Buffer, crc: number, filenameBuffer: Buffer, uncompressedSize: number }}
 */
function createZipEntry(filename, data) {
  const filenameBuffer = Buffer.from(filename, 'utf-8');
  const crc = zlib.crc32(data);
  const compressed = zlib.deflateRawSync(data);

  // Local file header: 30 bytes fixed + filename length
  const lfh = Buffer.alloc(30 + filenameBuffer.length);
  lfh.writeUInt32LE(0x04034b50, 0);            // local file header signature
  lfh.writeUInt16LE(20, 4);                     // version needed to extract (2.0)
  lfh.writeUInt16LE(0, 6);                      // general purpose bit flag
  lfh.writeUInt16LE(8, 8);                      // compression method (8 = deflate)
  lfh.writeUInt16LE(0, 10);                     // last mod file time
  lfh.writeUInt16LE(0, 12);                     // last mod file date
  lfh.writeUInt32LE(crc, 14);                   // crc-32
  lfh.writeUInt32LE(compressed.length, 18);     // compressed size
  lfh.writeUInt32LE(data.length, 22);           // uncompressed size
  lfh.writeUInt16LE(filenameBuffer.length, 26); // filename length
  lfh.writeUInt16LE(0, 28);                     // extra field length
  filenameBuffer.copy(lfh, 30);

  return { lfh, compressed, crc, filenameBuffer, uncompressedSize: data.length };
}

/**
 * Build a complete ZIP archive from an array of entries.
 *
 * @param {Array<{ filename: string, data: Buffer }>} entries
 * @returns {Buffer} Complete ZIP file
 * @throws {Error} If entries exceed 65535 (ZIP16 limit)
 */
function buildZip(entries) {
  if (entries.length > 65535) {
    throw new Error(`ZIP entry count ${entries.length} exceeds maximum 65535`);
  }

  const parts = entries.map(e => createZipEntry(e.filename, e.data));

  // Calculate offsets and collect buffers
  let offset = 0;
  const offsets = [];
  const buffers = [];
  for (const part of parts) {
    offsets.push(offset);
    buffers.push(part.lfh, part.compressed);
    offset += part.lfh.length + part.compressed.length;
  }

  const centralDirStart = offset;

  // Central directory headers
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const cdh = Buffer.alloc(46 + part.filenameBuffer.length);
    cdh.writeUInt32LE(0x02014b50, 0);                   // central directory header signature
    cdh.writeUInt16LE(20, 4);                            // version made by
    cdh.writeUInt16LE(20, 6);                            // version needed
    cdh.writeUInt16LE(0, 8);                             // flags
    cdh.writeUInt16LE(8, 10);                            // compression method
    cdh.writeUInt16LE(0, 12);                            // mod time
    cdh.writeUInt16LE(0, 14);                            // mod date
    cdh.writeUInt32LE(part.crc, 16);                     // crc-32
    cdh.writeUInt32LE(part.compressed.length, 20);       // compressed size
    cdh.writeUInt32LE(part.uncompressedSize, 24);        // uncompressed size
    cdh.writeUInt16LE(part.filenameBuffer.length, 28);   // filename length
    cdh.writeUInt16LE(0, 30);                            // extra field length
    cdh.writeUInt16LE(0, 32);                            // file comment length
    cdh.writeUInt16LE(0, 34);                            // disk number start
    cdh.writeUInt16LE(0, 36);                            // internal file attributes
    cdh.writeUInt32LE(0, 38);                            // external file attributes
    cdh.writeUInt32LE(offsets[i], 42);                   // relative offset of local header
    part.filenameBuffer.copy(cdh, 46);
    buffers.push(cdh);
    offset += cdh.length;
  }

  const centralDirSize = offset - centralDirStart;

  // End of central directory record (EOCD)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);            // EOCD signature
  eocd.writeUInt16LE(0, 4);                     // disk number
  eocd.writeUInt16LE(0, 6);                     // disk with central dir
  eocd.writeUInt16LE(parts.length, 8);          // entries on this disk
  eocd.writeUInt16LE(parts.length, 10);         // total entries
  eocd.writeUInt32LE(centralDirSize, 12);       // central dir size
  eocd.writeUInt32LE(centralDirStart, 16);      // central dir offset
  eocd.writeUInt16LE(0, 20);                    // comment length
  buffers.push(eocd);

  return Buffer.concat(buffers);
}

/**
 * Read entries from a ZIP buffer.
 *
 * @param {Buffer} zipBuffer
 * @returns {Array<{ filename: string, data: Buffer }>}
 * @throws {Error} If not a valid ZIP
 */
function readZipEntries(zipBuffer) {
  if (zipBuffer.length < 22) {
    throw new Error('Not a valid ZIP file: too small');
  }

  // Find EOCD (last 22 bytes for no-comment archives)
  const eocdOffset = zipBuffer.length - 22;
  const sig = zipBuffer.readUInt32LE(eocdOffset);
  if (sig !== 0x06054b50) {
    throw new Error('Not a valid ZIP file: EOCD signature not found');
  }

  const entryCount = zipBuffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let pos = cdOffset;
  for (let i = 0; i < entryCount; i++) {
    const nameLen = zipBuffer.readUInt16LE(pos + 28);
    const extraLen = zipBuffer.readUInt16LE(pos + 30);
    const commentLen = zipBuffer.readUInt16LE(pos + 32);
    const compressedSize = zipBuffer.readUInt32LE(pos + 20);
    const compression = zipBuffer.readUInt16LE(pos + 10);
    const localOffset = zipBuffer.readUInt32LE(pos + 42);
    const filename = zipBuffer.subarray(pos + 46, pos + 46 + nameLen).toString('utf-8');

    // Read data from local file header
    const localNameLen = zipBuffer.readUInt16LE(localOffset + 26);
    const localExtraLen = zipBuffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressedData = zipBuffer.subarray(dataStart, dataStart + compressedSize);

    let data;
    if (compression === 0) {
      data = Buffer.from(compressedData); // STORE (copy to avoid subarray issues)
    } else if (compression === 8) {
      data = zlib.inflateRawSync(compressedData); // DEFLATE
    } else {
      throw new Error(`Unsupported compression method: ${compression}`);
    }

    entries.push({ filename, data });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Artifact Discovery
// ---------------------------------------------------------------------------

/**
 * Default redaction function: strips lines matching common secret patterns.
 */
function defaultRedactFn(content) {
  const patterns = [
    /(?:api[_-]?key|secret|token|password|credential)\s*[=:]\s*[^\n]+/gi,
  ];
  let redacted = content;
  const stripped = [];
  for (const pattern of patterns) {
    const matches = redacted.match(pattern);
    if (matches) {
      for (const m of matches) {
        stripped.push(m.split(/[=:]/)[0].trim());
      }
      redacted = redacted.replace(pattern, (match) => {
        const [key] = match.split(/[=:]/);
        return `${key}=[REDACTED]`;
      });
    }
  }
  return { content: redacted, stripped };
}

/**
 * Scan .planning/ directories for bundleable artifacts.
 *
 * @param {string} cwd - Project root
 * @param {object} filters - { phase, since, until, manifestIds }
 * @returns {{ artifacts: Array, manifestObjects: Array }}
 */
function discoverArtifacts(cwd, filters = {}) {
  const paths = planningPaths(cwd);
  const artifacts = [];
  const manifestObjects = [];

  // 1. Scan manifests first (need them for cross-referencing)
  if (fs.existsSync(paths.manifests)) {
    for (const file of fs.readdirSync(paths.manifests)) {
      if (!file.endsWith('.json')) continue;
      const fullPath = path.join(paths.manifests, file);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const manifest = JSON.parse(content);

        // Apply manifest ID filter
        if (filters.manifestIds && !filters.manifestIds.includes(manifest.manifest_id)) {
          continue;
        }

        // Apply time range filter on execution.completed_at
        if (filters.since || filters.until) {
          const completedAt = manifest.execution && manifest.execution.completed_at;
          if (completedAt) {
            const ts = new Date(completedAt).getTime();
            if (filters.since && ts < new Date(filters.since).getTime()) continue;
            if (filters.until && ts >= new Date(filters.until).getTime()) continue;
          } else {
            // No completed_at — skip if time filter is active
            continue;
          }
        }

        // Apply phase filter on manifest
        if (filters.phase) {
          const phaseStr = String(filters.phase);
          const matchesPhase =
            (manifest.tags && manifest.tags.some(t => t.includes(phaseStr))) ||
            (manifest.hypothesis_ids && manifest.hypothesis_ids.some(h => h.includes(phaseStr))) ||
            file.includes(phaseStr);
          // Also check artifact paths
          const artifactPathMatch = (manifest.artifacts || []).some(a =>
            a.path && a.path.includes(phaseStr)
          );
          if (!matchesPhase && !artifactPathMatch) continue;
        }

        manifestObjects.push({ manifest, content, file });
      } catch {
        // Skip corrupt manifest files
      }
    }
  }

  // Build a set of artifact paths referenced by included manifests
  const manifestArtifactPaths = new Map(); // path -> manifest_id
  for (const { manifest } of manifestObjects) {
    for (const art of manifest.artifacts || []) {
      if (art.path) {
        for (const alias of artifactLookupAliases(art.path)) {
          manifestArtifactPaths.set(alias, manifest.manifest_id);
        }
      }
    }
  }

  // 2. Scan query logs
  if (fs.existsSync(paths.queries)) {
    for (const file of fs.readdirSync(paths.queries)) {
      if (!file.endsWith('.md')) continue;
      const fullPath = path.join(paths.queries, file);
      const relativePath = toPosixPath(path.relative(path.join(cwd, PLANNING_DIR_NAME), fullPath));
      const manifestId = artifactLookupAliases(relativePath)
        .map(alias => manifestArtifactPaths.get(alias))
        .find(Boolean) || null;

      // If phase filter is active and this artifact is not referenced by any included manifest,
      // skip it (unless it matches the phase in its path)
      if (filters.phase && !manifestId && !file.includes(filters.phase)) continue;

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        artifacts.push({
          type: 'query_log',
          id: file.replace(/\.md$/, ''),
          path: `QUERIES/${file}`,
          content,
          sourceFile: fullPath,
          manifest_id: manifestId,
        });
      } catch {
        // File disappeared between readdir and readFile
      }
    }
  }

  // 3. Scan receipts
  if (fs.existsSync(paths.receipts)) {
    for (const file of fs.readdirSync(paths.receipts)) {
      if (!file.endsWith('.md')) continue;
      const fullPath = path.join(paths.receipts, file);
      const relativePath = toPosixPath(path.relative(path.join(cwd, PLANNING_DIR_NAME), fullPath));
      const manifestId = artifactLookupAliases(relativePath)
        .map(alias => manifestArtifactPaths.get(alias))
        .find(Boolean) || null;

      if (filters.phase && !manifestId && !file.includes(filters.phase)) continue;

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        artifacts.push({
          type: 'receipt',
          id: file.replace(/\.md$/, ''),
          path: `RECEIPTS/${file}`,
          content,
          sourceFile: fullPath,
          manifest_id: manifestId,
        });
      } catch {
        // File disappeared between readdir and readFile
      }
    }
  }

  return { artifacts, manifestObjects };
}

// ---------------------------------------------------------------------------
// Bundle Creation
// ---------------------------------------------------------------------------

/**
 * Create an evidence export bundle as a ZIP file.
 *
 * @param {string} cwd - Project root
 * @param {object} options - { phase, output, since, until, redact, redactFn, manifestIds }
 * @returns {{ bundlePath: string, bundleId: string, bundleHash: string, summary: object }}
 */
function createExportBundle(cwd, options = {}) {
  const bundleId = makeBundleId();
  const createdAt = new Date().toISOString();

  // Discover artifacts with filters
  const filters = {
    phase: options.phase || null,
    since: options.since || null,
    until: options.until || null,
    manifestIds: options.manifestIds || null,
  };
  const { artifacts, manifestObjects } = discoverArtifacts(cwd, filters);

  // Build a map of discovered artifact paths (normalized) -> artifact
  const discoveredPaths = new Map();
  for (const art of artifacts) {
    for (const alias of artifactLookupAliases(art.path)) {
      discoveredPaths.set(alias, art);
    }
  }

  // Process manifests: cross-reference artifacts, find missing ones
  const bundleArtifacts = [];
  const bundleManifests = [];
  const chainOfCustody = [];
  const redactions = [];
  const processedArtifactPaths = new Set();

  const redactFn = options.redact
    ? (options.redactFn || defaultRedactFn)
    : null;

  for (const { manifest, content, file } of manifestObjects) {
    // Process each artifact referenced by this manifest
    for (const mArt of manifest.artifacts || []) {
      if (!mArt.path) continue;
      const artifactKey = stripKnownPlanningPrefix(mArt.path);

      // Try to find the discovered artifact
      const discovered = artifactLookupAliases(mArt.path)
        .map(alias => discoveredPaths.get(alias))
        .find(Boolean) || null;

      if (discovered && !processedArtifactPaths.has(discovered.path)) {
        processedArtifactPaths.add(discovered.path);

        let artifactContent = discovered.content;

        // Apply redaction if requested
        if (redactFn) {
          const result = redactFn(artifactContent, discovered.path);
          if (result.stripped && result.stripped.length > 0) {
            redactions.push({
              path: discovered.path,
              stripped_fields: result.stripped,
            });
          }
          artifactContent = result.content;
        }

        const contentHash = computeContentHash(artifactContent);
        bundleArtifacts.push({
          path: toPosixPath(discovered.path),
          type: discovered.type,
          content_hash: contentHash,
          status: 'included',
          manifest_id: manifest.manifest_id,
          _content: artifactContent, // internal, not serialized into bundle.json
        });
      } else if (!processedArtifactPaths.has(artifactKey)) {
        // Missing artifact
        const artPath = artifactKey;
        processedArtifactPaths.add(artifactKey);
        bundleArtifacts.push({
          path: toPosixPath(artPath),
          type: mArt.type || 'unknown',
          content_hash: mArt.content_hash || null,
          status: 'missing',
          manifest_id: manifest.manifest_id,
        });
      }
    }

    // Add manifest to bundle manifests list
    const manifestPath = toPosixPath(`manifests/${file}`);
    let manifestContent = content;

    if (redactFn) {
      const result = redactFn(manifestContent, manifestPath);
      if (result.stripped && result.stripped.length > 0) {
        redactions.push({ path: manifestPath, stripped_fields: result.stripped });
      }
      manifestContent = result.content;
    }

    bundleManifests.push({
      manifest_id: manifest.manifest_id,
      path: manifestPath,
      content_hash: computeContentHash(manifestContent),
      _content: manifestContent, // internal
    });

    // Chain of custody extraction
    if (manifest.provenance) {
      const prov = manifest.provenance;
      const custodyEntry = {
        manifest_id: manifest.manifest_id,
        signer_type: prov.signer ? prov.signer.signer_type : null,
        signer_id: prov.signer ? prov.signer.signer_id : null,
        signed_at: prov.signed_at || null,
      };
      if (prov.environment) {
        custodyEntry.runtime_name = prov.environment.runtime_name || null;
        custodyEntry.thrunt_version = prov.environment.thrunt_version || null;
      }
      chainOfCustody.push(custodyEntry);
    }
  }

  // Add any discovered artifacts not referenced by a manifest
  for (const art of artifacts) {
    if (!processedArtifactPaths.has(art.path)) {
      let artifactContent = art.content;

      if (redactFn) {
        const result = redactFn(artifactContent, art.path);
        if (result.stripped && result.stripped.length > 0) {
          redactions.push({ path: art.path, stripped_fields: result.stripped });
        }
        artifactContent = result.content;
      }

      bundleArtifacts.push({
        path: toPosixPath(art.path),
        type: art.type,
        content_hash: computeContentHash(artifactContent),
        status: 'included',
        manifest_id: art.manifest_id,
        _content: artifactContent,
      });
    }
  }

  // Compute summary counts
  const included = bundleArtifacts.filter(a => a.status === 'included').length;
  const missing = bundleArtifacts.filter(a => a.status === 'missing').length;

  // Collect phases covered (from manifest tags or hypothesis_ids)
  const phasesCovered = new Set();
  for (const { manifest } of manifestObjects) {
    if (manifest.tags) {
      for (const tag of manifest.tags) {
        const match = tag.match(/phase[- ]?(\d+)/i);
        if (match) phasesCovered.add(match[1]);
      }
    }
  }

  // Build bundle.json (exclude _content fields)
  const bundleJson = {
    bundle_version: '1.0',
    bundle_id: bundleId,
    created_at: createdAt,
    hash_algorithm: 'sha256',
    filters: {
      phase: filters.phase,
      since: filters.since,
      until: filters.until,
      manifest_ids: filters.manifestIds,
    },
    artifacts: bundleArtifacts.map(a => {
      const { _content, ...rest } = a;
      return rest;
    }),
    manifests: bundleManifests.map(m => {
      const { _content, ...rest } = m;
      return rest;
    }),
    chain_of_custody: chainOfCustody,
    redactions,
    summary: {
      total_artifacts: bundleArtifacts.length,
      included,
      missing,
      manifests: bundleManifests.length,
      phases_covered: [...phasesCovered].sort(),
    },
  };

  // Serialize bundle.json deterministically
  const bundleJsonContent = canonicalSerialize(bundleJson);

  // Build ZIP entries
  const zipEntries = [];

  // Artifact entries (included only)
  for (const art of bundleArtifacts) {
    if (art.status !== 'included' || !art._content) continue;
    zipEntries.push({
      filename: toPosixPath(art.path),
      data: Buffer.from(art._content, 'utf-8'),
    });
  }

  // Manifest entries
  for (const m of bundleManifests) {
    zipEntries.push({
      filename: toPosixPath(m.path),
      data: Buffer.from(m._content, 'utf-8'),
    });
  }

  // bundle.json LAST (per Research: written last, hash not inside itself)
  zipEntries.push({
    filename: 'bundle.json',
    data: Buffer.from(bundleJsonContent, 'utf-8'),
  });

  // Build the ZIP
  const zipBuffer = buildZip(zipEntries);

  // Determine output path
  let outputPath;
  if (options.output) {
    if (options.output.endsWith('.zip')) {
      outputPath = path.resolve(options.output);
    } else {
      // Treat as directory
      const dir = path.resolve(options.output);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      outputPath = path.join(dir, `${bundleId}.zip`);
    }
  } else {
    outputPath = path.join(cwd, `${bundleId}.zip`);
  }

  // Write ZIP to disk
  fs.writeFileSync(outputPath, zipBuffer);

  // Compute SHA-256 of the complete ZIP buffer (not inside bundle.json)
  const bundleHash = computeContentHash(zipBuffer);

  return {
    bundlePath: outputPath,
    bundleId,
    bundleHash,
    summary: bundleJson.summary,
  };
}

// ---------------------------------------------------------------------------
// Bundle Verification
// ---------------------------------------------------------------------------

/**
 * Verify an evidence bundle for completeness and integrity.
 *
 * @param {string} bundlePath - Path to the ZIP bundle
 * @returns {{ valid: boolean, failures: Array<{ path: string, expected?: string, actual?: string, error?: string }> }}
 */
function verifyBundle(bundlePath) {
  const failures = [];

  // Read the ZIP file
  let zipBuffer;
  try {
    zipBuffer = fs.readFileSync(bundlePath);
  } catch (err) {
    return { valid: false, failures: [{ path: bundlePath, error: `Cannot read file: ${err.message}` }] };
  }

  // Parse ZIP entries
  let entries;
  try {
    entries = readZipEntries(zipBuffer);
  } catch (err) {
    return { valid: false, failures: [{ path: 'bundle.json', error: `Invalid ZIP: ${err.message}` }] };
  }

  // Find bundle.json
  const bundleEntry = entries.find(e => e.filename === 'bundle.json');
  if (!bundleEntry) {
    return { valid: false, failures: [{ path: 'bundle.json', error: 'bundle.json not found in archive' }] };
  }

  // Parse bundle.json
  let bundleJson;
  try {
    bundleJson = JSON.parse(bundleEntry.data.toString('utf-8'));
  } catch (err) {
    return { valid: false, failures: [{ path: 'bundle.json', error: `Invalid JSON: ${err.message}` }] };
  }

  // Build a map of ZIP entries by filename
  const entryMap = new Map();
  for (const entry of entries) {
    entryMap.set(entry.filename, entry);
  }

  // Verify each included artifact
  for (const artifact of bundleJson.artifacts || []) {
    if (artifact.status !== 'included') continue;

    const entry = entryMap.get(artifact.path);
    if (!entry) {
      failures.push({
        path: artifact.path,
        expected: artifact.content_hash,
        actual: null,
        error: 'Entry not found in ZIP archive',
      });
      continue;
    }

    const actualHash = computeContentHash(entry.data.toString('utf-8'));
    if (actualHash !== artifact.content_hash) {
      failures.push({
        path: artifact.path,
        expected: artifact.content_hash,
        actual: actualHash,
      });
    }
  }

  // Verify each manifest
  for (const manifest of bundleJson.manifests || []) {
    const entry = entryMap.get(manifest.path);
    if (!entry) {
      failures.push({
        path: manifest.path,
        expected: manifest.content_hash,
        actual: null,
        error: 'Entry not found in ZIP archive',
      });
      continue;
    }

    const actualHash = computeContentHash(entry.data.toString('utf-8'));
    if (actualHash !== manifest.content_hash) {
      failures.push({
        path: manifest.path,
        expected: manifest.content_hash,
        actual: actualHash,
      });
    }
  }

  return { valid: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// CLI Command Functions
// ---------------------------------------------------------------------------

/**
 * CLI entry point for `bundle export`.
 *
 * @param {string} cwd - Working directory
 * @param {object} options - Parsed CLI options { phase, output, since, until, redact }
 * @param {boolean} raw - Raw output flag
 */
function cmdBundleExport(cwd, options, raw) {
  const result = createExportBundle(cwd, options);
  output(result, raw, `Bundle created: ${result.bundlePath}\nHash: ${result.bundleHash}`);
}

/**
 * CLI entry point for `bundle verify`.
 *
 * @param {string} cwd - Working directory
 * @param {string} bundlePath - Path to the bundle ZIP
 * @param {boolean} raw - Raw output flag
 */
function cmdBundleVerify(cwd, bundlePath, raw) {
  if (!bundlePath) {
    error('Usage: bundle verify <path-to-bundle.zip>');
  }
  // Validate path safety
  requireSafePath(bundlePath, cwd, 'Bundle path', { allowAbsolute: true });

  const result = verifyBundle(bundlePath);
  const plainText = result.valid
    ? 'PASS'
    : `FAIL: ${result.failures.length} failures`;
  output(result, raw, plainText);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createExportBundle,
  verifyBundle,
  cmdBundleExport,
  cmdBundleVerify,
  // Exported for testing
  buildZip,
  readZipEntries,
};
