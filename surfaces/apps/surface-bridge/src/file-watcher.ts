/**
 * Structured file watcher producing typed events with content hashing
 * and artifact classification.
 *
 * Replaces the simple debounced watcher in server.ts with per-file
 * debouncing, content hash tracking, artifact type classification,
 * and semantic event detection (phase transitions, verdict changes).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type {
  ArtifactType,
  ArtifactEventType,
  ArtifactDiff,
  ArtifactEventPayload,
  EventBridgeEnvelope,
  EventBridgeEventType,
  PhaseTransitionPayload,
  VerdictChangedPayload,
} from '@thrunt-surfaces/contracts';
import type { Logger } from './logger.ts';

// ─── Artifact classification ──────────────────────────────────────────────

export function classifyArtifactType(relativePath: string): ArtifactType {
  const normalized = relativePath.replace(/\\/g, '/');
  const basename = path.basename(normalized);

  if (normalized.includes('/QUERIES/') || basename.startsWith('QRY-')) return 'query';
  if (normalized.includes('/RECEIPTS/') || basename.startsWith('RCT-')) return 'receipt';
  if (normalized.includes('/EVIDENCE/') || basename.startsWith('EV-') || basename.startsWith('EVD-')) return 'evidence';
  if (normalized.includes('/FINDINGS/') || basename.startsWith('FND-')) return 'finding';
  if (basename === 'HYPOTHESES.md' || basename.startsWith('HYP-')) return 'hypothesis';
  if (normalized.includes('/MANIFESTS/') || basename.startsWith('MAN-')) return 'manifest';
  if (normalized.includes('/METRICS/') || basename.startsWith('MET-')) return 'metric';
  if (basename === 'config.json' || basename === 'STATE.md' || basename === 'ROADMAP.md') return 'config';

  return 'unknown';
}

// ─── Content hashing ──────────────────────────────────────────────────────

function md5(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

// ─── Frontmatter parsing ──────────────────────────────────────────────────

function parseFrontmatterKeys(content: string): Map<string, string> {
  const keys = new Map<string, string>();
  if (!content.startsWith('---')) return keys;

  const endIdx = content.indexOf('---', 3);
  if (endIdx === -1) return keys;

  const frontmatter = content.slice(3, endIdx).trim();
  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      keys.set(key, value);
    }
  }
  return keys;
}

function diffFrontmatterKeys(oldContent: string | null, newContent: string | null): string[] {
  if (!oldContent || !newContent) return [];

  const oldKeys = parseFrontmatterKeys(oldContent);
  const newKeys = parseFrontmatterKeys(newContent);

  const changed: string[] = [];
  const allKeys = new Set([...oldKeys.keys(), ...newKeys.keys()]);
  for (const key of allKeys) {
    const oldVal = oldKeys.get(key);
    const newVal = newKeys.get(key);
    if (oldVal !== newVal) {
      changed.push(key);
    }
  }
  return changed;
}

// ─── Phase detection ──────────────────────────────────────────────────────

function parsePhaseFromStateContent(content: string): string | null {
  // Look for "Phase:" line in STATE.md
  const match = content.match(/^Phase:\s*(.+)/m);
  return match ? match[1].trim() : null;
}

// ─── Verdict detection ────────────────────────────────────────────────────

function parseVerdictFromContent(content: string): { hypothesisId: string; verdict: string } | null {
  if (!content.startsWith('---')) return null;
  const endIdx = content.indexOf('---', 3);
  if (endIdx === -1) return null;
  const frontmatter = content.slice(3, endIdx);

  const verdictMatch = frontmatter.match(/^verdict:\s*(.+)/m);
  const idMatch = frontmatter.match(/^(?:id|hypothesis_id):\s*(.+)/m);

  if (verdictMatch) {
    return {
      hypothesisId: idMatch ? idMatch[1].trim() : path.basename(content).replace(/\.md$/, ''),
      verdict: verdictMatch[1].trim(),
    };
  }
  return null;
}

// ─── Watcher interface ────────────────────────────────────────────────────

export interface StructuredWatcherOptions {
  planningRoot: string;
  logger: Logger;
  onEvent: (event: Omit<EventBridgeEnvelope, 'seq'>) => void;
}

export interface StructuredWatcher {
  start(): void;
  stop(): void;
  /** Force a full scan (useful after reconnect or init) */
  scan(): void;
}

export function createStructuredWatcher(options: StructuredWatcherOptions): StructuredWatcher {
  const { planningRoot, logger, onEvent } = options;

  // In-memory state: relativePath -> { hash, content }
  const hashMap = new Map<string, { hash: string; content: string }>();
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let fsWatcher: fs.FSWatcher | null = null;

  function readFileSafe(absolutePath: string): string | null {
    try {
      return fs.readFileSync(absolutePath, 'utf-8');
    } catch {
      return null;
    }
  }

  function fileExists(absolutePath: string): boolean {
    try {
      return fs.existsSync(absolutePath);
    } catch {
      return false;
    }
  }

  function emitArtifactEvent(
    relativePath: string,
    eventType: ArtifactEventType,
    diff: ArtifactDiff,
  ): void {
    const artifactType = classifyArtifactType(relativePath);
    const payload: ArtifactEventPayload = {
      artifactPath: relativePath,
      artifactType,
      diff,
    };
    const event: Omit<EventBridgeEnvelope, 'seq'> = {
      v: 1,
      ts: new Date().toISOString(),
      type: eventType as EventBridgeEventType,
      data: payload,
    };
    onEvent(event);
  }

  function emitPhaseTransition(
    relativePath: string,
    previousPhase: string | null,
    currentPhase: string,
  ): void {
    const payload: PhaseTransitionPayload = {
      previousPhase,
      currentPhase,
      artifactPath: relativePath,
    };
    const event: Omit<EventBridgeEnvelope, 'seq'> = {
      v: 1,
      ts: new Date().toISOString(),
      type: 'phase.transition' as EventBridgeEventType,
      data: payload,
    };
    onEvent(event);
  }

  function emitVerdictChanged(
    relativePath: string,
    hypothesisId: string,
    previousVerdict: string | null,
    currentVerdict: string,
  ): void {
    const payload: VerdictChangedPayload = {
      hypothesisId,
      previousVerdict,
      currentVerdict,
      artifactPath: relativePath,
    };
    const event: Omit<EventBridgeEnvelope, 'seq'> = {
      v: 1,
      ts: new Date().toISOString(),
      type: 'verdict.changed' as EventBridgeEventType,
      data: payload,
    };
    onEvent(event);
  }

  function processFileChange(relativePath: string): void {
    const absolutePath = path.join(planningRoot, relativePath);
    const existing = hashMap.get(relativePath);
    const exists = fileExists(absolutePath);

    if (!exists && existing) {
      // File deleted
      const diff: ArtifactDiff = {
        previousHash: existing.hash,
        currentHash: null,
        changedFrontmatterKeys: [],
      };
      hashMap.delete(relativePath);
      logger.debug('file-watcher', 'artifact deleted', { path: relativePath });
      emitArtifactEvent(relativePath, 'artifact.deleted', diff);
      return;
    }

    if (!exists) {
      // File doesn't exist and never tracked -- ignore
      return;
    }

    const content = readFileSafe(absolutePath);
    if (content === null) return;

    const currentHash = md5(content);

    if (!existing) {
      // New file
      const diff: ArtifactDiff = {
        previousHash: null,
        currentHash,
        changedFrontmatterKeys: [],
      };
      hashMap.set(relativePath, { hash: currentHash, content });
      logger.debug('file-watcher', 'artifact created', { path: relativePath });
      emitArtifactEvent(relativePath, 'artifact.created', diff);

      // Check semantic events for new files
      checkSemanticEvents(relativePath, null, content);
      return;
    }

    if (currentHash === existing.hash) {
      // Content unchanged -- no event
      return;
    }

    // File modified
    const changedFrontmatterKeys = diffFrontmatterKeys(existing.content, content);
    const diff: ArtifactDiff = {
      previousHash: existing.hash,
      currentHash,
      changedFrontmatterKeys,
    };

    const previousContent = existing.content;
    hashMap.set(relativePath, { hash: currentHash, content });
    logger.debug('file-watcher', 'artifact modified', { path: relativePath, changedKeys: changedFrontmatterKeys });
    emitArtifactEvent(relativePath, 'artifact.modified', diff);

    // Check semantic events
    checkSemanticEvents(relativePath, previousContent, content);
  }

  function checkSemanticEvents(
    relativePath: string,
    previousContent: string | null,
    currentContent: string,
  ): void {
    const artifactType = classifyArtifactType(relativePath);

    // Phase transition: STATE.md config file changed
    if (artifactType === 'config' && relativePath.includes('STATE.md')) {
      const previousPhase = previousContent ? parsePhaseFromStateContent(previousContent) : null;
      const currentPhase = parsePhaseFromStateContent(currentContent);
      if (currentPhase && currentPhase !== previousPhase) {
        logger.info('file-watcher', 'phase transition detected', { from: previousPhase, to: currentPhase });
        emitPhaseTransition(relativePath, previousPhase, currentPhase);
      }
    }

    // Verdict changed: hypothesis file changed
    if (artifactType === 'hypothesis' || relativePath.includes('HYPOTHESES.md')) {
      const previousVerdict = previousContent ? parseVerdictFromContent(previousContent) : null;
      const currentVerdictInfo = parseVerdictFromContent(currentContent);
      if (currentVerdictInfo && currentVerdictInfo.verdict !== (previousVerdict?.verdict ?? null)) {
        logger.info('file-watcher', 'verdict changed', {
          hypothesisId: currentVerdictInfo.hypothesisId,
          from: previousVerdict?.verdict ?? null,
          to: currentVerdictInfo.verdict,
        });
        emitVerdictChanged(
          relativePath,
          currentVerdictInfo.hypothesisId,
          previousVerdict?.verdict ?? null,
          currentVerdictInfo.verdict,
        );
      }
    }
  }

  function handleFsEvent(_eventType: string, filename: string | null): void {
    if (!filename) return;

    const relativePath = filename.replace(/\\/g, '/');

    // Per-file debounce at 300ms
    const existingTimer = debounceTimers.get(relativePath);
    if (existingTimer) clearTimeout(existingTimer);

    debounceTimers.set(relativePath, setTimeout(() => {
      debounceTimers.delete(relativePath);
      processFileChange(relativePath);
    }, 300));
  }

  function scan(): void {
    logger.info('file-watcher', 'full scan starting', { root: planningRoot });
    const scanned = new Set<string>();

    function walkDir(dirPath: string): void {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          walkDir(fullPath);
        } else if (entry.isFile()) {
          const relativePath = path.relative(planningRoot, fullPath).replace(/\\/g, '/');
          scanned.add(relativePath);
          processFileChange(relativePath);
        }
      }
    }

    walkDir(planningRoot);

    // Detect deletions: any previously tracked paths not in the scan
    for (const tracked of hashMap.keys()) {
      if (!scanned.has(tracked)) {
        processFileChange(tracked);
      }
    }

    logger.info('file-watcher', 'full scan complete', { files: scanned.size });
  }

  function start(): void {
    if (fsWatcher) return;

    if (!fs.existsSync(planningRoot)) {
      logger.warn('file-watcher', 'planning root does not exist', { root: planningRoot });
      return;
    }

    try {
      fsWatcher = fs.watch(planningRoot, { recursive: true }, handleFsEvent);
      logger.info('file-watcher', 'started', { root: planningRoot });
    } catch (err) {
      logger.error('file-watcher', 'failed to start watcher', { error: String(err) });
    }
  }

  function stop(): void {
    if (fsWatcher) {
      try { fsWatcher.close(); } catch { /* ignore */ }
      fsWatcher = null;
    }
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer);
    }
    debounceTimers.clear();
    logger.info('file-watcher', 'stopped', {});
  }

  return { start, stop, scan };
}
