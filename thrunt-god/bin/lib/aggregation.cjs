/**
 * Aggregation — Cross-tenant result aggregation for multi-tenant dispatch
 *
 * Merges events with tenant provenance, deduplicates entities across tenants,
 * correlates findings (multi-tenant entities, technique spread, temporal clusters).
 *
 * Consumed by dispatchMultiTenant result processing and evidence artifacts.
 */

'use strict';

const crypto = require('crypto');

// ─── tagEventsWithTenant ────────────────────────────────────────────────────

/**
 * Mutate envelope in-place: tag every event and entity with tenant provenance.
 *
 * @param {object|null|undefined} envelope - The connector envelope ({events, entities, connector})
 * @param {string} tenantId - Tenant identifier to stamp
 */
function tagEventsWithTenant(envelope, tenantId) {
  if (envelope == null) return;

  const connectorId = envelope.connector?.id || null;
  const events = envelope.events || [];
  const entities = envelope.entities || [];

  for (let i = 0; i < events.length; i++) {
    events[i].tenant_id = tenantId;
    events[i].tenant_connector_id = connectorId;
  }

  for (let i = 0; i < entities.length; i++) {
    entities[i].tenant_id = tenantId;
  }
}

// ─── deduplicateEntities ────────────────────────────────────────────────────

/**
 * Deduplicate entities across tenant results by case-insensitive (kind, value) tuple.
 *
 * Skips tenant_results with status 'error' or 'timeout' or null envelope.
 *
 * @param {Array} tenantResults - The tenant_results array from MultiTenantResult
 * @returns {Array} Deduplicated entities with tenant_ids[] and occurrence_count
 */
function deduplicateEntities(tenantResults) {
  const map = new Map();

  for (const tr of tenantResults) {
    if (tr.status === 'error' || tr.status === 'timeout') continue;
    if (tr.envelope == null) continue;

    const entities = tr.envelope.entities || [];
    const tenantId = tr.tenant_id;

    for (const entity of entities) {
      const key = computeEntityDedupKey(entity);
      if (!key) continue;
      const existing = map.get(key);

      if (existing) {
        if (!existing.tenant_ids.includes(tenantId)) {
          existing.tenant_ids.push(tenantId);
        }
        existing.occurrence_count++;
      } else {
        map.set(key, {
          ...entity,
          tenant_ids: [tenantId],
          occurrence_count: 1,
        });
      }
    }
  }

  return Array.from(map.values());
}

function computeEntityDedupKey(entity) {
  if (!entity || typeof entity.kind !== 'string') return null;

  const normalizedValue = normalizeEntityValue(entity.value);
  if (normalizedValue == null) return null;

  return `${entity.kind}:${normalizedValue.toLowerCase()}`;
}

function normalizeEntityValue(value) {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return null;
}

// ─── deduplicateEvents ─────────────────────────────────────────────────────

/**
 * Compute a dedup key for an event based on the chosen strategy.
 *
 * @param {object|null|undefined} event - A single event object
 * @param {string} strategy - 'by_id' or 'by_content_hash'
 * @returns {string|null} Dedup key, or null if event is falsy or key cannot be computed
 */
function computeEventDedupKey(event, strategy) {
  if (!event) return null;
  switch (strategy) {
    case 'by_id':
      return event.id || null;
    case 'by_content_hash': {
      const timestampMinute = normalizeTimestampMinute(event.timestamp);
      const seed = [
        event.tenant_id || '',
        event.tenant_connector_id || '',
        event.connector_id || '',
        event.title || '',
        event.summary || '',
        timestampMinute,
      ].join(':');
      return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
    }
    default:
      return event.id || null;
  }
}

function normalizeTimestampMinute(value) {
  if (typeof value === 'string') {
    return value.slice(0, 16);
  }

  if (typeof value === 'number' || value instanceof Date) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 16);
    }
  }

  return '';
}

/**
 * Deduplicate an array of events using the specified strategy.
 *
 * Strategies:
 *   - 'by_id' (default): Remove events with duplicate event.id, keep first occurrence
 *   - 'by_content_hash': Remove events where SHA-256 of connector_id:title:summary:timestamp_minute matches
 *
 * @param {Array|null|undefined} events - Array of event objects
 * @param {object} [options] - Configuration
 * @param {string} [options.strategy='by_id'] - Dedup strategy
 * @returns {Array} Deduplicated events
 */
function deduplicateEvents(events, options) {
  if (!Array.isArray(events)) return [];
  const strategy = options?.strategy || 'by_id';
  const seen = new Set();
  return events.filter(event => {
    const key = computeEventDedupKey(event, strategy);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── aggregateResults ───────────────────────────────────────────────────────

/**
 * Orchestrate full aggregation: tag events, merge, deduplicate entities, build overlap map.
 *
 * @param {object} multiTenantResult - The full MultiTenantResult from dispatchMultiTenant
 * @param {object} [options] - Optional configuration
 * @returns {object} { events, entities, entity_overlap, unique_entities }
 */
function aggregateResults(multiTenantResult, options = {}) {
  const tenantResults = multiTenantResult.tenant_results;

  // Tag all events with tenant provenance
  for (const tr of tenantResults) {
    if (tr.status === 'error' || tr.status === 'timeout') continue;
    if (tr.envelope == null) continue;
    tagEventsWithTenant(tr.envelope, tr.tenant_id);
  }

  // Merge all events into flat array
  const events = [];
  for (const tr of tenantResults) {
    if (tr.status === 'error' || tr.status === 'timeout') continue;
    if (tr.envelope == null) continue;
    const trEvents = tr.envelope.events || [];
    for (let i = 0; i < trEvents.length; i++) {
      events.push(trEvents[i]);
    }
  }

  // Deduplicate entities
  const entities = deduplicateEntities(tenantResults);

  // Build entity_overlap map (only entities with 2+ tenants)
  const entity_overlap = {};
  for (const entity of entities) {
    if (entity.tenant_ids.length >= 2) {
      entity_overlap[entity.value] = entity.tenant_ids;
    }
  }

  return {
    events,
    entities,
    entity_overlap,
    unique_entities: entities.length,
  };
}

// ─── correlateFindings ──────────────────────────────────────────────────────

/**
 * Correlate findings across tenants: multi-tenant entities, technique spread, temporal clusters.
 *
 * @param {Array} tenantResults - The tenant_results array from MultiTenantResult
 * @param {object} [options] - Configuration options
 * @param {number} [options.entity_threshold=3] - Min tenants for multi_tenant_entities
 * @param {number} [options.cluster_window_minutes=15] - Temporal cluster window in minutes
 * @param {string[]} [options.pack_attack] - ATT&CK technique IDs from pack metadata
 * @returns {object} { multi_tenant_entities, technique_spread, temporal_clusters }
 */
function correlateFindings(tenantResults, options = {}) {
  const entityThreshold = options.entity_threshold || 3;
  const clusterWindowMinutes = options.cluster_window_minutes || 15;
  const windowMs = clusterWindowMinutes * 60_000;
  const packAttack = options.pack_attack || [];

  // ── Multi-tenant entities ──────────────────────────────────────────────
  const dedupedEntities = deduplicateEntities(tenantResults);
  const multi_tenant_entities = dedupedEntities.filter(
    e => e.tenant_ids.length >= entityThreshold
  );

  // ── Technique spread ───────────────────────────────────────────────────
  const techniqueMap = new Map(); // technique_id -> { technique_id, tenant_ids: Set, event_counts: {} }

  // Extract technique IDs from event tags
  const TECHNIQUE_TAG_PATTERN = /^technique:(T\d{4}(?:\.\d{3})?)$/i;

  for (const tr of tenantResults) {
    if (tr.status === 'error' || tr.status === 'timeout') continue;
    if (tr.envelope == null) continue;

    const tenantId = tr.tenant_id;
    const events = tr.envelope.events || [];

    for (const event of events) {
      const tags = event.tags || [];
      for (const tag of tags) {
        const match = TECHNIQUE_TAG_PATTERN.exec(tag);
        if (match) {
          const techId = match[1].toUpperCase();
          let entry = techniqueMap.get(techId);
          if (!entry) {
            entry = { technique_id: techId, tenant_ids: new Set(), event_counts: {} };
            techniqueMap.set(techId, entry);
          }
          entry.tenant_ids.add(tenantId);
          entry.event_counts[tenantId] = (entry.event_counts[tenantId] || 0) + 1;
        }
      }
    }

    // Also apply pack_attack techniques if provided
    if (packAttack.length > 0) {
      for (const techId of packAttack) {
        const normalizedTech = techId.toUpperCase();
        let entry = techniqueMap.get(normalizedTech);
        if (!entry) {
          entry = { technique_id: normalizedTech, tenant_ids: new Set(), event_counts: {} };
          techniqueMap.set(normalizedTech, entry);
        }
        entry.tenant_ids.add(tenantId);
        entry.event_counts[tenantId] = (entry.event_counts[tenantId] || 0) + events.length;
      }
    }
  }

  // Filter to techniques in 2+ tenants, convert Sets to arrays
  const technique_spread = [];
  for (const entry of techniqueMap.values()) {
    if (entry.tenant_ids.size >= 2) {
      technique_spread.push({
        technique_id: entry.technique_id,
        tenant_ids: Array.from(entry.tenant_ids),
        event_counts: entry.event_counts,
      });
    }
  }

  // ── Temporal clusters ──────────────────────────────────────────────────
  // Collect all events with timestamps across all successful tenants
  const allEvents = [];
  for (const tr of tenantResults) {
    if (tr.status === 'error' || tr.status === 'timeout') continue;
    if (tr.envelope == null) continue;

    const events = tr.envelope.events || [];
    for (const event of events) {
      if (event.timestamp) {
        allEvents.push({
          id: event.id,
          timestamp: new Date(event.timestamp).getTime(),
          tenant_id: event.tenant_id || tr.tenant_id,
          event,
        });
      }
    }
  }

  // Sort by timestamp
  allEvents.sort((a, b) => a.timestamp - b.timestamp);

  // Sliding window grouping
  const temporal_clusters = [];
  let clusterCounter = 0;

  if (allEvents.length > 0) {
    let clusterStart = 0;

    for (let i = 0; i < allEvents.length; i++) {
      // Find the window starting point
      while (clusterStart < i && allEvents[i].timestamp - allEvents[clusterStart].timestamp > windowMs) {
        clusterStart++;
      }

      // Check if we have a meaningful cluster at position i
      // Look for the longest window ending at i
      const windowEvents = allEvents.slice(clusterStart, i + 1);
      const windowTenants = new Set(windowEvents.map(e => e.tenant_id));

      // Only emit cluster when it spans 2+ tenants and we're at the end of a group
      if (windowTenants.size >= 2) {
        // Check if next event would break the window or we're at the end
        const isEnd = i === allEvents.length - 1 ||
          allEvents[i + 1].timestamp - allEvents[clusterStart].timestamp > windowMs;

        if (isEnd) {
          clusterCounter++;
          const sampleEvents = windowEvents.slice(0, 10).map(e => e.event);
          temporal_clusters.push({
            cluster_id: `TC-${clusterCounter}`,
            start: new Date(windowEvents[0].timestamp).toISOString(),
            end: new Date(windowEvents[windowEvents.length - 1].timestamp).toISOString(),
            tenant_ids: Array.from(windowTenants),
            event_count: windowEvents.length,
            events: sampleEvents,
          });
          clusterStart = i + 1;
        }
      }
    }
  }

  return {
    multi_tenant_entities,
    technique_spread,
    temporal_clusters,
  };
}

// ─── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  tagEventsWithTenant,
  deduplicateEntities,
  deduplicateEvents,
  correlateFindings,
  aggregateResults,
};
