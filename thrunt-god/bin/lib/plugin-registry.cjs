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

const CONNECTOR_ID_REGEX = /^[a-z][a-z0-9_-]{1,63}$/;
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

function resolveWithinRoot(rootPath, relativePath) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedPath = path.resolve(rootPath, relativePath);

  if (
    resolvedPath === resolvedRoot ||
    resolvedPath.startsWith(resolvedRoot + path.sep)
  ) {
    return resolvedPath;
  }

  return null;
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function isSatisfiableSemverRange(range) {
  if (typeof range !== 'string') return false;
  const trimmed = range.trim();
  if (!trimmed) return false;

  if (parseSemver(trimmed)) return true;

  if (trimmed.startsWith('^')) {
    return parseSemver(trimmed.slice(1)) !== null;
  }

  if (trimmed.startsWith('~')) {
    return parseSemver(trimmed.slice(1)) !== null;
  }

  if (trimmed.startsWith('>=')) {
    const parts = trimmed.slice(2).trim().split(/\s+/);
    if (!parseSemver(parts[0])) return false;
    if (parts.length === 1) return true;
    if (parts.length === 2 && parts[1].startsWith('<')) {
      return parseSemver(parts[1].slice(1)) !== null;
    }
    return false;
  }

  return false;
}

function validatePluginManifest(manifest, options = {}) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(manifest)) {
    return { valid: false, errors: ['manifest must be a plain object'], warnings };
  }

  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (manifest[field] === undefined || manifest[field] === null) {
      errors.push(`Required field '${field}' is missing`);
    }
  }

  if (typeof manifest.connector_id === 'string') {
    if (!CONNECTOR_ID_REGEX.test(manifest.connector_id)) {
      errors.push(
        `connector_id must match pattern ${CONNECTOR_ID_REGEX} (lowercase letter start, 2-64 chars, alphanumeric/underscore/hyphen)`
      );
    }
  }

  if (typeof manifest.sdk_version === 'string') {
    if (!isSatisfiableSemverRange(manifest.sdk_version)) {
      errors.push(`sdk_version '${manifest.sdk_version}' is not a valid semver range`);
    }
  }

  if (typeof manifest.entry === 'string' && options.packageRoot) {
    const entryPath = resolveWithinRoot(options.packageRoot, manifest.entry);
    if (!entryPath) {
      errors.push(`entry '${manifest.entry}' resolves outside packageRoot (path traversal blocked)`);
    } else if (!fs.existsSync(entryPath)) {
      errors.push(`entry '${manifest.entry}' does not exist at ${entryPath}`);
    }
  }

  if (Array.isArray(manifest.auth_types)) {
    for (const at of manifest.auth_types) {
      if (!AUTH_TYPES.includes(at)) {
        errors.push(`auth_types contains invalid value '${at}' (allowed: ${AUTH_TYPES.join(', ')})`);
      }
    }
  }

  if (Array.isArray(manifest.dataset_kinds)) {
    for (const dk of manifest.dataset_kinds) {
      if (!DATASET_KINDS.includes(dk)) {
        errors.push(`dataset_kinds contains invalid value '${dk}' (allowed: ${DATASET_KINDS.join(', ')})`);
      }
    }
  }

  if (Array.isArray(manifest.pagination_modes)) {
    for (const pm of manifest.pagination_modes) {
      if (!PAGINATION_MODES.includes(pm)) {
        errors.push(`pagination_modes contains invalid value '${pm}' (allowed: ${PAGINATION_MODES.join(', ')})`);
      }
    }
  }

  if (typeof manifest.connector_id === 'string' && !options.allowOverride) {
    if (BUILT_IN_CONNECTOR_IDS.includes(manifest.connector_id)) {
      warnings.push(
        `connector_id '${manifest.connector_id}' collides with a built-in connector ID`
      );
    }
  }

  if (manifest.permissions !== undefined && manifest.permissions !== null) {
    if (!isPlainObject(manifest.permissions)) {
      errors.push('permissions must be a plain object');
    }
  } else {
    const idx = errors.findIndex(e => e.includes("'permissions'"));
    if (idx !== -1) errors.splice(idx, 1);
    errors.push('permissions object is required');
  }

  return { valid: errors.length === 0, errors, warnings };
}

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
  const entryPath = resolveWithinRoot(packageRoot, manifest.entry);

  if (!entryPath) {
    return {
      valid: false,
      adapter: null,
      manifest,
      errors: [`entry '${manifest.entry}' resolves outside packageRoot (path traversal blocked)`],
      warnings: manifestResult.warnings,
    };
  }

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

  const caps = adapter.capabilities || {};

  if (Array.isArray(manifest.auth_types)) {
    for (const at of manifest.auth_types) {
      if (!Array.isArray(caps.auth_types) || !caps.auth_types.includes(at)) {
        errors.push(`Manifest declares auth_type '${at}' but adapter capabilities do not include it`);
      }
    }
  }

  if (Array.isArray(manifest.dataset_kinds)) {
    for (const dk of manifest.dataset_kinds) {
      if (!Array.isArray(caps.dataset_kinds) || !caps.dataset_kinds.includes(dk)) {
        errors.push(`Manifest declares dataset_kind '${dk}' but adapter capabilities do not include it`);
      }
    }
  }

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

function createPluginRegistry(options = {}) {
  const { builtInAdapters = [], pluginEntries = [] } = options;

  const adapterMap = new Map();
  const pluginInfoMap = new Map();
  const overriddenSet = new Set();

  function canOverrideBuiltIn(id, source) {
    return BUILT_IN_CONNECTOR_IDS.includes(id) && source === 'config-override';
  }

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

  for (const entry of pluginEntries) {
    const { adapter, manifest, source, packageRoot } = entry;
    if (!adapter || !adapter.capabilities) continue;
    const id = adapter.capabilities.id;

    if (pluginInfoMap.has(id) && pluginInfoMap.get(id).source === 'built-in') {
      if (!canOverrideBuiltIn(id, source)) {
        continue;
      }
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
        if (!canOverrideBuiltIn(id, pluginInfo ? pluginInfo.source : null)) {
          return;
        }
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

/** @type {Map<string, {mtime: number, results: Array}>} */
const _scanCache = new Map();

function isLooseTopLevelDiscoveryEnabled(config = {}) {
  if (process.env.THRUNT_ENABLE_TOPLEVEL_CONNECTOR_DISCOVERY === '1') {
    return true;
  }

  if (config && typeof config === 'object') {
    if (config.allow_top_level_connector_discovery === true) {
      return true;
    }
    if (config.plugins && typeof config.plugins === 'object' && config.plugins.allow_top_level_connector_discovery === true) {
      return true;
    }
    if (config.connectors && typeof config.connectors === 'object' && config.connectors.allow_top_level_connector_discovery === true) {
      return true;
    }
  }

  return false;
}

function _scanNodeModules(cwd, options = {}) {
  const allowTopLevelConnectorDiscovery = Boolean(options.allowTopLevelConnectorDiscovery);
  const nmDir = path.join(cwd, 'node_modules');
  const cacheKey = `${cwd}:${allowTopLevelConnectorDiscovery ? 'top-level' : 'namespaced-only'}`;

  let lockMtime = 0;
  const lockPath = path.join(cwd, 'package-lock.json');
  try {
    lockMtime = fs.statSync(lockPath).mtimeMs;
  } catch {
  }

  const cached = _scanCache.get(cacheKey);
  if (cached && cached.mtime === lockMtime) {
    return cached.results;
  }

  // Scan node_modules
  if (!fs.existsSync(nmDir)) {
    const results = [];
    _scanCache.set(cacheKey, { mtime: lockMtime, results });
    return results;
  }

  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(nmDir);
  } catch {
    _scanCache.set(cacheKey, { mtime: lockMtime, results });
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

    if (!allowTopLevelConnectorDiscovery) {
      continue;
    }

    // Check any other top-level package with thrunt-connector.json only when explicitly enabled.
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

  _scanCache.set(cacheKey, { mtime: lockMtime, results });
  return results;
}

function discoverPlugins(options = {}) {
  const {
    cwd = process.cwd(),
    config = {},
    includeBuiltIn = true,
  } = options;

  const builtInAdapters = [];
  const pluginEntries = [];

  if (includeBuiltIn) {
    const { createBuiltInConnectorRegistry } = require('./runtime.cjs');
    const builtInRegistry = createBuiltInConnectorRegistry();
    for (const id of BUILT_IN_CONNECTOR_IDS) {
      const adapter = builtInRegistry.get(id);
      if (adapter) builtInAdapters.push(adapter);
    }
  }

  // 2. node_modules scan
  const discovered = _scanNodeModules(cwd, {
    allowTopLevelConnectorDiscovery: isLooseTopLevelDiscoveryEnabled(config),
  });
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

module.exports = {
  BUILT_IN_CONNECTOR_IDS,
  validatePluginManifest,
  loadPluginManifest,
  loadPlugin,
  createPluginRegistry,
  discoverPlugins,
  _scanNodeModules,
};
