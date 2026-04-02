import * as vscode from 'vscode';
import type { ArtifactType } from './types';

/**
 * Resolve a file path (relative to hunt root) to an artifact type and ID.
 * Returns null for unrecognized files.
 */
export function resolveArtifactType(filePath: string): { type: ArtifactType; id: string } | null {
  // Normalize path separators to forward slashes
  const normalized = filePath.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() ?? '';
  const nameNoExt = basename.replace(/\.md$/i, '');

  // Top-level singleton artifacts
  switch (basename) {
    case 'MISSION.md':
      return { type: 'mission', id: 'MISSION' };
    case 'HYPOTHESES.md':
      return { type: 'hypotheses', id: 'HYPOTHESES' };
    case 'HUNTMAP.md':
      return { type: 'huntmap', id: 'HUNTMAP' };
    case 'STATE.md':
      return { type: 'state', id: 'STATE' };
    case 'EVIDENCE_REVIEW.md':
      return { type: 'evidenceReview', id: 'EVIDENCE_REVIEW' };
    case 'FINDINGS.md':
      return { type: 'phaseSummary', id: 'FINDINGS' };
  }

  // Directory-based artifacts: QUERIES/QRY-*.md and RECEIPTS/RCT-*.md
  if (/QUERIES\/QRY-[^/]+\.md$/i.test(normalized)) {
    return { type: 'query', id: nameNoExt };
  }
  if (/RECEIPTS\/RCT-[^/]+\.md$/i.test(normalized)) {
    return { type: 'receipt', id: nameNoExt };
  }

  // Unrecognized artifact (e.g. SUCCESS_CRITERIA.md, environment/ENVIRONMENT.md)
  return null;
}

/** Tracked file state for stability checking */
interface FileState {
  mtime: number;
  size: number;
}

/**
 * ArtifactWatcher monitors a hunt directory for .md file changes.
 *
 * Uses VS Code's FileSystemWatcher with per-file 300ms debounce
 * and mtime/size stability checks to avoid acting on half-written files.
 * Emits arrays of changed file paths via onDidChange.
 */
export class ArtifactWatcher implements vscode.Disposable {
  private readonly _onDidChange = new vscode.EventEmitter<string[]>();
  readonly onDidChange: vscode.Event<string[]> = this._onDidChange.event;

  private readonly watcher: vscode.FileSystemWatcher;
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly lastStats = new Map<string, FileState>();

  private static readonly DEBOUNCE_MS = 300;

  constructor(huntRoot: vscode.Uri) {
    const pattern = new vscode.RelativePattern(huntRoot, '**/*.md');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern, false, false, false);

    this.watcher.onDidCreate((uri) => this.scheduleFile(uri));
    this.watcher.onDidChange((uri) => this.scheduleFile(uri));
    this.watcher.onDidDelete((uri) => this.handleDelete(uri));
  }

  /**
   * Schedule a file for emission after debounce + stability check.
   */
  private scheduleFile(uri: vscode.Uri): void {
    const filePath = uri.fsPath;

    // Clear existing timer for this path (restart debounce)
    const existing = this.debounceTimers.get(filePath);
    if (existing !== undefined) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.checkStabilityAndEmit(uri);
    }, ArtifactWatcher.DEBOUNCE_MS);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Stat the file and verify mtime/size stability before emitting.
   * If the file changed since the debounce started, re-schedule.
   */
  private async checkStabilityAndEmit(uri: vscode.Uri): Promise<void> {
    const filePath = uri.fsPath;

    try {
      const stat = await vscode.workspace.fs.stat(uri);
      const current: FileState = {
        mtime: stat.mtime,
        size: stat.size,
      };

      const previous = this.lastStats.get(filePath);

      if (previous && (previous.mtime !== current.mtime || previous.size !== current.size)) {
        // File changed during the debounce window -- restart
        this.lastStats.set(filePath, current);
        this.scheduleFile(uri);
        return;
      }

      // Stable -- update tracked state and emit
      this.lastStats.set(filePath, current);
      this._onDidChange.fire([filePath]);
    } catch {
      // File may have been deleted between change event and stat -- emit anyway
      // so the store can handle removal
      this._onDidChange.fire([filePath]);
    }
  }

  /**
   * Handle file deletion -- emit immediately (no debounce needed).
   */
  private handleDelete(uri: vscode.Uri): void {
    const filePath = uri.fsPath;

    // Clear any pending debounce timer
    const existing = this.debounceTimers.get(filePath);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.debounceTimers.delete(filePath);
    }

    // Clean up tracked state
    this.lastStats.delete(filePath);

    this._onDidChange.fire([filePath]);
  }

  dispose(): void {
    // Clear all pending debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.lastStats.clear();

    this.watcher.dispose();
    this._onDidChange.dispose();
  }
}
