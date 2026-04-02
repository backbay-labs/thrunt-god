import { render } from 'preact';
import { useEffect, useState, useRef, useCallback, useMemo } from 'preact/hooks';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  forceCollide,
} from 'd3-force';
import type {
  Simulation,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from 'd3-force';
import type {
  HostToEvidenceBoardMessage,
  EvidenceBoardToHostMessage,
  EvidenceBoardViewModel,
  EvidenceBoardNode,
  EvidenceBoardEdge,
} from '../../shared/evidence-board';
import { Panel } from '../shared/components';
import { useTheme, useHostMessage, createVsCodeApi } from '../shared/hooks';
import '../shared/tokens.css';

// ---------------------------------------------------------------------------
// VS Code API
// ---------------------------------------------------------------------------

const vscode = createVsCodeApi<unknown, EvidenceBoardToHostMessage>();

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface SimNode extends SimulationNodeDatum {
  id: string;
  type: EvidenceBoardNode['type'];
  label: string;
  tier: number;
  verdict?: string;
  confidence?: string;
  deviationScore?: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  relationship: EvidenceBoardEdge['relationship'];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIER_Y: Record<number, number> = { 0: 80, 1: 280, 2: 480 };
const TIER_LABELS = ['Hypotheses', 'Receipts', 'Queries'];
const SVG_WIDTH = 1100;
const SVG_HEIGHT = 560;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nodeRadius(score?: number): number {
  if (score == null) return 16;
  return 16 + (Math.min(Math.max(score, 0), 6) / 6) * 20; // 16px to 36px
}

function verdictClass(node: EvidenceBoardNode): string {
  const v = (node.verdict ?? '').toLowerCase();
  if (v === 'supported') return 'hunt-eb-node__circle--supported';
  if (v === 'disproved' || v === 'contradicts') return 'hunt-eb-node__circle--contradicts';
  if (v === 'inconclusive') return 'hunt-eb-node__circle--inconclusive';
  if (v === 'supports') return 'hunt-eb-node__circle--supported';
  return 'hunt-eb-node__circle--open';
}

function edgeClass(relationship: EvidenceBoardEdge['relationship']): string {
  return `hunt-eb-edge hunt-eb-edge--${relationship}`;
}

function edgeKey(source: string, target: string): string {
  return `${source}->${target}`;
}

function truncateLabel(label: string, maxLen = 20): string {
  return label.length > maxLen ? label.slice(0, maxLen) + '...' : label;
}

// ---------------------------------------------------------------------------
// Custom Hook: useForceSimulation
// ---------------------------------------------------------------------------

function useForceSimulation(
  vmNodes: EvidenceBoardNode[],
  vmEdges: EvidenceBoardEdge[],
): { positions: Map<string, { x: number; y: number }>; ready: boolean } {
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [ready, setReady] = useState(false);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);

  useEffect(() => {
    if (vmNodes.length === 0) {
      setReady(true);
      return;
    }

    // Stop any existing simulation
    simRef.current?.stop();

    // Create simulation nodes with initial x spread within tier
    const simNodes: SimNode[] = vmNodes.map((n, i) => ({
      ...n,
      x: SVG_WIDTH / 2 + ((i % 5) - 2) * 80,
      y: TIER_Y[n.tier] ?? 280,
    }));

    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
    const simLinks: SimLink[] = vmEdges
      .filter((e) => nodeMap.has(e.source) && nodeMap.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        relationship: e.relationship,
      }));

    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(120)
          .strength(0.3),
      )
      .force('charge', forceManyBody().strength(-200))
      .force('x', forceX(SVG_WIDTH / 2).strength(0.05))
      .force(
        'y',
        forceY<SimNode>((d) => TIER_Y[d.tier] ?? 280).strength(0.8),
      )
      .force(
        'collide',
        forceCollide<SimNode>((d) => nodeRadius(d.deviationScore) + 8),
      )
      .alphaDecay(0.03)
      .on('tick', () => {
        const next = new Map<string, { x: number; y: number }>();
        for (const n of simNodes) {
          next.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
        }
        setPositions(next);
      })
      .on('end', () => setReady(true));

    simRef.current = sim;

    // Run 120 ticks synchronously for instant layout, then let it settle
    sim.tick(120);
    const settled = new Map<string, { x: number; y: number }>();
    for (const n of simNodes) {
      settled.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
    }
    setPositions(settled);
    setReady(true);

    return () => {
      sim.stop();
    };
  }, [vmNodes, vmEdges]);

  return { positions, ready };
}

// ---------------------------------------------------------------------------
// Component: Tooltip
// ---------------------------------------------------------------------------

function Tooltip({
  node,
  x,
  y,
}: {
  node: EvidenceBoardNode | null;
  x: number;
  y: number;
}) {
  if (!node) return null;
  return (
    <div class="hunt-eb-tooltip" style={{ left: `${x + 12}px`, top: `${y - 10}px` }}>
      <div class="hunt-eb-tooltip__id">{node.id}</div>
      <div class="hunt-eb-tooltip__row">
        <span class="hunt-eb-tooltip__label">Type</span> {node.type}
      </div>
      {node.verdict && (
        <div class="hunt-eb-tooltip__row">
          <span class="hunt-eb-tooltip__label">Verdict</span> {node.verdict}
        </div>
      )}
      {node.confidence && (
        <div class="hunt-eb-tooltip__row">
          <span class="hunt-eb-tooltip__label">Confidence</span> {node.confidence}
        </div>
      )}
      {node.deviationScore != null && (
        <div class="hunt-eb-tooltip__row">
          <span class="hunt-eb-tooltip__label">Deviation</span> {node.deviationScore}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Focus / trace helpers
// ---------------------------------------------------------------------------

/**
 * Compute the set of node IDs connected to a focused hypothesis.
 * Connected means: the hypothesis itself, any receipt connected via an edge,
 * and any query connected to one of those receipts.
 */
function computeConnectedSet(
  hypothesisId: string,
  nodes: EvidenceBoardNode[],
  edges: EvidenceBoardEdge[],
): Set<string> {
  const connected = new Set<string>();
  connected.add(hypothesisId);

  // Find all receipts directly linked to this hypothesis
  const receiptIds = new Set<string>();
  for (const e of edges) {
    if (e.source === hypothesisId || e.target === hypothesisId) {
      const other = e.source === hypothesisId ? e.target : e.source;
      const otherNode = nodes.find((n) => n.id === other);
      if (otherNode && otherNode.type === 'receipt') {
        receiptIds.add(other);
        connected.add(other);
      }
    }
  }

  // Find all queries linked to those receipts
  for (const e of edges) {
    for (const rctId of receiptIds) {
      if (e.source === rctId || e.target === rctId) {
        const other = e.source === rctId ? e.target : e.source;
        const otherNode = nodes.find((n) => n.id === other);
        if (otherNode && otherNode.type === 'query') {
          connected.add(other);
        }
      }
    }
  }

  return connected;
}

/**
 * Compute the set of edge keys for edges in the connected chain of a hypothesis.
 */
function computeConnectedEdges(
  hypothesisId: string,
  connectedNodes: Set<string>,
  edges: EvidenceBoardEdge[],
): Set<string> {
  const connectedEdges = new Set<string>();
  for (const e of edges) {
    if (connectedNodes.has(e.source) && connectedNodes.has(e.target)) {
      // At least one end must be related to the hypothesis chain
      if (e.source === hypothesisId || e.target === hypothesisId || connectedNodes.has(e.source)) {
        connectedEdges.add(edgeKey(e.source, e.target));
      }
    }
  }
  return connectedEdges;
}

/**
 * Compute the trace chain: all edges reachable from a hypothesis via BFS.
 */
function computeTraceChain(
  hypothesisId: string,
  edges: EvidenceBoardEdge[],
): Set<string> {
  const visited = new Set<string>();
  const traceEdges = new Set<string>();
  const queue = [hypothesisId];
  visited.add(hypothesisId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const e of edges) {
      if (e.source === current && !visited.has(e.target)) {
        visited.add(e.target);
        queue.push(e.target);
        traceEdges.add(edgeKey(e.source, e.target));
      }
      if (e.target === current && !visited.has(e.source)) {
        visited.add(e.source);
        queue.push(e.source);
        traceEdges.add(edgeKey(e.source, e.target));
      }
    }
  }

  return traceEdges;
}

// ---------------------------------------------------------------------------
// Component: GraphView
// ---------------------------------------------------------------------------

function GraphView({
  viewModel,
  focusedHypothesis,
  tracedChain,
  onNodeClick,
  onNodeHover,
  onNodeHoverEnd,
  onHypothesisFocus,
  onTraceToggle,
}: {
  viewModel: EvidenceBoardViewModel;
  focusedHypothesis: string | null;
  tracedChain: Set<string>;
  onNodeClick: (nodeId: string) => void;
  onNodeHover: (node: EvidenceBoardNode, x: number, y: number) => void;
  onNodeHoverEnd: () => void;
  onHypothesisFocus: (hypothesisId: string | null) => void;
  onTraceToggle: (hypothesisId: string) => void;
}) {
  const { positions, ready } = useForceSimulation(viewModel.nodes, viewModel.edges);

  // Compute connected set for focus dimming
  const connectedNodes = useMemo(() => {
    if (!focusedHypothesis) return null;
    return computeConnectedSet(focusedHypothesis, viewModel.nodes, viewModel.edges);
  }, [focusedHypothesis, viewModel.nodes, viewModel.edges]);

  const connectedEdges = useMemo(() => {
    if (!focusedHypothesis || !connectedNodes) return null;
    return computeConnectedEdges(focusedHypothesis, connectedNodes, viewModel.edges);
  }, [focusedHypothesis, connectedNodes, viewModel.edges]);

  const svgRef = useRef<SVGSVGElement>(null);

  const handleNodeClick = useCallback(
    (e: MouseEvent, nodeId: string) => {
      if (e.shiftKey) {
        // Shift+click toggles evidence chain trace
        const node = viewModel.nodes.find((n) => n.id === nodeId);
        if (node && node.type === 'hypothesis') {
          onTraceToggle(nodeId);
        }
        return;
      }
      onNodeClick(nodeId);
    },
    [onNodeClick, onTraceToggle, viewModel.nodes],
  );

  const handleContextMenu = useCallback(
    (e: MouseEvent, nodeId: string) => {
      e.preventDefault();
      const node = viewModel.nodes.find((n) => n.id === nodeId);
      if (node && node.type === 'hypothesis') {
        onHypothesisFocus(focusedHypothesis === nodeId ? null : nodeId);
      }
    },
    [focusedHypothesis, onHypothesisFocus, viewModel.nodes],
  );

  const handleMouseEnter = useCallback(
    (e: MouseEvent, node: EvidenceBoardNode) => {
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      onNodeHover(node, e.clientX - rect.left, e.clientY - rect.top);
    },
    [onNodeHover],
  );

  if (!ready || positions.size === 0) {
    return (
      <div class="hunt-eb-graph">
        <p style={{ color: 'var(--hunt-text-muted)', textAlign: 'center', paddingTop: '80px' }}>
          Computing layout...
        </p>
      </div>
    );
  }

  return (
    <div class="hunt-eb-graph">
      <svg ref={svgRef} viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} preserveAspectRatio="xMidYMid meet">
        {/* Tier labels */}
        {TIER_LABELS.map((label, tier) => (
          <text
            key={`tier-${tier}`}
            class="hunt-eb-tier-label"
            x={20}
            y={TIER_Y[tier]}
          >
            {label}
          </text>
        ))}

        {/* Edges */}
        {viewModel.edges.map((edge) => {
          const sourcePos = positions.get(edge.source);
          const targetPos = positions.get(edge.target);
          if (!sourcePos || !targetPos) return null;

          const ek = edgeKey(edge.source, edge.target);
          const isDimmed = connectedEdges != null && !connectedEdges.has(ek);
          const isTraced = tracedChain.has(ek);

          let className = edgeClass(edge.relationship);
          if (isDimmed) className += ' hunt-eb-edge--dimmed';
          if (isTraced) className += ' hunt-eb-edge--traced';

          return (
            <line
              key={ek}
              class={className}
              x1={sourcePos.x}
              y1={sourcePos.y}
              x2={targetPos.x}
              y2={targetPos.y}
            />
          );
        })}

        {/* Nodes */}
        {viewModel.nodes.map((node) => {
          const pos = positions.get(node.id);
          if (!pos) return null;

          const r = nodeRadius(node.deviationScore);
          const isDimmed = connectedNodes != null && !connectedNodes.has(node.id);

          let groupClass = 'hunt-eb-node';
          if (isDimmed) groupClass += ' hunt-eb-node--dimmed';

          return (
            <g
              key={node.id}
              class={groupClass}
              transform={`translate(${pos.x}, ${pos.y})`}
              onClick={(e: MouseEvent) => handleNodeClick(e, node.id)}
              onContextMenu={(e: MouseEvent) => handleContextMenu(e, node.id)}
              onMouseEnter={(e: MouseEvent) => handleMouseEnter(e, node)}
              onMouseLeave={onNodeHoverEnd}
            >
              <circle
                r={r}
                class={`hunt-eb-node__circle ${verdictClass(node)}`}
              />
              <text class="hunt-eb-node__label" dy={r + 14}>
                {truncateLabel(node.label)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------

function App() {
  const { setIsDark } = useTheme();
  const [mode, setMode] = useState<'graph' | 'matrix'>('graph');
  const [viewModel, setViewModel] = useState<EvidenceBoardViewModel | null>(null);
  const [focusedHypothesis, setFocusedHypothesis] = useState<string | null>(null);
  const [tracedChain, setTracedChain] = useState<Set<string>>(new Set());
  const [tooltipNode, setTooltipNode] = useState<EvidenceBoardNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    vscode.postMessage({ type: 'webview:ready' });
  }, []);

  useHostMessage<HostToEvidenceBoardMessage>((message) => {
    switch (message.type) {
      case 'init':
        setViewModel(message.viewModel);
        setIsDark(message.isDark);
        break;
      case 'update':
        setViewModel(message.viewModel);
        break;
      case 'theme':
        setIsDark(message.isDark);
        break;
    }
  });

  const handleModeToggle = useCallback(
    (newMode: 'graph' | 'matrix') => {
      setMode(newMode);
      vscode.postMessage({ type: 'mode:toggle', mode: newMode });
    },
    [],
  );

  const handleNodeClick = useCallback((nodeId: string) => {
    vscode.postMessage({ type: 'node:open', nodeId });
  }, []);

  const handleNodeHover = useCallback((node: EvidenceBoardNode, x: number, y: number) => {
    setTooltipNode(node);
    setTooltipPos({ x, y });
  }, []);

  const handleNodeHoverEnd = useCallback(() => {
    setTooltipNode(null);
  }, []);

  const handleHypothesisFocus = useCallback((hypothesisId: string | null) => {
    setFocusedHypothesis(hypothesisId);
    vscode.postMessage({ type: 'hypothesis:focus', hypothesisId });
  }, []);

  const handleTraceToggle = useCallback(
    (hypothesisId: string) => {
      if (!viewModel) return;
      setTracedChain((prev) => {
        // If already tracing this hypothesis, clear the chain
        const isAlreadyTracing = Array.from(prev).some((k) => k.startsWith(hypothesisId + '->'));

        if (isAlreadyTracing) {
          return new Set();
        }

        return computeTraceChain(hypothesisId, viewModel.edges);
      });
    },
    [viewModel],
  );

  return (
    <main
      class="hunt-surface"
      style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '24px 18px',
        color: 'var(--hunt-text)',
      }}
    >
      {viewModel === null ? (
        <Panel>
          <p style={{ color: 'var(--hunt-text-muted)', margin: 0 }}>
            Connecting to extension host...
          </p>
        </Panel>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Header with mode toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p
                style={{
                  fontSize: '11px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--hunt-text-muted)',
                  margin: '0 0 8px',
                }}
              >
                Evidence Board
              </p>
              <h1
                style={{
                  margin: 0,
                  fontSize: 'clamp(1.5rem, 2.5vw, 2.4rem)',
                  lineHeight: 1.1,
                }}
              >
                {mode === 'graph' ? 'Lineage Graph' : 'Coverage Matrix'}
              </h1>
            </div>
            <div class="hunt-eb-mode-toggle">
              <button
                class={`hunt-eb-mode-toggle__btn ${mode === 'graph' ? 'hunt-eb-mode-toggle__btn--active' : ''}`}
                onClick={() => handleModeToggle('graph')}
                type="button"
              >
                Graph
              </button>
              <button
                class={`hunt-eb-mode-toggle__btn ${mode === 'matrix' ? 'hunt-eb-mode-toggle__btn--active' : ''}`}
                onClick={() => handleModeToggle('matrix')}
                type="button"
              >
                Matrix
              </button>
            </div>
          </div>

          {/* Graph or Matrix view */}
          {mode === 'graph' ? (
            <Panel>
              <div style={{ position: 'relative' }}>
                <GraphView
                  viewModel={viewModel}
                  focusedHypothesis={focusedHypothesis}
                  tracedChain={tracedChain}
                  onNodeClick={handleNodeClick}
                  onNodeHover={handleNodeHover}
                  onNodeHoverEnd={handleNodeHoverEnd}
                  onHypothesisFocus={handleHypothesisFocus}
                  onTraceToggle={handleTraceToggle}
                />
                <Tooltip node={tooltipNode} x={tooltipPos.x} y={tooltipPos.y} />
              </div>
            </Panel>
          ) : (
            <Panel>
              <p style={{ color: 'var(--hunt-text-muted)', margin: 0 }}>
                Matrix mode -- Phase 14 Plan 03
              </p>
            </Panel>
          )}
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const root = document.getElementById('root');
if (root) {
  render(<App />, root);
}
