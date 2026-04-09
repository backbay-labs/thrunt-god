/**
 * Dispatch Coordinator — Multi-tenant fan-out execution with concurrency control,
 * per-tenant isolation, and error containment.
 *
 * Provides:
 *   - resolveTenantTargets(): Filter tenants by tags, connector type, IDs, enabled status
 *   - cloneTenantSpec(): Produce tenant-scoped QuerySpec with parameter merge
 *   - dispatchMultiTenant(): Fan-out execution to N targets with concurrency semaphore
 *
 * Isolation guarantees:
 *   - Per-tenant token cache (fresh Map per tenant)
 *   - Per-tenant timeout budget
 *   - Per-tenant error containment (Promise.allSettled pattern)
 */

'use strict';

const crypto = require('crypto');

// ─── Lazy requires to avoid circular deps ───────────────────────────────────
// dispatch.cjs requires runtime.cjs functions at call time (not load time).
// runtime.cjs can require dispatch.cjs at module level since dispatch.cjs
// does NOT require runtime at load time.

function getRuntime() {
  return require('./runtime.cjs');
}

// Local helpers (avoid depending on unexported runtime internals)
function nowIso(now = new Date()) {
  return new Date(now).toISOString();
}

// ─── Target Resolution ─────────────────────────────────────────────────────

/**
 * Resolve tenant targets from config, filtering by tags, connector type,
 * explicit tenant IDs, and enabled status.
 *
 * @param {object} config - Full project config with tenants and connector_profiles
 * @param {object} [options={}]
 * @param {string[]} [options.tenant_ids] - Explicit list of tenant IDs to include
 * @param {string[]} [options.tags] - Filter by tag intersection (tenant must have ALL tags)
 * @param {string} [options.connector_id] - Filter tenants to those with this connector
 * @param {boolean} [options.exclude_disabled=true] - Exclude disabled tenants (default true)
 * @returns {Array<{tenant_id, connector_id, profile_name, parameters, display_name, tags}>}
 */
function resolveTenantTargets(config, options = {}) {
  const tenants = config?.tenants;
  if (!tenants || typeof tenants !== 'object') return [];

  const { toArray } = getRuntime();
  const tenantIds = options.tenant_ids ? new Set(toArray(options.tenant_ids)) : null;
  const filterTags = options.tags ? toArray(options.tags) : null;
  const filterConnectorId = options.connector_id || null;
  const excludeDisabled = options.exclude_disabled !== false;

  const targets = [];

  for (const [id, tenant] of Object.entries(tenants)) {
    // Filter by explicit tenant IDs
    if (tenantIds && !tenantIds.has(id)) continue;

    // Filter by enabled status
    if (excludeDisabled && tenant.enabled === false) continue;

    // Filter by tag intersection (tenant must have ALL specified tags)
    if (filterTags && filterTags.length > 0) {
      const tenantTags = toArray(tenant.tags);
      const hasAllTags = filterTags.every(tag => tenantTags.includes(tag));
      if (!hasAllTags) continue;
    }

    // Expand connectors
    const connectors = tenant.connectors || {};
    for (const [connectorId, connectorCfg] of Object.entries(connectors)) {
      // Filter by connector_id if specified
      if (filterConnectorId && connectorId !== filterConnectorId) continue;

      targets.push({
        tenant_id: id,
        connector_id: connectorId,
        profile_name: connectorCfg.profile,
        parameters: connectorCfg.parameters || {},
        display_name: tenant.display_name || null,
        tags: toArray(tenant.tags),
      });
    }
  }

  return targets;
}

// ─── Tenant Spec Cloning ────────────────────────────────────────────────────

/**
 * Clone a base QuerySpec with tenant-specific connector, parameters, and evidence tags.
 *
 * @param {object} baseSpec - The base QuerySpec to clone
 * @param {object} target - Resolved tenant target from resolveTenantTargets
 * @returns {object} New QuerySpec with tenant overrides
 */
function cloneTenantSpec(baseSpec, target) {
  const { createQuerySpec, toArray } = getRuntime();

  return createQuerySpec({
    ...baseSpec,
    query_id: undefined, // Let createQuerySpec generate a new ID
    connector: {
      ...baseSpec.connector,
      id: target.connector_id,
      profile: target.profile_name,
      tenant: target.tenant_id,
    },
    parameters: {
      ...baseSpec.parameters,
      ...(target.parameters || {}),
    },
    evidence: {
      ...baseSpec.evidence,
      tags: [
        ...toArray(baseSpec.evidence?.tags),
        `tenant:${target.tenant_id}`,
      ],
    },
  });
}

// ─── Internal: Execute Single Tenant ────────────────────────────────────────

/**
 * Execute a query for a single tenant with isolated token cache and error containment.
 * NOT exported -- used by dispatchMultiTenant.
 *
 * @param {object} tenantSpec - Tenant-scoped QuerySpec
 * @param {object} target - Resolved tenant target
 * @param {object} registry - Connector registry
 * @param {object} config - Full project config
 * @param {object} [options={}]
 * @returns {Promise<object>} Tenant result with status, envelope, artifacts, timing
 */
async function executeTenantQuery(tenantSpec, target, registry, config, options = {}) {
  const { executeQuerySpec } = getRuntime();
  const startedAt = nowIso();

  try {
    const tokenCache = new Map();
    const result = await executeQuerySpec(tenantSpec, registry, {
      cwd: options.cwd,
      config,
      token_cache: tokenCache,
      artifacts: { tenant_id: target.tenant_id },
    });

    const completedAt = nowIso();
    const durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));

    // Derive status from envelope
    const envelope = result.envelope;
    let status = 'ok';
    if (envelope.errors && envelope.errors.length > 0) {
      status = 'error';
    } else if (envelope.warnings && envelope.warnings.length > 0 &&
               envelope.status === 'partial') {
      status = 'partial';
    }

    return {
      tenant_id: target.tenant_id,
      display_name: target.display_name,
      status,
      envelope,
      artifacts: result.artifacts,
      timing: {
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: durationMs,
      },
    };
  } catch (err) {
    const completedAt = nowIso();
    const durationMs = Math.max(0, Date.parse(completedAt) - Date.parse(startedAt));

    return {
      tenant_id: target.tenant_id,
      display_name: target.display_name,
      status: 'error',
      envelope: null,
      artifacts: null,
      error: {
        code: err.code || 'TENANT_EXECUTION_FAILED',
        message: err.message || String(err),
      },
      timing: {
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: durationMs,
      },
    };
  }
}

// ─── Dispatch Multi-Tenant ──────────────────────────────────────────────────

/**
 * Fan out execution of a base QuerySpec to N tenant targets with concurrency
 * control, per-tenant isolation, and global timeout.
 *
 * @param {object} baseSpec - Base QuerySpec to dispatch
 * @param {Array} targets - Resolved targets from resolveTenantTargets
 * @param {object} registry - Connector registry
 * @param {object} config - Full project config
 * @param {object} [options={}]
 * @param {number} [options.concurrency=5] - Max parallel tenant executions
 * @param {number} [options.global_timeout_ms=600000] - Global wall-clock timeout
 * @returns {Promise<object>} MultiTenantResult
 */
async function dispatchMultiTenant(baseSpec, targets, registry, config, options = {}) {
  const concurrency = options.concurrency || config?.dispatch?.concurrency || 5;
  const globalTimeoutMs = options.global_timeout_ms || config?.dispatch?.global_timeout_ms || 600_000;

  // Generate dispatch ID: MTD-YYYYMMDDHHMMSS-RANDOM8
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  const dispatchId = `MTD-${stamp}-${suffix}`;

  const startedAt = nowIso();
  const startEpoch = Date.now();

  const tenantResults = [];
  const errors = [];
  const pending = [...targets];
  const active = new Map(); // promise -> target
  const finalizedTargets = new Set();
  let globalTimedOut = false;

  function getTargetKey(target) {
    return `${target.tenant_id}\u0000${target.connector_id}\u0000${target.profile_name}`;
  }

  function pushTenantResultOnce(target, result) {
    const key = getTargetKey(target);
    if (finalizedTargets.has(key)) return false;
    finalizedTargets.add(key);
    tenantResults.push(result);
    return true;
  }

  function createTimeoutResult(target) {
    return {
      tenant_id: target.tenant_id,
      display_name: target.display_name,
      status: 'timeout',
      envelope: null,
      artifacts: null,
      error: { code: 'GLOBAL_TIMEOUT', message: `Global dispatch timeout (${globalTimeoutMs}ms) exceeded` },
      timing: { started_at: null, completed_at: nowIso(), duration_ms: 0 },
    };
  }

  // Create an abort mechanism for global timeout
  let globalTimer;
  const globalTimeoutPromise = new Promise((resolve) => {
    globalTimer = setTimeout(() => {
      globalTimedOut = true;
      resolve({ _globalTimeout: true });
    }, globalTimeoutMs);
    if (typeof globalTimer.unref === 'function') {
      globalTimer.unref();
    }
  });

  try {
    while ((pending.length > 0 || active.size > 0) && !globalTimedOut) {
      // Fill active up to concurrency from pending
      while (pending.length > 0 && active.size < concurrency && !globalTimedOut) {
        const target = pending.shift();
        const tenantSpec = cloneTenantSpec(baseSpec, target);

        // Wrap execution: result goes into tenantResults, wrapper signals completion
        const wrapper = executeTenantQuery(tenantSpec, target, registry, config, options)
          .then(result => {
            pushTenantResultOnce(target, result);
          })
          .catch(err => {
            pushTenantResultOnce(target, {
              tenant_id: target.tenant_id,
              display_name: target.display_name,
              status: 'error',
              envelope: null,
              artifacts: null,
              error: { code: err.code || 'DISPATCH_ERROR', message: err.message },
              timing: { started_at: nowIso(), completed_at: nowIso(), duration_ms: 0 },
            });
          })
          .finally(() => {
            active.delete(wrapper);
          });

        active.set(wrapper, target);
      }

      if (active.size > 0) {
        // Race active promises against global timeout
        const raceResult = await Promise.race([...active.keys(), globalTimeoutPromise]);

        if (raceResult && raceResult._globalTimeout) {
          globalTimedOut = true;
          break;
        }
      }
    }

    // If global timeout fired, mark remaining pending and active as timeout
    if (globalTimedOut) {
      for (const target of pending) {
        pushTenantResultOnce(target, createTimeoutResult(target));
      }
      for (const [, target] of active) {
        pushTenantResultOnce(target, createTimeoutResult(target));
      }
    }
  } finally {
    clearTimeout(globalTimer);
  }

  // Build summary
  const completedAt = nowIso();
  const wallClockMs = Date.now() - startEpoch;

  let tenantsSucceeded = 0;
  let tenantsPartial = 0;
  let tenantsFailed = 0;
  let tenantsTimeout = 0;
  let totalEvents = 0;
  let totalEntities = 0;

  for (const tr of tenantResults) {
    switch (tr.status) {
      case 'ok':
        tenantsSucceeded++;
        break;
      case 'partial':
        tenantsPartial++;
        break;
      case 'error':
        tenantsFailed++;
        break;
      case 'timeout':
        tenantsTimeout++;
        break;
    }

    if (tr.envelope) {
      totalEvents += (tr.envelope.events || []).length;
      totalEntities += (tr.envelope.entities || []).length;
    }

    if (tr.error) {
      errors.push({
        tenant_id: tr.tenant_id,
        code: tr.error.code,
        message: tr.error.message,
      });
    }
  }

  return {
    version: '1.0',
    dispatch_id: dispatchId,
    summary: {
      tenants_targeted: targets.length,
      tenants_succeeded: tenantsSucceeded,
      tenants_partial: tenantsPartial,
      tenants_failed: tenantsFailed,
      tenants_timeout: tenantsTimeout,
      total_events: totalEvents,
      total_entities: totalEntities,
      wall_clock_ms: wallClockMs,
    },
    tenant_results: tenantResults,
    errors,
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  resolveTenantTargets,
  cloneTenantSpec,
  dispatchMultiTenant,
};
