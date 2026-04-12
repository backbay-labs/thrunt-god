/**
 * CanvasService -- domain service for Obsidian Canvas generation
 * (hunt canvases, current-hunt canvases).
 *
 * Shell created in Plan 79-01. Logic moved from WorkspaceService in Plan 79-02.
 */

import type { VaultAdapter } from '../vault-adapter';
import type { EventBus } from './event-bus';
import type { CanvasEntity, CanvasData } from '../types';
import { normalizePath } from '../paths';
import { ENTITY_FOLDERS } from '../entity-schema';
import { parseReceipt } from '../parsers/receipt';
import {
  extractEntitiesFromReceipt,
} from '../ingestion';
import {
  generateKillChainCanvas,
  generateDiamondCanvas,
  generateLateralMovementCanvas,
  generateHuntProgressionCanvas,
  type EdgeGroup,
} from '../canvas-generator';
import { parseFrontmatterFields } from '../entity-utils';

export class CanvasService {
  constructor(
    private vaultAdapter: VaultAdapter,
    private getPlanningDir: () => string,
    private eventBus?: EventBus,
  ) {}

  async generateHuntCanvas(
    templateName: 'kill-chain' | 'diamond' | 'lateral-movement' | 'hunt-progression',
  ): Promise<{ success: boolean; message: string; canvasPath?: string }> {
    try {
      const planningDir = this.getPlanningDir();

      const entities: CanvasEntity[] = [];

      // Scan entity folders for .md files
      for (const folder of ENTITY_FOLDERS) {
        const folderPath = normalizePath(`${planningDir}/${folder}`);
        if (!this.vaultAdapter.folderExists(folderPath)) continue;

        const files = await this.vaultAdapter.listFiles(folderPath);
        const mdFiles = files.filter(f => f.endsWith('.md'));

        for (const fileName of mdFiles) {
          try {
            const filePath = normalizePath(`${folderPath}/${fileName}`);
            const content = await this.vaultAdapter.readFile(filePath);
            const fm = parseFrontmatterFields(content);
            const id = fileName.replace(/\.md$/, '');

            entities.push({
              id,
              name: id,
              entityType: fm.type || 'ttp',
              tactic: fm.tactic || undefined,
              notePath: filePath,
            });
          } catch {
            // Skip unreadable files
          }
        }
      }

      // Scan RECEIPTS/ for EdgeGroup data
      const edgeGroups: EdgeGroup[] = [];
      const receiptsPath = normalizePath(`${planningDir}/RECEIPTS`);
      if (this.vaultAdapter.folderExists(receiptsPath)) {
        const receiptFiles = await this.vaultAdapter.listFiles(receiptsPath);
        const rctFiles = receiptFiles.filter(f => /^RCT-.*\.md$/.test(f));

        for (const fileName of rctFiles) {
          try {
            const filePath = normalizePath(`${receiptsPath}/${fileName}`);
            const content = await this.vaultAdapter.readFile(filePath);
            const snapshot = parseReceipt(content);
            const receiptEntities = extractEntitiesFromReceipt(snapshot, fileName);
            const groupIds = receiptEntities.map(e => e.name);
            if (groupIds.length > 0) {
              edgeGroups.push({ entities: groupIds });
            }
          } catch {
            // Skip unreadable receipts
          }
        }
      }

      // Call appropriate generator
      const generators: Record<string, (e: CanvasEntity[], g?: EdgeGroup[]) => CanvasData> = {
        'kill-chain': generateKillChainCanvas,
        'diamond': generateDiamondCanvas,
        'lateral-movement': generateLateralMovementCanvas,
        'hunt-progression': generateHuntProgressionCanvas,
      };

      const generator = generators[templateName]!;
      const canvasData = generator(entities, edgeGroups);

      // Output path
      const outputFileName = `CANVAS_${templateName.toUpperCase().replace(/-/g, '_')}.canvas`;
      const canvasPath = normalizePath(`${planningDir}/${outputFileName}`);
      const canvasJson = JSON.stringify(canvasData, null, 2);

      if (this.vaultAdapter.fileExists(canvasPath)) {
        await this.vaultAdapter.modifyFile(canvasPath, canvasJson);
      } else {
        await this.vaultAdapter.createFile(canvasPath, canvasJson);
      }

      return { success: true, message: `Canvas created: ${outputFileName}`, canvasPath };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, message };
    }
  }

  async canvasFromCurrentHunt(
    templateName: 'kill-chain' | 'diamond' | 'lateral-movement' | 'hunt-progression' = 'kill-chain',
  ): Promise<{ success: boolean; message: string; canvasPath?: string }> {
    try {
      const planningDir = this.getPlanningDir();

      const entitiesMap = new Map<string, CanvasEntity>();
      const edgeGroups: EdgeGroup[] = [];

      // Check for findings + receipts
      const findingsPath = normalizePath(`${planningDir}/FINDINGS.md`);
      const receiptsPath = normalizePath(`${planningDir}/RECEIPTS`);
      const hasFindingsFile = this.vaultAdapter.fileExists(findingsPath);
      const hasReceiptsFolder = this.vaultAdapter.folderExists(receiptsPath);

      if (!hasFindingsFile && !hasReceiptsFolder) {
        return { success: false, message: 'No findings or receipts found. Run a hunt first.' };
      }

      // Extract from FINDINGS.md
      if (hasFindingsFile) {
        const findingsContent = await this.vaultAdapter.readFile(findingsPath);

        // Extract technique refs (T1234, T1234.567)
        const techniqueRegex = /T\d{4}(?:\.\d{3})?/g;
        const techMatches = findingsContent.match(techniqueRegex) ?? [];
        for (const ref of new Set(techMatches)) {
          if (!entitiesMap.has(ref)) {
            entitiesMap.set(ref, {
              id: ref,
              name: ref,
              entityType: 'ttp',
              tactic: undefined,
              notePath: undefined,
            });
          }
        }

        // Extract wiki-links [[Name]]
        const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
        let wlMatch: RegExpExecArray | null;
        while ((wlMatch = wikiLinkRegex.exec(findingsContent)) !== null) {
          const name = wlMatch[1]!;
          if (!entitiesMap.has(name)) {
            entitiesMap.set(name, {
              id: name,
              name,
              entityType: 'ttp', // default; will be refined below if it's a TTP note
              tactic: undefined,
              notePath: undefined,
            });
          }
        }
      }

      // Extract from validated receipts
      if (hasReceiptsFolder) {
        const receiptFiles = await this.vaultAdapter.listFiles(receiptsPath);
        const rctFiles = receiptFiles.filter(f => /^RCT-.*\.md$/.test(f));

        for (const fileName of rctFiles) {
          try {
            const filePath = normalizePath(`${receiptsPath}/${fileName}`);
            const content = await this.vaultAdapter.readFile(filePath);
            const snapshot = parseReceipt(content);

            // Only include validated receipts (claim_status "supports")
            if (snapshot.claim_status !== 'supports') continue;

            // Technique refs as TTP entities
            for (const ref of snapshot.technique_refs) {
              if (!entitiesMap.has(ref)) {
                entitiesMap.set(ref, {
                  id: ref,
                  name: ref,
                  entityType: 'ttp',
                  tactic: undefined,
                  notePath: undefined,
                });
              }
            }

            // IOC entities from receipt via extractEntitiesFromReceipt
            const instructions = extractEntitiesFromReceipt(snapshot, fileName);
            for (const instr of instructions) {
              if (!entitiesMap.has(instr.name)) {
                entitiesMap.set(instr.name, {
                  id: instr.name,
                  name: instr.name,
                  entityType: instr.entityType,
                  tactic: undefined,
                  notePath: undefined,
                });
              }
            }

            // Build edge group from receipt's entities
            const groupIds = [
              ...snapshot.technique_refs,
              ...instructions.map(i => i.name),
            ];
            if (groupIds.length > 0) {
              edgeGroups.push({ entities: groupIds });
            }
          } catch {
            // Skip unreadable receipts
          }
        }
      }

      // Look up tactic for TTP entities from vault notes
      for (const [id, entity] of entitiesMap) {
        if (entity.entityType === 'ttp') {
          const ttpNotePath = normalizePath(`${planningDir}/entities/ttps/${id}.md`);
          if (this.vaultAdapter.fileExists(ttpNotePath)) {
            try {
              const noteContent = await this.vaultAdapter.readFile(ttpNotePath);
              const fm = parseFrontmatterFields(noteContent);
              if (fm.tactic) {
                entity.tactic = fm.tactic;
              }
              entity.notePath = ttpNotePath;
            } catch {
              // Skip unreadable notes
            }
          }
        }
      }

      const entities = [...entitiesMap.values()];
      const generators: Record<string, (e: CanvasEntity[], g?: EdgeGroup[]) => CanvasData> = {
        'kill-chain': generateKillChainCanvas,
        'diamond': generateDiamondCanvas,
        'lateral-movement': generateLateralMovementCanvas,
        'hunt-progression': generateHuntProgressionCanvas,
      };
      const generator = generators[templateName]!;
      const canvasData = generator(entities, edgeGroups);

      const outputFileName = `CANVAS_HUNT_${templateName.toUpperCase().replace(/-/g, '_')}.canvas`;
      const canvasPath = normalizePath(`${planningDir}/${outputFileName}`);
      const canvasJson = JSON.stringify(canvasData, null, 2);

      if (this.vaultAdapter.fileExists(canvasPath)) {
        await this.vaultAdapter.modifyFile(canvasPath, canvasJson);
      } else {
        await this.vaultAdapter.createFile(canvasPath, canvasJson);
      }

      return {
        success: true,
        message: `Hunt canvas created with ${entities.length} entities`,
        canvasPath,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, message };
    }
  }
}
