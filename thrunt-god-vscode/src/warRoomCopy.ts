import { checkReceiptStructured, summarizeIntegrityCounts } from './receiptIntegrity';
import type { HuntDataStore } from './store';
import type { Hypothesis, Mission, Query, Receipt } from './types';

export type WarRoomFormat = 'markdown' | 'plainText' | 'attack';

export interface WarRoomOutput {
  markdown: string;
  plainText: string;
  attack?: string;
}

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const ATTACK_PATTERN = /\bT\d{4}(?:\.\d{3})?\b/g;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maxLength: number): string {
  const normalized = collapseWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function escapeMarkdown(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*/g, '\\*');
}

function formatScoreLabel(score: number | null): string | null {
  if (score === null) {
    return null;
  }

  if (score >= 5) {
    return 'HIGH';
  }

  if (score >= 3) {
    return 'MEDIUM';
  }

  return 'LOW';
}

function joinList(values: string[]): string {
  return values.filter(Boolean).join(', ');
}

function sortUnique(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
}

function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_PATTERN);
  return sortUnique(matches ?? []);
}

function extractAttackIds(text: string): string[] {
  const matches = text.match(ATTACK_PATTERN);
  return sortUnique(matches ?? []);
}

function collectAllHypotheses(store: HuntDataStore): Hypothesis[] {
  const hunt = store.getHunt();
  if (!hunt || hunt.hypotheses.status !== 'loaded') {
    return [];
  }

  return [
    ...hunt.hypotheses.data.active,
    ...hunt.hypotheses.data.parked,
    ...hunt.hypotheses.data.disproved,
  ];
}

function findHypothesis(store: HuntDataStore, hypothesisId: string): Hypothesis | undefined {
  return collectAllHypotheses(store).find((hypothesis) => hypothesis.id === hypothesisId);
}

function summarizeReceiptScore(receipt: Receipt): { score: number | null; label: string | null } {
  const score = receipt.anomalyFrame?.deviationScore.totalScore ?? null;
  return {
    score,
    label: formatScoreLabel(score),
  };
}

function describeHypothesisRelationship(receipt: Receipt): string {
  const hypothesisList = joinList(receipt.relatedHypotheses);
  if (!hypothesisList) {
    return 'Unlinked to hypothesis';
  }

  const normalized = receipt.claimStatus.toLowerCase();
  if (normalized === 'supports') {
    return `Supports ${hypothesisList}`;
  }

  if (normalized === 'contradicts') {
    return `Contradicts ${hypothesisList}`;
  }

  return `Context for ${hypothesisList}`;
}

function firstLoadedQuery(store: HuntDataStore, receipt: Receipt): Query | undefined {
  for (const queryId of receipt.relatedQueries ?? []) {
    const query = store.getQuery(queryId);
    if (query?.status === 'loaded') {
      return query.data;
    }
  }

  return undefined;
}

function describeQueryLine(query: Query | undefined): string | null {
  if (!query) {
    return null;
  }

  return `${query.queryId} (${query.eventCount} events, ${query.templateCount} templates)`;
}

function deriveImpactEntities(receipt: Receipt): string[] {
  return extractEmails(`${receipt.claim}\n${receipt.evidence}`);
}

function collectAttackCoverage(receipts: Receipt[]): Map<string, Receipt[]> {
  const coverage = new Map<string, Receipt[]>();

  for (const receipt of receipts) {
    const attackIds = receipt.anomalyFrame?.attackMapping?.length
      ? receipt.anomalyFrame.attackMapping
      : extractAttackIds(`${receipt.claim}\n${receipt.evidence}`);

    for (const attackId of sortUnique(attackIds)) {
      const existing = coverage.get(attackId) ?? [];
      existing.push(receipt);
      coverage.set(attackId, existing);
    }
  }

  return new Map(
    [...coverage.entries()].sort(([left], [right]) => left.localeCompare(right))
  );
}

function describeMissionTitle(mission: Mission | null): string {
  if (!mission) {
    return 'Untitled Hunt';
  }

  return truncate(mission.signal || 'Untitled Hunt', 72);
}

function deriveTimeWindow(store: HuntDataStore, mission: Mission | null): string | null {
  const windows = [...store.getQueries().values()]
    .filter((query): query is { status: 'loaded'; data: Query } => query.status === 'loaded')
    .map((query) => query.data.timeWindow)
    .filter(
      (window): window is NonNullable<Query['timeWindow']> =>
        window !== null && Boolean(window.start) && Boolean(window.end)
    );

  if (windows.length > 0) {
    const start = windows
      .map((window) => window.start)
      .sort((left, right) => left.localeCompare(right))[0];
    const end = windows
      .map((window) => window.end)
      .sort((left, right) => right.localeCompare(left))[0];

    return `${start} - ${end}`;
  }

  if (!mission) {
    return null;
  }

  const scopeLine = mission.scope
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().includes('time window'));

  return scopeLine ? scopeLine.replace(/^-+\s*/, '') : null;
}

export function getClipboardText(output: WarRoomOutput, format: WarRoomFormat): string {
  if (format === 'plainText') {
    return output.plainText;
  }

  if (format === 'attack') {
    return output.attack ?? output.markdown;
  }

  return output.markdown;
}

export class WarRoomFormatter {
  constructor(private readonly store: HuntDataStore) {}

  formatFinding(receipt: Receipt): WarRoomOutput {
    const { score, label } = summarizeReceiptScore(receipt);
    const query = firstLoadedQuery(this.store, receipt);
    const entity = deriveImpactEntities(receipt)[0] ?? 'No entity extracted';
    const attackLine = joinList(
      sortUnique(receipt.anomalyFrame?.attackMapping ?? extractAttackIds(receipt.evidence))
    );
    const queryLine = describeQueryLine(query);

    const headlineParts = [
      `**${receipt.receiptId}**`,
      score !== null ? `Score: ${score}/6${label ? ` (${label})` : ''}` : null,
      describeHypothesisRelationship(receipt),
    ].filter(Boolean);

    const markdownLines = [
      headlineParts.join(' | '),
      '',
      escapeMarkdown(truncate(receipt.claim, 280)),
      `Entity: ${escapeMarkdown(entity)} | Source: ${escapeMarkdown(receipt.source)} | ${receipt.createdAt}`,
    ];

    if (attackLine) {
      markdownLines.push('', `ATT&CK: ${attackLine}`);
    }

    if (queryLine) {
      markdownLines.push(`Query: ${queryLine}`);
    }

    const plainTextLines = [
      `Receipt: ${receipt.receiptId}`,
      ...(score !== null ? [`Score: ${score}/6${label ? ` (${label})` : ''}`] : []),
      `Verdict: ${describeHypothesisRelationship(receipt)}`,
      `Claim: ${truncate(receipt.claim, 280)}`,
      `Entity: ${entity}`,
      `Source: ${receipt.source}`,
      `Timestamp: ${receipt.createdAt}`,
      ...(attackLine ? [`ATT&CK: ${attackLine}`] : []),
      ...(queryLine ? [`Related query: ${queryLine}`] : []),
    ];

    return {
      markdown: markdownLines.join('\n'),
      plainText: plainTextLines.join('\n'),
      attack: attackLine
        ? `ATT&CK Techniques Observed:\n  ${attackLine}  ${receipt.receiptId}${score !== null ? ` (score ${score})` : ''}`
        : undefined,
    };
  }

  formatHypothesis(hypothesis: Hypothesis): WarRoomOutput {
    const receipts = this.store
      .getReceiptsForHypothesis(hypothesis.id)
      .filter((receipt): receipt is { status: 'loaded'; data: Receipt } => receipt.status === 'loaded')
      .map((receipt) => receipt.data)
      .sort((left, right) => left.receiptId.localeCompare(right.receiptId));

    const evidenceSummary = receipts.length
      ? receipts
          .map((receipt) => {
            const { score } = summarizeReceiptScore(receipt);
            return `${receipt.receiptId}${score !== null ? ` (score ${score})` : ''}`;
          })
          .join(', ')
      : 'No receipts linked';

    const keyFinding = receipts.length > 0
      ? truncate(
          receipts.sort((left, right) => {
            const leftScore = left.anomalyFrame?.deviationScore.totalScore ?? -1;
            const rightScore = right.anomalyFrame?.deviationScore.totalScore ?? -1;
            if (rightScore !== leftScore) {
              return rightScore - leftScore;
            }
            return left.receiptId.localeCompare(right.receiptId);
          })[0].claim,
          180
        )
      : 'No key finding yet';

    const markdown = [
      `**${hypothesis.id}**: ${escapeMarkdown(truncate(hypothesis.assertion, 160))}`,
      `Status: *${escapeMarkdown(hypothesis.status)}* (${escapeMarkdown(hypothesis.confidence)} confidence)`,
      `Evidence: ${evidenceSummary}`,
      `Key finding: ${escapeMarkdown(keyFinding)}`,
    ].join('\n');

    const plainText = [
      `Hypothesis: ${hypothesis.id}`,
      `Assertion: ${hypothesis.assertion}`,
      `Status: ${hypothesis.status}`,
      `Confidence: ${hypothesis.confidence}`,
      `Evidence: ${evidenceSummary}`,
      `Key finding: ${keyFinding}`,
    ].join('\n');

    return { markdown, plainText };
  }

  formatHuntOverview(): WarRoomOutput {
    const hunt = this.store.getHunt();
    const mission = hunt?.mission.status === 'loaded' ? hunt.mission.data : null;
    const state = hunt?.state.status === 'loaded' ? hunt.state.data : null;
    const allHypotheses = collectAllHypotheses(this.store);
    const loadedReceipts = [...this.store.getReceipts().values()]
      .filter((receipt): receipt is { status: 'loaded'; data: Receipt } => receipt.status === 'loaded')
      .map((receipt) => receipt.data);

    const criticalCount = loadedReceipts.filter(
      (receipt) => (receipt.anomalyFrame?.deviationScore.totalScore ?? -1) >= 5
    ).length;
    const attackCoverage = collectAttackCoverage(loadedReceipts);
    const impactedEntities = sortUnique(
      loadedReceipts.flatMap((receipt) => deriveImpactEntities(receipt))
    ).slice(0, 6);

    let warningCount = 0;
    let errorCount = 0;
    for (const receipt of loadedReceipts) {
      const counts = summarizeIntegrityCounts(checkReceiptStructured(receipt));
      warningCount += counts.warnings;
      errorCount += counts.errors;
    }

    const hypothesisLines = allHypotheses.length
      ? allHypotheses.map((hypothesis) => {
          const relatedReceipts = loadedReceipts.filter((receipt) =>
            receipt.relatedHypotheses.includes(hypothesis.id)
          );
          return `  - ${hypothesis.id}: ${truncate(hypothesis.assertion, 96)} -- *${hypothesis.status}* (${relatedReceipts.length} receipts)`;
        })
      : ['  - Hypotheses not yet defined.'];

    const markdownLines = [
      `**THRUNT Hunt: ${escapeMarkdown(describeMissionTitle(mission))}**`,
      state
        ? `Phase: ${state.phase}/${state.totalPhases} | Owner: ${escapeMarkdown(mission?.owner ?? 'Unknown')}`
        : `Owner: ${escapeMarkdown(mission?.owner ?? 'Unknown')}`,
      '',
      'Hypotheses:',
      ...hypothesisLines,
      '',
      `Critical findings: ${criticalCount} receipts with score >= 5`,
      `Evidence integrity: ${errorCount} errors, ${warningCount} warnings`,
      `ATT&CK coverage: ${joinList([...attackCoverage.keys()]) || 'None mapped'}`,
      `Impacted: ${joinList(impactedEntities) || 'No entities extracted'}`,
      ...(deriveTimeWindow(this.store, mission) ? [`Time window: ${deriveTimeWindow(this.store, mission)}`] : []),
    ];

    const plainTextLines = [
      `THRUNT Hunt: ${describeMissionTitle(mission)}`,
      ...(state ? [`Phase: ${state.phase}/${state.totalPhases}`] : []),
      `Owner: ${mission?.owner ?? 'Unknown'}`,
      '',
      'Hypotheses:',
      ...hypothesisLines.map((line) => line.replace(/\*/g, '')),
      '',
      `Critical findings: ${criticalCount}`,
      `Evidence integrity: ${errorCount} errors, ${warningCount} warnings`,
      `ATT&CK coverage: ${joinList([...attackCoverage.keys()]) || 'None mapped'}`,
      `Impacted: ${joinList(impactedEntities) || 'No entities extracted'}`,
      ...(deriveTimeWindow(this.store, mission) ? [`Time window: ${deriveTimeWindow(this.store, mission)}`] : []),
    ];

    return {
      markdown: markdownLines.join('\n'),
      plainText: plainTextLines.join('\n'),
      attack: this.formatAttackSummary().attack,
    };
  }

  formatAttackSummary(): WarRoomOutput {
    const loadedReceipts = [...this.store.getReceipts().values()]
      .filter((receipt): receipt is { status: 'loaded'; data: Receipt } => receipt.status === 'loaded')
      .map((receipt) => receipt.data);
    const attackCoverage = collectAttackCoverage(loadedReceipts);

    const markdownLines = [
      'ATT&CK Techniques Observed:',
      ...[...attackCoverage.entries()].map(([attackId, receipts]) => {
        const references = receipts
          .map((receipt) => {
            const score = receipt.anomalyFrame?.deviationScore.totalScore;
            return `${receipt.receiptId}${score !== undefined ? ` (score ${score})` : ''}`;
          })
          .join(', ');
        return `  ${attackId}  ${references}`;
      }),
      '',
      `Coverage: ${attackCoverage.size} techniques across ${loadedReceipts.length} receipts`,
    ];

    const plainText = markdownLines.join('\n');

    return {
      markdown: plainText,
      plainText,
      attack: plainText,
    };
  }

  getHypothesisById(hypothesisId: string): Hypothesis | undefined {
    return findHypothesis(this.store, hypothesisId);
  }
}
