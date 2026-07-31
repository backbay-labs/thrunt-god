/**
 * Coverage staleness -- pure functional coverage status computation
 * for ATT&CK technique notes.
 *
 * Computes whether a technique's hunt coverage is current or stale
 * based on the most recent hunt date and a configurable threshold.
 * Extracts last hunted date from ## Hunt History section entries.
 *
 * Pure module -- zero Obsidian imports. Safe for testing and CLI usage.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CoverageStatus = 'current' | 'stale';

// ---------------------------------------------------------------------------
// computeCoverageStatus
// ---------------------------------------------------------------------------

/**
 * Compute whether a technique's hunt coverage is current or stale.
 *
 * @param lastHuntedDate - YYYY-MM-DD string, null if never hunted, or empty string
 * @param staleDays - Number of days before coverage is considered stale
 * @param now - Current date (injectable for testing, defaults to new Date())
 * @returns 'current' if within threshold, 'stale' otherwise
 */
export function computeCoverageStatus(
  lastHuntedDate: string | null,
  staleDays: number,
  now?: Date,
): CoverageStatus {
  // Never hunted or empty string => stale
  if (!lastHuntedDate || lastHuntedDate.trim() === '') {
    return 'stale';
  }

  const currentDate = now ?? new Date();
  // Parse as UTC to avoid timezone issues in day calculations
  const lastHunted = new Date(lastHuntedDate + 'T00:00:00Z');
  // Normalize current date to UTC midnight for consistent day diff
  const nowUtc = new Date(Date.UTC(
    currentDate.getUTCFullYear(),
    currentDate.getUTCMonth(),
    currentDate.getUTCDate(),
  ));
  const diffMs = nowUtc.getTime() - lastHunted.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDays > staleDays ? 'stale' : 'current';
}

// ---------------------------------------------------------------------------
// extractLastHuntedDate
// ---------------------------------------------------------------------------

/**
 * Extract the most recent hunt date from ## Hunt History section entries.
 *
 * Parses entry dates matching the locked format:
 * `- **{huntId}** ({YYYY-MM-DD}) -- queries: ...`
 *
 * @param content - Full markdown file content
 * @returns Most recent YYYY-MM-DD date string, or null if no entries found
 */
export function extractLastHuntedDate(content: string): string | null {
  const lines = content.split('\n');
  const dateRegex = /\((\d{4}-\d{2}-\d{2})\)/;

  // Find the ## Hunt History section
  const huntIdx = lines.findIndex((l) => l.trim() === '## Hunt History');
  if (huntIdx === -1) return null;

  const dates: string[] = [];

  // Scan entries within the Hunt History section
  for (let i = huntIdx + 1; i < lines.length; i++) {
    // Stop at the next ## heading
    if (lines[i]!.startsWith('## ')) break;

    const match = lines[i]!.match(dateRegex);
    if (match) {
      dates.push(match[1]!);
    }
  }

  if (dates.length === 0) return null;

  // Return the most recent (max) date
  dates.sort();
  return dates[dates.length - 1]!;
}
