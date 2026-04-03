import type { Receipt } from './types';

export type ReceiptCheckSeverity = 'error' | 'warning' | 'info';
export type ReceiptCheckStatus = 'pass' | 'flagged';

export interface ReceiptIntegrityCheck {
  id:
    | 'unsupported-claim'
    | 'causality-without-evidence'
    | 'missing-baseline'
    | 'missing-prediction'
    | 'score-inconsistency'
    | 'post-hoc-rationalization'
    | 'temporal-gap';
  label: string;
  severity: ReceiptCheckSeverity;
  status: ReceiptCheckStatus;
  message: string;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalize(value: string | null | undefined): string {
  return hasText(value) ? value!.trim().toLowerCase() : '';
}

function sumModifierContributions(receipt: Receipt): number {
  return (
    receipt.anomalyFrame?.deviationScore.modifiers.reduce(
      (sum, modifier) => sum + modifier.contribution,
      0
    ) ?? 0
  );
}

export function checkReceiptStructured(receipt: Receipt): ReceiptIntegrityCheck[] {
  const checks: ReceiptIntegrityCheck[] = [];
  const frame = receipt.anomalyFrame;
  const evidence = normalize(receipt.evidence);
  const claim = normalize(receipt.claim);
  const prediction = normalize(frame?.prediction);
  const baseline = normalize(frame?.baseline);
  const observation = normalize(frame?.observation);

  checks.push({
    id: 'unsupported-claim',
    label: 'Supported by source evidence',
    severity: 'error',
    status:
      receipt.relatedQueries.length > 0 || receipt.relatedHypotheses.length > 0
        ? 'pass'
        : 'flagged',
    message:
      receipt.relatedQueries.length > 0 || receipt.relatedHypotheses.length > 0
        ? 'Receipt is linked to supporting hunt artifacts.'
        : 'Receipt is not linked to any query or hypothesis.',
  });

  const causalityClaim =
    claim.includes('because') ||
    claim.includes('caused by') ||
    claim.includes('therefore') ||
    claim.includes('led to');
  checks.push({
    id: 'causality-without-evidence',
    label: 'Causality grounded in evidence',
    severity: 'error',
    status: causalityClaim && evidence.length < 40 ? 'flagged' : 'pass',
    message:
      causalityClaim && evidence.length < 40
        ? 'Claim implies causality but the evidence section is sparse.'
        : 'Evidence section is sufficient for the current claim style.',
  });

  checks.push({
    id: 'missing-baseline',
    label: 'Baseline documented',
    severity: 'warning',
    status: frame && !hasText(frame.baseline) ? 'flagged' : 'pass',
    message:
      frame && !hasText(frame.baseline)
        ? 'No baseline documented for anomaly framing.'
        : 'Baseline is present or anomaly framing is absent.',
  });

  checks.push({
    id: 'missing-prediction',
    label: 'Prediction documented',
    severity: 'warning',
    status: frame && !hasText(frame.prediction) ? 'flagged' : 'pass',
    message:
      frame && !hasText(frame.prediction)
        ? 'No prediction captured for the anomaly frame.'
        : 'Prediction is present or anomaly framing is absent.',
  });

  const expectedScore =
    (frame?.deviationScore.baseScore ?? 0) + sumModifierContributions(receipt);
  checks.push({
    id: 'score-inconsistency',
    label: 'Score math checks out',
    severity: 'warning',
    status:
      frame && frame.deviationScore.totalScore !== expectedScore ? 'flagged' : 'pass',
    message:
      frame && frame.deviationScore.totalScore !== expectedScore
        ? `Expected ${expectedScore} but receipt reports ${frame.deviationScore.totalScore}.`
        : 'Deviation total matches base score plus modifiers.',
  });

  const postHoc =
    hasText(frame?.prediction) &&
    hasText(frame?.observation) &&
    prediction === observation;
  checks.push({
    id: 'post-hoc-rationalization',
    label: 'Prediction distinct from observation',
    severity: 'info',
    status: postHoc ? 'flagged' : 'pass',
    message: postHoc
      ? 'Prediction text mirrors the final observation and may be post-hoc.'
      : 'Prediction and observation are distinct.',
  });

  const createdAt = Date.parse(receipt.createdAt);
  checks.push({
    id: 'temporal-gap',
    label: 'Timestamp is parseable',
    severity: 'info',
    status: Number.isNaN(createdAt) ? 'flagged' : 'pass',
    message: Number.isNaN(createdAt)
      ? 'Receipt timestamp could not be parsed.'
      : 'Receipt timestamp parsed successfully.',
  });

  return checks;
}

export function summarizeIntegrityCounts(checks: ReceiptIntegrityCheck[]): {
  errors: number;
  warnings: number;
  infos: number;
} {
  let errors = 0;
  let warnings = 0;
  let infos = 0;

  for (const check of checks) {
    if (check.status !== 'flagged') {
      continue;
    }
    if (check.severity === 'error') {
      errors += 1;
    } else if (check.severity === 'warning') {
      warnings += 1;
    } else {
      infos += 1;
    }
  }

  return { errors, warnings, infos };
}
