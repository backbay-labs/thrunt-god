import type {
  CertificationBaselineChurnSummary,
  CertificationBaselineRecord,
  CertificationDriftTrendSummary,
  CertificationFreshnessSummary,
  CaseSummary, CaseProgress, HypothesisSummary,
  QueryLogSummary, ReceiptSummary, FindingSummary, CapturedEvidenceSummary, CaseViewModel,
  CertificationCampaignSummary,
  CertificationStatusSummary,
  CertificationVendorHistorySummary,
  LastExecutionSummary,
  RuntimePreviewSummary,
  RecommendedAction,
  AdapterStatus,
  EvidenceTimelineEntry,
} from '@thrunt-surfaces/contracts';

export interface RawArtifacts {
  mission: CaseSummary | null;
  progress: CaseProgress | null;
  hypotheses: HypothesisSummary[];
  queries: QueryLogSummary[];
  receipts: ReceiptSummary[];
  evidence: CapturedEvidenceSummary[];
  findings: FindingSummary[];
  blockers: string[];
  runtimePreview?: RuntimePreviewSummary | null;
  lastExecution?: LastExecutionSummary | null;
  certification?: CertificationStatusSummary[];
  certificationCampaigns?: CertificationCampaignSummary[];
  certificationHistory?: CertificationVendorHistorySummary[];
  certificationDriftTrends?: CertificationDriftTrendSummary[];
  certificationBaselines?: CertificationBaselineRecord[];
  certificationFreshness?: CertificationFreshnessSummary[];
  certificationBaselineChurn?: CertificationBaselineChurnSummary[];
}

export function projectCaseViewModel(artifacts: RawArtifacts): CaseViewModel | null {
  if (!artifacts.mission || !artifacts.progress) return null;

  const blockers: string[] = [...artifacts.blockers];
  // Derive blockers from hypothesis state
  const openCritical = artifacts.hypotheses.filter(h => h.status === 'Open' && h.priority === 'Critical');
  if (openCritical.length > 0) {
    blockers.push(`${openCritical.length} critical hypothesis(es) still open`);
  }

  // Derive recommended action
  let recommendedAction: string | null = null;
  const currentPhase = artifacts.progress.phases.find(p => p.number === artifacts.progress!.currentPhase);
  if (currentPhase && currentPhase.status === 'running') {
    recommendedAction = `Continue phase ${currentPhase.number}: ${currentPhase.goal}`;
  } else if (currentPhase && currentPhase.status === 'planned') {
    recommendedAction = `Start phase ${currentPhase.number}: ${currentPhase.goal}`;
  }

  return {
    case: artifacts.mission,
    progress: artifacts.progress,
    hypotheses: artifacts.hypotheses,
    recentQueries: artifacts.queries.slice(0, 10),
    recentReceipts: artifacts.receipts.slice(0, 10),
    recentEvidence: artifacts.evidence.slice(0, 10),
    findings: artifacts.findings,
    blockers,
    readinessBlockers: artifacts.runtimePreview?.blockers ?? [],
    recommendedAction,
    runtimePreview: artifacts.runtimePreview ?? null,
    lastExecution: artifacts.lastExecution ?? null,
    certification: artifacts.certification ?? [],
    certificationCampaigns: artifacts.certificationCampaigns ?? [],
    certificationHistory: artifacts.certificationHistory ?? [],
    certificationDriftTrends: artifacts.certificationDriftTrends ?? [],
    certificationBaselines: artifacts.certificationBaselines ?? [],
    certificationFreshness: artifacts.certificationFreshness ?? [],
    certificationBaselineChurn: artifacts.certificationBaselineChurn ?? [],
    recommendedActions: deriveRecommendedActions(artifacts),
    evidenceTimeline: mergeEvidenceTimeline(artifacts),
    adapterStatuses: deriveAdapterStatuses(artifacts, null),
  };
}

export function deriveHypothesisStats(hypotheses: HypothesisSummary[]) {
  return {
    total: hypotheses.length,
    supported: hypotheses.filter(h => h.status === 'Supported').length,
    disproved: hypotheses.filter(h => h.status === 'Disproved').length,
    inconclusive: hypotheses.filter(h => h.status === 'Inconclusive').length,
    open: hypotheses.filter(h => h.status === 'Open').length,
  };
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function deriveRecommendedActions(artifacts: RawArtifacts): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  // Evidence gap: open hypotheses with no linked evidence
  const openWithNoEvidence = artifacts.hypotheses.filter(h => {
    if (h.status !== 'Open') return false;
    const hasReceipt = artifacts.receipts.some(r => r.relatedHypotheses.includes(h.id));
    const hasQuery = artifacts.queries.some(q => q.relatedHypotheses.includes(h.id));
    const hasEvidence = artifacts.evidence.some(e => e.relatedHypotheses.includes(h.id));
    return !hasReceipt && !hasQuery && !hasEvidence;
  });
  if (openWithNoEvidence.length > 0) {
    actions.push({
      id: `evidence-gap-${openWithNoEvidence.length}`,
      label: `${openWithNoEvidence.length} hypothesis${openWithNoEvidence.length === 1 ? ' has' : 'es have'} no evidence`,
      priority: 'high',
      category: 'evidence_gap',
    });
  }

  // Phase progress: next planned phase after current running one
  if (artifacts.progress) {
    const phases = artifacts.progress.phases;
    const runningIdx = phases.findIndex(p => p.status === 'running');
    if (runningIdx >= 0 && runningIdx + 1 < phases.length) {
      const next = phases[runningIdx + 1];
      if (next.status === 'planned') {
        actions.push({
          id: 'phase-ready',
          label: `Phase ${next.number} ready for execution`,
          priority: 'medium',
          category: 'phase_progress',
        });
      }
    }
  }

  // Capture debt: evidence items with pending review or no linked hypotheses
  const captureDebt = artifacts.evidence.filter(
    e => e.reviewStatus === 'pending' || e.relatedHypotheses.length === 0,
  );
  if (captureDebt.length > 0) {
    actions.push({
      id: `capture-debt-${captureDebt.length}`,
      label: `${captureDebt.length} captured evidence item${captureDebt.length === 1 ? ' needs' : 's need'} linking`,
      priority: 'medium',
      category: 'capture_debt',
    });
  }

  // Hypothesis coverage: most hypotheses still open
  const stats = deriveHypothesisStats(artifacts.hypotheses);
  if (stats.total > 0 && stats.open > stats.supported + stats.disproved) {
    actions.push({
      id: 'coverage-low',
      label: `Most hypotheses still open (${stats.open}/${stats.total})`,
      priority: 'low',
      category: 'hypothesis_coverage',
    });
  }

  // Sort by priority, cap at 5
  actions.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9));
  return actions.slice(0, 5);
}

export function mergeEvidenceTimeline(artifacts: RawArtifacts): EvidenceTimelineEntry[] {
  const entries: EvidenceTimelineEntry[] = [];

  for (const q of artifacts.queries) {
    entries.push({
      id: q.queryId,
      type: 'query',
      vendorId: q.connectorId,
      timestamp: q.executedAt,
      summary: q.title || q.queryId,
      relatedHypotheses: q.relatedHypotheses,
    });
  }

  for (const r of artifacts.receipts) {
    entries.push({
      id: r.receiptId,
      type: 'receipt',
      vendorId: r.connectorId,
      timestamp: r.createdAt,
      summary: r.claim || r.receiptId,
      relatedHypotheses: r.relatedHypotheses,
    });
  }

  for (const e of artifacts.evidence) {
    entries.push({
      id: e.evidenceId,
      type: 'evidence',
      vendorId: e.vendorId,
      timestamp: e.capturedAt,
      summary: e.summary,
      relatedHypotheses: e.relatedHypotheses,
    });
  }

  entries.sort((a, b) => (b.timestamp > a.timestamp ? 1 : b.timestamp < a.timestamp ? -1 : 0));
  return entries.slice(0, 20);
}

export function deriveAdapterStatuses(
  artifacts: RawArtifacts,
  detectedVendorId: string | null,
): AdapterStatus[] {
  const vendorIds = new Set<string>();

  // Collect from certification
  for (const c of artifacts.certification ?? []) {
    vendorIds.add(c.vendorId);
  }
  // Collect from queries, receipts, evidence
  for (const q of artifacts.queries) vendorIds.add(q.connectorId);
  for (const r of artifacts.receipts) vendorIds.add(r.connectorId);
  for (const e of artifacts.evidence) vendorIds.add(e.vendorId);

  const certMap = new Map<string, string>();
  for (const c of artifacts.certification ?? []) {
    certMap.set(c.vendorId, c.status);
  }

  const statuses: AdapterStatus[] = [];
  for (const vid of vendorIds) {
    let state: AdapterStatus['state'];
    if (vid === detectedVendorId) {
      state = 'connected';
    } else if (certMap.has(vid)) {
      state = certMap.get(vid)!.includes('certified') ? 'certified' : 'uncertified';
    } else {
      state = 'disconnected';
    }

    const displayName = vid
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

    statuses.push({ vendorId: vid, displayName, state });
  }

  return statuses;
}
