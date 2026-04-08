// ParseResult discriminated union
export type ParseStatus = 'loaded' | 'error' | 'loading' | 'missing';

export type ParseResult<T> =
  | { status: 'loaded'; data: T }
  | { status: 'error'; error: string; partial?: Partial<T> }
  | { status: 'loading' }
  | { status: 'missing' };

// Artifact type enum
export type ArtifactType =
  | 'mission'
  | 'hypotheses'
  | 'huntmap'
  | 'state'
  | 'query'
  | 'receipt'
  | 'evidenceReview'
  | 'phaseSummary';

// Store change event
export interface ArtifactChangeEvent {
  type: 'artifact:updated' | 'artifact:deleted' | 'store:rebuilt';
  artifactType: ArtifactType;
  id: string;        // e.g. "QRY-20260329-001" or "MISSION"
  filePath: string;   // absolute path to the artifact file
}

// --- Domain interfaces ---

export interface Mission {
  mode: string;               // "case", "patrol", etc.
  opened: string;             // date string
  owner: string;
  status: string;             // "Open", "Closed"
  signal: string;             // ## Signal section text
  desiredOutcome: string;     // ## Desired Outcome section text
  scope: string;              // ## Scope section text
  workingTheory: string;      // ## Working Theory section text
}

export interface Hypothesis {
  id: string;                 // "HYP-01"
  signal: string;
  assertion: string;
  priority: string;           // "Critical", "High", "Medium", "Low"
  status: string;             // "Supported", "Disproved", "Inconclusive", "Open"
  confidence: string;         // "High", "Medium", "Low"
  scope: string;
  dataSources: string[];
  evidenceNeeded: string;
  disproofCondition: string;
}

export interface Hypotheses {
  active: Hypothesis[];
  parked: Hypothesis[];
  disproved: Hypothesis[];
}

export interface HuntPhase {
  number: number;
  name: string;
  goal: string;
  status: string;             // "planned", "running", "complete"
  dependsOn: string;
  plans: string[];            // plan names
}

export interface HuntMap {
  overview: string;           // ## Overview section text
  phases: HuntPhase[];
}

export interface HuntState {
  activeSignal: string;
  currentFocus: string;
  phase: number;
  totalPhases: number;
  planInPhase: number;
  totalPlansInPhase: number;
  status: string;             // "Complete", "In Progress"
  lastActivity: string;
  scope: string;              // ### Current Scope section
  confidence: string;
  blockers: string;
}

export interface ChildHuntSummary {
  id: string;
  name: string;
  kind: 'case' | 'workstream';
  huntRootPath: string;
  missionPath: string;
  signal: string;
  mode: string;
  status: string;
  opened: string;
  owner: string;
  currentPhase: number;
  totalPhases: number;
  phaseName: string;
  lastActivity: string;
  blockerCount: number;
  findingsPublished: boolean;
  techniqueIds: string[];
}

// Drain template metadata (extracted from Query result summary)
export interface DrainTemplate {
  templateId: string;         // "T1", "T2", etc.
  template: string;           // Template pattern text
  count: number;              // Number of events matching
  percentage: number;         // % of total events
}

export interface QueryTimeWindow {
  start: string;
  end: string;
}

export interface DrainTemplateDetail {
  templateId: string;
  heading: string;
  summary: string;
  detailLines: string[];
  sampleEventText: string | null;
  sampleEventId: string | null;
  eventIds: string[];
}

export interface Query {
  queryId: string;            // from frontmatter: query_id
  querySpecVersion: string;
  source: string;
  connectorId: string;
  dataset: string;
  executedAt: string;
  author: string;
  relatedHypotheses: string[];
  relatedReceipts: string[];
  contentHash: string;
  manifestId: string;
  title: string;              // H1 query title
  intent: string;             // ## Intent section
  queryText: string;          // ## Query Or Procedure code block
  resultSummary: string;      // ## Result Summary first line (events=N, templates=N, entities=N)
  templates: DrainTemplate[]; // Extracted from Result Summary table
  templateDetails: DrainTemplateDetail[]; // Extracted from ### Template Tn Details subsections
  entityCount: number;
  eventCount: number;
  templateCount: number;
  timeWindow: QueryTimeWindow | null;
}

// Anomaly framing (extracted from Receipt)
export interface DeviationScore {
  category: string;           // EXPECTED_BENIGN | EXPECTED_MALICIOUS | AMBIGUOUS | NOVEL
  baseScore: number;
  modifiers: Array<{ factor: string; value: string; contribution: number }>;
  totalScore: number;         // 0-6
}

export interface AnomalyFrame {
  baseline: string;           // ### Baseline section text
  prediction: string;         // Predicted benign/malicious next text
  observation: string;        // Actual observation text
  deviationScore: DeviationScore;
  attackMapping: string[];    // ATT&CK technique IDs
}

export interface Receipt {
  receiptId: string;          // from frontmatter: receipt_id
  querySpecVersion: string;
  createdAt: string;
  source: string;
  connectorId: string;
  dataset: string;
  resultStatus: string;
  claimStatus: string;        // "supports", "contradicts", "inconclusive"
  relatedHypotheses: string[];
  relatedQueries: string[];
  contentHash: string;
  manifestId: string;
  claim: string;              // ## Claim section text
  evidence: string;           // ## Evidence section text
  anomalyFrame: AnomalyFrame | null;  // null if no Anomaly Framing section
  confidence: string;         // ## Confidence section text
}

export interface EvidenceCheck {
  check: string;
  status: string;             // "Pass", "Fail", "Partial"
  notes: string;
}

export interface AntiPatternCheck {
  pattern: string;
  signal: string;
  status: string;             // "Clear", "Flagged"
}

export interface EvidenceReview {
  publishabilityVerdict: string;
  evidenceChecks: EvidenceCheck[];
  antiPatternChecks: AntiPatternCheck[];
  contradictoryEvidence: string;
  blindSpots: string;
  followUpNeeded: string;
}

export interface HypothesisVerdict {
  hypothesisId: string;
  verdict: string;
  confidence: string;
  evidence: string;
}

export interface PhaseSummary {
  executiveSummary: string;
  hypothesisVerdicts: HypothesisVerdict[];
  impactedScope: string;
  attackTimeline: string;     // raw markdown table text
}
