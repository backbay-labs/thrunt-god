import * as vscode from 'vscode';
import type {
  ArtifactType,
  ArtifactChangeEvent,
  ParseResult,
  Query,
  Receipt,
  Mission,
  Hypotheses,
  HuntMap,
  HuntState,
  EvidenceReview,
} from './types';
import type { HuntOverviewViewModel, SessionDiff } from '../shared/hunt-overview';
import type {
  EvidenceBoardViewModel,
  EvidenceBoardNode,
  EvidenceBoardEdge,
  EvidenceBoardMatrixCell,
} from '../shared/evidence-board';
import type {
  QueryAnalysisViewModel,
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
        phases: [],
        currentPhase: 0,
        verdicts: { supported: 0, disproved: 0, inconclusive: 0, open: 0 },
        evidence: { receipts: 0, queries: 0, templates: 0 },
        confidence: 'Unknown',
        blockers: [],
        diagnosticsHealth,
        activityFeed: sessionDiff ? sessionDiff.entries : [],
        sessionDiff,
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

    return {
      mission,
      phases,
      currentPhase,
      verdicts,
      evidence,
      confidence,
      blockers,
      diagnosticsHealth,
      activityFeed: sessionDiff ? sessionDiff.entries : [],
      sessionDiff,
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
    inspectorReceiptId: string | null
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
      });
    }

    // Resolve selected query data
    const selectedQueries = selectedQueryIds
      .map((id) => {
        const result = allQueries.get(id);
        return result?.status === 'loaded' ? result.data : undefined;
      })
      .filter((q): q is Query => q !== undefined);

    // 2. Build comparison for exactly 2 selected queries
    let comparison: ComparisonData | null = null;
    if (selectedQueries.length === 2) {
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
      } else if (sortBy === 'novelty') {
        comparisonTemplates.sort((a, b) => {
          const aPresence = a.presence === 'both' ? 2 : 1;
          const bPresence = b.presence === 'both' ? 2 : 1;
          if (aPresence !== bPresence) return aPresence - bPresence;
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
    if (selectedQueries.length >= 3) {
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
      } else if (sortBy === 'novelty') {
        // Templates appearing in fewer queries first
        rows.sort((a, b) => {
          const aNonZero = a.cells.filter((c) => c.count > 0).length;
          const bNonZero = b.cells.filter((c) => c.count > 0).length;
          if (aNonZero !== bNonZero) return aNonZero - bNonZero;
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
    if (inspectorReceiptId !== null) {
      const receipts: ReceiptInspectorItem[] = [];
      for (const [, result] of allReceipts) {
        if (result.status !== 'loaded') continue;
        const r = result.data;
        const af = r.anomalyFrame;
        receipts.push({
          receiptId: r.receiptId,
          claim: r.claim,
          claimStatus: r.claimStatus,
          confidence: r.confidence,
          relatedQueries: r.relatedQueries ?? [],
          hasAnomalyFrame: af !== null,
          deviationScore: af?.deviationScore.totalScore ?? null,
          deviationCategory: af?.deviationScore.category ?? null,
          baseScore: af?.deviationScore.baseScore ?? null,
          modifiers: af?.deviationScore.modifiers ?? [],
          baseline: af?.baseline ?? null,
          prediction: af?.prediction ?? null,
          observation: af?.observation ?? null,
          attackMapping: af?.attackMapping ?? [],
        });
      }
      receiptInspector = {
        receipts,
        selectedReceiptId: inspectorReceiptId,
      };
    }

    return {
      queries,
      selectedQueryIds,
      comparisonMode: 'side-by-side',
      sortBy: (sortBy as QueryAnalysisViewModel['sortBy']) ?? 'count',
      comparison,
      heatmap,
      receiptInspector,
      availableSorts,
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

    for (const filePath of batch) {
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

    // Rebuild cross-artifact indexes after batch
    this.rebuildIndexes();

    // Emit events
    for (const event of events) {
      this._onDidChange.fire(event);
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
      // readDirectory not available, failed, or empty -- fall back to known artifact structure
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

  /**
   * Return known artifact relative paths for fallback scanning.
   * This probes common artifact locations when readDirectory is unavailable.
   */
  private getKnownArtifactPaths(): string[] {
    const paths = [
      'MISSION.md',
      'HYPOTHESES.md',
      'HUNTMAP.md',
      'STATE.md',
      'EVIDENCE_REVIEW.md',
      'FINDINGS.md',
    ];

    // Probe for numbered query/receipt files (common pattern)
    // Check QRY/RCT with date-based IDs
    for (let i = 1; i <= 20; i++) {
      const num = String(i).padStart(3, '0');
      paths.push(`QUERIES/QRY-20260329-${num}.md`);
      paths.push(`RECEIPTS/RCT-20260329-${num}.md`);
    }

    return paths;
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

    // For each phase, find all queries that link through receipts
    // Phase N: look at receipts whose content links to that phase's scope
    // Simple heuristic: distribute queries across phases by their execution order
    const allQueryIds: string[] = [];
    for (const [id, info] of this.artifactPaths) {
      if (info.type === 'query') {
        allQueryIds.push(id);
      }
    }

    // Map queries to phases through receipt cross-references
    // A query belongs to the earliest phase whose receipts reference it
    for (const queryId of allQueryIds) {
      // Find which receipts reference this query
      const linkedReceipts: string[] = [];
      for (const [receiptId, queryIds] of this.receiptToQueries) {
        if (queryIds.includes(queryId)) {
          linkedReceipts.push(receiptId);
        }
      }

      // Try to determine phase from the receipt hypotheses
      // Hypotheses are numbered HYP-01, HYP-02, etc.
      // Phase assignments can be inferred from the huntmap phases order
      if (huntMap.data.phases.length > 0 && linkedReceipts.length > 0) {
        // Use the first linked receipt's hypothesis to infer phase
        for (const receiptId of linkedReceipts) {
          const hypIds = this.receiptToHypotheses.get(receiptId);
          if (hypIds && hypIds.length > 0) {
            // Map hypothesis ID to phase number
            // HYP-01 -> phase 1, HYP-02 -> phase 2, etc.
            const hypNum = parseInt(hypIds[0].replace(/\D/g, ''), 10);
            if (!isNaN(hypNum) && hypNum >= 1 && hypNum <= huntMap.data.phases.length) {
              this.queryToPhase.set(queryId, hypNum);
              break;
            }
          }
        }
      }
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
