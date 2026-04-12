import type { App } from 'obsidian';
import { type VaultAdapter } from './vault-adapter';
import { CORE_ARTIFACTS, KNOWLEDGE_BASE_TEMPLATE } from './artifacts';
import { getPlanningDir, getCoreFilePath, normalizePath } from './paths';
import { ENTITY_FOLDERS } from './entity-schema';
import {
  type WorkspaceStatus,
  type ArtifactStatus,
  type ViewModel,
  type McpConnectionStatus,
  type EntityCounts,
  type ExtendedArtifacts,
  type IngestionResult,
  type ReceiptTimelineEntry,
  type AssembledContext,
  type ExportProfile,
} from './types';
import type { McpClient } from './mcp-client';
import { assembleContext } from './context-assembly';
import { formatExportLog } from './export-log';
import type { ExportLogEntry } from './export-log';
import { loadProfiles } from './export-profiles';
import { parseState, parseHypotheses } from './parsers';
import { parseReceipt } from './parsers/receipt';
import {
  buildReceiptTimeline,
} from './ingestion';
import type { StateSnapshot, HypothesisSnapshot, PhaseDirectoryInfo } from './types';
import { EventBus } from './services/event-bus';
import { IntelligenceService } from './services/intelligence-service';
import { CanvasService } from './services/canvas-service';
import { McpBridgeService } from './services/mcp-bridge-service';
import { WatcherService } from './services/watcher-service';

export class WorkspaceService {
  private cachedViewModel: ViewModel | null = null;
  private intelligenceService!: IntelligenceService;
  private canvasService!: CanvasService;
  private mcpBridgeService!: McpBridgeService;
  private watcherService!: WatcherService;

  constructor(
    private app: App,
    readonly vaultAdapter: VaultAdapter,
    private getSettings: () => { planningDir: string },
    private defaultPlanningDir: string,
    private mcpClient?: McpClient,
    private eventBus?: EventBus,
  ) {
    const bus = eventBus ?? new EventBus();
    const planningDirGetter = () => getPlanningDir(
      this.getSettings().planningDir,
      this.defaultPlanningDir,
    );

    this.intelligenceService = new IntelligenceService(vaultAdapter, planningDirGetter, bus);
    this.canvasService = new CanvasService(vaultAdapter, planningDirGetter, bus);
    this.mcpBridgeService = new McpBridgeService(vaultAdapter, planningDirGetter, mcpClient, bus);
    this.watcherService = new WatcherService(vaultAdapter, planningDirGetter, this.intelligenceService, bus);
  }

  get watcher(): WatcherService {
    return this.watcherService;
  }

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
    const result = await this.intelligenceService.runIngestion();
    this.invalidate();
    return result;
  }

  // ---------------------------------------------------------------------------
  // MCP enrichment methods (Plan 02) -- facade delegations
  // ---------------------------------------------------------------------------

  async enrichFromMcp(notePath: string): Promise<{ success: boolean; message: string }> {
    return this.mcpBridgeService.enrichFromMcp(notePath);
  }

  async analyzeCoverage(): Promise<{ success: boolean; message: string }> {
    const result = await this.mcpBridgeService.analyzeCoverage();
    this.invalidate();
    return result;
  }

  async logDecision(
    notePath: string,
    decision: string,
    rationale: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.mcpBridgeService.logDecision(notePath, decision, rationale);
  }

  async logLearning(
    topic: string,
    learning: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.mcpBridgeService.logLearning(topic, learning);
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
  // Canvas generation methods (Phase 76 Plan 02) -- facade delegations
  // ---------------------------------------------------------------------------

  async generateHuntCanvas(
    templateName: 'kill-chain' | 'diamond' | 'lateral-movement' | 'hunt-progression',
  ): Promise<{ success: boolean; message: string; canvasPath?: string }> {
    const result = await this.canvasService.generateHuntCanvas(templateName);
    this.invalidate();
    return result;
  }

  async canvasFromCurrentHunt(
    templateName: 'kill-chain' | 'diamond' | 'lateral-movement' | 'hunt-progression' = 'kill-chain',
  ): Promise<{ success: boolean; message: string; canvasPath?: string }> {
    const result = await this.canvasService.canvasFromCurrentHunt(templateName);
    this.invalidate();
    return result;
  }

  async refreshCanvasForEntity(entityPath: string): Promise<void> {
    await this.canvasService.handleEntityModified(entityPath);
  }

  async refreshAllCanvasNodes(): Promise<{ totalPatched: number }> {
    return this.canvasService.refreshAllCanvasNodes();
  }

  async handleLiveCanvasEntityCreated(event: { name: string; entityType: string; sourcePath: string }): Promise<void> {
    await this.canvasService.handleEntityCreated(event);
  }

  async refreshDashboardCanvas(): Promise<void> {
    await this.canvasService.refreshDashboardCanvas();
  }

  async openLiveHuntCanvas(): Promise<{ success: boolean; message: string; canvasPath?: string }> {
    try {
      const planningDir = getPlanningDir(
        this.getSettings().planningDir,
        this.defaultPlanningDir,
      );
      const canvasPath = normalizePath(`${planningDir}/live-hunt.canvas`);
      if (!this.vaultAdapter.fileExists(canvasPath)) {
        await this.vaultAdapter.ensureFolder(planningDir);
        await this.vaultAdapter.createFile(canvasPath, JSON.stringify({ nodes: [], edges: [] }, null, '\t'));
      }
      return { success: true, message: 'Live hunt canvas ready', canvasPath };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, message: `Failed to open live hunt canvas: ${message}` };
    }
  }

  // ---------------------------------------------------------------------------
  // Cross-hunt intelligence methods (Phase 77 Plan 02) -- facade delegations
  // ---------------------------------------------------------------------------

  async crossHuntIntel(): Promise<{ success: boolean; message: string; reportPath?: string }> {
    const result = await this.intelligenceService.crossHuntIntel();
    this.invalidate();
    return result;
  }

  async compareHuntsReport(
    huntAPath: string,
    huntBPath: string,
  ): Promise<{ success: boolean; message: string; reportPath?: string }> {
    const result = await this.intelligenceService.compareHuntsReport(huntAPath, huntBPath);
    this.invalidate();
    return result;
  }

  async generateKnowledgeDashboard(): Promise<{ success: boolean; message: string; canvasPath?: string }> {
    const result = await this.intelligenceService.generateKnowledgeDashboard();
    this.invalidate();
    return result;
  }

  async refreshTechniqueIntelligence(
    filePath: string,
    staleCoverageDays: number,
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.intelligenceService.refreshTechniqueIntelligence(filePath, staleCoverageDays);
    this.invalidate();
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
