import type { App } from 'obsidian';
import { type VaultAdapter } from './vault-adapter';
import { CORE_ARTIFACTS } from './artifacts';
import { getPlanningDir, getCoreFilePath } from './paths';
import {
  type WorkspaceStatus,
  type ArtifactStatus,
  type ViewModel,
} from './types';

export class WorkspaceService {
  private cachedViewModel: ViewModel | null = null;

  constructor(
    private app: App,
    readonly vaultAdapter: VaultAdapter,
    private getSettings: () => { planningDir: string },
    private defaultPlanningDir: string,
  ) {}

  getViewModel(): ViewModel {
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

    const viewModel: ViewModel = {
      workspaceStatus,
      planningDir,
      artifactCount,
      artifactTotal,
      artifacts,
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
}
