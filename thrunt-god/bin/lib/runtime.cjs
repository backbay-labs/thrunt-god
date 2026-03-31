/**
 * Runtime -- Re-export wrapper for backward compatibility.
 *
 * SDK primitives live in connector-sdk.cjs. Adapter factories live in connectors/.
 * This module re-exports everything for backward compatibility with existing
 * require('../thrunt-god/bin/lib/runtime.cjs') calls.
 */

'use strict';

// --- SDK re-export (all SDK primitives) ---
const sdk = require('./connector-sdk.cjs');

// --- Plugin registry re-export (manifest validation, discovery, registry) ---
const pluginRegistry = require('./plugin-registry.cjs');

// --- Built-in connectors (extracted to individual files) ---
const { createBuiltInConnectorRegistry } = require('./connectors/index.cjs');

// --- module.exports: spread SDK + plugin-registry + connector barrel + domain modules ---
module.exports = {
  ...sdk,
  ...pluginRegistry,

  // Built-in connector registry:
  createBuiltInConnectorRegistry,

  // Dispatch coordinator (Phase 43):
  resolveTenantTargets: require('./dispatch.cjs').resolveTenantTargets,
  cloneTenantSpec: require('./dispatch.cjs').cloneTenantSpec,
  dispatchMultiTenant: require('./dispatch.cjs').dispatchMultiTenant,

  // Aggregation (Phase 44):
  tagEventsWithTenant: require('./aggregation.cjs').tagEventsWithTenant,
  deduplicateEntities: require('./aggregation.cjs').deduplicateEntities,
  deduplicateEvents: require('./aggregation.cjs').deduplicateEvents,
  correlateFindings: require('./aggregation.cjs').correlateFindings,
  aggregateResults: require('./aggregation.cjs').aggregateResults,

  // Heatmap (Phase 44):
  buildHeatmapFromResults: require('./heatmap.cjs').buildHeatmapFromResults,
  writeHeatmapArtifacts: require('./heatmap.cjs').writeHeatmapArtifacts,
  renderHeatmapTable: require('./heatmap.cjs').renderHeatmapTable,
  inferTechniques: require('./heatmap.cjs').inferTechniques,

  // Contract tests (Phase 47):
  runContractTests: require('./contract-tests.cjs').runContractTests,
  createTestQuerySpec: require('./contract-tests.cjs').createTestQuerySpec,
  createTestProfile: require('./contract-tests.cjs').createTestProfile,
  createTestSecrets: require('./contract-tests.cjs').createTestSecrets,
};
