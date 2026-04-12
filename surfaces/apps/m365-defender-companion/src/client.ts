/**
 * @thrunt-surfaces/m365-defender-companion — Advanced Hunting query helpers
 * and incident correlation for Microsoft 365 Defender within THRUNT hunt workflows.
 */

import { SurfaceClient, type SurfaceClientOptions } from '@thrunt-surfaces/sdk';

export interface AdvancedHuntingQueryParams {
  /** Primary table to query (e.g., 'DeviceProcessEvents', 'EmailEvents', 'IdentityLogonEvents') */
  table: string;
  /** Time range lookback in days */
  lookbackDays?: number;
  /** KQL where clauses to apply */
  filters?: string[];
  /** Columns to project */
  columns?: string[];
  /** Maximum rows to return */
  limit?: number;
  /** Optional: entity value to search for across common fields */
  entitySearch?: string;
  /** Optional: sort column */
  orderBy?: string;
  /** Optional: sort direction */
  orderDirection?: 'asc' | 'desc';
}

export interface IncidentCorrelationResult {
  incidentId: string;
  vendor: 'm365-defender';
  correlated: boolean;
  caseId: string | null;
  hypothesisIds: string[];
  correlatedAt: string;
  details: Record<string, unknown>;
}

/** Common Advanced Hunting tables for reference */
export const ADVANCED_HUNTING_TABLES = [
  'DeviceProcessEvents',
  'DeviceNetworkEvents',
  'DeviceFileEvents',
  'DeviceRegistryEvents',
  'DeviceLogonEvents',
  'DeviceImageLoadEvents',
  'DeviceEvents',
  'EmailEvents',
  'EmailAttachmentInfo',
  'EmailUrlInfo',
  'EmailPostDeliveryEvents',
  'IdentityLogonEvents',
  'IdentityQueryEvents',
  'IdentityDirectoryEvents',
  'CloudAppEvents',
  'AlertEvidence',
  'AlertInfo',
] as const;

export class M365DefenderCompanion {
  protected readonly bridge: SurfaceClient;

  constructor(options?: SurfaceClientOptions) {
    this.bridge = new SurfaceClient(options);
  }

  /**
   * Build a KQL query template for Microsoft 365 Defender Advanced Hunting.
   *
   * Generates a valid KQL query string from structured parameters. The query
   * can be pasted into the Advanced Hunting console or executed via the
   * Microsoft Graph Security API.
   */
  buildAdvancedHuntingQuery(params: AdvancedHuntingQueryParams): string {
    const lines: string[] = [];

    // Table reference
    lines.push(params.table);

    // Time filter
    const lookback = params.lookbackDays ?? 7;
    lines.push(`| where Timestamp > ago(${lookback}d)`);

    // Entity search across common fields if provided
    if (params.entitySearch) {
      const escaped = params.entitySearch.replace(/"/g, '\\"');
      lines.push(
        `| where AccountName has "${escaped}" or DeviceName has "${escaped}" or RemoteUrl has "${escaped}" or FileName has "${escaped}" or InitiatingProcessFileName has "${escaped}"`,
      );
    }

    // Additional filters
    if (params.filters && params.filters.length > 0) {
      for (const filter of params.filters) {
        lines.push(`| where ${filter}`);
      }
    }

    // Projection
    if (params.columns && params.columns.length > 0) {
      lines.push(`| project ${params.columns.join(', ')}`);
    }

    // Sorting
    if (params.orderBy) {
      const direction = params.orderDirection ?? 'desc';
      lines.push(`| sort by ${params.orderBy} ${direction}`);
    }

    // Limit
    const limit = params.limit ?? 100;
    lines.push(`| take ${limit}`);

    return lines.join('\n');
  }

  /**
   * Correlate a Microsoft 365 Defender incident with THRUNT case state.
   *
   * This is a stub that returns a correlation result structure. In production,
   * it would query the bridge for active cases and match incident entities
   * against hunt hypotheses.
   */
  correlateIncident(incidentId: string): IncidentCorrelationResult {
    return {
      incidentId,
      vendor: 'm365-defender',
      correlated: false,
      caseId: null,
      hypothesisIds: [],
      correlatedAt: new Date().toISOString(),
      details: {
        _stub: true,
        _message: `M365 Defender incident ${incidentId} correlation — not yet connected to live case state. Bridge connection required for active correlation.`,
        suggestedApiEndpoint: `https://graph.microsoft.com/v1.0/security/incidents/${incidentId}`,
      },
    };
  }
}
