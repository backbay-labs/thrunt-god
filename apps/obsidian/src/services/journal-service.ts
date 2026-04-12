/**
 * JournalService -- vault I/O service for hunt journal operations.
 *
 * Mediates between the pure journal.ts module and Obsidian vault reads/writes.
 * Constructor pattern matches WatcherService: (vaultAdapter, getPlanningDir, eventBus).
 *
 * Emits hypothesis:changed on EventBus when journal entries contain #thrunt/h/ tags.
 */

import type { VaultAdapter } from '../vault-adapter';
import type { EventBus } from './event-bus';
import { normalizePath } from '../paths';
import {
  createJournalNote,
  appendJournalEntry,
  extractTags,
  buildSummarySection,
  replaceSummarySection,
} from '../journal';
import { formatTimestamp } from '../verdict';
import { updateFrontmatter } from '../frontmatter-editor';

export class JournalService {
  constructor(
    private vaultAdapter: VaultAdapter,
    private getPlanningDir: () => string,
    private eventBus?: EventBus,
  ) {}

  /**
   * Get the vault path for a journal note.
   */
  getJournalPath(huntId: string): string {
    return normalizePath(this.getPlanningDir() + '/journals/JOURNAL-' + huntId + '.md');
  }

  /**
   * Check whether a journal note exists for the given hunt ID.
   */
  async journalExists(huntId: string): Promise<boolean> {
    const path = this.getJournalPath(huntId);
    return this.vaultAdapter.fileExists(path);
  }

  /**
   * List hunt IDs for all existing journal notes.
   *
   * Scans .planning/journals/ for JOURNAL-*.md files and extracts hunt IDs.
   */
  async listJournals(): Promise<string[]> {
    const journalsDir = normalizePath(this.getPlanningDir() + '/journals');
    if (!this.vaultAdapter.folderExists(journalsDir)) {
      return [];
    }

    const files = await this.vaultAdapter.listFiles(journalsDir);
    const huntIds: string[] = [];
    for (const file of files) {
      const match = file.match(/^JOURNAL-(.+)\.md$/);
      if (match && match[1]) {
        huntIds.push(match[1]);
      }
    }
    return huntIds;
  }

  /**
   * Create a new hunt journal note.
   *
   * Ensures the journals/ directory exists, generates the journal template,
   * and writes it to disk.
   */
  async createJournal(huntId: string, hypothesis: string): Promise<{ path: string }> {
    const journalsDir = normalizePath(this.getPlanningDir() + '/journals');
    await this.vaultAdapter.ensureFolder(journalsDir);

    const path = this.getJournalPath(huntId);
    const content = createJournalNote(huntId, hypothesis, new Date());
    await this.vaultAdapter.createFile(path, content);

    return { path };
  }

  /**
   * Append a timestamped entry to an existing journal.
   *
   * If the journal does not exist, creates it first with a default hypothesis.
   * After appending, scans the entry for #thrunt/h/ tags and emits
   * hypothesis:changed on EventBus if any are found.
   */
  async appendEntry(huntId: string, entryText: string): Promise<{ path: string }> {
    const path = this.getJournalPath(huntId);

    // Auto-create journal if it does not exist
    if (!this.vaultAdapter.fileExists(path)) {
      await this.createJournal(huntId, 'To be determined');
    }

    // Read current content
    let content = await this.vaultAdapter.readFile(path);

    // Append the entry
    const timestamp = formatTimestamp(new Date());
    content = appendJournalEntry(content, timestamp, entryText);

    // Update the `updated` frontmatter field
    const dateStr = new Date().toISOString().slice(0, 10);
    content = updateFrontmatter(content, { updated: dateStr });

    // Write back
    await this.vaultAdapter.modifyFile(path, content);

    // Check for hypothesis tags and emit event
    const tags = extractTags(content);
    const hypothesisTags = tags.filter((t) => t.type === 'hypothesis');
    if (hypothesisTags.length > 0 && this.eventBus) {
      for (const tag of hypothesisTags) {
        this.eventBus.emit('hypothesis:changed', {
          huntId,
          hypothesis: tag.value,
          journalPath: path,
        });
      }
    }

    return { path };
  }

  /**
   * Generate a structured summary section from journal tags.
   *
   * Reads the journal, extracts all #thrunt/ tags, builds a ## Summary
   * section, and replaces/appends it in the journal content.
   */
  async generateSummary(huntId: string): Promise<{ path: string }> {
    const path = this.getJournalPath(huntId);

    let content = await this.vaultAdapter.readFile(path);

    const tags = extractTags(content);
    const summary = buildSummarySection(tags);
    content = replaceSummarySection(content, summary);

    await this.vaultAdapter.modifyFile(path, content);

    return { path };
  }
}
