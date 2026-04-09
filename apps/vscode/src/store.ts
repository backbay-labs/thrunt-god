import * as vscode from 'vscode';
import type {
  ArtifactType,
  ArtifactChangeEvent,
  ChildHuntSummary,
  ParseResult,
  Query,
  Receipt,
  Mission,
  Hypotheses,
  HuntMap,
  HuntPhase,
  HuntState,
  EvidenceReview,
} from './types';
import type { HuntOverviewViewModel, SessionDiff, SessionContinuitySummary } from '../shared/hunt-overview';
import type {
  EvidenceBoardViewModel,
  EvidenceBoardNode,
  EvidenceBoardEdge,
  EvidenceBoardMatrixCell,
} from '../shared/evidence-board';
import type { ProgramDashboardViewModel, CaseCard } from '../shared/program-dashboard';
import type {
  QueryAnalysisViewModel,
  QueryAnalysisMode,
  QueryAnalysisQuery,
  ComparisonData,
  ComparisonTemplate,
  HeatmapData,
  HeatmapRow,
  HeatmapCell,
  ReceiptInspectorData,
  ReceiptInspectorItem,
} from '../shared/query-analysis';
import { parseArtifact } from './parsers/index';
import { extractFrontmatter } from './parsers/base';
import { resolveArtifactType } from './watcher';
import {
  checkReceiptStructured,
  summarizeIntegrityCounts,
} from './receiptIntegrity';

const PHASE_MATCH_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'that',
  'this',
  'these',
  'those',
  'all',
  'are',
  'was',
  'were',
  'has',
  'have',
  'had',
  'not',
  'but',
  'can',
  'use',
  'using',
  'each',
  'per',
  'via',
  'out',
  'its',
  'their',
  'them',
  'against',
  'after',
  'before',
  'through',
  'across',
  'within',
  'during',
  'until',
  'then',
  'than',
  'into',
  'onto',
  'also',
  'only',
  'just',
  'will',
  'would',
  'should',
  'could',
  'must',
  'phase',
  'query',
  'queries',
  'proc',
]);

function normalizeMatchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenizeMatchText(value: string): string[] {
  return normalizeMatchText(value)
    .split(/\s+/)
    .filter(
      (token) => token.length >= 3 && !PHASE_MATCH_STOP_WORDS.has(token)
    );
}

function normalizeFsPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

function parseDashboardDateMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const directMs = new Date(value).getTime();
  if (!Number.isNaN(directMs)) {
    return directMs;
  }

  const match = value.match(/\b\d{4}-\d{2}-\d{2}(?:T[0-9:.+-]+(?:Z|[+-]\d{2}:\d{2})?)?\b/);
  if (!match) {
    return null;
  }

  const embeddedMs = new Date(match[0]).getTime();
  return Number.isNaN(embeddedMs) ? null : embeddedMs;
}

/** Internal type for the watcher's onDidChange event shape */
interface WatcherLike {
  onDidChange: vscode.Event<string[]>;
}

/** Cached body entry with LRU timestamp */
interface BodyCacheEntry {
  result: ParseResult<unknown>;
  lastAccess: number;
}

/**
 * HuntDataStore is the single source of truth for parsed hunt artifacts.
 *
 * It subscribes to ArtifactWatcher for filesystem change notifications,
 * maintains cross-artifact indexes (receipt->query, receipt->hypothesis,
 * query->phase), implements batch coalescing (500ms window), and provides
 * a two-level cache (frontmatter always, body with 10-slot LRU eviction).
 *
 * All downstream UI providers subscribe to onDidChange rather than touching
 * the filesystem directly.
 */
export class HuntDataStore implements vscode.Disposable {
  // --- Event emission ---
  private readonly _onDidChange = new vscode.EventEmitter<ArtifactChangeEvent>();
  readonly onDidChange: vscode.Event<ArtifactChangeEvent> = this._onDidChange.event;

  // --- Selection state (cross-surface sync) ---
  private _selectedArtifactId: string | null = null;
  private readonly _onDidSelect = new vscode.EventEmitter<string | null>();
  readonly onDidSelect: vscode.Event<string | null> = this._onDidSelect.event;

  // --- Caches ---
  // Level 1: frontmatter cache (always retained, never evicted)
  private readonly _frontmatterCache = new Map<string, Record<string, unknown>>();
  // Raw content cache (always retained for on-demand re-parsing on body cache miss)
  private readonly _rawCache = new Map<string, string>();
  // Level 2: parsed body cache with LRU eviction (max 10 entries)
  private readonly _bodyCache = new Map<string, BodyCacheEntry>();
  private static readonly LRU_MAX = 10;

  // --- Artifact ID -> file path mapping ---
  private readonly artifactPaths = new Map<string, { filePath: string; type: ArtifactType }>();

  // --- Cross-artifact indexes ---
  private readonly receiptToQueries = new Map<string, string[]>();
  private readonly receiptToHypotheses = new Map<string, string[]>();
  private readonly queryToPhase = new Map<string, number>();
  private childHunts: ChildHuntSummary[] = [];

  // --- Batch window ---
  private readonly pendingPaths = new Set<string>();
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly BATCH_WINDOW_MS = 500;

  // --- Watcher subscription ---
  private readonly watcherDisposable: vscode.Disposable;

  // --- Initial scan promise ---
  private readonly _initialScanPromise: Promise<void>;

  constructor(
    private readonly huntRoot: vscode.Uri,
    watcher: WatcherLike,
    private readonly outputChannel: vscode.OutputChannel
  ) {
    // Subscribe to watcher change events
    this.watcherDisposable = watcher.onDidChange((paths) => {
      this.handleFileChange(paths);
    });

    // Perform initial scan
    this._initialScanPromise = this.performInitialScan();
  }

  /**
   * Returns a promise that resolves when the initial scan is complete.
   * Useful for tests to await before asserting.
   */
  initialScanComplete(): Promise<void> {
    return this._initialScanPromise;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Select an artifact across all surfaces. Fires onDidSelect only if value changed (dedup).
   */
  select(artifactId: string | null): void {
    if (artifactId === this._selectedArtifactId) {
      return;
    }
    this._selectedArtifactId = artifactId;
    this._onDidSelect.fire(artifactId);
  }

  /**
   * Get the currently selected artifact ID, or null if no selection.
   */
  getSelectedArtifactId(): string | null {
    return this._selectedArtifactId;
  }

  /**
   * Get all singleton hunt artifacts.
   */
  getHunt(): {
    mission: ParseResult<Mission>;
    hypotheses: ParseResult<Hypotheses>;
    huntMap: ParseResult<HuntMap>;
    state: ParseResult<HuntState>;
  } | null {
    const mission = this.getArtifactByType<Mission>('mission', 'MISSION');
    const hypotheses = this.getArtifactByType<Hypotheses>('hypotheses', 'HYPOTHESES');
    const huntMap = this.getArtifactByType<HuntMap>('huntmap', 'HUNTMAP');
    const state = this.getArtifactByType<HuntState>('state', 'STATE');

    if (!mission || !hypotheses || !huntMap || !state) {
      return null;
    }

    return { mission, hypotheses, huntMap, state };
  }

  /**
   * Get all parsed query artifacts.
   */
  getQueries(): Map<string, ParseResult<Query>> {
    const result = new Map<string, ParseResult<Query>>();
    for (const [id, info] of this.artifactPaths) {
      if (info.type === 'query') {
        const parsed = this.getCachedOrParse(id, info.filePath, info.type);
        if (parsed) {
          result.set(id, parsed as ParseResult<Query>);
        }
      }
    }
    return result;
  }

  /**
   * Get all parsed receipt artifacts.
   */
  getReceipts(): Map<string, ParseResult<Receipt>> {
    const result = new Map<string, ParseResult<Receipt>>();
    for (const [id, info] of this.artifactPaths) {
      if (info.type === 'receipt') {
        const parsed = this.getCachedOrParse(id, info.filePath, info.type);
        if (parsed) {
          result.set(id, parsed as ParseResult<Receipt>);
        }
      }
    }
    return result;
  }

  /**
   * Get a specific query by ID.
   */
  getQuery(queryId: string): ParseResult<Query> | undefined {
    const info = this.artifactPaths.get(queryId);
    if (!info || info.type !== 'query') return undefined;
    return this.getCachedOrParse(queryId, info.filePath, info.type) as ParseResult<Query> | undefined;
  }

  /**
   * Get a specific receipt by ID.
   */
  getReceipt(receiptId: string): ParseResult<Receipt> | undefined {
    const info = this.artifactPaths.get(receiptId);
    if (!info || info.type !== 'receipt') return undefined;
    return this.getCachedOrParse(receiptId, info.filePath, info.type) as ParseResult<Receipt> | undefined;
  }

  /**
   * Get the parsed EvidenceReview singleton artifact.
   */
  getEvidenceReview(): ParseResult<EvidenceReview> | undefined {
    return this.getArtifactByType<EvidenceReview>('evidenceReview', 'EVIDENCE_REVIEW');
  }

  /**
   * Resolve the absolute path for a parsed artifact by ID.
   */
  getArtifactPath(id: string): string | undefined {
    return this.artifactPaths.get(id)?.filePath;
  }

  /**
   * Get nested case/workstream hunts discovered under the current hunt root.
   */
  getChildHunts(): ChildHuntSummary[] {
    return [...this.childHunts];
  }

  /**
   * Get all receipts linked to a specific query.
   * Uses the receiptToQueries cross-index.
   */
  getReceiptsForQuery(queryId: string): ParseResult<Receipt>[] {
    const results: ParseResult<Receipt>[] = [];
    for (const [receiptId, queryIds] of this.receiptToQueries) {
      if (queryIds.includes(queryId)) {
        const receipt = this.getReceipt(receiptId);
        if (receipt) {
          results.push(receipt);
        }
      }
    }
    return results;
  }

  /**
   * Get all receipts linked to a specific hypothesis.
   * Uses the receiptToHypotheses cross-index.
   */
  getReceiptsForHypothesis(hypothesisId: string): ParseResult<Receipt>[] {
    const results: ParseResult<Receipt>[] = [];
    for (const [receiptId, hypIds] of this.receiptToHypotheses) {
      if (hypIds.includes(hypothesisId)) {
        const receipt = this.getReceipt(receiptId);
        if (receipt) {
          results.push(receipt);
        }
      }
    }
    return results;
  }

  /**
   * Get all queries linked to a specific phase.
   * Uses the queryToPhase cross-index.
   */
  getQueriesForPhase(phaseNumber: number): ParseResult<Query>[] {
    const results: ParseResult<Query>[] = [];
    for (const [queryId, phase] of this.queryToPhase) {
      if (phase === phaseNumber) {
        const query = this.getQuery(queryId);
        if (query) {
          results.push(query);
        }
      }
    }
    return results;
  }

  /**
   * Expose body cache size for testing.
   */
  bodyCacheSize(): number {
    return this._bodyCache.size;
  }

  /**
   * Expose frontmatter cache size for testing.
   */
  frontmatterCacheSize(): number {
    return this._frontmatterCache.size;
  }

  // ---------------------------------------------------------------------------
  // ViewModel derivation
  // ---------------------------------------------------------------------------

  /**
   * Derive a complete HuntOverviewViewModel from current store state.
   * The panel host calls this on init, store change, and diagnostics change.
   */
  deriveHuntOverview(
    diagnosticsHealth: { warnings: number; errors: number },
    sessionDiff: SessionDiff | null
  ): HuntOverviewViewModel {
    const hunt = this.getHunt();

    if (!hunt) {
      return {
        mission: null,
        childHunts: [],
        phases: [],
        currentPhase: 0,
        verdicts: { supported: 0, disproved: 0, inconclusive: 0, open: 0 },
        evidence: { receipts: 0, queries: 0, templates: 0 },
        confidence: 'Unknown',
        blockers: [],
        diagnosticsHealth,
        activityFeed: sessionDiff ? sessionDiff.entries : [],
        sessionDiff,
        sessionContinuity: {
          lastActivity: 'Unknown',
          currentPosition: 'No hunt detected',
          changesSummary: sessionDiff?.summary ?? 'No changes since last session',
          suggestedAction: 'Open a workspace with hunt artifacts',
          hasChanges: sessionDiff !== null && sessionDiff.entries.length > 0,
        },
      };
    }

    // Mission
    const mission =
      hunt.mission.status === 'loaded'
        ? {
            signal: hunt.mission.data.signal,
            owner: hunt.mission.data.owner,
            opened: hunt.mission.data.opened,
            mode: hunt.mission.data.mode,
            focus: hunt.mission.data.scope,
          }
        : null;

    const childHunts =
      typeof this.getChildHunts === 'function'
        ? this.getChildHunts().map((child) => ({
            id: child.id,
            name: child.name,
            kind: child.kind,
            signal: child.signal,
            status: child.status,
            currentPhase: child.currentPhase,
            totalPhases: child.totalPhases,
            phaseName: child.phaseName,
            lastActivity: child.lastActivity,
            findingsPublished: child.findingsPublished,
          }))
        : [];

    // Phases
    const phases =
      hunt.huntMap.status === 'loaded'
        ? hunt.huntMap.data.phases.map((p) => ({
            number: p.number,
            name: p.name,
            status: p.status,
          }))
        : [];

    // Current phase
    const currentPhase =
      hunt.state.status === 'loaded' ? hunt.state.data.phase : 0;

    // Verdicts
    const verdicts = { supported: 0, disproved: 0, inconclusive: 0, open: 0 };
    if (hunt.hypotheses.status === 'loaded') {
      const allHypotheses = [
        ...hunt.hypotheses.data.active,
        ...hunt.hypotheses.data.parked,
        ...hunt.hypotheses.data.disproved,
      ];
      for (const h of allHypotheses) {
        const s = h.status.toLowerCase();
        if (s === 'supported') {
          verdicts.supported += 1;
        } else if (s === 'disproved') {
          verdicts.disproved += 1;
        } else if (s === 'inconclusive') {
          verdicts.inconclusive += 1;
        } else {
          verdicts.open += 1;
        }
      }
    }

    // Evidence counts
    const queries = this.getQueries();
    const receipts = this.getReceipts();
    let totalTemplates = 0;
    for (const [, result] of queries) {
      if (result.status === 'loaded') {
        totalTemplates += result.data.templateCount;
      }
    }
    const evidence = {
      receipts: receipts.size,
      queries: queries.size,
      templates: totalTemplates,
    };

    // Confidence
    const confidence =
      hunt.state.status === 'loaded' ? hunt.state.data.confidence : 'Unknown';

    // Blockers
    let blockers: Array<{ text: string; timestamp: string }> = [];
    if (hunt.state.status === 'loaded' && hunt.state.data.blockers) {
      const lastActivity = hunt.state.data.lastActivity;
      blockers = hunt.state.data.blockers
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((text) => ({ text, timestamp: lastActivity }));
    }

    // Session continuity summary
    const lastActivity = hunt.state.status === 'loaded'
      ? hunt.state.data.lastActivity
      : 'Unknown';
    const currentPosition = hunt.state.status === 'loaded'
      ? `Phase ${hunt.state.data.phase} of ${hunt.state.data.totalPhases}, Plan ${hunt.state.data.planInPhase} of ${hunt.state.data.totalPlansInPhase}`
      : 'Unknown position';
    const hasChanges = sessionDiff !== null && sessionDiff.entries.length > 0;
    const changesSummary = sessionDiff?.summary ?? 'No changes since last session';

    let suggestedAction: string;
    if (hasChanges && sessionDiff && sessionDiff.entries.length >= 3) {
      suggestedAction = `Review ${sessionDiff.entries.length} changed artifacts`;
    } else if (hunt.state.status === 'loaded') {
      const stateData = hunt.state.data;
      const phaseName = phases.find(p => p.number === stateData.phase)?.name ?? '';
      suggestedAction = `Continue Phase ${stateData.phase}${phaseName ? `: ${phaseName}` : ''}`;
    } else {
      suggestedAction = 'Open the sidebar to explore artifacts';
    }

    const sessionContinuity: SessionContinuitySummary = {
      lastActivity,
      currentPosition,
      changesSummary,
      suggestedAction,
      hasChanges,
    };

    return {
      mission,
      childHunts,
      phases,
      currentPhase,
      verdicts,
      evidence,
      confidence,
      blockers,
      diagnosticsHealth,
      activityFeed: sessionDiff ? sessionDiff.entries : [],
      sessionDiff,
      sessionContinuity,
    };
  }

  /**
   * Derive a complete EvidenceBoardViewModel from current store state.
   * Builds the graph (nodes + edges), matrix cells, and blind spots.
   */
  deriveEvidenceBoard(): EvidenceBoardViewModel {
    const nodes: EvidenceBoardNode[] = [];
    const edges: EvidenceBoardEdge[] = [];
    const hypothesisIds: string[] = [];
    const receiptIds: string[] = [];

    // 1. Hypothesis nodes (tier 0)
    const hunt = this.getHunt();
    if (hunt && hunt.hypotheses.status === 'loaded') {
      const allHypotheses = [
        ...hunt.hypotheses.data.active,
        ...hunt.hypotheses.data.parked,
        ...hunt.hypotheses.data.disproved,
      ];
      for (const h of allHypotheses) {
        const label =
          h.assertion.length > 80
            ? h.assertion.slice(0, 80) + '...'
            : h.assertion;
        nodes.push({
          id: h.id,
          type: 'hypothesis',
          label,
          tier: 0,
          verdict: h.status,
          confidence: h.confidence,
        });
        hypothesisIds.push(h.id);
      }
    }

    // 2. Receipt nodes (tier 1) + edges from receipts
    const receipts = this.getReceipts();
    for (const [, result] of receipts) {
      if (result.status !== 'loaded') continue;
      const r = result.data;
      const label =
        r.claim.length > 80 ? r.claim.slice(0, 80) + '...' : r.claim;
      nodes.push({
        id: r.receiptId,
        type: 'receipt',
        label,
        tier: 1,
        verdict: r.claimStatus,
        confidence: r.confidence,
        deviationScore:
          r.anomalyFrame?.deviationScore.totalScore ?? undefined,
      });
      receiptIds.push(r.receiptId);

      // Edges: receipt -> hypothesis
      if (r.relatedHypotheses) {
        for (const hypId of r.relatedHypotheses) {
          let relationship: 'supports' | 'contradicts' | 'context';
          if (r.claimStatus === 'supports') {
            relationship = 'supports';
          } else if (r.claimStatus === 'contradicts') {
            relationship = 'contradicts';
          } else {
            relationship = 'context';
          }
          edges.push({
            source: r.receiptId,
            target: hypId,
            relationship,
          });
        }
      }

      // Edges: query -> receipt
      if (r.relatedQueries) {
        for (const qryId of r.relatedQueries) {
          edges.push({
            source: qryId,
            target: r.receiptId,
            relationship: 'context',
          });
        }
      }
    }

    // 3. Query nodes (tier 2)
    const queries = this.getQueries();
    for (const [, result] of queries) {
      if (result.status !== 'loaded') continue;
      const q = result.data;
      const label =
        q.title.length > 80 ? q.title.slice(0, 80) + '...' : q.title;
      nodes.push({
        id: q.queryId,
        type: 'query',
        label,
        tier: 2,
      });
    }

    // 4. Build receipt->hypothesis edge lookup for matrix
    const edgeLookup = new Map<string, EvidenceBoardEdge>();
    for (const edge of edges) {
      // Only receipt->hypothesis edges matter for matrix
      if (
        receiptIds.includes(edge.source) &&
        hypothesisIds.includes(edge.target)
      ) {
        edgeLookup.set(`${edge.target}:${edge.source}`, edge);
      }
    }

    // 5. Build matrixCells for every hypothesis x receipt pair
    const matrixCells: EvidenceBoardMatrixCell[] = [];
    for (const hypId of hypothesisIds) {
      for (const rctId of receiptIds) {
        const edge = edgeLookup.get(`${hypId}:${rctId}`);
        if (edge) {
          // Find the receipt's deviationScore
          const rctResult = receipts.get(rctId);
          const devScore =
            rctResult?.status === 'loaded'
              ? rctResult.data.anomalyFrame?.deviationScore.totalScore ?? null
              : null;
          matrixCells.push({
            hypothesisId: hypId,
            receiptId: rctId,
            relationship: edge.relationship,
            deviationScore: devScore,
          });
        } else {
          matrixCells.push({
            hypothesisId: hypId,
            receiptId: rctId,
            relationship: 'absent',
            deviationScore: null,
          });
        }
      }
    }

    // 6. Extract blindSpots from EvidenceReview
    let blindSpots: string[] = [];
    const evReview = this.getEvidenceReview();
    if (
      evReview &&
      evReview.status === 'loaded' &&
      evReview.data.blindSpots &&
      evReview.data.blindSpots.length > 0
    ) {
      blindSpots = evReview.data.blindSpots
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    }

    return {
      nodes,
      edges,
      matrixCells,
      hypothesisIds,
      receiptIds,
      blindSpots,
    };
  }

  /**
   * Derive a complete QueryAnalysisViewModel from current store state.
   * Builds comparison (2 queries), heatmap (3+ queries), sort controls,
   * and receipt inspector data.
   */
  deriveQueryAnalysis(
    selectedQueryIds: string[],
    sortBy: string,
    inspectorReceiptId: string | null,
    mode?: QueryAnalysisMode
  ): QueryAnalysisViewModel {
    // 1. Build queries array from store
    const allQueries = this.getQueries();
    const queries: QueryAnalysisQuery[] = [];
    for (const [, result] of allQueries) {
      if (result.status !== 'loaded') continue;
      const q = result.data;
      queries.push({
        queryId: q.queryId,
        title: q.title ?? q.queryId,
        templates: q.templates.map((t) => ({
          templateId: t.templateId,
          template: t.template,
          count: t.count,
          percentage: t.percentage,
        })),
        eventCount: q.eventCount,
        templateCount: q.templateCount,
        executedAt: q.executedAt ?? '',
      });
    }
    queries.sort((left, right) => left.queryId.localeCompare(right.queryId));

    // Resolve selected query data
    const selectedQueries = selectedQueryIds
      .map((id) => {
        const result = allQueries.get(id);
        return result?.status === 'loaded' ? result.data : undefined;
      })
      .filter((q): q is Query => q !== undefined);
    const queryTimestamps = new Map(
      selectedQueries.map((query) => [
        query.queryId,
        Number.isNaN(Date.parse(query.executedAt))
          ? Number.NEGATIVE_INFINITY
          : Date.parse(query.executedAt),
      ])
    );
    const queryDeviationScores = new Map(
      selectedQueries.map((query) => {
        const maxDeviation = this.getReceiptsForQuery(query.queryId)
          .filter((receipt): receipt is ParseResult<Receipt> & { status: 'loaded' } => receipt.status === 'loaded')
          .reduce(
            (maxScore, receipt) =>
              Math.max(
                maxScore,
                receipt.data.anomalyFrame?.deviationScore.totalScore ?? Number.NEGATIVE_INFINITY
              ),
            Number.NEGATIVE_INFINITY
          );
        return [query.queryId, maxDeviation];
      })
    );

    const compareDescending = (left: number, right: number): number => right - left;

    const resolvedMode: QueryAnalysisMode =
      mode ??
      (inspectorReceiptId
        ? 'inspector'
        : selectedQueryIds.length >= 3
          ? 'heatmap'
          : 'comparison');

    // 2. Build comparison for exactly 2 selected queries
    let comparison: ComparisonData | null = null;
    if (resolvedMode === 'comparison' && selectedQueries.length === 2) {
      const [qA, qB] = selectedQueries;
      const templateMapA = new Map(qA.templates.map((t) => [t.templateId, t]));
      const templateMapB = new Map(qB.templates.map((t) => [t.templateId, t]));
      const allTemplateIds = new Set([...templateMapA.keys(), ...templateMapB.keys()]);

      const comparisonTemplates: ComparisonTemplate[] = [];
      for (const tid of allTemplateIds) {
        const tA = templateMapA.get(tid);
        const tB = templateMapB.get(tid);
        let presence: 'both' | 'a-only' | 'b-only';
        if (tA && tB) {
          presence = 'both';
        } else if (tA) {
          presence = 'a-only';
        } else {
          presence = 'b-only';
        }
        comparisonTemplates.push({
          templateId: tid,
          template: (tA ?? tB)!.template,
          countA: tA?.count ?? 0,
          percentageA: tA?.percentage ?? 0,
          countB: tB?.count ?? 0,
          percentageB: tB?.percentage ?? 0,
          presence,
        });
      }

      // Sort comparison templates inline (avoid private method call for prototype.call() testing)
      if (sortBy === 'count') {
        comparisonTemplates.sort((a, b) => (b.countA + b.countB) - (a.countA + a.countB));
      } else if (sortBy === 'deviation') {
        comparisonTemplates.sort((a, b) => {
          const aDeviation = Math.max(
            a.countA > 0
              ? (queryDeviationScores.get(qA.queryId) ?? Number.NEGATIVE_INFINITY)
              : Number.NEGATIVE_INFINITY,
            a.countB > 0
              ? (queryDeviationScores.get(qB.queryId) ?? Number.NEGATIVE_INFINITY)
              : Number.NEGATIVE_INFINITY
          );
          const bDeviation = Math.max(
            b.countA > 0
              ? (queryDeviationScores.get(qA.queryId) ?? Number.NEGATIVE_INFINITY)
              : Number.NEGATIVE_INFINITY,
            b.countB > 0
              ? (queryDeviationScores.get(qB.queryId) ?? Number.NEGATIVE_INFINITY)
              : Number.NEGATIVE_INFINITY
          );
          if (aDeviation !== bDeviation) {
            return compareDescending(aDeviation, bDeviation);
          }
          return (b.countA + b.countB) - (a.countA + a.countB);
        });
      } else if (sortBy === 'novelty') {
        comparisonTemplates.sort((a, b) => {
          const aPresence = a.presence === 'both' ? 2 : 1;
          const bPresence = b.presence === 'both' ? 2 : 1;
          if (aPresence !== bPresence) return aPresence - bPresence;
          return (b.countA + b.countB) - (a.countA + a.countB);
        });
      } else if (sortBy === 'recency') {
        comparisonTemplates.sort((a, b) => {
          const aRecency = Math.max(
            a.countA > 0
              ? (queryTimestamps.get(qA.queryId) ?? Number.NEGATIVE_INFINITY)
              : Number.NEGATIVE_INFINITY,
            a.countB > 0
              ? (queryTimestamps.get(qB.queryId) ?? Number.NEGATIVE_INFINITY)
              : Number.NEGATIVE_INFINITY
          );
          const bRecency = Math.max(
            b.countA > 0
              ? (queryTimestamps.get(qA.queryId) ?? Number.NEGATIVE_INFINITY)
              : Number.NEGATIVE_INFINITY,
            b.countB > 0
              ? (queryTimestamps.get(qB.queryId) ?? Number.NEGATIVE_INFINITY)
              : Number.NEGATIVE_INFINITY
          );
          if (aRecency !== bRecency) {
            return compareDescending(aRecency, bRecency);
          }
          return (b.countA + b.countB) - (a.countA + a.countB);
        });
      } else {
        comparisonTemplates.sort((a, b) => (b.countA + b.countB) - (a.countA + a.countB));
      }

      comparison = {
        queryA: { queryId: qA.queryId, title: qA.title ?? qA.queryId, eventCount: qA.eventCount },
        queryB: { queryId: qB.queryId, title: qB.title ?? qB.queryId, eventCount: qB.eventCount },
        templates: comparisonTemplates,
      };
    }

    // 3. Build heatmap for 3+ selected queries
    let heatmap: HeatmapData | null = null;
    if (resolvedMode === 'heatmap' && selectedQueries.length >= 3) {
      const queryIds = selectedQueries.map((q) => q.queryId);
      const queryTitles = selectedQueries.map((q) => q.title ?? q.queryId);

      // Collect all unique templates across selected queries
      const allTemplateIds = new Set<string>();
      const templateTextMap = new Map<string, string>();
      for (const q of selectedQueries) {
        for (const t of q.templates) {
          allTemplateIds.add(t.templateId);
          if (!templateTextMap.has(t.templateId)) {
            templateTextMap.set(t.templateId, t.template);
          }
        }
      }

      // Build template lookup per query
      const queryTemplateMaps = selectedQueries.map(
        (q) => new Map(q.templates.map((t) => [t.templateId, t]))
      );

      const rows: HeatmapRow[] = [];
      for (const tid of allTemplateIds) {
        const cells: HeatmapCell[] = selectedQueries.map((q, idx) => ({
          queryId: q.queryId,
          count: queryTemplateMaps[idx].get(tid)?.count ?? 0,
        }));
        const totalCount = cells.reduce((sum, c) => sum + c.count, 0);
        rows.push({
          templateId: tid,
          template: templateTextMap.get(tid) ?? tid,
          cells,
          totalCount,
        });
      }

      // Sort heatmap rows
      if (sortBy === 'count') {
        rows.sort((a, b) => b.totalCount - a.totalCount);
      } else if (sortBy === 'deviation') {
        rows.sort((a, b) => {
          const aDeviation = a.cells.reduce(
            (maxScore, cell) =>
              cell.count > 0
                ? Math.max(
                    maxScore,
                    queryDeviationScores.get(cell.queryId) ?? Number.NEGATIVE_INFINITY
                  )
                : maxScore,
            Number.NEGATIVE_INFINITY
          );
          const bDeviation = b.cells.reduce(
            (maxScore, cell) =>
              cell.count > 0
                ? Math.max(
                    maxScore,
                    queryDeviationScores.get(cell.queryId) ?? Number.NEGATIVE_INFINITY
                  )
                : maxScore,
            Number.NEGATIVE_INFINITY
          );
          if (aDeviation !== bDeviation) {
            return compareDescending(aDeviation, bDeviation);
          }
          return b.totalCount - a.totalCount;
        });
      } else if (sortBy === 'novelty') {
        // Templates appearing in fewer queries first
        rows.sort((a, b) => {
          const aNonZero = a.cells.filter((c) => c.count > 0).length;
          const bNonZero = b.cells.filter((c) => c.count > 0).length;
          if (aNonZero !== bNonZero) return aNonZero - bNonZero;
          return b.totalCount - a.totalCount;
        });
      } else if (sortBy === 'recency') {
        rows.sort((a, b) => {
          const aRecency = a.cells.reduce(
            (maxTimestamp, cell) =>
              cell.count > 0
                ? Math.max(
                    maxTimestamp,
                    queryTimestamps.get(cell.queryId) ?? Number.NEGATIVE_INFINITY
                  )
                : maxTimestamp,
            Number.NEGATIVE_INFINITY
          );
          const bRecency = b.cells.reduce(
            (maxTimestamp, cell) =>
              cell.count > 0
                ? Math.max(
                    maxTimestamp,
                    queryTimestamps.get(cell.queryId) ?? Number.NEGATIVE_INFINITY
                  )
                : maxTimestamp,
            Number.NEGATIVE_INFINITY
          );
          if (aRecency !== bRecency) {
            return compareDescending(aRecency, bRecency);
          }
          return b.totalCount - a.totalCount;
        });
      } else {
        // Default sort by count for other modes
        rows.sort((a, b) => b.totalCount - a.totalCount);
      }

      heatmap = { queryIds, queryTitles, rows };
    }

    // 4. Build availableSorts
    const allReceipts = this.getReceipts();
    let hasAnomalyFrame = false;
    for (const [, r] of allReceipts) {
      if (r.status === 'loaded' && r.data.anomalyFrame) {
        hasAnomalyFrame = true;
        break;
      }
    }
    const hasMultipleQueries = selectedQueries.length >= 2;
    const hasTimestamps = selectedQueries.some(
      (q) => q.executedAt && q.executedAt.length > 0
    );

    const availableSorts = [
      { key: 'count', available: true, tooltip: 'Sort by template event count' },
      {
        key: 'deviation',
        available: hasAnomalyFrame,
        tooltip: hasAnomalyFrame
          ? 'Sort by deviation score'
          : 'Requires receipts with anomaly framing',
      },
      {
        key: 'novelty',
        available: hasMultipleQueries,
        tooltip: hasMultipleQueries
          ? 'Sort by template uniqueness'
          : 'Requires 2+ selected queries',
      },
      {
        key: 'recency',
        available: hasTimestamps,
        tooltip: hasTimestamps
          ? 'Sort by query execution time'
          : 'Requires timestamp data',
      },
    ];

    // 5. Build receipt inspector if inspectorReceiptId is set
    let receiptInspector: ReceiptInspectorData | null = null;
    if (resolvedMode === 'inspector') {
      const receipts: ReceiptInspectorItem[] = [];
      for (const [, result] of allReceipts) {
        if (result.status !== 'loaded') continue;
        const r = result.data;
        const af = r.anomalyFrame;
        const diagnostics = checkReceiptStructured(r);
        receipts.push({
          receiptId: r.receiptId,
          claim: r.claim,
          claimStatus: r.claimStatus,
          confidence: r.confidence,
          relatedQueries: r.relatedQueries ?? [],
          relatedHypotheses: r.relatedHypotheses ?? [],
          hasAnomalyFrame: af !== null,
          deviationScore: af?.deviationScore.totalScore ?? null,
          deviationCategory: af?.deviationScore.category ?? null,
          baseScore: af?.deviationScore.baseScore ?? null,
          modifiers: af?.deviationScore.modifiers ?? [],
          baseline: af?.baseline ?? null,
          prediction: af?.prediction ?? null,
          observation: af?.observation ?? null,
          attackMapping: af?.attackMapping ?? [],
          diagnostics,
          diagnosticCounts: summarizeIntegrityCounts(diagnostics),
        });
      }

      receipts.sort((left, right) => {
        const scoreDelta =
          (right.deviationScore ?? -1) - (left.deviationScore ?? -1);
        if (scoreDelta !== 0) {
          return scoreDelta;
        }
        return left.receiptId.localeCompare(right.receiptId);
      });

      const selectedReceipt =
        inspectorReceiptId &&
        receipts.some((receipt) => receipt.receiptId === inspectorReceiptId)
          ? inspectorReceiptId
          : receipts[0]?.receiptId ?? null;

      receiptInspector = {
        receipts,
        selectedReceiptId: selectedReceipt,
      };
    }

    return {
      queries,
      selectedQueryIds,
      mode: resolvedMode,
      sortBy: (sortBy as QueryAnalysisViewModel['sortBy']) ?? 'count',
      comparison,
      heatmap,
      receiptInspector,
      availableSorts,
    };
  }

  // ---------------------------------------------------------------------------
  // Program Dashboard
  // ---------------------------------------------------------------------------

  /**
   * Derive a ProgramDashboardViewModel from child hunts and mission data.
   * Called by ProgramDashboardPanel on init, store change, etc.
   */
  deriveProgramDashboard(): ProgramDashboardViewModel {
    const hunt = this.getHunt();
    const childHunts = typeof this.getChildHunts === 'function' ? this.getChildHunts() : [];

    const programName = hunt?.mission.status === 'loaded' ? hunt.mission.data.signal : 'Program';
    const missionSnippet = hunt?.mission.status === 'loaded'
      ? (hunt.mission.data.scope || hunt.mission.data.signal)
      : '';

    const STALE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const cases: CaseCard[] = childHunts.map((child) => {
      const lowerStatus = child.status.toLowerCase();
      const isClosed = lowerStatus === 'closed' || lowerStatus === 'complete';
      const lastActivityMs = parseDashboardDateMs(child.lastActivity)
        ?? parseDashboardDateMs(child.opened);
      const isStale = !isClosed
        && lastActivityMs !== null
        && (now - lastActivityMs > STALE_THRESHOLD_MS);

      let status: CaseCard['status'];
      if (isClosed) {
        status = 'closed';
      } else if (isStale) {
        status = 'stale';
      } else {
        status = 'active';
      }

      return {
        id: child.id,
        slug: child.name,
        name: child.name,
        kind: child.kind,
        status,
        openedAt: child.opened,
        closedAt: isClosed ? child.lastActivity : null,
        techniqueCount: child.techniqueIds.length,
        signal: child.signal,
        currentPhase: child.currentPhase,
        totalPhases: child.totalPhases,
        phaseName: child.phaseName,
        lastActivity: child.lastActivity,
        findingsPublished: child.findingsPublished,
      };
    });

    const active = cases.filter((c) => c.status === 'active').length;
    const closed = cases.filter((c) => c.status === 'closed').length;
    const stale = cases.filter((c) => c.status === 'stale').length;

    const allTechniques = new Set<string>();
    for (const child of childHunts) {
      for (const tid of child.techniqueIds) {
        allTechniques.add(tid);
      }
    }

    const timeline = [...childHunts]
      .filter((child) => child.opened)
      .sort((a, b) => new Date(a.opened).getTime() - new Date(b.opened).getTime())
      .map((child) => ({
        date: child.opened,
        event: `Opened: ${child.name}`,
        slug: child.name,
      }));

    return {
      programName,
      missionSnippet,
      cases,
      aggregates: {
        total: cases.length,
        active,
        closed,
        stale,
        uniqueTechniques: allTechniques.size,
      },
      timeline,
    };
  }

  // ---------------------------------------------------------------------------
  // File change handling
  // ---------------------------------------------------------------------------

  /**
   * Handle incoming file change notification from watcher.
   * Adds paths to pending set and starts/resets batch timer.
   */
  private handleFileChange(paths: string[]): void {
    for (const p of paths) {
      this.pendingPaths.add(p);
    }

    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      this.processBatch();
    }, HuntDataStore.BATCH_WINDOW_MS);
  }

  /**
   * Process all pending file changes as a single batch.
   */
  private async processBatch(): Promise<void> {
    if (this.pendingPaths.size === 0) return;

    // Snapshot and clear pending
    const batch = new Set(this.pendingPaths);
    this.pendingPaths.clear();

    const events: ArtifactChangeEvent[] = [];
    let childHuntChanged = false;

    for (const filePath of batch) {
      if (this.isChildHuntArtifact(filePath)) {
        childHuntChanged = true;
        continue;
      }

      const resolved = resolveArtifactType(filePath);
      if (!resolved) continue;

      const { type, id } = resolved;

      // Try to read the file content
      try {
        const uri = vscode.Uri.file(filePath);
        const rawBytes = await vscode.workspace.fs.readFile(uri);
        const raw = new TextDecoder().decode(rawBytes);

        // Store raw content for on-demand re-parsing
        this._rawCache.set(filePath, raw);

        // Update frontmatter cache
        const fm = extractFrontmatter(raw);
        this._frontmatterCache.set(filePath, fm);

        // Parse and update body cache
        const parsed = parseArtifact(type, raw);
        this.addToBodyCache(filePath, parsed);

        // Update artifact path mapping
        this.artifactPaths.set(id, { filePath, type });

        events.push({
          type: 'artifact:updated',
          artifactType: type,
          id,
          filePath,
        });
      } catch {
        // File not found -- this is a deletion
        this.removeArtifact(filePath, type, id);
        events.push({
          type: 'artifact:deleted',
          artifactType: type,
          id,
          filePath,
        });
      }
    }

    if (childHuntChanged) {
      this.childHunts = await this.discoverChildHunts();
    }

    // Rebuild cross-artifact indexes after batch
    this.rebuildIndexes();

    // Emit events
    for (const event of events) {
      this._onDidChange.fire(event);
    }

    if (childHuntChanged && events.length === 0) {
      this._onDidChange.fire({
        type: 'store:rebuilt',
        artifactType: 'state',
        id: 'STATE',
        filePath: this.huntRoot.fsPath,
      });
    }

    // If more changes accumulated during processing, restart batch timer
    if (this.pendingPaths.size > 0) {
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null;
        this.processBatch();
      }, HuntDataStore.BATCH_WINDOW_MS);
    }
  }

  // ---------------------------------------------------------------------------
  // Initial scan
  // ---------------------------------------------------------------------------

  /**
   * Perform initial scan of the hunt directory to populate all caches.
   */
  private async performInitialScan(): Promise<void> {
    try {
      const files = await this.findAllMarkdownFiles(this.huntRoot);

      for (const filePath of files) {
        if (this.isChildHuntArtifact(filePath)) {
          continue;
        }

        const resolved = resolveArtifactType(filePath);
        if (!resolved) continue;

        const { type, id } = resolved;

        try {
          const uri = vscode.Uri.file(filePath);
          const rawBytes = await vscode.workspace.fs.readFile(uri);
          const raw = new TextDecoder().decode(rawBytes);

          // Store raw content for on-demand re-parsing
          this._rawCache.set(filePath, raw);

          // Update frontmatter cache
          const fm = extractFrontmatter(raw);
          this._frontmatterCache.set(filePath, fm);

          // Parse and update body cache
          const parsed = parseArtifact(type, raw);
          this.addToBodyCache(filePath, parsed);

          // Update artifact path mapping
          this.artifactPaths.set(id, { filePath, type });
        } catch {
          this.outputChannel.appendLine(`[Store] Failed to read artifact: ${filePath}`);
        }
      }

      this.childHunts = await this.discoverChildHunts();

      // Build initial cross-artifact indexes
      this.rebuildIndexes();

      this.outputChannel.appendLine(
        `[Store] Initial scan complete: ${this.artifactPaths.size} artifacts indexed`
      );
    } catch {
      this.outputChannel.appendLine('[Store] Initial scan failed -- hunt directory may not exist');
    }
  }

  /**
   * Recursively find all .md files in a directory.
   * Uses mock-compatible readDirectory or falls back to known artifact paths.
   */
  private async findAllMarkdownFiles(dir: vscode.Uri): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await vscode.workspace.fs.readDirectory(dir);

      if (entries.length === 0) {
        // Empty directory or mock environment -- use fallback probing
        throw new Error('empty directory listing, fallback to probing');
      }

      for (const [name, fileType] of entries) {
        const childUri = vscode.Uri.joinPath(dir, name);
        if (fileType === vscode.FileType.Directory) {
          const subFiles = await this.findAllMarkdownFiles(childUri);
          files.push(...subFiles);
        } else if (name.endsWith('.md')) {
          files.push(childUri.fsPath);
        }
      }
    } catch {
      // readDirectory not available, failed, or empty -- try a generic glob
      // search before falling back to singleton probes.
      const globbed = await this.findMarkdownFilesWithGlob(dir);
      if (globbed.length > 0) {
        return globbed;
      }

      // Last-resort fallback when directory listing and glob search are both
      // unavailable in the current environment.
      const knownPaths = this.getKnownArtifactPaths();
      for (const relPath of knownPaths) {
        const uri = vscode.Uri.joinPath(this.huntRoot, relPath);
        try {
          await vscode.workspace.fs.readFile(uri);
          files.push(uri.fsPath);
        } catch {
          // File doesn't exist, skip
        }
      }
    }

    return files;
  }

  private async findMarkdownFilesWithGlob(dir: vscode.Uri): Promise<string[]> {
    const findFiles = (
      vscode.workspace as typeof vscode.workspace & {
        findFiles?: (pattern: vscode.RelativePattern) => Thenable<vscode.Uri[]>;
      }
    ).findFiles;

    if (typeof findFiles !== 'function') {
      return [];
    }

    try {
      const matches = await findFiles(new vscode.RelativePattern(dir, '**/*.md'));
      return [...new Set(matches.map((match) => match.fsPath))];
    } catch {
      return [];
    }
  }

  /**
   * Return known artifact relative paths for fallback scanning.
   * This probes singleton artifact locations when directory enumeration is
   * unavailable. Query and receipt discovery should happen via glob search.
   */
  private getKnownArtifactPaths(): string[] {
    return [
      'MISSION.md',
      'HYPOTHESES.md',
      'HUNTMAP.md',
      'STATE.md',
      'EVIDENCE_REVIEW.md',
      'FINDINGS.md',
      'published/FINDINGS.md',
    ];
  }

  // ---------------------------------------------------------------------------
  // Cache management
  // ---------------------------------------------------------------------------

  /**
   * Get a parsed artifact from body cache, re-parsing from raw cache on miss.
   * On cache miss, the re-parsed result is returned directly without being
   * added to the body cache (to avoid eviction cascades during bulk access).
   */
  private getCachedOrParse(
    _id: string,
    filePath: string,
    type: ArtifactType
  ): ParseResult<unknown> | undefined {
    const cached = this._bodyCache.get(filePath);
    if (cached) {
      cached.lastAccess = Date.now();
      return cached.result;
    }

    // Body cache miss -- re-parse from raw content cache (on-demand)
    const raw = this._rawCache.get(filePath);
    if (raw) {
      return parseArtifact(type, raw);
    }

    return undefined;
  }

  /**
   * Get a singleton artifact by type and expected ID.
   */
  private getArtifactByType<T>(
    type: ArtifactType,
    id: string
  ): ParseResult<T> | undefined {
    const info = this.artifactPaths.get(id);
    if (!info || info.type !== type) return undefined;
    return this.getCachedOrParse(id, info.filePath, type) as ParseResult<T> | undefined;
  }

  /**
   * Add a parsed result to the body cache with LRU eviction.
   */
  private addToBodyCache(filePath: string, result: ParseResult<unknown>): void {
    // If the path is already in cache, just update it
    if (this._bodyCache.has(filePath)) {
      this._bodyCache.set(filePath, { result, lastAccess: Date.now() });
      return;
    }

    // Evict oldest entries if at capacity
    while (this._bodyCache.size >= HuntDataStore.LRU_MAX) {
      this.evictOldestCacheEntry();
    }

    this._bodyCache.set(filePath, { result, lastAccess: Date.now() });
  }

  /**
   * Evict the least recently used body cache entry.
   */
  private evictOldestCacheEntry(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this._bodyCache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this._bodyCache.delete(oldestKey);
    }
  }

  // ---------------------------------------------------------------------------
  // Index management
  // ---------------------------------------------------------------------------

  /**
   * Rebuild all cross-artifact indexes from current cache state.
   */
  private rebuildIndexes(): void {
    this.receiptToQueries.clear();
    this.receiptToHypotheses.clear();
    this.queryToPhase.clear();

    // Build receipt indexes
    for (const [id, info] of this.artifactPaths) {
      if (info.type !== 'receipt') continue;

      const parsed = this.getCachedOrParse(id, info.filePath, info.type);
      if (!parsed || parsed.status !== 'loaded') continue;

      const receipt = parsed.data as Receipt;
      if (receipt.relatedQueries && receipt.relatedQueries.length > 0) {
        this.receiptToQueries.set(id, [...receipt.relatedQueries]);
      }
      if (receipt.relatedHypotheses && receipt.relatedHypotheses.length > 0) {
        this.receiptToHypotheses.set(id, [...receipt.relatedHypotheses]);
      }
    }

    // Build query-to-phase index from huntmap
    this.buildQueryToPhaseIndex();
  }

  /**
   * Build queryToPhase index from the parsed huntmap.
   *
   * Strategy: Each huntmap phase references plans. We map queries
   * to phases through the receipt chain -- receipts link to queries,
   * and receipts are associated with phases through the huntmap's
   * phase structure. Since phases reference plans (not queries directly),
   * we use a heuristic: map each query to the phase(s) that reference
   * receipts linking to that query.
   */
  private buildQueryToPhaseIndex(): void {
    const huntMap = this.getArtifactByType<HuntMap>('huntmap', 'HUNTMAP');
    if (!huntMap || huntMap.status !== 'loaded') return;

    const phases = huntMap.data.phases;
    const allQueries = this.getQueries();
    for (const [queryId, parsed] of allQueries) {
      if (parsed.status !== 'loaded') {
        continue;
      }

      const phaseNumber = this.mapQueryToPhase(parsed.data, phases);
      if (phaseNumber !== undefined) {
        this.queryToPhase.set(queryId, phaseNumber);
      }
    }
  }

  private mapQueryToPhase(query: Query, phases: HuntPhase[]): number | undefined {
    let bestPhase: HuntPhase | undefined;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const phase of phases) {
      const score = this.scorePhaseForQuery(phase, query);
      if (
        score > bestScore ||
        (score === bestScore && bestPhase && phase.number > bestPhase.number)
      ) {
        bestScore = score;
        bestPhase = phase;
      }
    }

    if (bestPhase && bestScore > 0) {
      return bestPhase.number;
    }

    return this.inferPhaseFromLinkedReceipts(query, phases.length);
  }

  private scorePhaseForQuery(phase: HuntPhase, query: Query): number {
    const queryText = [query.title, query.intent].join(' ');
    const phaseText = [
      phase.name,
      phase.goal,
      phase.dependsOn,
      ...phase.plans,
    ].join(' ');

    const queryTokens = new Set(tokenizeMatchText(queryText));
    const phaseTokens = new Set(tokenizeMatchText(phaseText));
    let score = 0;

    for (const token of queryTokens) {
      if (phaseTokens.has(token)) {
        score += token.length >= 8 ? 3 : 2;
      }
    }

    const normalizedQuery = normalizeMatchText(queryText);
    const normalizedPhase = normalizeMatchText(phaseText);
    const phraseBonuses: Array<[string, string, number]> = [
      ['environment', 'environment', 5],
      ['query path validation', 'validation', 8],
      ['evidence collection', 'evidence collection', 10],
      ['pilot hunt', 'pilot hunt', 8],
      ['publish', 'publish', 8],
      ['findings', 'findings', 6],
      ['correlation', 'correlation', 4],
    ];

    for (const [queryPhrase, phasePhrase, bonus] of phraseBonuses) {
      if (
        normalizedQuery.includes(queryPhrase) &&
        normalizedPhase.includes(phasePhrase)
      ) {
        score += bonus;
      }
    }

    return score;
  }

  private inferPhaseFromLinkedReceipts(
    query: Query,
    phaseCount: number
  ): number | undefined {
    const linkedReceiptIds = new Set<string>(query.relatedReceipts ?? []);

    for (const [receiptId, queryIds] of this.receiptToQueries) {
      if (queryIds.includes(query.queryId)) {
        linkedReceiptIds.add(receiptId);
      }
    }

    for (const receiptId of linkedReceiptIds) {
      const hypIds = this.receiptToHypotheses.get(receiptId);
      if (!hypIds || hypIds.length === 0) {
        continue;
      }

      const hypothesisNumber = parseInt(hypIds[0].replace(/\D/g, ''), 10);
      if (
        !Number.isNaN(hypothesisNumber) &&
        hypothesisNumber >= 1 &&
        hypothesisNumber <= phaseCount
      ) {
        return hypothesisNumber;
      }
    }

    return undefined;
  }

  private getRelativeHuntPath(filePath: string): string | null {
    const normalizedRoot = normalizeFsPath(this.huntRoot.fsPath);
    const normalizedFile = normalizeFsPath(filePath);

    if (normalizedFile === normalizedRoot) {
      return '';
    }

    if (!normalizedFile.startsWith(`${normalizedRoot}/`)) {
      return null;
    }

    return normalizedFile.slice(normalizedRoot.length + 1);
  }

  private parseChildHuntLocation(
    filePath: string
  ): { kind: 'case' | 'workstream'; name: string; relativeRoot: string } | null {
    const relativePath = this.getRelativeHuntPath(filePath);
    if (!relativePath) {
      return null;
    }

    const match = /^(cases|workstreams)\/([^/]+)\/.+$/i.exec(relativePath);
    if (!match) {
      return null;
    }

    return {
      kind: match[1].toLowerCase() === 'cases' ? 'case' : 'workstream',
      name: match[2],
      relativeRoot: `${match[1]}/${match[2]}`,
    };
  }

  private isChildHuntArtifact(filePath: string): boolean {
    return this.parseChildHuntLocation(filePath) !== null;
  }

  private async discoverChildHunts(): Promise<ChildHuntSummary[]> {
    const markdownFiles = await this.findMarkdownFilesWithGlob(this.huntRoot);
    const childRoots = new Map<string, { kind: 'case' | 'workstream'; name: string }>();

    for (const filePath of markdownFiles) {
      if (!/\/MISSION\.md$/i.test(normalizeFsPath(filePath))) {
        continue;
      }

      const location = this.parseChildHuntLocation(filePath);
      if (!location) {
        continue;
      }

      childRoots.set(location.relativeRoot, {
        kind: location.kind,
        name: location.name,
      });
    }

    const results: ChildHuntSummary[] = [];
    for (const [relativeRoot, location] of childRoots) {
      const summary = await this.readChildHuntSummary(relativeRoot, location.kind, location.name);
      if (summary) {
        results.push(summary);
      }
    }

    results.sort((left, right) => left.name.localeCompare(right.name));
    return results;
  }

  private async readChildHuntSummary(
    relativeRoot: string,
    kind: 'case' | 'workstream',
    name: string
  ): Promise<ChildHuntSummary | null> {
    const huntRoot = vscode.Uri.joinPath(this.huntRoot, ...relativeRoot.split('/'));
    const mission = await this.readOptionalArtifact<Mission>(
      vscode.Uri.joinPath(huntRoot, 'MISSION.md'),
      'mission'
    );

    if (mission?.status !== 'loaded') {
      return null;
    }

    const state = await this.readOptionalArtifact<HuntState>(
      vscode.Uri.joinPath(huntRoot, 'STATE.md'),
      'state'
    );
    const huntMap = await this.readOptionalArtifact<HuntMap>(
      vscode.Uri.joinPath(huntRoot, 'HUNTMAP.md'),
      'huntmap'
    );
    const findingsPublished = await this.pathExists(
      vscode.Uri.joinPath(huntRoot, 'published', 'FINDINGS.md')
    );

    const stateData = state?.status === 'loaded' ? state.data : null;
    const huntMapData = huntMap?.status === 'loaded' ? huntMap.data : null;
    const currentPhase = stateData?.phase ?? 0;
    const totalPhases = stateData?.totalPhases ?? huntMapData?.phases.length ?? 0;
    const phaseName =
      huntMapData?.phases.find((phase) => phase.number === currentPhase)?.name ?? '';
    const blockerCount =
      stateData?.blockers
        ?.split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0).length ?? 0;

    // Extract technique_ids from STATE.md frontmatter (written by CLI as YAML array)
    let techniqueIds: string[] = [];
    try {
      const stateUri = vscode.Uri.joinPath(huntRoot, 'STATE.md');
      const stateRaw = new TextDecoder().decode(await vscode.workspace.fs.readFile(stateUri));
      const fm = extractFrontmatter(stateRaw);
      if (Array.isArray(fm.technique_ids)) {
        techniqueIds = fm.technique_ids.filter((id): id is string => typeof id === 'string');
      }
    } catch {
      // STATE.md may not exist or have no technique_ids — that's fine
    }

    return {
      id: `${kind}:${name}`,
      name,
      kind,
      huntRootPath: huntRoot.fsPath,
      missionPath: vscode.Uri.joinPath(huntRoot, 'MISSION.md').fsPath,
      signal: mission.data.signal,
      mode: mission.data.mode,
      status: stateData?.status ?? mission.data.status,
      opened: mission.data.opened,
      owner: mission.data.owner,
      currentPhase,
      totalPhases,
      phaseName,
      lastActivity: stateData?.lastActivity ?? mission.data.opened,
      blockerCount,
      findingsPublished,
      techniqueIds,
    };
  }

  private async readOptionalArtifact<T>(
    uri: vscode.Uri,
    type: ArtifactType
  ): Promise<ParseResult<T> | null> {
    try {
      const rawBytes = await vscode.workspace.fs.readFile(uri);
      const raw = new TextDecoder().decode(rawBytes);
      return parseArtifact(type, raw) as ParseResult<T>;
    } catch {
      return null;
    }
  }

  private async pathExists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove an artifact from all caches and indexes.
   */
  private removeArtifact(filePath: string, _type: ArtifactType, id: string): void {
    this._frontmatterCache.delete(filePath);
    this._rawCache.delete(filePath);
    this._bodyCache.delete(filePath);
    this.artifactPaths.delete(id);

    // Index will be rebuilt in rebuildIndexes() after batch
  }

  // ---------------------------------------------------------------------------
  // Disposal
  // ---------------------------------------------------------------------------

  dispose(): void {
    if (this.batchTimer !== null) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    this.watcherDisposable.dispose();
    this._onDidChange.dispose();
    this._onDidSelect.dispose();

    this._frontmatterCache.clear();
    this._rawCache.clear();
    this._bodyCache.clear();
    this.artifactPaths.clear();
    this.receiptToQueries.clear();
    this.receiptToHypotheses.clear();
    this.queryToPhase.clear();
    this.pendingPaths.clear();
  }
}
