import type { App } from 'obsidian';
import { type VaultAdapter } from './vault-adapter';
import { CORE_ARTIFACTS } from './artifacts';
import { getPlanningDir, getCoreFilePath, normalizePath } from './paths';
import { ENTITY_FOLDERS } from './entity-schema';
import {
  type WorkspaceStatus,
  type ArtifactStatus,
  type ViewModel,
} from './types';
import { parseState, parseHypotheses } from './parsers';
import type { StateSnapshot, HypothesisSnapshot, PhaseDirectoryInfo } from './types';

export class WorkspaceService {
  private cachedViewModel: ViewModel | null = null;

  constructor(
    private app: App,
    readonly vaultAdapter: VaultAdapter,
    private getSettings: () => { planningDir: string },
    private defaultPlanningDir: string,
  ) {}

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

    const viewModel: ViewModel = {
      workspaceStatus,
      planningDir,
      artifactCount,
      artifactTotal,
      artifacts,
      stateSnapshot,
      hypothesisSnapshot,
      phaseDirectories,
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
