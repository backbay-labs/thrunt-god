/**
 * CanvasService -- domain service for Obsidian Canvas generation
 * (hunt canvases, current-hunt canvases).
 *
 * Shell created in Plan 79-01. Logic moved from WorkspaceService in Plan 79-02.
 */

import type { VaultAdapter } from '../vault-adapter';
import type { EventBus } from './event-bus';
import type { CanvasEntity, CanvasData, CanvasNode } from '../types';
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
import { resolveEntityColor, patchCanvasNodeColors, parseCanvasRelevantFields } from '../canvas-adapter';

// --- Grid layout constants ---

const NODE_WIDTH = 250;
const NODE_HEIGHT = 60;
const COL_GAP = 20;
const ROW_GAP = 20;
const COLS_PER_ROW = 4;

/** Gray color for removed / orphaned entity nodes */
const REMOVED_ENTITY_COLOR = '#757575';

/**
 * Compute position for a new node in a 4-column grid layout below existing nodes.
 *
 * Pure function -- no side effects. Used by handleEntityCreated for grid placement.
 *
 * @param existingNodes - current canvas nodes (used to find bottom edge)
 * @param nodeIndex - index within the current batch (0 = first new node in batch)
 */
export function computeNewNodePosition(
  existingNodes: CanvasNode[],
  nodeIndex: number = 0,
): { x: number; y: number } {
  let startY = 0;
  if (existingNodes.length > 0) {
    const maxBottom = Math.max(...existingNodes.map(n => n.y + n.height));
    startY = maxBottom + ROW_GAP;
  }

  const col = nodeIndex % COLS_PER_ROW;
  const row = Math.floor(nodeIndex / COLS_PER_ROW);

  return {
    x: col * (NODE_WIDTH + COL_GAP),
    y: startY + row * (NODE_HEIGHT + ROW_GAP),
  };
}

/**
 * Detect whether an entity content change is substantive (verdict, confidence, type)
 * versus cosmetic (whitespace, body text only).
 *
 * Pure function -- uses parseCanvasRelevantFields to compare structured fields.
 */
export function isSubstantiveEntityChange(oldContent: string, newContent: string): boolean {
  const oldFields = parseCanvasRelevantFields(oldContent);
  const newFields = parseCanvasRelevantFields(newContent);

  return (
    oldFields.type !== newFields.type ||
    oldFields.verdict !== newFields.verdict ||
    oldFields.confidenceScore !== newFields.confidenceScore
  );
}

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
      const canvasJson = JSON.stringify(canvasData, null, '\t');

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

  /**
   * Check if a file path is under one of the entity folders.
   */
  private isEntityPath(filePath: string): boolean {
    const planningDir = this.getPlanningDir();
    return ENTITY_FOLDERS.some(folder =>
      filePath.startsWith(planningDir + '/' + folder + '/'),
    );
  }

  /**
   * List all .canvas files in the planning directory (non-recursive).
   */
  async findCanvasFiles(): Promise<string[]> {
    const planningDir = this.getPlanningDir();
    const files = await this.vaultAdapter.listFiles(planningDir);
    return files
      .filter(f => f.endsWith('.canvas'))
      .map(f => normalizePath(`${planningDir}/${f}`));
  }

  /**
   * Handle a single entity file modification: read its type, resolve color,
   * then patch all canvas files that reference this entity path.
   */
  async handleEntityModified(entityPath: string): Promise<void> {
    if (!this.isEntityPath(entityPath)) return;

    const content = await this.vaultAdapter.readFile(entityPath);
    const { type: entityType } = parseCanvasRelevantFields(content);
    const color = resolveEntityColor(entityType);
    const colorMap = new Map<string, string>([[entityPath, color]]);

    const canvasFiles = await this.findCanvasFiles();
    let anyPatched = false;

    for (const canvasPath of canvasFiles) {
      try {
        const raw = await this.vaultAdapter.readFile(canvasPath);
        const canvasData = JSON.parse(raw) as CanvasData;
        const { patched, changedCount } = patchCanvasNodeColors(canvasData, colorMap);
        if (changedCount > 0) {
          await this.vaultAdapter.modifyFile(canvasPath, JSON.stringify(patched, null, '\t'));
          anyPatched = true;
          this.eventBus?.emit('canvas:refreshed', { canvasPath, changedCount });
        }
      } catch {
        // Silently skip malformed .canvas files
      }
    }
  }

  /**
   * Full refresh: scan all entity notes, resolve colors, then patch every
   * canvas file in one batch pass.
   */
  async refreshAllCanvasNodes(): Promise<{ totalPatched: number }> {
    const planningDir = this.getPlanningDir();
    const colorMap = new Map<string, string>();

    // Build color map from all entity files
    for (const folder of ENTITY_FOLDERS) {
      const folderPath = normalizePath(`${planningDir}/${folder}`);
      if (!this.vaultAdapter.folderExists(folderPath)) continue;

      const files = await this.vaultAdapter.listFiles(folderPath);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      for (const fileName of mdFiles) {
        try {
          const filePath = normalizePath(`${folderPath}/${fileName}`);
          const content = await this.vaultAdapter.readFile(filePath);
          const { type: entityType } = parseCanvasRelevantFields(content);
          const color = resolveEntityColor(entityType);
          colorMap.set(filePath, color);
        } catch {
          // Skip unreadable entity files
        }
      }
    }

    // Patch all canvas files
    const canvasFiles = await this.findCanvasFiles();
    let totalPatched = 0;

    for (const canvasPath of canvasFiles) {
      try {
        const raw = await this.vaultAdapter.readFile(canvasPath);
        const canvasData = JSON.parse(raw) as CanvasData;
        const { patched, changedCount } = patchCanvasNodeColors(canvasData, colorMap);
        if (changedCount > 0) {
          await this.vaultAdapter.modifyFile(canvasPath, JSON.stringify(patched, null, '\t'));
          totalPatched += changedCount;
          this.eventBus?.emit('canvas:refreshed', { canvasPath, changedCount });
        }
      } catch {
        // Silently skip malformed .canvas files
      }
    }

    return { totalPatched };
  }

  /**
   * Handle entity:created event -- append a new file-type node to live-hunt.canvas.
   *
   * Idempotent: skips if node with same file path already exists.
   * Creates live-hunt.canvas if it does not exist.
   * Silently returns if canvas file is malformed JSON.
   */
  async handleEntityCreated(event: { name: string; entityType: string; sourcePath: string }): Promise<void> {
    const planningDir = this.getPlanningDir();
    const canvasPath = normalizePath(`${planningDir}/live-hunt.canvas`);

    let canvasData: CanvasData;
    let fileExisted = false;

    if (this.vaultAdapter.fileExists(canvasPath)) {
      fileExisted = true;
      try {
        const raw = await this.vaultAdapter.readFile(canvasPath);
        canvasData = JSON.parse(raw) as CanvasData;
      } catch {
        // Malformed JSON -- silently return
        return;
      }
    } else {
      canvasData = { nodes: [], edges: [] };
    }

    // Idempotent: skip if node already exists for this file
    const alreadyExists = canvasData.nodes.some(
      n => n.type === 'file' && n.file === event.sourcePath,
    );
    if (alreadyExists) return;

    // Compute grid position: find bottom-most row, fill across columns
    let x: number;
    let y: number;

    if (canvasData.nodes.length === 0) {
      x = 0;
      y = 0;
    } else {
      const maxBottom = Math.max(...canvasData.nodes.map(n => n.y + n.height));
      // Find all nodes whose bottom edge reaches maxBottom (i.e., on the bottom-most row).
      // Use a small tolerance to handle nodes of different heights on the same visual row.
      const maxY = Math.max(...canvasData.nodes.map(n => n.y));
      const nodesOnLastRow = canvasData.nodes.filter(n => n.y === maxY);
      const bottomRowCount = nodesOnLastRow.length;

      if (bottomRowCount < COLS_PER_ROW) {
        // Fill next column in current bottom row
        x = bottomRowCount * (NODE_WIDTH + COL_GAP);
        y = maxY;
      } else {
        // Start new row
        x = 0;
        y = maxBottom + ROW_GAP;
      }
    }

    const newNode: CanvasNode = {
      id: `entity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      x,
      y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      type: 'file',
      file: event.sourcePath,
      color: resolveEntityColor(event.entityType),
    };

    canvasData.nodes.push(newNode);

    const canvasJson = JSON.stringify(canvasData, null, '\t');

    if (fileExisted) {
      await this.vaultAdapter.modifyFile(canvasPath, canvasJson);
    } else {
      await this.vaultAdapter.createFile(canvasPath, canvasJson);
    }

    this.eventBus?.emit('canvas:refreshed', { canvasPath, changedCount: 1 });
  }

  /**
   * Refresh CANVAS_DASHBOARD.canvas: re-resolve entity colors, gray out removed entities.
   *
   * Reads all entity files to build a color map, then patches canvas node colors.
   * File-type nodes whose entity file no longer exists on disk are grayed out (#757575)
   * rather than removed (per user decision: "Mark removed entities visually (gray color) instead").
   */
  async refreshDashboardCanvas(): Promise<void> {
    const planningDir = this.getPlanningDir();
    const canvasPath = normalizePath(`${planningDir}/CANVAS_DASHBOARD.canvas`);

    if (!this.vaultAdapter.fileExists(canvasPath)) return;

    let canvasData: CanvasData;
    try {
      const raw = await this.vaultAdapter.readFile(canvasPath);
      canvasData = JSON.parse(raw) as CanvasData;
    } catch {
      // Malformed JSON -- silently return
      return;
    }

    // Build color map from all entity files
    const colorMap = new Map<string, string>();
    for (const folder of ENTITY_FOLDERS) {
      const folderPath = normalizePath(`${planningDir}/${folder}`);
      if (!this.vaultAdapter.folderExists(folderPath)) continue;

      const files = await this.vaultAdapter.listFiles(folderPath);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      for (const fileName of mdFiles) {
        try {
          const filePath = normalizePath(`${folderPath}/${fileName}`);
          const content = await this.vaultAdapter.readFile(filePath);
          const { type: entityType } = parseCanvasRelevantFields(content);
          const color = resolveEntityColor(entityType);
          colorMap.set(filePath, color);
        } catch {
          // Skip unreadable entity files
        }
      }
    }

    // Gray out removed entities: file-type nodes referencing entity paths that
    // no longer exist on disk get color #757575
    const entitiesPrefix = normalizePath(`${planningDir}/entities/`);
    for (const node of canvasData.nodes) {
      if (
        node.type === 'file' &&
        node.file &&
        node.file.startsWith(entitiesPrefix) &&
        !colorMap.has(node.file)
      ) {
        colorMap.set(node.file, REMOVED_ENTITY_COLOR);
      }
    }

    const { patched, changedCount } = patchCanvasNodeColors(canvasData, colorMap);

    if (changedCount === 0) return;

    await this.vaultAdapter.modifyFile(canvasPath, JSON.stringify(patched, null, '\t'));
    this.eventBus?.emit('canvas:refreshed', { canvasPath, changedCount });
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
      const canvasJson = JSON.stringify(canvasData, null, '\t');

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
