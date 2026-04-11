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
}

// --- Error types ---

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceError';
  }
}
