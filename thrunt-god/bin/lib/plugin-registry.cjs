/**
 * Plugin Registry — Manifest validation, loading, and cross-check for third-party connectors.
 *
 * Provides validatePluginManifest(), loadPluginManifest(), and loadPlugin() for the
 * plugin discovery pipeline (Phase 46). All manifest parsing and validation logic lives
 * here so that discoverPlugins() (Plan 02) can validate discovered packages.
 *
 * Depends on connector-sdk.cjs for AUTH_TYPES, DATASET_KINDS, PAGINATION_MODES constants
 * and validateConnectorAdapter() for adapter validation.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
  AUTH_TYPES,
  DATASET_KINDS,
  PAGINATION_MODES,
  validateConnectorAdapter,
  isPlainObject,
} = require('./connector-sdk.cjs');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Built-in connector IDs from createBuiltInConnectorRegistry in runtime.cjs */
const BUILT_IN_CONNECTOR_IDS = Object.freeze([
  'splunk',
  'elastic',
  'sentinel',
  'opensearch',
  'defender_xdr',
  'okta',
  'm365',
  'crowdstrike',
  'aws',
  'gcp',
]);

/** connector_id must start with a lowercase letter, followed by 1-63 lowercase alphanumeric, underscore, or hyphen chars */
const CONNECTOR_ID_REGEX = /^[a-z][a-z0-9_-]{1,63}$/;

/** Required top-level fields in thrunt-connector.json */
const REQUIRED_MANIFEST_FIELDS = [
  'name',
  'version',
  'sdk_version',
  'connector_id',
  'display_name',
  'entry',
  'auth_types',
  'dataset_kinds',
  'languages',
  'pagination_modes',
  'permissions',
];

// ---------------------------------------------------------------------------
// Minimal semver range checker (no external dependency)
// ---------------------------------------------------------------------------

/**
 * Parse a version string into [major, minor, patch] or null.
 */
function parseSemver(version) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

/**
 * Check if a semver range string is a recognizable, satisfiable pattern.
 * Supports: exact "X.Y.Z", "^X.Y.Z", "~X.Y.Z", ">=X.Y.Z", ">=X.Y.Z <A.B.C".
 * Returns true if the range is parseable and satisfiable.
 */
function isSatisfiableSemverRange(range) {
  if (typeof range !== 'string') return false;
  const trimmed = range.trim();
  if (!trimmed) return false;

  // Exact version: "1.2.3"
  if (parseSemver(trimmed)) return true;

  // Caret range: "^1.2.3"
  if (trimmed.startsWith('^')) {
    return parseSemver(trimmed.slice(1)) !== null;
  }

  // Tilde range: "~1.2.3"
  if (trimmed.startsWith('~')) {
    return parseSemver(trimmed.slice(1)) !== null;
  }

  // Greater-than-or-equal: ">=1.2.3" or ">=1.2.3 <2.0.0"
  if (trimmed.startsWith('>=')) {
    const parts = trimmed.slice(2).trim().split(/\s+/);
    if (!parseSemver(parts[0])) return false;
    if (parts.length === 1) return true;
    // Handle ">=X.Y.Z <A.B.C"
    if (parts.length === 2 && parts[1].startsWith('<')) {
      return parseSemver(parts[1].slice(1)) !== null;
    }
    return false;
  }

  return false;
}

// ---------------------------------------------------------------------------
// validatePluginManifest
// ---------------------------------------------------------------------------

/**
 * Validate a parsed plugin manifest object.
 *
 * @param {object} manifest - Parsed thrunt-connector.json contents
 * @param {object} [options] - Validation options
 * @param {string} [options.packageRoot] - Directory where entry file is resolved (enables file existence check)
 * @param {boolean} [options.allowOverride] - If true, suppress built-in collision warning
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validatePluginManifest(manifest, options = {}) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(manifest)) {
    return { valid: false, errors: ['manifest must be a plain object'], warnings };
  }

  // -- Rule 0: Required fields --
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (manifest[field] === undefined || manifest[field] === null) {
      errors.push(`Required field '${field}' is missing`);
    }
  }

  // -- Rule 1: connector_id format --
  if (typeof manifest.connector_id === 'string') {
    if (!CONNECTOR_ID_REGEX.test(manifest.connector_id)) {
      errors.push(
        `connector_id must match pattern ${CONNECTOR_ID_REGEX} (lowercase letter start, 2-64 chars, alphanumeric/underscore/hyphen)`
      );
    }
  }

  // -- Rule 2: sdk_version is a satisfiable semver range --
  if (typeof manifest.sdk_version === 'string') {
    if (!isSatisfiableSemverRange(manifest.sdk_version)) {
      errors.push(`sdk_version '${manifest.sdk_version}' is not a valid semver range`);
    }
  }

  // -- Rule 3: entry points to existing file (only if packageRoot provided) --
  if (typeof manifest.entry === 'string' && options.packageRoot) {
    const entryPath = path.resolve(options.packageRoot, manifest.entry);
    // Guard against path traversal — entry must resolve within packageRoot
    const resolvedRoot = path.resolve(options.packageRoot) + path.sep;
    if (!entryPath.startsWith(resolvedRoot) && entryPath !== path.resolve(options.packageRoot)) {
      errors.push(`entry '${manifest.entry}' resolves outside packageRoot (path traversal blocked)`);
    } else if (!fs.existsSync(entryPath)) {
      errors.push(`entry '${manifest.entry}' does not exist at ${entryPath}`);
    }
  }

  // -- Rule 4: auth_types validation --
  if (Array.isArray(manifest.auth_types)) {
    for (const at of manifest.auth_types) {
      if (!AUTH_TYPES.includes(at)) {
        errors.push(`auth_types contains invalid value '${at}' (allowed: ${AUTH_TYPES.join(', ')})`);
      }
    }
  }

  // -- Rule 5: dataset_kinds validation --
  if (Array.isArray(manifest.dataset_kinds)) {
    for (const dk of manifest.dataset_kinds) {
      if (!DATASET_KINDS.includes(dk)) {
        errors.push(`dataset_kinds contains invalid value '${dk}' (allowed: ${DATASET_KINDS.join(', ')})`);
      }
    }
  }

  // -- Rule 6: pagination_modes validation --
  if (Array.isArray(manifest.pagination_modes)) {
    for (const pm of manifest.pagination_modes) {
      if (!PAGINATION_MODES.includes(pm)) {
        errors.push(`pagination_modes contains invalid value '${pm}' (allowed: ${PAGINATION_MODES.join(', ')})`);
      }
    }
  }

  // -- Rule 7: connector_id collision with built-in --
  if (typeof manifest.connector_id === 'string' && !options.allowOverride) {
    if (BUILT_IN_CONNECTOR_IDS.includes(manifest.connector_id)) {
      warnings.push(
        `connector_id '${manifest.connector_id}' collides with a built-in connector ID`
      );
    }
  }

  // -- Rule 8: permissions required as plain object --
  if (manifest.permissions !== undefined && manifest.permissions !== null) {
    if (!isPlainObject(manifest.permissions)) {
      errors.push('permissions must be a plain object');
    }
  } else {
    // Remove the generic required-field error and replace with specific message
    const idx = errors.findIndex(e => e.includes("'permissions'"));
    if (idx !== -1) errors.splice(idx, 1);
    errors.push('permissions object is required');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// loadPluginManifest
// ---------------------------------------------------------------------------

/**
 * Read thrunt-connector.json from a package root directory and validate it.
 *
 * @param {string} packageRoot - Absolute path to the plugin package directory
 * @returns {{ valid: boolean, manifest: object|null, errors: string[], warnings: string[] }}
 */
function loadPluginManifest(packageRoot) {
  const manifestPath = path.join(packageRoot, 'thrunt-connector.json');
  let raw;

  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch (err) {
    return {
      valid: false,
      manifest: null,
      errors: [`Cannot read thrunt-connector.json at ${manifestPath}: ${err.message}`],
      warnings: [],
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      valid: false,
      manifest: null,
      errors: [`Failed to parse thrunt-connector.json: ${err.message}`],
      warnings: [],
    };
  }

  const validation = validatePluginManifest(parsed, { packageRoot });
  return {
    valid: validation.valid,
    manifest: parsed,
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

// ---------------------------------------------------------------------------
// loadPlugin
// ---------------------------------------------------------------------------

/**
 * Load a plugin from a package root: read manifest, require entry module,
 * call createAdapter(), validate adapter, and cross-check capabilities.
 *
 * @param {string} packageRoot - Absolute path to the plugin package directory
 * @returns {{ valid: boolean, adapter: object|null, manifest: object|null, errors: string[], warnings: string[] }}
 */
function loadPlugin(packageRoot) {
  const manifestResult = loadPluginManifest(packageRoot);
  if (!manifestResult.valid) {
    return {
      valid: false,
      adapter: null,
      manifest: manifestResult.manifest,
      errors: manifestResult.errors,
      warnings: manifestResult.warnings,
    };
  }

  const manifest = manifestResult.manifest;
  const entryPath = path.resolve(packageRoot, manifest.entry);

  // Guard against path traversal — entry must resolve within packageRoot
  const resolvedRoot = path.resolve(packageRoot) + path.sep;
  if (!entryPath.startsWith(resolvedRoot) && entryPath !== path.resolve(packageRoot)) {
    return {
      valid: false,
      adapter: null,
      manifest,
      errors: [`entry '${manifest.entry}' resolves outside packageRoot (path traversal blocked)`],
      warnings: manifestResult.warnings,
    };
  }

  // Load entry module
  let entryModule;
  try {
    entryModule = require(entryPath);
  } catch (err) {
    return {
      valid: false,
      adapter: null,
      manifest,
      errors: [`Failed to require entry module '${manifest.entry}': ${err.message}`],
      warnings: manifestResult.warnings,
    };
  }

  // Call createAdapter
  if (typeof entryModule.createAdapter !== 'function') {
    return {
      valid: false,
      adapter: null,
      manifest,
      errors: ['Entry module does not export a createAdapter() function'],
      warnings: manifestResult.warnings,
    };
  }

  let adapter;
  try {
    adapter = entryModule.createAdapter();
  } catch (err) {
    return {
      valid: false,
      adapter: null,
      manifest,
      errors: [`createAdapter() threw: ${err.message}`],
      warnings: manifestResult.warnings,
    };
  }

  // Validate adapter structure
  const adapterValidation = validateConnectorAdapter(adapter);
  const errors = [...manifestResult.errors];
  const warnings = [...manifestResult.warnings, ...(adapterValidation.warnings || [])];

  if (!adapterValidation.valid) {
    return {
      valid: false,
      adapter,
      manifest,
      errors: [...errors, ...adapterValidation.errors],
      warnings,
    };
  }

  // Cross-check: adapter capabilities must be a superset of manifest declarations
  const caps = adapter.capabilities || {};

  // Check auth_types
  if (Array.isArray(manifest.auth_types)) {
    for (const at of manifest.auth_types) {
      if (!Array.isArray(caps.auth_types) || !caps.auth_types.includes(at)) {
        errors.push(`Manifest declares auth_type '${at}' but adapter capabilities do not include it`);
      }
    }
  }

  // Check dataset_kinds
  if (Array.isArray(manifest.dataset_kinds)) {
    for (const dk of manifest.dataset_kinds) {
      if (!Array.isArray(caps.dataset_kinds) || !caps.dataset_kinds.includes(dk)) {
        errors.push(`Manifest declares dataset_kind '${dk}' but adapter capabilities do not include it`);
      }
    }
  }

  // Check pagination_modes
  if (Array.isArray(manifest.pagination_modes)) {
    for (const pm of manifest.pagination_modes) {
      if (!Array.isArray(caps.pagination_modes) || !caps.pagination_modes.includes(pm)) {
        errors.push(`Manifest declares pagination_mode '${pm}' but adapter capabilities do not include it`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    adapter,
    manifest,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// createPluginRegistry
// ---------------------------------------------------------------------------

/**
 * Factory that creates a PluginRegistry object — a superset of ConnectorRegistry
 * with provenance tracking (source, version, permissions) for each connector.
 *
 * @param {object} [options]
 * @param {object[]} [options.builtInAdapters] - Array of built-in adapter objects
 * @param {Array<{adapter, manifest, source, packageRoot}>} [options.pluginEntries] - Plugin entries
 * @returns {PluginRegistry}
 */
function createPluginRegistry(options = {}) {
  const { builtInAdapters = [], pluginEntries = [] } = options;

  /** @type {Map<string, object>} connector_id -> adapter */
  const adapterMap = new Map();
  /** @type {Map<string, object>} connector_id -> PluginInfo */
  const pluginInfoMap = new Map();
  /** @type {Set<string>} connector_ids where a plugin replaced a built-in */
  const overriddenSet = new Set();

  // 1. Register built-in adapters first
  for (const adapter of builtInAdapters) {
    if (!adapter || !adapter.capabilities) continue;
    const id = adapter.capabilities.id;
    adapterMap.set(id, adapter);
    pluginInfoMap.set(id, {
      connector_id: id,
      source: 'built-in',
      package_name: null,
      manifest_path: null,
      version: '0.0.0',
      sdk_version_range: '*',
      sdk_compatible: true,
      permissions: { network: true, filesystem: false, subprocess: false, env_access: [] },
    });
  }

  // 2. Register plugin entries (plugins take precedence over built-ins)
  for (const entry of pluginEntries) {
    const { adapter, manifest, source, packageRoot } = entry;
    if (!adapter || !adapter.capabilities) continue;
    const id = adapter.capabilities.id;

    // If this connector_id matches a built-in, record the override
    if (pluginInfoMap.has(id) && pluginInfoMap.get(id).source === 'built-in') {
      overriddenSet.add(id);
    }

    adapterMap.set(id, adapter);
    pluginInfoMap.set(id, {
      connector_id: id,
      source,
      package_name: manifest ? manifest.name : null,
      manifest_path: packageRoot ? path.join(packageRoot, 'thrunt-connector.json') : null,
      version: manifest ? manifest.version : '0.0.0',
      sdk_version_range: manifest ? manifest.sdk_version : '*',
      sdk_compatible: true,
      permissions: manifest ? (manifest.permissions || {}) : {},
    });
  }

  // Helper to clone capabilities (consistent with ConnectorRegistry.list())
  function cloneCapabilities(adapter) {
    return JSON.parse(JSON.stringify(adapter.capabilities));
  }

  return {
    get(id) {
      return adapterMap.get(id) || null;
    },
    has(id) {
      return adapterMap.has(id);
    },
    list() {
      return Array.from(adapterMap.values()).map(a => cloneCapabilities(a));
    },
    register(adapter, pluginInfo) {
      if (!adapter || !adapter.capabilities) return;
      const id = adapter.capabilities.id;
      if (pluginInfoMap.has(id) && pluginInfoMap.get(id).source === 'built-in') {
        overriddenSet.add(id);
      }
      adapterMap.set(id, adapter);
      pluginInfoMap.set(id, pluginInfo);
    },
    getPluginInfo(id) {
      return pluginInfoMap.get(id) || null;
    },
    listPlugins() {
      return Array.from(pluginInfoMap.values());
    },
    isBuiltIn(id) {
      const info = pluginInfoMap.get(id);
      if (!info) return false;
      return info.source === 'built-in' && !overriddenSet.has(id);
    },
    isOverridden(id) {
      return overriddenSet.has(id);
    },
  };
}

// ---------------------------------------------------------------------------
// _scanNodeModules (exported for testing)
// ---------------------------------------------------------------------------

/** @type {Map<string, {mtime: number, results: Array}>} */
const _scanCache = new Map();

/**
 * Scan node_modules for plugin packages.
 * Check patterns: @thrunt/connector-*, thrunt-connector-*, and any package with thrunt-connector.json.
 * Caches results keyed by cwd; invalidated when package-lock.json mtime changes.
 *
 * @param {string} cwd - Directory containing node_modules
 * @returns {Array<{packageRoot: string, manifestPath: string}>}
 */
function _scanNodeModules(cwd) {
  const nmDir = path.join(cwd, 'node_modules');

  // Check lockfile mtime for cache invalidation
  let lockMtime = 0;
  const lockPath = path.join(cwd, 'package-lock.json');
  try {
    lockMtime = fs.statSync(lockPath).mtimeMs;
  } catch {
    // No lockfile — that's fine
  }

  // Check cache
  const cached = _scanCache.get(cwd);
  if (cached && cached.mtime === lockMtime) {
    return cached.results;
  }

  // Scan node_modules
  if (!fs.existsSync(nmDir)) {
    const results = [];
    _scanCache.set(cwd, { mtime: lockMtime, results });
    return results;
  }

  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(nmDir);
  } catch {
    _scanCache.set(cwd, { mtime: lockMtime, results });
    return results;
  }

  for (const entry of entries) {
    // Skip dot-prefixed entries (.cache, .package-lock.json, etc.)
    if (entry.startsWith('.')) continue;

    const entryPath = path.join(nmDir, entry);

    // Check scoped packages: @thrunt/connector-*
    if (entry === '@thrunt') {
      try {
        const scopedEntries = fs.readdirSync(entryPath);
        for (const scopedEntry of scopedEntries) {
          if (scopedEntry.startsWith('connector-')) {
            const pkgRoot = path.join(entryPath, scopedEntry);
            const manifestPath = path.join(pkgRoot, 'thrunt-connector.json');
            if (fs.existsSync(manifestPath)) {
              results.push({ packageRoot: pkgRoot, manifestPath });
            }
          }
        }
      } catch {
        // Skip unreadable scoped directory
      }
      continue;
    }

    // Check thrunt-connector-* packages
    if (entry.startsWith('thrunt-connector-')) {
      const manifestPath = path.join(entryPath, 'thrunt-connector.json');
      if (fs.existsSync(manifestPath)) {
        results.push({ packageRoot: entryPath, manifestPath });
      }
      continue;
    }

    // Check any other top-level package with thrunt-connector.json
    try {
      const stat = fs.statSync(entryPath);
      if (stat.isDirectory()) {
        const manifestPath = path.join(entryPath, 'thrunt-connector.json');
        if (fs.existsSync(manifestPath)) {
          results.push({ packageRoot: entryPath, manifestPath });
        }
      }
    } catch {
      // Skip unreadable entries
    }
  }

  _scanCache.set(cwd, { mtime: lockMtime, results });
  return results;
}

// ---------------------------------------------------------------------------
// discoverPlugins
// ---------------------------------------------------------------------------

/**
 * Discover and register plugins using triple-precedence resolution:
 *   1. Built-in fallback (lowest precedence)
 *   2. node_modules scan
 *   3. Explicit config plugins (config-path)
 *   4. Config overrides (config-override, highest precedence for built-in replacement)
 *
 * @param {object} [options]
 * @param {string} [options.cwd] - Working directory (default: process.cwd())
 * @param {object} [options.config] - Config with connectors.plugins and connectors.overrides
 * @param {boolean} [options.includeBuiltIn] - Include built-in connectors (default: true)
 * @returns {PluginRegistry}
 */
function discoverPlugins(options = {}) {
  const {
    cwd = process.cwd(),
    config = {},
    includeBuiltIn = true,
  } = options;

  const builtInAdapters = [];
  const pluginEntries = [];

  // 1. Built-in fallback
  if (includeBuiltIn) {
    // Lazy require to avoid circular dependency at module load time
    const { createBuiltInConnectorRegistry } = require('./runtime.cjs');
    const builtInRegistry = createBuiltInConnectorRegistry();
    for (const id of BUILT_IN_CONNECTOR_IDS) {
      const adapter = builtInRegistry.get(id);
      if (adapter) builtInAdapters.push(adapter);
    }
  }

  // 2. node_modules scan
  const discovered = _scanNodeModules(cwd);
  for (const { packageRoot } of discovered) {
    const result = loadPlugin(packageRoot);
    if (result.valid) {
      pluginEntries.push({
        adapter: result.adapter,
        manifest: result.manifest,
        source: 'node_modules',
        packageRoot,
      });
    } else {
      console.error(`[thrunt] Invalid plugin at ${packageRoot}: ${result.errors.join('; ')}`);
    }
  }

  // Path containment helper — validates a resolved path is within allowed roots
  const resolvedCwd = path.resolve(cwd);
  const nodeModulesRoot = path.join(resolvedCwd, 'node_modules');

  function isWithinProjectRoot(resolvedPath) {
    const normalised = path.resolve(resolvedPath);
    return normalised.startsWith(resolvedCwd + path.sep) || normalised === resolvedCwd;
  }

  function isWithinProjectOrNodeModules(resolvedPath) {
    const normalised = path.resolve(resolvedPath);
    return (
      normalised.startsWith(resolvedCwd + path.sep) ||
      normalised === resolvedCwd ||
      normalised.startsWith(nodeModulesRoot + path.sep) ||
      normalised === nodeModulesRoot
    );
  }

  // 3. Explicit config plugins
  const configPlugins = config?.connectors?.plugins;
  if (Array.isArray(configPlugins)) {
    for (const pluginPath of configPlugins) {
      const resolvedPath = path.resolve(cwd, pluginPath);
      if (!isWithinProjectRoot(resolvedPath)) {
        console.warn(`[thrunt] Plugin path '${pluginPath}' resolves outside project root (path traversal blocked)`);
        continue;
      }
      const result = loadPlugin(resolvedPath);
      if (result.valid) {
        pluginEntries.push({
          adapter: result.adapter,
          manifest: result.manifest,
          source: 'config-path',
          packageRoot: resolvedPath,
        });
      } else {
        console.error(`[thrunt] Invalid plugin at ${resolvedPath}: ${result.errors.join('; ')}`);
      }
    }
  }

  // 4. Config overrides (highest precedence for built-in replacement)
  const configOverrides = config?.connectors?.overrides;
  if (configOverrides && typeof configOverrides === 'object') {
    for (const [builtInId, pluginPath] of Object.entries(configOverrides)) {
      const resolvedPath = path.resolve(cwd, pluginPath);
      if (!isWithinProjectOrNodeModules(resolvedPath)) {
        console.warn(`[thrunt] Override path '${pluginPath}' resolves outside project root and node_modules (path traversal blocked)`);
        continue;
      }
      const result = loadPlugin(resolvedPath);
      if (result.valid) {
        if (result.adapter.capabilities.id === builtInId) {
          pluginEntries.push({
            adapter: result.adapter,
            manifest: result.manifest,
            source: 'config-override',
            packageRoot: resolvedPath,
          });
        } else {
          console.error(
            `[thrunt] Override for '${builtInId}' skipped: plugin has connector_id '${result.adapter.capabilities.id}' (must match override key)`
          );
        }
      } else {
        console.error(`[thrunt] Invalid override plugin at ${resolvedPath}: ${result.errors.join('; ')}`);
      }
    }
  }

  return createPluginRegistry({ builtInAdapters, pluginEntries });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  BUILT_IN_CONNECTOR_IDS,
  validatePluginManifest,
  loadPluginManifest,
  loadPlugin,
  createPluginRegistry,
  discoverPlugins,
  _scanNodeModules,
};
