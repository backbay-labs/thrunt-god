/**
 * Tenant — Multi-tenant registry with validation, readiness assessment, and CRUD CLI commands
 *
 * Provides tenant configuration management for MSSP operators. Tenants group
 * connector profiles under named identities, enabling per-tenant credential
 * isolation and readiness tracking.
 */

const { loadConfig, planningDir, planningPaths, output, error } = require('./core.cjs');
const { setConfigValue } = require('./config.cjs');

// ─── Tenant ID & Schema Validation ──────────────────────────────────────────

const TENANT_ID_REGEX = /^[a-z0-9][a-z0-9-]*$/;
const TENANT_ID_MAX_LENGTH = 64;

/**
 * Validates a tenant configuration object against the expected schema and
 * cross-references connector profiles in the project config.
 *
 * @param {object} tenant - The tenant object to validate
 * @param {object} config - Full project config (with connector_profiles, tenants, etc.)
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
function validateTenantConfig(tenant, config) {
  const errors = [];
  const warnings = [];

  // --- id validation ---
  if (tenant.id === undefined || tenant.id === null) {
    errors.push('Tenant id is required');
  } else if (typeof tenant.id !== 'string') {
    errors.push('Tenant id must be a string');
  } else {
    if (tenant.id.length > TENANT_ID_MAX_LENGTH) {
      errors.push(`Tenant id must be at most ${TENANT_ID_MAX_LENGTH} characters (got ${tenant.id.length})`);
    }
    if (!TENANT_ID_REGEX.test(tenant.id)) {
      errors.push(`Tenant id must match /^[a-z0-9][a-z0-9-]*$/ (got "${tenant.id}")`);
    }
  }

  // --- display_name validation (optional) ---
  if (tenant.display_name !== undefined && tenant.display_name !== null && typeof tenant.display_name !== 'string') {
    errors.push('Tenant display_name must be a string if provided');
  }

  // --- tags validation (optional, default []) ---
  if (tenant.tags !== undefined && tenant.tags !== null) {
    if (!Array.isArray(tenant.tags)) {
      errors.push('Tenant tags must be an array of strings');
    } else {
      for (let i = 0; i < tenant.tags.length; i++) {
        if (typeof tenant.tags[i] !== 'string') {
          errors.push(`Tenant tags[${i}] must be a string`);
        }
      }
    }
  }

  // --- enabled validation (default true) ---
  if (tenant.enabled !== undefined && tenant.enabled !== null && typeof tenant.enabled !== 'boolean') {
    errors.push('Tenant enabled must be a boolean');
  }

  // --- connectors validation (required, at least 1 entry) ---
  if (!tenant.connectors || typeof tenant.connectors !== 'object' || Array.isArray(tenant.connectors)) {
    errors.push('Tenant connectors is required and must be an object mapping connector IDs to { profile, parameters? }');
  } else {
    const connectorIds = Object.keys(tenant.connectors);
    if (connectorIds.length === 0) {
      errors.push('Tenant connectors must have at least one entry');
    }
    for (const connectorId of connectorIds) {
      const entry = tenant.connectors[connectorId];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`Tenant connectors.${connectorId} must be an object with { profile: string }`);
        continue;
      }
      if (!entry.profile || typeof entry.profile !== 'string') {
        errors.push(`Tenant connectors.${connectorId}.profile is required and must be a string`);
        continue;
      }
      if (entry.parameters !== undefined && entry.parameters !== null) {
        if (typeof entry.parameters !== 'object' || Array.isArray(entry.parameters)) {
          errors.push(`Tenant connectors.${connectorId}.parameters must be a plain object if provided`);
        }
      }

      // Cross-reference: verify the profile exists in connector_profiles
      const profileName = entry.profile;
      const profileExists = config?.connector_profiles?.[connectorId]?.[profileName];
      if (!profileExists) {
        errors.push(`Tenant connectors.${connectorId} references profile "${profileName}" which does not exist in connector_profiles.${connectorId}`);
      }
    }
  }

  // --- Credential isolation warnings ---
  // Check if two tenants reference the same env var value across different tenants
  if (config && config.tenants) {
    const envVarToTenant = new Map(); // envVar -> { tenantId, connectorId }

    const collectEnvVars = (tenantId, tenantObj) => {
      if (!tenantObj || !tenantObj.connectors) return;
      for (const [connectorId, connectorCfg] of Object.entries(tenantObj.connectors)) {
        const profileName = connectorCfg.profile;
        const profile = config?.connector_profiles?.[connectorId]?.[profileName];
        if (!profile) continue;
        // Look for secret_ref or auth fields that reference env vars
        const secretRefs = profile.secret_ref || profile.secret_refs || {};
        for (const [refName, refValue] of Object.entries(secretRefs)) {
          if (typeof refValue === 'string' && refValue.startsWith('$')) {
            const envVar = refValue.slice(1);
            const key = envVar;
            if (envVarToTenant.has(key)) {
              const existing = envVarToTenant.get(key);
              if (existing.tenantId !== tenantId) {
                warnings.push(
                  `Credential isolation warning: env var "${envVar}" is used by tenant "${existing.tenantId}" (${existing.connectorId}) and tenant "${tenantId}" (${connectorId})`
                );
              }
            } else {
              envVarToTenant.set(key, { tenantId, connectorId });
            }
          }
        }
        // Also check top-level env-var-like fields (e.g., client_id, client_secret stored as env refs)
        for (const [field, value] of Object.entries(profile)) {
          if (field === 'secret_ref' || field === 'secret_refs') continue;
          if (typeof value === 'string' && value.startsWith('$')) {
            const envVar = value.slice(1);
            if (envVarToTenant.has(envVar)) {
              const existing = envVarToTenant.get(envVar);
              if (existing.tenantId !== tenantId) {
                warnings.push(
                  `Credential isolation warning: env var "${envVar}" is used by tenant "${existing.tenantId}" (${existing.connectorId}) and tenant "${tenantId}" (${connectorId})`
                );
              }
            } else {
              envVarToTenant.set(envVar, { tenantId, connectorId });
            }
          }
        }
      }
    };

    // Collect env vars from all tenants in config
    for (const [tid, tObj] of Object.entries(config.tenants)) {
      collectEnvVars(tid, tObj);
    }
    // Also collect for the tenant being validated (if not yet in config.tenants)
    if (tenant.id && !config.tenants[tenant.id]) {
      collectEnvVars(tenant.id, tenant);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Readiness Assessment ────────────────────────────────────────────────────

/**
 * Assesses per-connector readiness for a tenant by delegating to
 * assessConnectorReadiness for each connector in the tenant's config.
 *
 * @param {string} tenantId
 * @param {object} config - Full project config
 * @param {object} [options={}]
 * @returns {Promise<{ tenant_id, display_name, enabled, status, connectors }>}
 */
async function assessTenantReadiness(tenantId, config, options = {}) {
  const tenantConfig = config?.tenants?.[tenantId];

  if (!tenantConfig) {
    return { tenant_id: tenantId, status: 'not_found', connectors: [] };
  }

  // Lazy-require runtime to avoid circular dependency
  const runtime = require('./runtime.cjs');

  const connectorResults = [];

  for (const [connectorId, connectorCfg] of Object.entries(tenantConfig.connectors || {})) {
    try {
      const result = await runtime.assessConnectorReadiness(connectorId, config, {
        ...options,
        profile: connectorCfg.profile,
      });
      connectorResults.push({
        connector_id: connectorId,
        profile: connectorCfg.profile,
        readiness_status: result.readiness_status,
        readiness_score: result.readiness_score,
        checks: result.checks,
        smoke: result.smoke,
        limitations: result.limitations,
        capabilities: result.capabilities,
      });
    } catch (err) {
      connectorResults.push({
        connector_id: connectorId,
        profile: connectorCfg.profile,
        readiness_status: 'error',
        readiness_score: 0,
        error: err.message,
      });
    }
  }

  // Determine overall status
  const readyStatuses = new Set(['ready', 'live_verified']);
  const readyCount = connectorResults.filter(c => readyStatuses.has(c.readiness_status)).length;
  const totalCount = connectorResults.length;

  let status;
  if (totalCount === 0) {
    status = 'unconfigured';
  } else if (readyCount === totalCount) {
    status = 'ready';
  } else if (readyCount > 0) {
    status = 'partial';
  } else {
    status = 'unconfigured';
  }

  return {
    tenant_id: tenantId,
    display_name: tenantConfig.display_name || null,
    enabled: tenantConfig.enabled !== false,
    status,
    connectors: connectorResults,
  };
}

// ─── CLI Commands ────────────────────────────────────────────────────────────

/**
 * List all configured tenants.
 * CLI: runtime tenant list
 */
function cmdTenantList(cwd, raw) {
  const config = loadConfig(cwd);
  const tenants = config.tenants || {};
  const result = [];

  for (const [id, t] of Object.entries(tenants)) {
    result.push({
      id,
      display_name: t.display_name || null,
      enabled: t.enabled !== false,
      connector_count: Object.keys(t.connectors || {}).length,
      connectors: Object.keys(t.connectors || {}),
    });
  }

  output({ tenants: result, count: result.length }, raw);
}

/**
 * Show detailed status for a specific tenant, including per-connector readiness.
 * CLI: runtime tenant status <id>
 */
async function cmdTenantStatus(cwd, tenantId, raw) {
  if (!tenantId) {
    error('Tenant ID is required. Usage: runtime tenant status <tenant-id>');
  }

  const config = loadConfig(cwd);
  if (!config.tenants || !config.tenants[tenantId]) {
    error(`Tenant "${tenantId}" not found in configuration`);
  }

  const readinessResult = await assessTenantReadiness(tenantId, config, { cwd });
  output(readinessResult, raw);
}

/**
 * Add a new tenant to the configuration.
 * CLI: runtime tenant add <id> --display-name "..." --connector sentinel:profile-name --tag healthcare
 */
function cmdTenantAdd(cwd, args, raw) {
  const config = loadConfig(cwd);

  // Parse arguments
  let tenantId = null;
  let displayName = null;
  const connectors = {};
  const tags = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--display-name' || arg === '--name') {
      displayName = args[++i];
    } else if (arg === '--connector') {
      const spec = args[++i];
      if (!spec || !spec.includes(':')) {
        error(`Invalid --connector format: expected "connector_id:profile_name", got "${spec}"`);
      }
      const [connectorId, profileName] = spec.split(':', 2);
      connectors[connectorId] = { profile: profileName };
    } else if (arg === '--tag') {
      tags.push(args[++i]);
    } else if (!arg.startsWith('-') && !tenantId) {
      tenantId = arg;
    }
  }

  if (!tenantId) {
    error('Tenant ID is required. Usage: runtime tenant add <id> [--display-name "..."] --connector id:profile [--tag ...]');
  }

  // Validate tenant ID format
  if (tenantId.length > TENANT_ID_MAX_LENGTH) {
    error(`Tenant ID must be at most ${TENANT_ID_MAX_LENGTH} characters (got ${tenantId.length})`);
  }
  if (!TENANT_ID_REGEX.test(tenantId)) {
    error(`Tenant ID must match /^[a-z0-9][a-z0-9-]*$/ (got "${tenantId}")`);
  }

  if (Object.keys(connectors).length === 0) {
    error('At least one --connector is required. Usage: --connector sentinel:profile-name');
  }

  // Check for duplicate
  if (config.tenants && config.tenants[tenantId]) {
    error(`Tenant "${tenantId}" already exists. Use 'runtime tenant disable' or remove it manually.`);
  }

  // Build tenant object
  const tenant = {
    display_name: displayName || undefined,
    tags: tags.length > 0 ? tags : [],
    enabled: true,
    connectors,
  };

  // Validate
  const validation = validateTenantConfig({ ...tenant, id: tenantId }, config);
  if (!validation.valid) {
    error('Tenant validation failed:\n  - ' + validation.errors.join('\n  - '));
  }

  // Write to config
  setConfigValue(cwd, 'tenants.' + tenantId, tenant);
  output({ added: true, tenant_id: tenantId, tenant }, raw);
}

/**
 * Disable a tenant (sets enabled: false without removing config).
 * CLI: runtime tenant disable <id>
 */
function cmdTenantDisable(cwd, tenantId, raw) {
  if (!tenantId) {
    error('Tenant ID is required. Usage: runtime tenant disable <tenant-id>');
  }

  const config = loadConfig(cwd);
  if (!config.tenants || !config.tenants[tenantId]) {
    error(`Tenant "${tenantId}" not found in configuration`);
  }

  setConfigValue(cwd, 'tenants.' + tenantId + '.enabled', false);
  output({ disabled: true, tenant_id: tenantId }, raw);
}

/**
 * Enable a tenant (sets enabled: true).
 * CLI: runtime tenant enable <id>
 */
function cmdTenantEnable(cwd, tenantId, raw) {
  if (!tenantId) {
    error('Tenant ID is required. Usage: runtime tenant enable <tenant-id>');
  }

  const config = loadConfig(cwd);
  if (!config.tenants || !config.tenants[tenantId]) {
    error(`Tenant "${tenantId}" not found in configuration`);
  }

  setConfigValue(cwd, 'tenants.' + tenantId + '.enabled', true);
  output({ enabled: true, tenant_id: tenantId }, raw);
}

/**
 * Run readiness assessment for all configured tenants.
 * CLI: runtime tenant doctor
 */
async function cmdTenantDoctor(cwd, args, raw) {
  const config = loadConfig(cwd);
  const tenants = config.tenants || {};
  const tenantIds = Object.keys(tenants);

  if (tenantIds.length === 0) {
    output({ tenants: [], summary: { total: 0, ready: 0, partial: 0, unconfigured: 0 } }, raw);
    return;
  }

  const results = [];
  let ready = 0;
  let partial = 0;
  let unconfigured = 0;

  for (const tenantId of tenantIds) {
    const result = await assessTenantReadiness(tenantId, config, { cwd });
    results.push(result);
    if (result.status === 'ready') ready++;
    else if (result.status === 'partial') partial++;
    else unconfigured++;
  }

  output({
    tenants: results,
    summary: { total: tenantIds.length, ready, partial, unconfigured },
  }, raw);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  validateTenantConfig,
  assessTenantReadiness,
  cmdTenantList,
  cmdTenantStatus,
  cmdTenantAdd,
  cmdTenantDisable,
  cmdTenantEnable,
  cmdTenantDoctor,
};
