export interface EvidenceBoardNode {
  id: string;
  type: 'hypothesis' | 'receipt' | 'query';
  label: string;
  tier: number;           // 0 = hypothesis, 1 = receipt, 2 = query
  verdict?: string;       // hypothesis verdict or receipt claim status
  confidence?: string;
  deviationScore?: number;
}

export interface EvidenceBoardEdge {
  source: string;         // node id
  target: string;         // node id
  relationship: 'supports' | 'contradicts' | 'context';
}

export interface EvidenceBoardMatrixCell {
  hypothesisId: string;
  receiptId: string;
  relationship: 'supports' | 'contradicts' | 'context' | 'absent';
  deviationScore: number | null;
}

export interface EvidenceBoardViewModel {
  nodes: EvidenceBoardNode[];
  edges: EvidenceBoardEdge[];
  matrixCells: EvidenceBoardMatrixCell[];
  hypothesisIds: string[];
  receiptIds: string[];
  blindSpots: string[];
}

export interface EvidenceBoardBootData {
  surfaceId: 'evidence-board';
  mode?: 'graph' | 'matrix';
}

export type HostToEvidenceBoardMessage =
  | { type: 'init'; viewModel: EvidenceBoardViewModel; isDark: boolean }
  | { type: 'update'; viewModel: EvidenceBoardViewModel }
  | { type: 'theme'; isDark: boolean }
  | { type: 'focus'; artifactId: string };

export type EvidenceBoardToHostMessage =
  | { type: 'webview:ready' }
  | { type: 'node:select'; nodeId: string }
  | { type: 'node:open'; nodeId: string }
  | { type: 'mode:toggle'; mode: 'graph' | 'matrix' }
  | { type: 'hypothesis:focus'; hypothesisId: string | null }
  | { type: 'blur' };
