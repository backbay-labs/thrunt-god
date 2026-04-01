const { loadConfig, output, error } = require('./core.cjs');
const { setConfigValue } = require('./config.cjs');

const TENANT_ID_REGEX = /^[a-z0-9][a-z0-9-]*$/;
const TENANT_ID_MAX_LENGTH = 64;

function addIsolationWarning(warnings, envVar, existing, tenantId, connectorId) {
  if (existing.tenantId === tenantId) {
    return;
  }

  warnings.push(
    `Credential isolation warning: env var "${envVar}" is used by tenant "${existing.tenantId}" (${existing.connectorId}) and tenant "${tenantId}" (${connectorId})`
  );
}

function validateTenantConfig(tenant, config) {
  const errors = [];
  const warnings = [];

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

  if (tenant.display_name !== undefined && tenant.display_name !== null && typeof tenant.display_name !== 'string') {
    errors.push('Tenant display_name must be a string if provided');
  }

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

  if (tenant.enabled !== undefined && tenant.enabled !== null && typeof tenant.enabled !== 'boolean') {
    errors.push('Tenant enabled must be a boolean');
  }

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

      const profileName = entry.profile;
      const profileExists = config?.connector_profiles?.[connectorId]?.[profileName];
      if (!profileExists) {
        errors.push(`Tenant connectors.${connectorId} references profile "${profileName}" which does not exist in connector_profiles.${connectorId}`);
      }
    }
  }

  if (config && config.tenants) {
    const envVarToTenant = new Map();

    const collectEnvVars = (tenantId, tenantObj) => {
      if (!tenantObj || !tenantObj.connectors) return;
      for (const [connectorId, connectorCfg] of Object.entries(tenantObj.connectors)) {
        const profileName = connectorCfg.profile;
        const profile = config?.connector_profiles?.[connectorId]?.[profileName];
        if (!profile) continue;
        const secretRefs = profile.secret_ref || profile.secret_refs || {};
        for (const [refName, refValue] of Object.entries(secretRefs)) {
          if (typeof refValue === 'string' && refValue.startsWith('$')) {
            const envVar = refValue.slice(1);
            const key = envVar;
            if (envVarToTenant.has(key)) {
              addIsolationWarning(warnings, envVar, envVarToTenant.get(key), tenantId, connectorId);
            } else {
              envVarToTenant.set(key, { tenantId, connectorId });
            }
          }
        }
        for (const [field, value] of Object.entries(profile)) {
          if (field === 'secret_ref' || field === 'secret_refs') continue;
          if (typeof value === 'string' && value.startsWith('$')) {
            const envVar = value.slice(1);
            if (envVarToTenant.has(envVar)) {
              addIsolationWarning(warnings, envVar, envVarToTenant.get(envVar), tenantId, connectorId);
            } else {
              envVarToTenant.set(envVar, { tenantId, connectorId });
            }
          }
        }
      }
    };

    for (const [tid, tObj] of Object.entries(config.tenants)) {
      collectEnvVars(tid, tObj);
    }
    if (tenant.id && !config.tenants[tenant.id]) {
      collectEnvVars(tenant.id, tenant);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

async function assessTenantReadiness(tenantId, config, options = {}) {
  const tenantConfig = config?.tenants?.[tenantId];

  if (!tenantConfig) {
    return { tenant_id: tenantId, status: 'not_found', connectors: [] };
  }

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

function cmdTenantAdd(cwd, args, raw) {
  const config = loadConfig(cwd);

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

  if (tenantId.length > TENANT_ID_MAX_LENGTH) {
    error(`Tenant ID must be at most ${TENANT_ID_MAX_LENGTH} characters (got ${tenantId.length})`);
  }
  if (!TENANT_ID_REGEX.test(tenantId)) {
    error(`Tenant ID must match /^[a-z0-9][a-z0-9-]*$/ (got "${tenantId}")`);
  }

  if (Object.keys(connectors).length === 0) {
    error('At least one --connector is required. Usage: --connector sentinel:profile-name');
  }

  if (config.tenants && config.tenants[tenantId]) {
    error(`Tenant "${tenantId}" already exists. Use 'runtime tenant disable' or remove it manually.`);
  }

  const tenant = {
    display_name: displayName || undefined,
    tags: tags.length > 0 ? tags : [],
    enabled: true,
    connectors,
  };

  const validation = validateTenantConfig({ ...tenant, id: tenantId }, config);
  if (!validation.valid) {
    error('Tenant validation failed:\n  - ' + validation.errors.join('\n  - '));
  }

  setConfigValue(cwd, 'tenants.' + tenantId, tenant);
  output({ added: true, tenant_id: tenantId, tenant }, raw);
}

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
