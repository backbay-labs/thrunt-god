/**
 * Hunt pulse formatting -- pure function for status bar text.
 *
 * Converts watcher activity state into a human-readable status string
 * for the Obsidian status bar. No side effects, no Obsidian imports.
 */

/**
 * Format hunt pulse status text for the status bar.
 *
 * @param lastActivityTimestamp - epoch ms of last watcher activity (0 = never)
 * @param now - current epoch ms (injected for testability)
 * @param recentArtifactCount - number of artifacts ingested since last reset
 * @param idleThresholdMs - ms after which activity is considered idle (default 5 min)
 * @returns formatted status string like "\u26A1 idle" or "\u26A1 3 artifacts (120s ago)"
 */
export function formatHuntPulse(
  lastActivityTimestamp: number,
  now: number,
  recentArtifactCount: number,
  idleThresholdMs: number = 5 * 60 * 1000,
): string {
  if (lastActivityTimestamp === 0 || now - lastActivityTimestamp > idleThresholdMs) {
    return '\u26A1 idle';
  }

  const secondsAgo = Math.floor((now - lastActivityTimestamp) / 1000);
  const label = recentArtifactCount === 1 ? 'artifact' : 'artifacts';
  return `\u26A1 ${recentArtifactCount} ${label} (${secondsAgo}s ago)`;
}
