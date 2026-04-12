/**
 * IntelligenceService -- domain service for cross-hunt intelligence,
 * entity scanning, ingestion, and knowledge dashboard generation.
 *
 * Shell created in Plan 79-01. Logic moved from WorkspaceService in Plan 79-02.
 */

import type { VaultAdapter } from '../vault-adapter';
import type { EventBus } from './event-bus';
import type { IngestionResult, EntityInstruction } from '../types';
import { normalizePath } from '../paths';
import { ENTITY_FOLDERS, ENTITY_TYPES } from '../entity-schema';
import { parseReceipt } from '../parsers/receipt';
import { parseQueryLog } from '../parsers/query-log';
import {
  extractEntitiesFromReceipt,
  extractEntitiesFromQuery,
  deduplicateSightings,
  formatIngestionLog,
} from '../ingestion';
import {
  type EntityNote,
  buildRecurringIocs,
  buildCoverageGaps,
  buildActorConvergence,
  compareHunts,
  generateDashboardCanvas,
  type HuntSummary,
  type TopEntity,
} from '../cross-hunt';
import { parseEntityNote, scanEntityNotes } from '../entity-utils';
import {
  refreshEntityIntelligence as refreshEntityIntelCoordinator,
  type RefreshInput,
} from '../entity-intelligence';
import type { ConfidenceFactors } from '../confidence';
import type { HuntHistoryEntry } from '../hunt-history';

export class IntelligenceService {
  constructor(
    private vaultAdapter: VaultAdapter,
    private getPlanningDir: () => string,
    private eventBus?: EventBus,
  ) {}

  async runIngestion(): Promise<IngestionResult> {
    const planningDir = this.getPlanningDir();

    const allInstructions: EntityInstruction[] = [];

    // Scan RECEIPTS/ for RCT-*.md files
    const receiptsPath = normalizePath(`${planningDir}/RECEIPTS`);
    if (this.vaultAdapter.folderExists(receiptsPath)) {
      const receiptFiles = await this.vaultAdapter.listFiles(receiptsPath);
      const rctFiles = receiptFiles.filter(f => /^RCT-.*\.md$/.test(f));
      for (const fileName of rctFiles) {
        try {
          const filePath = normalizePath(`${receiptsPath}/${fileName}`);
          const content = await this.vaultAdapter.readFile(filePath);
          const snapshot = parseReceipt(content);
          const instructions = extractEntitiesFromReceipt(snapshot, fileName);
          allInstructions.push(...instructions);
        } catch {
          // Skip unreadable receipts
        }
      }
    }

    // Scan QUERIES/ for QRY-*.md files
    const queriesPath = normalizePath(`${planningDir}/QUERIES`);
    if (this.vaultAdapter.folderExists(queriesPath)) {
      const queryFiles = await this.vaultAdapter.listFiles(queriesPath);
      const qryFiles = queryFiles.filter(f => /^QRY-.*\.md$/.test(f));
      for (const fileName of qryFiles) {
        try {
          const filePath = normalizePath(`${queriesPath}/${fileName}`);
          const content = await this.vaultAdapter.readFile(filePath);
          const snapshot = parseQueryLog(content);
          const instructions = extractEntitiesFromQuery(snapshot, fileName);
          allInstructions.push(...instructions);
        } catch {
          // Skip unreadable queries
        }
      }
    }

    // Process entity instructions
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const instruction of allInstructions) {
      const entityNotePath = normalizePath(
        `${planningDir}/${instruction.folder}/${instruction.name}.md`,
      );

      if (this.vaultAdapter.fileExists(entityNotePath)) {
        // Entity note exists -- check for duplicate sighting
        const existingContent = await this.vaultAdapter.readFile(entityNotePath);
        const isNew = deduplicateSightings(existingContent, instruction.sourceId);

        if (!isNew) {
          skipped++;
          continue;
        }

        // Append sighting line after ## Sightings heading
        const sightingsMatch = existingContent.match(/^## Sightings\s*$/m);
        if (sightingsMatch && sightingsMatch.index !== undefined) {
          const insertPos = sightingsMatch.index + sightingsMatch[0].length;
          let updatedContent = existingContent;

          // Remove placeholder text if present
          updatedContent = updatedContent.replace(
            /^## Sightings\s*\n+_No sightings recorded yet\._/m,
            '## Sightings',
          );

          // Re-find ## Sightings position after placeholder removal
          const newMatch = updatedContent.match(/^## Sightings\s*$/m);
          if (newMatch && newMatch.index !== undefined) {
            const pos = newMatch.index + newMatch[0].length;
            updatedContent =
              updatedContent.slice(0, pos) +
              '\n' + instruction.sightingLine +
              updatedContent.slice(pos);
          }

          await this.vaultAdapter.modifyFile(entityNotePath, updatedContent);
        }

        updated++;
      } else {
        // Entity note does not exist -- create from template
        const entityDef = ENTITY_TYPES.find(
          (def) => def.type === instruction.entityType,
        );

        let content: string;
        if (entityDef) {
          content = entityDef.starterTemplate(instruction.name);
        } else {
          // Fallback: minimal entity note
          content = `# ${instruction.name}\n\n## Sightings\n\n_No sightings recorded yet._\n\n## Related\n\n`;
        }

        // Replace placeholder with sighting line
        content = content.replace(
          '_No sightings recorded yet._',
          instruction.sightingLine,
        );

        // Ensure entity folder exists
        const folderPath = normalizePath(`${planningDir}/${instruction.folder}`);
        await this.vaultAdapter.ensureFolder(folderPath);
        await this.vaultAdapter.createFile(entityNotePath, content);

        created++;
      }
    }

    // Build IngestionResult
    const result: IngestionResult = {
      created,
      updated,
      skipped,
      entities: allInstructions,
      timestamp: new Date().toISOString(),
    };

    // Append to INGESTION_LOG.md
    const logPath = normalizePath(`${planningDir}/INGESTION_LOG.md`);
    const logEntry = formatIngestionLog(result);

    if (this.vaultAdapter.fileExists(logPath)) {
      const existingLog = await this.vaultAdapter.readFile(logPath);
      await this.vaultAdapter.modifyFile(logPath, existingLog + '\n' + logEntry);
    } else {
      await this.vaultAdapter.createFile(
        logPath,
        '# Ingestion Log\n\n' + logEntry,
      );
    }

    return result;
  }

  async crossHuntIntel(): Promise<{ success: boolean; message: string; reportPath?: string }> {
    try {
      const planningDir = this.getPlanningDir();

      const allNotes = await scanEntityNotes(this.vaultAdapter, planningDir, planningDir);

      const recurringIocs = buildRecurringIocs(allNotes);
      const ttpNotes = allNotes.filter(n => n.entityType === 'ttp');
      const coverageGaps = buildCoverageGaps(ttpNotes);
      const iocNotes = allNotes.filter(n => n.entityType.startsWith('ioc'));
      const actorConvergence = buildActorConvergence(iocNotes);

      // Format markdown report
      const lines: string[] = [];
      lines.push('# Cross-Hunt Intelligence Report');
      lines.push('');
      lines.push(`Generated: ${new Date().toISOString()}`);
      lines.push('');

      // Recurring IOCs table
      lines.push('## Recurring IOCs');
      lines.push('');
      lines.push('IOCs seen across multiple hunts (2+ hunt references).');
      lines.push('');
      lines.push('| IOC | Type | Hunt Count | Hunts |');
      lines.push('|-----|------|------------|-------|');
      for (const ioc of recurringIocs) {
        lines.push(`| ${ioc.name} | ${ioc.entityType} | ${ioc.huntRefs.length} | ${ioc.huntRefs.join(', ')} |`);
      }
      lines.push('');

      // Coverage gaps
      lines.push('## TTP Coverage Gaps');
      lines.push('');
      lines.push('Techniques with zero hunts, grouped by ATT&CK tactic.');
      lines.push('');
      for (const gap of coverageGaps) {
        lines.push(`### ${gap.tactic}`);
        for (const g of gap.gaps) {
          lines.push(`- ${g}`);
        }
        lines.push('');
      }

      // Actor convergence table
      lines.push('## Actor Convergence');
      lines.push('');
      lines.push('Hunt pairs sharing 3+ IOCs (potential campaign linkage).');
      lines.push('');
      lines.push('| Hunt A | Hunt B | Shared IOCs |');
      lines.push('|--------|--------|-------------|');
      for (const pair of actorConvergence) {
        lines.push(`| ${pair.huntA} | ${pair.huntB} | ${pair.sharedIocs.join(', ')} |`);
      }
      lines.push('');

      const reportContent = lines.join('\n');
      const reportPath = normalizePath(`${planningDir}/CROSS_HUNT_INTEL.md`);

      if (this.vaultAdapter.fileExists(reportPath)) {
        await this.vaultAdapter.modifyFile(reportPath, reportContent);
      } else {
        await this.vaultAdapter.createFile(reportPath, reportContent);
      }

      return { success: true, message: 'Cross-hunt intelligence report generated', reportPath };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, message };
    }
  }

  async compareHuntsReport(
    huntAPath: string,
    huntBPath: string,
  ): Promise<{ success: boolean; message: string; reportPath?: string }> {
    try {
      const planningDir = this.getPlanningDir();

      const huntAEntities = await scanEntityNotes(this.vaultAdapter, huntAPath, huntAPath);
      const huntBEntities = await scanEntityNotes(this.vaultAdapter, huntBPath, huntBPath);

      const huntAName = huntAPath.split('/').pop() ?? huntAPath;
      const huntBName = huntBPath.split('/').pop() ?? huntBPath;

      const result = compareHunts({
        huntAName,
        huntAEntities,
        huntBName,
        huntBEntities,
      });

      const lines: string[] = [];
      lines.push(`# Hunt Comparison: ${huntAName} vs ${huntBName}`);
      lines.push('');
      lines.push(`Generated: ${new Date().toISOString()}`);
      lines.push('');

      lines.push(`## Shared Entities (${result.shared.length})`);
      lines.push('');
      lines.push('| Entity |');
      lines.push('|--------|');
      for (const name of result.shared) {
        lines.push(`| ${name} |`);
      }
      lines.push('');

      lines.push(`## Unique to ${huntAName} (${result.uniqueA.length})`);
      lines.push('');
      lines.push('| Entity |');
      lines.push('|--------|');
      for (const name of result.uniqueA) {
        lines.push(`| ${name} |`);
      }
      lines.push('');

      lines.push(`## Unique to ${huntBName} (${result.uniqueB.length})`);
      lines.push('');
      lines.push('| Entity |');
      lines.push('|--------|');
      for (const name of result.uniqueB) {
        lines.push(`| ${name} |`);
      }
      lines.push('');

      lines.push('## Combined Technique Coverage');
      lines.push('');
      lines.push('| Tactic | Techniques |');
      lines.push('|--------|------------|');
      for (const row of result.combinedTacticCoverage) {
        lines.push(`| ${row.tactic} | ${row.count} |`);
      }
      lines.push('');

      const reportContent = lines.join('\n');
      const reportPath = normalizePath(`${planningDir}/HUNT_COMPARISON.md`);

      if (this.vaultAdapter.fileExists(reportPath)) {
        await this.vaultAdapter.modifyFile(reportPath, reportContent);
      } else {
        await this.vaultAdapter.createFile(reportPath, reportContent);
      }

      return { success: true, message: 'Hunt comparison report generated', reportPath };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, message };
    }
  }

  async generateKnowledgeDashboard(): Promise<{ success: boolean; message: string; canvasPath?: string }> {
    try {
      const planningDir = this.getPlanningDir();

      // Build HuntSummary[] from cases/*/MISSION.md
      const hunts: HuntSummary[] = [];
      const casesPath = normalizePath(`${planningDir}/cases`);
      if (this.vaultAdapter.folderExists(casesPath)) {
        const subfolders = await this.vaultAdapter.listFolders(casesPath);
        for (const subfolder of subfolders) {
          const missionPath = normalizePath(`${planningDir}/cases/${subfolder}/MISSION.md`);
          if (this.vaultAdapter.fileExists(missionPath)) {
            const missionContent = await this.vaultAdapter.readFile(missionPath);
            const h1Match = missionContent.match(/^#\s+(.+)$/m);
            const huntName = h1Match ? h1Match[1]!.trim() : subfolder;

            // Count entity files across entity folders in this case
            let entityCount = 0;
            for (const folder of ENTITY_FOLDERS) {
              const entityFolderPath = normalizePath(`${planningDir}/cases/${subfolder}/${folder}`);
              if (this.vaultAdapter.folderExists(entityFolderPath)) {
                const files = await this.vaultAdapter.listFiles(entityFolderPath);
                entityCount += files.filter(f => f.endsWith('.md')).length;
              }
            }

            const mtime = this.vaultAdapter.getFileMtime(missionPath);
            const lastModified = mtime
              ? new Date(mtime).toISOString()
              : new Date().toISOString();

            hunts.push({
              name: huntName,
              entityCount,
              lastModified,
            });
          }
        }
      }

      // If no cases, use current workspace as single hunt
      if (hunts.length === 0) {
        const missionPath = normalizePath(`${planningDir}/MISSION.md`);
        let huntName = 'Current Hunt';
        if (this.vaultAdapter.fileExists(missionPath)) {
          const missionContent = await this.vaultAdapter.readFile(missionPath);
          const h1Match = missionContent.match(/^#\s+(.+)$/m);
          if (h1Match) {
            huntName = h1Match[1]!.trim();
          }
        }

        let entityCount = 0;
        for (const folder of ENTITY_FOLDERS) {
          const folderPath = normalizePath(`${planningDir}/${folder}`);
          if (this.vaultAdapter.folderExists(folderPath)) {
            const files = await this.vaultAdapter.listFiles(folderPath);
            entityCount += files.filter(f => f.endsWith('.md')).length;
          }
        }

        const mtime = this.vaultAdapter.getFileMtime(missionPath);
        const lastModified = mtime
          ? new Date(mtime).toISOString()
          : new Date().toISOString();

        hunts.push({
          name: huntName,
          entityCount,
          lastModified,
        });
      }

      // Build TopEntity[] from all entity notes
      const allNotes = await scanEntityNotes(this.vaultAdapter, planningDir, planningDir);
      const sortedNotes = [...allNotes].sort((a, b) => b.sightingsCount - a.sightingsCount);
      const topEntities: TopEntity[] = sortedNotes.slice(0, 10).map(n => ({
        name: n.name,
        entityType: n.entityType,
        sightingsCount: n.sightingsCount,
      }));

      // Build huntEntityLinks
      const huntEntityLinks = new Map<string, string[]>();
      const topEntityNames = new Set(topEntities.map(e => e.name));

      if (this.vaultAdapter.folderExists(casesPath)) {
        const subfolders = await this.vaultAdapter.listFolders(casesPath);
        for (const subfolder of subfolders) {
          const missionPath = normalizePath(`${planningDir}/cases/${subfolder}/MISSION.md`);
          if (!this.vaultAdapter.fileExists(missionPath)) continue;

          const missionContent = await this.vaultAdapter.readFile(missionPath);
          const h1Match = missionContent.match(/^#\s+(.+)$/m);
          const huntName = h1Match ? h1Match[1]!.trim() : subfolder;

          const linked: string[] = [];
          for (const folder of ENTITY_FOLDERS) {
            const entityFolderPath = normalizePath(`${planningDir}/cases/${subfolder}/${folder}`);
            if (!this.vaultAdapter.folderExists(entityFolderPath)) continue;
            const files = await this.vaultAdapter.listFiles(entityFolderPath);
            for (const f of files.filter(fn => fn.endsWith('.md'))) {
              const name = f.replace(/\.md$/, '');
              if (topEntityNames.has(name)) {
                linked.push(name);
              }
            }
          }

          if (linked.length > 0) {
            huntEntityLinks.set(huntName, linked);
          }
        }
      } else {
        // Single hunt: link to any matching top entities
        const huntName = hunts[0]?.name ?? 'Current Hunt';
        const linked: string[] = [];
        for (const folder of ENTITY_FOLDERS) {
          const folderPath = normalizePath(`${planningDir}/${folder}`);
          if (!this.vaultAdapter.folderExists(folderPath)) continue;
          const files = await this.vaultAdapter.listFiles(folderPath);
          for (const f of files.filter(fn => fn.endsWith('.md'))) {
            const name = f.replace(/\.md$/, '');
            if (topEntityNames.has(name)) {
              linked.push(name);
            }
          }
        }
        if (linked.length > 0) {
          huntEntityLinks.set(huntName, linked);
        }
      }

      const canvasData = generateDashboardCanvas(hunts, topEntities, huntEntityLinks);

      const canvasPath = normalizePath(`${planningDir}/CANVAS_DASHBOARD.canvas`);
      const canvasJson = JSON.stringify(canvasData, null, 2);

      if (this.vaultAdapter.fileExists(canvasPath)) {
        await this.vaultAdapter.modifyFile(canvasPath, canvasJson);
      } else {
        await this.vaultAdapter.createFile(canvasPath, canvasJson);
      }

      return { success: true, message: 'Knowledge dashboard generated', canvasPath };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, message };
    }
  }

  async refreshEntityIntelligence(
    filePath: string,
    halfLifeDays: number,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const planningDir = this.getPlanningDir();

      // Read and parse the entity note
      const content = await this.vaultAdapter.readFile(filePath);
      const fileName = filePath.split('/').pop() ?? filePath;
      const entity = parseEntityNote(content, fileName);

      // Scan all entity notes for co-occurrence
      const allEntities = await scanEntityNotes(
        this.vaultAdapter,
        planningDir,
        planningDir,
      );

      // Build HuntHistoryEntry[] from the entity's huntRefs
      const huntEntries: HuntHistoryEntry[] = entity.huntRefs.map((ref) => {
        const lastSeen = entity.frontmatter['last_seen'];
        const date =
          typeof lastSeen === 'string' && lastSeen
            ? lastSeen
            : new Date().toISOString().slice(0, 10);
        const verdict = entity.frontmatter['verdict'];
        const outcome =
          typeof verdict === 'string' && verdict ? verdict : 'unknown';
        return {
          huntId: ref,
          date,
          role: 'indicator' as const,
          outcome,
        };
      });

      // Extract confidence factors from frontmatter
      const confidenceFactors: ConfidenceFactors = {
        source_count:
          typeof entity.frontmatter['source_count'] === 'number'
            ? entity.frontmatter['source_count']
            : 0,
        reliability:
          typeof entity.frontmatter['reliability'] === 'number'
            ? entity.frontmatter['reliability']
            : 0,
        corroboration:
          typeof entity.frontmatter['corroboration'] === 'number'
            ? entity.frontmatter['corroboration']
            : 0,
        days_since_validation:
          typeof entity.frontmatter['days_since_validation'] === 'number'
            ? entity.frontmatter['days_since_validation']
            : 0,
      };

      const input: RefreshInput = {
        entityContent: content,
        entityName: entity.name,
        entityHuntRefs: entity.huntRefs,
        huntEntries,
        allEntities,
        confidenceFactors,
        confidenceConfig: { half_life_days: halfLifeDays },
      };

      const result = refreshEntityIntelCoordinator(input);

      await this.vaultAdapter.modifyFile(filePath, result.content);

      return {
        success: true,
        message: `Entity intelligence refreshed (${result.huntHistoryCount} hunts, ${result.coOccurrenceCount} co-occurrences, confidence: ${result.confidenceScore})`,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, message };
    }
  }
}
