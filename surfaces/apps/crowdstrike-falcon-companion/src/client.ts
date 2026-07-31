/**
 * @thrunt-surfaces/crowdstrike-falcon-companion — Detection query helpers
 * and detection correlation for CrowdStrike Falcon within THRUNT hunt workflows.
 */

import { SurfaceClient, type SurfaceClientOptions } from '@thrunt-surfaces/sdk';

export interface DetectionQueryParams {
  /** FQL filter expression for Event Search */
  filter?: string;
  /** Free-text search query */
  q?: string;
  /** Time range start (ISO date string) */
  since?: string;
  /** Time range end (ISO date string) */
  until?: string;
  /** Host name or device ID to filter by */
  hostFilter?: string;
  /** Tactic IDs (MITRE ATT&CK) to filter by */
  tacticIds?: string[];
  /** Technique IDs (MITRE ATT&CK) to filter by */
  techniqueIds?: string[];
  /** Detection severity: Critical, High, Medium, Low, Informational */
  severities?: string[];
  /** Maximum results */
  limit?: number;
  /** Sort field */
  sortBy?: string;
  /** Sort direction */
  sortDirection?: 'asc' | 'desc';
}

export interface DetectionCorrelationResult {
  detectionId: string;
  vendor: 'crowdstrike';
  correlated: boolean;
  caseId: string | null;
  hypothesisIds: string[];
  correlatedAt: string;
  details: Record<string, unknown>;
}

function escapeFqlLiteral(value: string): string {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ');
}

function escapeQueryParam(value: string): string {
  return String(value).replace(/\r?\n/g, ' ');
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return fallback;
  }
  return Math.floor(value as number);
}

function validateSortField(value: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(value)) {
    throw new Error(`Invalid CrowdStrike sort field: ${value}`);
  }
  return value;
}

export class CrowdStrikeCompanion {
  protected readonly bridge: SurfaceClient;

  constructor(options?: SurfaceClientOptions) {
    this.bridge = new SurfaceClient(options);
  }

  /**
   * Build a query template for CrowdStrike Falcon Event Search.
   *
   * Generates a Falcon Query Language (FQL) filter string from structured
   * parameters. The output can be used with the Falcon Detections API
   * (/detects/queries/detects/v1) or pasted into Falcon Event Search.
   */
  buildDetectionQuery(params: DetectionQueryParams): string {
    const fqlParts: string[] = [];

    if (params.filter) {
      fqlParts.push(params.filter);
    }

    // Time range
    if (params.since) {
      fqlParts.push(`created_timestamp:>='${escapeFqlLiteral(params.since)}'`);
    }
    if (params.until) {
      fqlParts.push(`created_timestamp:<='${escapeFqlLiteral(params.until)}'`);
    }

    // Host filter
    if (params.hostFilter) {
      fqlParts.push(`device.hostname:'${escapeFqlLiteral(params.hostFilter)}'`);
    }

    // MITRE ATT&CK tactics
    if (params.tacticIds && params.tacticIds.length > 0) {
      const tacticFilter = params.tacticIds
        .map((t) => `behaviors.tactic_id:'${escapeFqlLiteral(t)}'`)
        .join(',');
      fqlParts.push(tacticFilter);
    }

    // MITRE ATT&CK techniques
    if (params.techniqueIds && params.techniqueIds.length > 0) {
      const techniqueFilter = params.techniqueIds
        .map((t) => `behaviors.technique_id:'${escapeFqlLiteral(t)}'`)
        .join(',');
      fqlParts.push(techniqueFilter);
    }

    // Severity filter
    if (params.severities && params.severities.length > 0) {
      const severityFilter = params.severities
        .map((s) => `max_severity_displayname:'${escapeFqlLiteral(s)}'`)
        .join(',');
      fqlParts.push(severityFilter);
    }

    const fql = fqlParts.length > 0 ? fqlParts.join('+') : '*';

    // Build the full query structure
    const queryParams = new URLSearchParams();
    queryParams.set('filter', fql);

    if (params.q) {
      queryParams.set('q', escapeQueryParam(params.q));
    }

    const limit = normalizeLimit(params.limit, 100);
    queryParams.set('limit', String(limit));

    if (params.sortBy) {
      const direction = params.sortDirection ?? 'desc';
      queryParams.set('sort', `${validateSortField(params.sortBy)}.${direction}`);
    } else {
      queryParams.set('sort', 'created_timestamp.desc');
    }

    return queryParams.toString();
  }

  /**
   * Correlate a CrowdStrike Falcon detection with THRUNT case state.
   *
   * This is a stub that returns a correlation result structure. In production,
   * it would query the bridge for active cases and match detection indicators
   * against hunt hypotheses.
   */
  correlateDetection(detectionId: string): DetectionCorrelationResult {
    return {
      detectionId,
      vendor: 'crowdstrike',
      correlated: false,
      caseId: null,
      hypothesisIds: [],
      correlatedAt: new Date().toISOString(),
      details: {
        _stub: true,
        _message: `CrowdStrike detection ${detectionId} correlation — not yet connected to live case state. Bridge connection required for active correlation.`,
        suggestedApiEndpoints: [
          `/detects/entities/summaries/GET/v1?ids=${detectionId}`,
          `/incidents/queries/incidents/v1?filter=detection_ids:'${detectionId}'`,
        ],
      },
    };
  }
}
