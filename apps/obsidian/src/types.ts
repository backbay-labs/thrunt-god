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

// --- View model consumed by view.ts ---
// Phase 2 will extend ViewModel with parsed hunt state fields (phase, blockers, hypothesis counts, phase directories).

export interface ViewModel {
  workspaceStatus: WorkspaceStatus;
  planningDir: string;
  artifactCount: number;     // how many of CORE_ARTIFACTS.length exist
  artifactTotal: number;     // CORE_ARTIFACTS.length (always 5 in Phase 1)
  artifacts: ArtifactStatus[];
}

// --- Error types ---

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceError';
  }
}
