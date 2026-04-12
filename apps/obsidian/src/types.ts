// --- MCP connection types ---

export type McpConnectionStatus = 'disabled' | 'disconnected' | 'connected' | 'error';

export interface McpHealthResponse {
  status: string;        // "healthy" or "unhealthy"
  toolCount: number;
  serverVersion: string;
  error?: string;        // present when status is "unhealthy"
}

export interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// --- Workspace status ---

export type WorkspaceStatus = 'healthy' | 'partial' | 'missing';

// --- Artifact definitions ---

export interface ArtifactDefinition {
  fileName: string;       // e.g. "MISSION.md"
  label: string;          // e.g. "Mission"
  description: string;    // e.g. "Program charter, scope, and constraints."
  starterTemplate: string; // multi-line starter markdown
  commandId: string;      // e.g. "open-thrunt-mission"
  commandName: string;    // e.g. "Open THRUNT mission"
}

// --- Per-artifact runtime status ---

export interface ArtifactStatus {
  definition: ArtifactDefinition;
  exists: boolean;
  path: string; // resolved vault-relative path
}

// --- Parsed hunt state snapshots ---

/** Parsed snapshot of STATE.md */
export interface StateSnapshot {
  currentPhase: string;       // first non-empty line under ## Current phase, or "unknown"
  blockers: string[];         // list items under ## Blockers
  nextActions: string[];      // list items under ## Next actions
}

/** Parsed snapshot of HYPOTHESES.md */
export interface HypothesisSnapshot {
  total: number;
  validated: number;
  pending: number;            // includes testing, draft, active, pending
  rejected: number;           // includes disproved
  unknown: number;            // anything not in recognized buckets
}

/** Phase directory detection result */
export interface PhaseDirectoryInfo {
  count: number;              // number of phase-XX/ directories found
  highest: number | null;     // highest numeric phase, or null if count is 0
  highestName: string | null; // directory name of highest phase, e.g. "phase-04"
}

// --- Entity counts ---

/** Entity file counts per folder, keyed by folder path (e.g. "entities/iocs") */
export interface EntityCounts {
  [folderPath: string]: number;
}

// --- Extended artifacts ---

/** Counts and existence flags for agent-produced artifacts beyond the 5 core files */
export interface ExtendedArtifacts {
  receipts: number;          // count of RCT-*.md in RECEIPTS/
  queries: number;           // count of QRY-*.md in QUERIES/
  evidenceReview: boolean;   // EVIDENCE_REVIEW.md exists
  successCriteria: boolean;  // SUCCESS_CRITERIA.md exists
  environment: boolean;      // environment/ENVIRONMENT.md exists
  cases: number;             // count of cases/*/MISSION.md subdirectories
}

// --- View model consumed by view.ts ---

export interface ViewModel {
  workspaceStatus: WorkspaceStatus;
  planningDir: string;
  artifactCount: number;     // how many of CORE_ARTIFACTS.length exist
  artifactTotal: number;     // CORE_ARTIFACTS.length (always 5 in Phase 1)
  artifacts: ArtifactStatus[];
  // Phase 2 (64): parsed hunt state
  stateSnapshot: StateSnapshot | null;       // null if STATE.md does not exist
  hypothesisSnapshot: HypothesisSnapshot | null; // null if HYPOTHESES.md does not exist
  phaseDirectories: PhaseDirectoryInfo;
  entityCounts: EntityCounts;
  extendedArtifacts: ExtendedArtifacts;
  receiptTimeline: ReceiptTimelineEntry[];
  // Phase 72: MCP connection status
  mcpStatus: McpConnectionStatus;
}

// --- Error types ---

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

// --- Parsed receipt snapshots ---

/** Parsed snapshot of a receipt markdown file */
export interface ReceiptSnapshot {
  receipt_id: string;
  claim_status: string;      // "supports" | "disproves" | "context" | ""
  result_status: string;     // "ok" | "partial" | "error" | "empty" | ""
  related_hypotheses: string[];
  related_queries: string[];
  claim: string;             // first non-empty paragraph from ## Claim
  evidence_summary: string;  // first non-empty paragraph from ## Evidence
  technique_refs: string[];  // T1234 or T1234.567 patterns found in body
  confidence: string;        // "Low" | "Medium" | "High" | ""
}

// --- Parsed query log snapshots ---

/** Parsed snapshot of a query log markdown file */
export interface QuerySnapshot {
  query_id: string;
  dataset: string;           // "events" | "alerts" | "identity" | ... | ""
  result_status: string;     // "ok" | "partial" | "error" | "empty" | ""
  related_hypotheses: string[];
  related_receipts: string[];
  intent: string;            // first non-empty paragraph from ## Intent
  entity_refs: {
    ips: string[];           // IPv4 addresses found in body
    domains: string[];       // domain names found in body
    hashes: string[];        // MD5/SHA1/SHA256 hex strings found in body
  };
}

// --- Entity schema types ---

export interface FrontmatterFieldDef {
  key: string;
  type: 'string' | 'number' | 'string[]' | 'date';
  default: string | number | string[] | null;
  required: boolean;
}

export interface EntityTypeDefinition {
  type: string;
  label: string;
  folder: string;
  frontmatterFields: FrontmatterFieldDef[];
  starterTemplate: (name: string) => string;
}

// --- Ingestion engine types ---

/** Instruction to create or update an entity note in the vault */
export interface EntityInstruction {
  action: 'create' | 'update';
  entityType: string;       // matches EntityTypeDefinition.type (e.g. 'ioc/ip', 'ttp')
  name: string;             // entity value (e.g. '192.168.1.100', 'T1059.001')
  folder: string;           // resolved folder (e.g. 'entities/iocs', 'entities/ttps')
  sightingLine: string;     // markdown line to append under ## Sightings
  sourceId: string;         // receipt_id or query_id used for deduplication
}

/** Result of an ingestion run */
export interface IngestionResult {
  created: number;
  updated: number;
  skipped: number;
  entities: EntityInstruction[];
  timestamp: string;        // ISO 8601
}

/** Timeline entry for a receipt artifact */
export interface ReceiptTimelineEntry {
  receipt_id: string;
  claim_status: string;     // "supports" | "disproves" | "context" | ""
  claim: string;            // truncated claim text
  technique_refs: string[];
  hypothesis: string;       // related_hypotheses[0] or "Ungrouped"
  fileName: string;         // e.g. "RCT-001.md"
}

// --- MCP enrichment types ---

/** Shape of parsed MCP lookupTechnique response */
export interface EnrichmentData {
  description: string;           // technique description text
  groups: string[];              // associated threat actor groups
  detectionSources: string[];    // data sources that detect this technique
  relatedTechniques: string[];   // related technique IDs (e.g. T1059.001)
}

/** One row in the coverage report */
export interface CoverageTactic {
  tactic: string;     // tactic name (e.g. "Initial Access")
  total: number;      // total techniques in this tactic
  hunted: number;     // techniques with hunt_count > 0
  percentage: number; // hunted/total * 100, rounded to 1 decimal
}

/** Full coverage analysis output */
export interface CoverageReport {
  tactics: CoverageTactic[];
  totalTechniques: number;
  huntedTechniques: number;
  overallPercentage: number;
  gaps: string[];    // technique IDs with hunt_count === 0
}

/** One result from knowledge graph search */
export interface SearchResult {
  id: string;         // entity identifier
  name: string;       // display name
  entityType: string; // e.g. 'ttp', 'ioc/ip', 'actor'
  snippet: string;    // context snippet from search hit
}
