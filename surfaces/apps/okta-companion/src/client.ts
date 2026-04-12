/**
 * @thrunt-surfaces/okta-companion — API helpers for Okta System Log queries
 * and entity enrichment within THRUNT hunt workflows.
 */

import { SurfaceClient, type SurfaceClientOptions } from '@thrunt-surfaces/sdk';
import type { QuerySpec } from '@thrunt-surfaces/contracts';

export interface OktaSystemLogQueryParams {
  /** Filter expression (e.g., 'eventType eq "user.session.start"') */
  filter?: string;
  /** Free-text query (searches across all fields) */
  q?: string;
  /** ISO date string — start of time window */
  since?: string;
  /** ISO date string — end of time window */
  until?: string;
  /** Actor ID to filter by */
  actorId?: string;
  /** Target user or resource ID */
  targetId?: string;
  /** Event types to include */
  eventTypes?: string[];
  /** Maximum results to return */
  limit?: number;
}

export interface OktaEnrichmentResult {
  entityType: string;
  value: string;
  vendor: 'okta';
  found: boolean;
  data: Record<string, unknown>;
  enrichedAt: string;
}

export class OktaCompanion {
  protected readonly bridge: SurfaceClient;

  constructor(options?: SurfaceClientOptions) {
    this.bridge = new SurfaceClient(options);
  }

  /**
   * Build a QuerySpec-compatible query for the Okta System Log API.
   *
   * Translates hunt-oriented parameters (actor, target, event types, time window)
   * into a QuerySpec that THRUNT connectors can execute against the Okta
   * System Log API (/api/v1/logs).
   */
  buildSystemLogQuery(params: OktaSystemLogQueryParams): Partial<QuerySpec> {
    const filterParts: string[] = [];

    if (params.filter) {
      filterParts.push(params.filter);
    }
    if (params.actorId) {
      filterParts.push(`actor.id eq "${params.actorId}"`);
    }
    if (params.targetId) {
      filterParts.push(`target.id eq "${params.targetId}"`);
    }
    if (params.eventTypes && params.eventTypes.length > 0) {
      const eventFilter = params.eventTypes
        .map((et) => `eventType eq "${et}"`)
        .join(' or ');
      filterParts.push(`(${eventFilter})`);
    }

    const combinedFilter = filterParts.length > 0
      ? filterParts.join(' and ')
      : undefined;

    const now = new Date().toISOString();

    return {
      version: '1.0',
      query_id: `okta-syslog-${Date.now()}`,
      connector: {
        id: 'okta',
        profile: 'default',
        tenant: null,
        region: null,
      },
      dataset: {
        kind: 'events',
        name: 'system_log',
        version: 'v1',
      },
      time_window: {
        start: params.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        end: params.until ?? now,
        timezone: 'UTC',
        preset: null,
        lookback_minutes: null,
        cursor: null,
        alignment: 'none',
      },
      parameters: {
        ...(combinedFilter ? { filter: combinedFilter } : {}),
        ...(params.q ? { q: params.q } : {}),
      },
      pagination: {
        mode: 'cursor',
        limit: params.limit ?? 100,
        max_pages: 5,
        cursor: null,
        page: 1,
        offset: 0,
      },
      query: {
        language: 'okta_filter',
        statement: combinedFilter ?? '',
        parameters: {
          ...(params.q ? { q: params.q } : {}),
        },
        hints: {
          api_path: '/api/v1/logs',
          sort_order: 'DESCENDING',
        },
      },
    };
  }

  /**
   * Enrich an entity using Okta API data.
   *
   * Returns a stub enrichment result. In production, this would call the
   * Okta Users, Groups, or Apps API to resolve entity details.
   */
  enrichEntity(entityType: string, value: string): OktaEnrichmentResult {
    return {
      entityType,
      value,
      vendor: 'okta',
      found: false,
      data: {
        _stub: true,
        _message: `Okta enrichment for ${entityType}:${value} — not yet connected to live API. Configure Okta API token to enable.`,
        suggestedEndpoints: entityType === 'user'
          ? ['/api/v1/users/{userId}', '/api/v1/users/{userId}/factors']
          : entityType === 'group'
            ? ['/api/v1/groups/{groupId}', '/api/v1/groups/{groupId}/users']
            : entityType === 'app'
              ? ['/api/v1/apps/{appId}', '/api/v1/apps/{appId}/users']
              : ['/api/v1/logs'],
      },
      enrichedAt: new Date().toISOString(),
    };
  }
}
