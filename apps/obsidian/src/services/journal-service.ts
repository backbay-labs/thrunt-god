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
import {
  extractPlaybookData,
  generatePlaybookNote,
  parsePlaybookFrontmatter,
  applyPlaybookToMission,
  buildPlaybookJournalEntries,
} from '../playbook';
import { buildReceiptTimeline } from '../ingestion';
import { parseReceipt } from '../parsers/receipt';
import { ENTITY_FOLDERS } from '../entity-schema';

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

  // ---------------------------------------------------------------------------
  // Playbook methods (Phase 90)
  // ---------------------------------------------------------------------------

  /**
   * Generate a playbook from the current hunt's journal and receipts.
   *
   * Reads journal content, scans RECEIPTS/ for RCT-*.md files, collects
   * entity types from entity folders, then writes PLAYBOOK-{huntId}.md
   * to the playbooks/ directory.
   */
  async generatePlaybook(huntId: string): Promise<{ path: string }> {
    const planningDir = this.getPlanningDir();

    // Read journal content
    const journalPath = this.getJournalPath(huntId);
    const journalContent = await this.vaultAdapter.readFile(journalPath);

    // Read receipt timeline
    const receiptsDir = normalizePath(planningDir + '/RECEIPTS');
    const parsed: Array<{ fileName: string; snapshot: import('../types').ReceiptSnapshot }> = [];
    if (this.vaultAdapter.folderExists(receiptsDir)) {
      const receiptFiles = await this.vaultAdapter.listFiles(receiptsDir);
      const rctFiles = receiptFiles.filter(f => /^RCT-.*\.md$/.test(f));
      for (const fileName of rctFiles) {
        try {
          const filePath = normalizePath(receiptsDir + '/' + fileName);
          const content = await this.vaultAdapter.readFile(filePath);
          const snapshot = parseReceipt(content);
          parsed.push({ fileName, snapshot });
        } catch {
          // Skip unreadable receipts
        }
      }
    }
    const receiptTimeline = buildReceiptTimeline(parsed);

    // Collect entity types from entity folders
    const entityTypes: string[] = [];
    for (const folder of ENTITY_FOLDERS) {
      const folderPath = normalizePath(planningDir + '/' + folder);
      if (this.vaultAdapter.folderExists(folderPath)) {
        const files = await this.vaultAdapter.listFiles(folderPath);
        const mdFiles = files.filter(f => f.endsWith('.md'));
        if (mdFiles.length > 0) {
          // Extract entity type from folder name
          const parts = folder.split('/');
          const typeName = parts[parts.length - 1] ?? folder;
          entityTypes.push(typeName);
        }
      }
    }

    // Generate playbook data and note
    const data = extractPlaybookData(journalContent, receiptTimeline, entityTypes);
    // Ensure huntId is set even if not found in frontmatter
    data.huntId = data.huntId || huntId;
    const noteContent = generatePlaybookNote(data, new Date());

    // Write playbook to playbooks/ directory
    const playbooksDir = normalizePath(planningDir + '/playbooks');
    await this.vaultAdapter.ensureFolder(playbooksDir);
    const playbookPath = normalizePath(playbooksDir + '/PLAYBOOK-' + huntId + '.md');
    await this.vaultAdapter.createFile(playbookPath, noteContent);

    return { path: playbookPath };
  }

  /**
   * List available playbooks in the playbooks/ directory.
   *
   * Scans .planning/playbooks/ for PLAYBOOK-*.md files and parses
   * each file's frontmatter for display information.
   */
  async listPlaybooks(): Promise<Array<{ id: string; name: string; description: string }>> {
    const planningDir = this.getPlanningDir();
    const playbooksDir = normalizePath(planningDir + '/playbooks');

    if (!this.vaultAdapter.folderExists(playbooksDir)) {
      return [];
    }

    const files = await this.vaultAdapter.listFiles(playbooksDir);
    const playbookFiles = files.filter(f => /^PLAYBOOK-.*\.md$/.test(f));

    const results: Array<{ id: string; name: string; description: string }> = [];
    for (const fileName of playbookFiles) {
      try {
        const filePath = normalizePath(playbooksDir + '/' + fileName);
        const content = await this.vaultAdapter.readFile(filePath);
        const parsed = parsePlaybookFrontmatter(content);
        const huntId = fileName.replace(/^PLAYBOOK-/, '').replace(/\.md$/, '');
        results.push({
          id: fileName,
          name: huntId,
          description: parsed.triggerConditions[0] ?? 'No trigger conditions',
        });
      } catch {
        // Skip unreadable playbooks
      }
    }

    return results;
  }

  /**
   * Apply a playbook to a new hunt, pre-populating MISSION.md and journal.
   *
   * Reads the playbook, updates MISSION.md hypothesis from trigger conditions,
   * creates a journal with initial entries from the playbook, and increments
   * the playbook's applied_count.
   */
  async applyPlaybook(
    playbookId: string,
    newHuntId: string,
  ): Promise<{ missionPath: string; journalPath: string }> {
    const planningDir = this.getPlanningDir();

    // Read playbook content
    const playbooksDir = normalizePath(planningDir + '/playbooks');
    const playbookPath = normalizePath(playbooksDir + '/' + playbookId);
    let playbookContent = await this.vaultAdapter.readFile(playbookPath);
    const parsed = parsePlaybookFrontmatter(playbookContent);

    // Read MISSION.md and check for existing hunt_id
    const missionPath = normalizePath(planningDir + '/MISSION.md');
    let missionContent = await this.vaultAdapter.readFile(missionPath);
    const huntIdMatch = missionContent.match(/^hunt_id:\s*"?([^"\n]+)/m);
    const existingHuntId = huntIdMatch ? huntIdMatch[1]!.trim() : '';
    if (existingHuntId && existingHuntId !== '') {
      throw new Error('MISSION.md already has a hunt_id set');
    }

    // Update MISSION.md hypothesis from trigger conditions
    missionContent = applyPlaybookToMission(missionContent, parsed.triggerConditions);
    await this.vaultAdapter.modifyFile(missionPath, missionContent);

    // Create journal with initial entries from playbook
    const { path: journalPath } = await this.createJournal(
      newHuntId,
      parsed.triggerConditions[0] ?? '',
    );

    // Append playbook journal entries
    const journalEntries = buildPlaybookJournalEntries(
      parsed.triggerConditions,
      new Date(),
    );
    if (journalEntries) {
      let journalContent = await this.vaultAdapter.readFile(journalPath);
      journalContent += '\n' + journalEntries;
      await this.vaultAdapter.modifyFile(journalPath, journalContent);
    }

    // Update playbook applied_count and last_applied
    const countMatch = playbookContent.match(/^applied_count:\s*(\d+)/m);
    const currentCount = countMatch ? parseInt(countMatch[1]!, 10) : 0;
    playbookContent = updateFrontmatter(playbookContent, {
      applied_count: currentCount + 1,
      last_applied: new Date().toISOString().slice(0, 10),
    });
    await this.vaultAdapter.modifyFile(playbookPath, playbookContent);

    return { missionPath, journalPath };
  }
}
