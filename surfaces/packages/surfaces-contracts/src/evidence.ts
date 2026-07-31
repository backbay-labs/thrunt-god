/**
 * Evidence contracts — mirrors the connector-sdk.cjs canonical types as TypeScript.
 *
 * These do NOT diverge from the CJS runtime types. They are a TypeScript projection
 * for type safety in surfaces code.
 */

// --- QuerySpec (v1.0) ---

export type DatasetKind = 'events' | 'alerts' | 'entities' | 'identity' | 'endpoint' | 'cloud' | 'email' | 'other';
export type PaginationMode = 'auto' | 'none' | 'cursor' | 'offset' | 'page' | 'token';
export type ConsistencyMode = 'best_effort' | 'strict';
export type EvidencePolicy = 'all' | 'material' | 'none';
export type ResultStatus = 'ok' | 'partial' | 'error' | 'empty';
export type AuthType = 'api_key' | 'basic' | 'bearer' | 'oauth_client_credentials' | 'oauth_refresh' | 'sigv4' | 'service_account' | 'session';

export interface QuerySpec {
  version: string;
  query_id: string;
  connector: {
    id: string;
    profile: string;
    tenant: string | null;
    region: string | null;
  };
  dataset: {
    kind: DatasetKind;
    name: string | null;
    version: string | null;
  };
  time_window: {
    start: string;
    end: string;
    timezone: string;
    preset: string | null;
    lookback_minutes: number | null;
    cursor: string | null;
    alignment: string;
  };
  parameters: Record<string, unknown>;
  pagination: {
    mode: PaginationMode;
    limit: number;
    max_pages: number;
    cursor: string | null;
    page: number;
    offset: number;
  };
  execution: {
    profile: string;
    timeout_ms: number;
    max_retries: number;
    backoff_ms: number;
    consistency: ConsistencyMode;
    dry_run: boolean;
    priority: string;
    request_id: string;
  };
  query: {
    language: string;
    statement: string;
    parameters: Record<string, unknown>;
    hints: Record<string, unknown>;
  };
  evidence: {
    hypothesis_ids: string[];
    query_log: boolean;
    receipt_policy: EvidencePolicy;
    chain_of_custody: Record<string, unknown>;
    tags: string[];
  };
}

// --- Result Envelope (v1.0) ---

export interface NormalizedEvent {
  id: string;
  timestamp: string;
  source: string;
  title: string;
  details: Record<string, unknown>;
  severity?: string;
  tags: string[];
}

export interface NormalizedEntity {
  kind: string;
  value: string;
  sources: string[];
}

export interface ResultWarning {
  code: string;
  message: string;
  details?: unknown;
}

export interface ResultError {
  code: string;
  message: string;
  retryable: boolean;
  stage: string | null;
  connector_id: string | null;
  details?: unknown;
}

export interface ResultEnvelope {
  version: string;
  query_id: string;
  connector: QuerySpec['connector'];
  dataset: QuerySpec['dataset'];
  status: ResultStatus;
  time_window: QuerySpec['time_window'];
  pagination: {
    mode: PaginationMode;
    requested_limit: number;
    max_pages: number;
    pages_fetched: number;
    next_cursor: string | null;
    exhausted: boolean;
  };
  execution: {
    request_id: string;
    profile: string;
    timeout_ms: number;
    consistency: ConsistencyMode;
    dry_run: boolean;
  };
  timing: {
    started_at: string;
    completed_at: string;
    duration_ms: number;
  };
  counts: {
    events: number;
    entities: number;
    relationships: number;
    evidence: number;
    warnings: number;
    errors: number;
    raw_records: number;
  };
  events: NormalizedEvent[];
  entities: NormalizedEntity[];
  relationships: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  warnings: ResultWarning[];
  errors: ResultError[];
  metadata: Record<string, unknown>;
}

// --- Connector capabilities ---

export interface ConnectorCapabilities {
  id: string;
  display_name: string;
  auth_types: AuthType[];
  dataset_kinds: DatasetKind[];
  languages: string[];
  pagination_modes: PaginationMode[];
  supports_entities: boolean;
  supports_relationships: boolean;
  supports_receipts: boolean;
  supports_dry_run: boolean;
  docs_url: string | null;
  limitations: string[];
  supported_parameters: string[];
}
