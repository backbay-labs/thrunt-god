import type { App } from 'obsidian';
import { type VaultAdapter } from './vault-adapter';
import { CORE_ARTIFACTS, KNOWLEDGE_BASE_TEMPLATE } from './artifacts';
import { getPlanningDir, getCoreFilePath, normalizePath } from './paths';
import { ENTITY_FOLDERS, ENTITY_TYPES } from './entity-schema';
import {
  type WorkspaceStatus,
  type ArtifactStatus,
  type ViewModel,
  type McpConnectionStatus,
  type EntityCounts,
  type ExtendedArtifacts,
  type IngestionResult,
  type EntityInstruction,
  type ReceiptTimelineEntry,
  type EnrichmentData,
  type CoverageReport,
  type CoverageTactic,
  type AssembledContext,
  type ExportProfile,
  type CanvasEntity,
  type CanvasData,
} from './types';
import {
  generateKillChainCanvas,
  generateDiamondCanvas,
  generateLateralMovementCanvas,
  generateHuntProgressionCanvas,
  type EdgeGroup,
} from './canvas-generator';
import type { McpClient } from './mcp-client';
import { mergeEnrichment, buildCoverageReport, formatDecisionEntry, formatLearningEntry } from './mcp-enrichment';
import { assembleContext } from './context-assembly';
import { formatExportLog } from './export-log';
import type { ExportLogEntry } from './export-log';
import { loadProfiles } from './export-profiles';
import { parseState, parseHypotheses } from './parsers';
import { parseReceipt } from './parsers/receipt';
import { parseQueryLog } from './parsers/query-log';
import {
  extractEntitiesFromReceipt,
  extractEntitiesFromQuery,
  deduplicateSightings,
  formatIngestionLog,
  buildReceiptTimeline,
} from './ingestion';
import type { StateSnapshot, HypothesisSnapshot, PhaseDirectoryInfo } from './types';
import {
  type EntityNote,
  buildRecurringIocs,
  buildCoverageGaps,
  buildActorConvergence,
  compareHunts,
  generateDashboardCanvas,
  type HuntSummary,
  type TopEntity,
} from './cross-hunt';

export class WorkspaceService {
  private cachedViewModel: ViewModel | null = null;

  constructor(
    private app: App,
    readonly vaultAdapter: VaultAdapter,
    private getSettings: () => { planningDir: string },
    private defaultPlanningDir: string,
    private mcpClient?: McpClient,
  ) {}

  getMcpClient(): McpClient | undefined {
    return this.mcpClient;
  }

  async getViewModel(): Promise<ViewModel> {
    if (this.cachedViewModel) {
      return this.cachedViewModel;
    }

    const planningDir = getPlanningDir(
      this.getSettings().planningDir,
      this.defaultPlanningDir,
    );

    const folderExists = this.vaultAdapter.folderExists(planningDir);

    const artifacts: ArtifactStatus[] = CORE_ARTIFACTS.map((def) => {
      const path = getCoreFilePath(planningDir, def.fileName);
      return {
        definition: def,
        exists: folderExists ? this.vaultAdapter.fileExists(path) : false,
        path,
      };
    });

    const artifactCount = artifacts.filter((a) => a.exists).length;
    const artifactTotal = CORE_ARTIFACTS.length;

    let workspaceStatus: WorkspaceStatus;
    if (!folderExists) {
      workspaceStatus = 'missing';
    } else if (artifactCount === artifactTotal) {
      workspaceStatus = 'healthy';
    } else {
      workspaceStatus = 'partial';
    }

    // Read and parse STATE.md
    let stateSnapshot: StateSnapshot | null = null;
    const stateArtifact = artifacts.find(a => a.definition.fileName === 'STATE.md');
    if (stateArtifact && stateArtifact.exists) {
      try {
        const content = await this.vaultAdapter.readFile(stateArtifact.path);
        stateSnapshot = parseState(content);
      } catch {
        stateSnapshot = null;
      }
    }

    // Read and parse HYPOTHESES.md
    let hypothesisSnapshot: HypothesisSnapshot | null = null;
    const hypoArtifact = artifacts.find(a => a.definition.fileName === 'HYPOTHESES.md');
    if (hypoArtifact && hypoArtifact.exists) {
      try {
        const content = await this.vaultAdapter.readFile(hypoArtifact.path);
        hypothesisSnapshot = parseHypotheses(content);
      } catch {
        hypothesisSnapshot = null;
      }
    }

    // Detect phase directories
    const phaseDirectories = await this.detectPhaseDirectories();

    // Count entity files per folder
    const entityCounts: EntityCounts = {};
    for (const folder of ENTITY_FOLDERS) {
      const folderPath = normalizePath(`${planningDir}/${folder}`);
      if (this.vaultAdapter.folderExists(folderPath)) {
        const files = await this.vaultAdapter.listFiles(folderPath);
        entityCounts[folder] = files.filter(f => f.endsWith('.md')).length;
      } else {
        entityCounts[folder] = 0;
      }
    }

    // Detect extended artifacts
    const extendedArtifacts = await this.detectExtendedArtifacts(planningDir);

    // Build receipt timeline
    let receiptTimeline: ReceiptTimelineEntry[] = [];
    const receiptsPath = normalizePath(`${planningDir}/RECEIPTS`);
    if (this.vaultAdapter.folderExists(receiptsPath)) {
      const receiptFiles = await this.vaultAdapter.listFiles(receiptsPath);
      const rctFiles = receiptFiles.filter(f => /^RCT-.*\.md$/.test(f));
      const parsed: Array<{ fileName: string; snapshot: import('./types').ReceiptSnapshot }> = [];
      for (const fileName of rctFiles) {
        try {
          const filePath = normalizePath(`${receiptsPath}/${fileName}`);
          const content = await this.vaultAdapter.readFile(filePath);
          const snapshot = parseReceipt(content);
          parsed.push({ fileName, snapshot });
        } catch {
          // Skip unreadable receipts
        }
      }
      receiptTimeline = buildReceiptTimeline(parsed);
    }

    const viewModel: ViewModel = {
      workspaceStatus,
      planningDir,
      artifactCount,
      artifactTotal,
      artifacts,
      stateSnapshot,
      hypothesisSnapshot,
      phaseDirectories,
      entityCounts,
      extendedArtifacts,
      receiptTimeline,
      mcpStatus: this.mcpClient ? this.mcpClient.getStatus() : 'disabled' as McpConnectionStatus,
    };

    this.cachedViewModel = viewModel;
    return viewModel;
  }

  invalidate(): void {
    this.cachedViewModel = null;
  }

  async bootstrap(): Promise<void> {
    const planningDir = getPlanningDir(
      this.getSettings().planningDir,
      this.defaultPlanningDir,
    );

    await this.vaultAdapter.ensureFolder(planningDir);

    for (const artifact of CORE_ARTIFACTS) {
      const path = getCoreFilePath(planningDir, artifact.fileName);
      if (!this.vaultAdapter.fileExists(path)) {
        await this.vaultAdapter.createFile(path, artifact.starterTemplate);
      }
    }

    // Entity folders (new in Phase 68)
    for (const folder of ENTITY_FOLDERS) {
      await this.vaultAdapter.ensureFolder(
        normalizePath(`${planningDir}/${folder}`),
      );
    }

    // Knowledge Base dashboard (not a core artifact, but created during bootstrap)
    const kbPath = normalizePath(`${planningDir}/KNOWLEDGE_BASE.md`);
    if (!this.vaultAdapter.fileExists(kbPath)) {
      await this.vaultAdapter.createFile(kbPath, KNOWLEDGE_BASE_TEMPLATE);
    }

    this.invalidate();
  }

  async ensureCoreFile(
    fileName: string,
    content: string,
  ): Promise<{ created: boolean; path: string }> {
    const planningDir = getPlanningDir(
      this.getSettings().planningDir,
      this.defaultPlanningDir,
    );
    const path = getCoreFilePath(planningDir, fileName);

    if (this.vaultAdapter.fileExists(path)) {
      return { created: false, path };
    }

    await this.vaultAdapter.ensureFolder(planningDir);
    await this.vaultAdapter.createFile(path, content);
    this.invalidate();
    return { created: true, path };
  }

  getFilePath(fileName: string): string {
    const planningDir = getPlanningDir(
      this.getSettings().planningDir,
      this.defaultPlanningDir,
    );
    return getCoreFilePath(planningDir, fileName);
  }

  async runIngestion(): Promise<IngestionResult> {
    const planningDir = getPlanningDir(
      this.getSettings().planningDir,
      this.defaultPlanningDir,
    );

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

    this.invalidate();
    return result;
  }

  // ---------------------------------------------------------------------------
  // MCP enrichment methods (Plan 02)
  // ---------------------------------------------------------------------------

  async enrichFromMcp(notePath: string): Promise<{ success: boolean; message: string }> {
    if (!this.mcpClient || !this.mcpClient.isConnected()) {
      return { success: false, message: 'MCP is not connected. Enable MCP in settings.' };
    }

    const content = await this.vaultAdapter.readFile(notePath);

    // Parse mitre_id from YAML frontmatter
    const mitreMatch = content.match(/^mitre_id:\s*"?([^"\n]+)"?$/m);
    if (!mitreMatch || !mitreMatch[1]) {
      return { success: false, message: 'No mitre_id found in frontmatter.' };
    }
    const mitreId = mitreMatch[1].trim();

    const result = await this.mcpClient.callTool('lookupTechnique', { id: mitreId });
    if (!result || result.isError) {
      return { success: false, message: 'MCP lookup failed.' };
    }

    let enrichmentData: EnrichmentData;
    try {
      enrichmentData = JSON.parse(result.content[0]!.text) as EnrichmentData;
    } catch {
      return { success: false, message: 'MCP lookup failed.' };
    }

    const updatedContent = mergeEnrichment(content, enrichmentData);
    await this.vaultAdapter.modifyFile(notePath, updatedContent);
    this.invalidate();
    return { success: true, message: `Enriched ${mitreId} from MCP.` };
  }

  async analyzeCoverage(): Promise<{ success: boolean; message: string }> {
    const planningDir = getPlanningDir(
      this.getSettings().planningDir,
      this.defaultPlanningDir,
    );

    const ttpsFolder = normalizePath(`${planningDir}/entities/ttps`);
    if (!this.vaultAdapter.folderExists(ttpsFolder)) {
      return { success: false, message: 'No TTP entities found.' };
    }

    const files = await this.vaultAdapter.listFiles(ttpsFolder);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    // --- MCP path (when connected) ---
    if (this.mcpClient && this.mcpClient.isConnected()) {
      const techniqueIds: string[] = [];
      for (const fileName of mdFiles) {
        try {
          const filePath = normalizePath(`${ttpsFolder}/${fileName}`);
          const fileContent = await this.vaultAdapter.readFile(filePath);
          const match = fileContent.match(/^mitre_id:\s*"?([^"\n]+)"?$/m);
          if (match && match[1]) {
            techniqueIds.push(match[1].trim());
          }
        } catch {
          // Skip unreadable files
        }
      }

      const result = await this.mcpClient.callTool('analyzeCoverage', { techniqueIds });
      if (!result || result.isError) {
        return { success: false, message: 'MCP coverage analysis failed.' };
      }

      let report: CoverageReport;
      try {
        report = JSON.parse(result.content[0]!.text) as CoverageReport;
      } catch {
        return { success: false, message: 'MCP coverage analysis failed.' };
      }

      const reportContent = buildCoverageReport(
        report.tactics,
        report.totalTechniques,
        report.huntedTechniques,
        report.overallPercentage,
        report.gaps,
      );

      const reportPath = normalizePath(`${planningDir}/COVERAGE_REPORT.md`);
      if (this.vaultAdapter.fileExists(reportPath)) {
        await this.vaultAdapter.modifyFile(reportPath, reportContent);
      } else {
        await this.vaultAdapter.createFile(reportPath, reportContent);
      }

      this.invalidate();
      return { success: true, message: 'Coverage report written to COVERAGE_REPORT.md' };
    }

    // --- Offline fallback: build coverage from vault frontmatter ---
    const tacticMap = new Map<string, { total: number; hunted: number }>();
    const gaps: string[] = [];
    let totalTechniques = 0;
    let huntedTechniques = 0;

    for (const fileName of mdFiles) {
      try {
        const filePath = normalizePath(`${ttpsFolder}/${fileName}`);
        const content = await this.vaultAdapter.readFile(filePath);
        const fm = this.parseFrontmatterFields(content);

        const tactic = fm.tactic || 'Unknown';
        const huntCount = parseInt(fm.hunt_count || '0', 10) || 0;
        const mitreId = fm.mitre_id || fileName.replace(/\.md$/, '');

        // Handle YAML array tactic values (e.g. "- Initial Access\n- Execution")
        const tactics = Array.isArray(tactic) ? tactic : [tactic];

        for (const t of tactics) {
          const tacticName = String(t).trim();
          if (!tacticMap.has(tacticName)) {
            tacticMap.set(tacticName, { total: 0, hunted: 0 });
          }
          const entry = tacticMap.get(tacticName)!;
          entry.total++;
          if (huntCount > 0) entry.hunted++;
        }

        totalTechniques++;
        if (huntCount > 0) {
          huntedTechniques++;
        } else {
          gaps.push(mitreId);
        }
      } catch {
        // Skip unreadable files
      }
    }

    const coverageTactics: CoverageTactic[] = [...tacticMap.entries()].map(([tactic, counts]) => ({
      tactic,
      total: counts.total,
      hunted: counts.hunted,
      percentage: counts.total > 0
        ? Math.round((counts.hunted / counts.total) * 1000) / 10
        : 0,
    }));

    const overallPercentage = totalTechniques > 0
      ? Math.round((huntedTechniques / totalTechniques) * 1000) / 10
      : 0;

    const reportContent = buildCoverageReport(
      coverageTactics,
      totalTechniques,
      huntedTechniques,
      overallPercentage,
      gaps,
    );

    const reportPath = normalizePath(`${planningDir}/COVERAGE_REPORT.md`);
    if (this.vaultAdapter.fileExists(reportPath)) {
      await this.vaultAdapter.modifyFile(reportPath, reportContent);
    } else {
      await this.vaultAdapter.createFile(reportPath, reportContent);
    }

    this.invalidate();
    return { success: true, message: 'Coverage report written to COVERAGE_REPORT.md (offline)' };
  }

  async logDecision(
    notePath: string,
    decision: string,
    rationale: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!this.mcpClient || !this.mcpClient.isConnected()) {
      return { success: false, message: 'MCP is not connected.' };
    }

    const content = await this.vaultAdapter.readFile(notePath);

    const mitreMatch = content.match(/^mitre_id:\s*"?([^"\n]+)"?$/m);
    if (!mitreMatch || !mitreMatch[1]) {
      return { success: false, message: 'No mitre_id found in frontmatter.' };
    }
    const mitreId = mitreMatch[1].trim();

    // Log to MCP server (fire and forget -- local write still succeeds)
    await this.mcpClient.callTool('logDecision', { technique: mitreId, decision, rationale });

    const entry = formatDecisionEntry(mitreId, decision, rationale);

    // Find ## Decisions section or add one
    let updatedContent: string;
    const decisionsMatch = content.match(/^## Decisions\s*$/m);
    if (decisionsMatch && decisionsMatch.index !== undefined) {
      const insertPos = decisionsMatch.index + decisionsMatch[0].length;
      updatedContent =
        content.slice(0, insertPos) +
        '\n\n' + entry +
        content.slice(insertPos);
    } else {
      updatedContent = content.trimEnd() + '\n\n## Decisions\n\n' + entry;
    }

    await this.vaultAdapter.modifyFile(notePath, updatedContent);
    this.invalidate();
    return { success: true, message: `Decision logged for ${mitreId}.` };
  }

  async logLearning(
    topic: string,
    learning: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!this.mcpClient || !this.mcpClient.isConnected()) {
      return { success: false, message: 'MCP is not connected.' };
    }

    // Log to MCP server
    await this.mcpClient.callTool('logLearning', { topic, learning });

    const entry = formatLearningEntry(topic, learning);

    const planningDir = getPlanningDir(
      this.getSettings().planningDir,
      this.defaultPlanningDir,
    );
    const learningsPath = normalizePath(`${planningDir}/LEARNINGS.md`);

    if (this.vaultAdapter.fileExists(learningsPath)) {
      const existing = await this.vaultAdapter.readFile(learningsPath);
      await this.vaultAdapter.modifyFile(learningsPath, existing.trimEnd() + '\n\n' + entry);
    } else {
      await this.vaultAdapter.createFile(learningsPath, '# Hunt Learnings\n\n' + entry);
    }

    this.invalidate();
    return { success: true, message: `Learning logged for ${topic}.` };
  }

  // ---------------------------------------------------------------------------
  // Context assembly methods (Phase 74 Plan 02)
  // ---------------------------------------------------------------------------

  async assembleContextForProfile(
    sourceNotePath: string,
    agentId: string,
    customProfilesJson?: string | null,
  ): Promise<AssembledContext | { error: string }> {
    const profiles = loadProfiles(customProfilesJson ?? null);
    const profile = profiles.find(p => p.agentId === agentId);
    if (!profile) {
      return { error: `Unknown agent profile: ${agentId}` };
    }

    const planningDir = getPlanningDir(
      this.getSettings().planningDir,
      this.defaultPlanningDir,
    );

    const result = await assembleContext({
      sourceNotePath,
      profile,
      readFile: async (path: string) => {
        try {
          return await this.vaultAdapter.readFile(path);
        } catch {
          return null;
        }
      },
      fileExists: (path: string) => this.vaultAdapter.fileExists(path),
      planningDir,
    });

    return result;
  }

  getAvailableProfiles(customProfilesJson?: string | null): ExportProfile[] {
    return loadProfiles(customProfilesJson ?? null);
  }

  renderAssembledContext(assembled: AssembledContext): string {
    const lines: string[] = [];
    for (const section of assembled.sections) {
      lines.push(`<!-- source: ${section.sourcePath} -->`);
      lines.push(`## ${section.heading}`);
      lines.push(section.content);
      lines.push('');
    }
    return lines.join('\n');
  }

  async logExport(entry: ExportLogEntry): Promise<void> {
    const planningDir = getPlanningDir(
      this.getSettings().planningDir,
      this.defaultPlanningDir,
    );
    const logPath = normalizePath(`${planningDir}/EXPORT_LOG.md`);
    const logEntry = formatExportLog(entry);

    if (this.vaultAdapter.fileExists(logPath)) {
      const existingLog = await this.vaultAdapter.readFile(logPath);
      await this.vaultAdapter.modifyFile(logPath, existingLog + '\n' + logEntry);
    } else {
      await this.vaultAdapter.createFile(
        logPath,
        '# Export Log\n\n' + logEntry,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Canvas generation methods (Phase 76 Plan 02)
  // ---------------------------------------------------------------------------

  async generateHuntCanvas(
    templateName: 'kill-chain' | 'diamond' | 'lateral-movement' | 'hunt-progression',
  ): Promise<{ success: boolean; message: string; canvasPath?: string }> {
    try {
      const planningDir = getPlanningDir(
        this.getSettings().planningDir,
        this.defaultPlanningDir,
      );

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
            const fm = this.parseFrontmatterFields(content);
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

      this.invalidate();
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
      const planningDir = getPlanningDir(
        this.getSettings().planningDir,
        this.defaultPlanningDir,
      );

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
              const fm = this.parseFrontmatterFields(noteContent);
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

      this.invalidate();
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

  // ---------------------------------------------------------------------------
  // Cross-hunt intelligence methods (Phase 77 Plan 02)
  // ---------------------------------------------------------------------------

  async crossHuntIntel(): Promise<{ success: boolean; message: string; reportPath?: string }> {
    try {
      const planningDir = getPlanningDir(
        this.getSettings().planningDir,
        this.defaultPlanningDir,
      );

      const allNotes = await this.scanEntityNotes(planningDir);

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

      this.invalidate();
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
      const planningDir = getPlanningDir(
        this.getSettings().planningDir,
        this.defaultPlanningDir,
      );

      const huntAEntities = await this.scanEntityNotes(huntAPath);
      const huntBEntities = await this.scanEntityNotes(huntBPath);

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

      this.invalidate();
      return { success: true, message: 'Hunt comparison report generated', reportPath };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, message };
    }
  }

  async generateKnowledgeDashboard(): Promise<{ success: boolean; message: string; canvasPath?: string }> {
    try {
      const planningDir = getPlanningDir(
        this.getSettings().planningDir,
        this.defaultPlanningDir,
      );

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
      const allNotes = await this.scanEntityNotes(planningDir);
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

      this.invalidate();
      return { success: true, message: 'Knowledge dashboard generated', canvasPath };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, message };
    }
  }

  /**
   * Parse an entity note's content into an EntityNote object.
   * Extracts frontmatter fields and counts sightings lines.
   */
  private parseEntityNote(content: string, fileName: string): EntityNote {
    const name = fileName.replace(/\.md$/, '');
    const result: EntityNote = {
      name,
      entityType: '',
      frontmatter: {},
      sightingsCount: 0,
      huntRefs: [],
    };

    // Parse frontmatter
    if (content.startsWith('---')) {
      const end = content.indexOf('\n---', 3);
      if (end !== -1) {
        const block = content.slice(4, end);
        const lines = block.split(/\r?\n/);

        for (const line of lines) {
          const typeMatch = line.match(/^type:\s*(.+)$/);
          if (typeMatch && typeMatch[1]) {
            const val = typeMatch[1].trim().replace(/^["']|["']$/g, '');
            result.entityType = val;
            result.frontmatter['type'] = val;
          }

          const tacticMatch = line.match(/^tactic:\s*(.+)$/);
          if (tacticMatch && tacticMatch[1]) {
            let val = tacticMatch[1].trim().replace(/^["']|["']$/g, '');
            if (val.startsWith('[') && val.endsWith(']')) {
              val = val.slice(1, -1).split(',')[0]?.trim() ?? '';
            }
            if (val) {
              result.frontmatter['tactic'] = val;
            }
          }

          const huntCountMatch = line.match(/^hunt_count:\s*(\d+)$/);
          if (huntCountMatch && huntCountMatch[1]) {
            result.frontmatter['hunt_count'] = parseInt(huntCountMatch[1], 10);
          }

          const confidenceMatch = line.match(/^confidence:\s*(.+)$/);
          if (confidenceMatch && confidenceMatch[1]) {
            result.frontmatter['confidence'] = confidenceMatch[1].trim().replace(/^["']|["']$/g, '');
          }

          const huntRefsMatch = line.match(/^hunt_refs:\s*\[(.+)\]$/);
          if (huntRefsMatch && huntRefsMatch[1]) {
            result.huntRefs = huntRefsMatch[1].split(',').map(r => r.trim().replace(/^["']|["']$/g, ''));
          }
        }
      }
    }

    // Count sightings
    const sightingsSection = content.match(/^## Sightings\s*$([\s\S]*?)(?=^## |\n$|$)/m);
    if (sightingsSection && sightingsSection[1]) {
      const sightingLines = sightingsSection[1]
        .split(/\r?\n/)
        .filter(l => l.startsWith('- ') && !l.includes('_No sightings recorded yet._'));
      result.sightingsCount = sightingLines.length;
    }

    return result;
  }

  /**
   * Scan ENTITY_FOLDERS for .md files and parse each into an EntityNote.
   */
  private async scanEntityNotes(basePath: string): Promise<EntityNote[]> {
    const notes: EntityNote[] = [];

    for (const folder of ENTITY_FOLDERS) {
      const folderPath = normalizePath(`${basePath}/${folder}`);
      if (!this.vaultAdapter.folderExists(folderPath)) continue;

      const files = await this.vaultAdapter.listFiles(folderPath);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      for (const fileName of mdFiles) {
        try {
          const filePath = normalizePath(`${folderPath}/${fileName}`);
          const content = await this.vaultAdapter.readFile(filePath);
          const note = this.parseEntityNote(content, fileName);
          notes.push(note);
        } catch {
          // Skip unreadable files
        }
      }
    }

    return notes;
  }

  /**
   * Parse simple frontmatter fields (type, tactic) from markdown content.
   * Manual parsing -- no library dependency.
   */
  private parseFrontmatterFields(content: string): { type: string; tactic: string; hunt_count: string; mitre_id: string } {
    const result = { type: '', tactic: '', hunt_count: '', mitre_id: '' };
    if (!content.startsWith('---')) return result;
    const end = content.indexOf('\n---', 3);
    if (end === -1) return result;
    const block = content.slice(4, end);
    const lines = block.split(/\r?\n/);

    for (const line of lines) {
      const typeMatch = line.match(/^type:\s*(.+)$/);
      if (typeMatch && typeMatch[1]) {
        result.type = typeMatch[1].trim().replace(/^["']|["']$/g, '');
      }
      const huntCountMatch = line.match(/^hunt_count:\s*(.+)$/);
      if (huntCountMatch && huntCountMatch[1]) {
        result.hunt_count = huntCountMatch[1].trim().replace(/^["']|["']$/g, '');
      }
      const mitreIdMatch = line.match(/^mitre_id:\s*(.+)$/);
      if (mitreIdMatch && mitreIdMatch[1]) {
        result.mitre_id = mitreIdMatch[1].trim().replace(/^["']|["']$/g, '');
      }
      const tacticMatch = line.match(/^tactic:\s*(.+)$/);
      if (tacticMatch && tacticMatch[1]) {
        let val = tacticMatch[1].trim().replace(/^["']|["']$/g, '');
        // Handle YAML array on same line: [Persistence, Privilege Escalation]
        if (val.startsWith('[') && val.endsWith(']')) {
          val = val.slice(1, -1).split(',')[0]?.trim() ?? '';
        }
        // Handle YAML array continuation (tactic: followed by - items on next lines)
        // This simple parser takes the inline value only
        result.tactic = val;
      }
    }

    // Handle tactic as YAML array with dash items
    if (!result.tactic) {
      let capturingTactic = false;
      for (const line of lines) {
        if (/^tactic:\s*$/.test(line)) {
          capturingTactic = true;
          continue;
        }
        if (capturingTactic) {
          const itemMatch = line.match(/^\s+-\s+(.+)$/);
          if (itemMatch && itemMatch[1]) {
            result.tactic = itemMatch[1].trim().replace(/^["']|["']$/g, '');
            break; // take first tactic only
          } else {
            capturingTactic = false;
          }
        }
      }
    }

    return result;
  }

  private async detectExtendedArtifacts(planningDir: string): Promise<ExtendedArtifacts> {
    // RECEIPTS count: RCT-*.md files in RECEIPTS/ folder
    let receipts = 0;
    const receiptsPath = normalizePath(`${planningDir}/RECEIPTS`);
    if (this.vaultAdapter.folderExists(receiptsPath)) {
      const files = await this.vaultAdapter.listFiles(receiptsPath);
      receipts = files.filter(f => /^RCT-.*\.md$/.test(f)).length;
    }

    // QUERIES count: QRY-*.md files in QUERIES/ folder
    let queries = 0;
    const queriesPath = normalizePath(`${planningDir}/QUERIES`);
    if (this.vaultAdapter.folderExists(queriesPath)) {
      const files = await this.vaultAdapter.listFiles(queriesPath);
      queries = files.filter(f => /^QRY-.*\.md$/.test(f)).length;
    }

    // Boolean artifact checks
    const evidenceReview = this.vaultAdapter.fileExists(
      normalizePath(`${planningDir}/EVIDENCE_REVIEW.md`),
    );
    const successCriteria = this.vaultAdapter.fileExists(
      normalizePath(`${planningDir}/SUCCESS_CRITERIA.md`),
    );
    const environment = this.vaultAdapter.fileExists(
      normalizePath(`${planningDir}/environment/ENVIRONMENT.md`),
    );

    // Cases count: subdirectories in cases/ that contain MISSION.md
    let cases = 0;
    const casesPath = normalizePath(`${planningDir}/cases`);
    if (this.vaultAdapter.folderExists(casesPath)) {
      const subfolders = await this.vaultAdapter.listFolders(casesPath);
      for (const subfolder of subfolders) {
        const missionPath = normalizePath(`${planningDir}/cases/${subfolder}/MISSION.md`);
        if (this.vaultAdapter.fileExists(missionPath)) {
          cases++;
        }
      }
    }

    return { receipts, queries, evidenceReview, successCriteria, environment, cases };
  }

  private async detectPhaseDirectories(): Promise<PhaseDirectoryInfo> {
    const planningDir = getPlanningDir(
      this.getSettings().planningDir,
      this.defaultPlanningDir,
    );
    if (!this.vaultAdapter.folderExists(planningDir)) {
      return { count: 0, highest: null, highestName: null };
    }

    const children = await this.vaultAdapter.listFolders(planningDir);
    const phaseRegex = /^phase-(\d+)$/;
    let count = 0;
    let highest: number | null = null;
    let highestName: string | null = null;

    for (const name of children) {
      const match = name.match(phaseRegex);
      if (!match) continue;
      count++;
      const num = parseInt(match[1]!, 10);
      if (highest === null || num > highest) {
        highest = num;
        highestName = name;
      }
    }

    return { count, highest, highestName };
  }
}

export function formatStatusBarText(vm: ViewModel): string {
  if (vm.workspaceStatus === 'missing') {
    return 'THRUNT not detected';
  }

  if (vm.workspaceStatus === 'partial') {
    return `THRUNT ${vm.planningDir} (${vm.artifactCount}/${vm.artifactTotal})`;
  }

  // healthy
  if (vm.stateSnapshot && vm.stateSnapshot.currentPhase !== 'unknown') {
    const parts: string[] = [];
    parts.push(vm.stateSnapshot.currentPhase);

    if (vm.hypothesisSnapshot && vm.hypothesisSnapshot.total > 0) {
      const active = vm.hypothesisSnapshot.pending;
      parts.push(`${active}/${vm.hypothesisSnapshot.total} hypotheses active`);
    }

    if (vm.stateSnapshot.blockers.length > 0) {
      parts.push(`${vm.stateSnapshot.blockers.length} blocker${vm.stateSnapshot.blockers.length !== 1 ? 's' : ''}`);
    }

    return parts.join(' | ');
  }

  // healthy but STATE.md not parseable
  return `THRUNT ${vm.planningDir} (${vm.artifactCount}/${vm.artifactTotal})`;
}
