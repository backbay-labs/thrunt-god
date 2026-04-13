/**
 * Confidence computation -- pure functional confidence scoring for entity notes.
 *
 * Computes entity confidence from 4 inspectable factors with weighted average
 * and exponential half-life decay:
 *   - source_count: normalized via logarithmic scaling (weight 0.25)
 *   - reliability: analyst-assigned 0-1 float (weight 0.30)
 *   - corroboration: normalized via logarithmic scaling (weight 0.25)
 *   - days_since_validation: drives recency and exponential decay (weight 0.20)
 *
 * Formula: baseScore * decayFactor
 *   baseScore = srcNorm * 0.25 + reliability * 0.30 + corrNorm * 0.25 + recency * 0.20
 *   recency = 1 - days / (days + halfLifeDays)
 *   decayFactor = 2^(-days / halfLifeDays)
 *
 * Pure module -- zero Obsidian imports. Safe for testing and CLI usage.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfidenceFactors {
  source_count: number;
  reliability: number; // 0.0 to 1.0
  corroboration: number;
  days_since_validation: number;
}

export interface ConfidenceConfig {
  half_life_days: number; // default 90
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ConfidenceConfig = { half_life_days: 90 };

// ---------------------------------------------------------------------------
// Normalization functions
// ---------------------------------------------------------------------------

/**
 * Normalize a source count to 0-1 using logarithmic scaling.
 * Formula: min(1, log2(count + 1) / log2(4))
 * Returns 0 for count <= 0.
 */
export function normalizeSourceCount(count: number): number {
  if (count <= 0) return 0;
  return Math.min(1, Math.log2(count + 1) / Math.log2(4));
}

/**
 * Normalize a corroboration count to 0-1 using logarithmic scaling.
 * Same formula as normalizeSourceCount (per research recommendation).
 * Returns 0 for count <= 0.
 */
export function normalizeCorroboration(count: number): number {
  if (count <= 0) return 0;
  return Math.min(1, Math.log2(count + 1) / Math.log2(4));
}

// ---------------------------------------------------------------------------
// Decay
// ---------------------------------------------------------------------------

/**
 * Compute the exponential decay factor based on time elapsed and half-life.
 * Formula: 2^(-daysSinceValidation / halfLifeDays)
 * Returns 1.0 for daysSinceValidation <= 0.
 */
export function computeDecayFactor(
  daysSinceValidation: number,
  halfLifeDays: number,
): number {
  if (daysSinceValidation <= 0) return 1.0;
  return Math.pow(2, -daysSinceValidation / halfLifeDays);
}

// ---------------------------------------------------------------------------
// Main confidence computation
// ---------------------------------------------------------------------------

/**
 * Compute confidence score from 4 inspectable factors.
 *
 * Weighted average:
 *   srcNorm * 0.25 + reliability * 0.30 + corrNorm * 0.25 + recency * 0.20
 *
 * Recency = 1 - days / (days + halfLifeDays), bounded [0, 1] asymptotic.
 * Result multiplied by exponential decay factor.
 * Rounded to 2 decimal places, clamped to [0, 1].
 */
export function computeConfidence(
  factors: ConfidenceFactors,
  config?: ConfidenceConfig,
): number {
  const { half_life_days } = config ?? DEFAULT_CONFIG;

  const srcNorm = normalizeSourceCount(factors.source_count);
  const reliability = Math.max(0, Math.min(1, factors.reliability));
  const corrNorm = normalizeCorroboration(factors.corroboration);

  // Recency: asymptotic decay bounded [0, 1]
  const days = Math.max(0, factors.days_since_validation);
  const recency = days === 0 && half_life_days === 0
    ? 1.0
    : 1 - days / (days + half_life_days);

  // Weighted average
  const baseScore =
    srcNorm * 0.25 +
    reliability * 0.30 +
    corrNorm * 0.25 +
    recency * 0.20;

  // Apply exponential decay
  const decayFactor = computeDecayFactor(days, half_life_days);
  const score = baseScore * decayFactor;

  // Round to 2 decimal places
  return Math.round(score * 100) / 100;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Format confidence factors as a single-line inline YAML object.
 * Output: {source_count: N, reliability: N, corroboration: N, days_since_validation: N}
 */
export function formatConfidenceFactors(factors: ConfidenceFactors): string {
  return `{source_count: ${factors.source_count}, reliability: ${factors.reliability}, corroboration: ${factors.corroboration}, days_since_validation: ${factors.days_since_validation}}`;
}

/**
 * Parse an inline YAML confidence factors string back to ConfidenceFactors.
 * Returns null if the format doesn't match.
 * Defaults missing fields to 0.
 */
export function parseConfidenceFactors(str: string): ConfidenceFactors | null {
  const trimmed = str.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  const inner = trimmed.slice(1, -1);

  const result: ConfidenceFactors = {
    source_count: 0,
    reliability: 0,
    corroboration: 0,
    days_since_validation: 0,
  };

  // Extract key: value pairs using regex
  const pairRegex = /(\w+):\s*([\d.]+)/g;
  let match: RegExpExecArray | null;
  let foundAny = false;

  while ((match = pairRegex.exec(inner)) !== null) {
    foundAny = true;
    const key = match[1]!;
    const value = parseFloat(match[2]!);

    if (key === 'source_count') result.source_count = value;
    else if (key === 'reliability') result.reliability = value;
    else if (key === 'corroboration') result.corroboration = value;
    else if (key === 'days_since_validation') result.days_since_validation = value;
  }

  if (!foundAny) return null;

  return result;
}
