import { describe, it, expect, beforeEach } from 'vitest';
import type { VaultAdapter } from '../vault-adapter';
import { WorkspaceService } from '../workspace';
import { CORE_ARTIFACTS } from '../artifacts';
import { getCoreFilePath } from '../paths';

// ---------------------------------------------------------------------------
// StubVaultAdapter -- in-memory implementation for testing without Obsidian
// ---------------------------------------------------------------------------

class StubVaultAdapter implements VaultAdapter {
  private files = new Map<string, string>();
  private folders = new Set<string>();

  addFolder(path: string): void {
    this.folders.add(path);
  }
  addFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  fileExists(path: string): boolean {
    return this.files.has(path);
  }
  folderExists(path: string): boolean {
    return this.folders.has(path);
  }
  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`File not found: ${path}`);
    return content;
  }
  async createFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
  async ensureFolder(path: string): Promise<void> {
    this.folders.add(path);
  }
  getFile(path: string): any {
    return this.files.has(path) ? ({} as any) : null;
  }
}

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const PLANNING_DIR = '.planning';

function makeService(adapter: StubVaultAdapter): WorkspaceService {
  // null as any for App -- not used in pure logic tests
  return new WorkspaceService(
    null as any,
    adapter,
    () => ({ planningDir: PLANNING_DIR }),
    PLANNING_DIR,
  );
}

function addAllArtifacts(adapter: StubVaultAdapter): void {
  for (const artifact of CORE_ARTIFACTS) {
    const path = getCoreFilePath(PLANNING_DIR, artifact.fileName);
    adapter.addFile(path, artifact.starterTemplate);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkspaceService', () => {
  let adapter: StubVaultAdapter;
  let service: WorkspaceService;

  beforeEach(() => {
    adapter = new StubVaultAdapter();
    service = makeService(adapter);
  });

  describe('getViewModel', () => {
    it('returns missing when planning folder does not exist', () => {
      const vm = service.getViewModel();
      expect(vm.workspaceStatus).toBe('missing');
      expect(vm.artifactCount).toBe(0);
      expect(vm.artifactTotal).toBe(5);
    });

    it('returns partial when folder exists but no artifacts', () => {
      adapter.addFolder(PLANNING_DIR);
      const vm = service.getViewModel();
      expect(vm.workspaceStatus).toBe('partial');
      expect(vm.artifactCount).toBe(0);
    });

    it('returns partial when folder exists with some artifacts', () => {
      adapter.addFolder(PLANNING_DIR);
      adapter.addFile(getCoreFilePath(PLANNING_DIR, 'MISSION.md'), '# Mission');
      adapter.addFile(getCoreFilePath(PLANNING_DIR, 'STATE.md'), '# State');
      const vm = service.getViewModel();
      expect(vm.workspaceStatus).toBe('partial');
      expect(vm.artifactCount).toBe(2);
      expect(vm.artifactTotal).toBe(5);
    });

    it('returns healthy when all artifacts exist', () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      const vm = service.getViewModel();
      expect(vm.workspaceStatus).toBe('healthy');
      expect(vm.artifactCount).toBe(5);
      expect(vm.artifactTotal).toBe(5);
    });

    it('caches the view model until invalidated', () => {
      adapter.addFolder(PLANNING_DIR);
      const vm1 = service.getViewModel();
      expect(vm1.artifactCount).toBe(0);

      // Add a file after caching -- should NOT be reflected yet
      adapter.addFile(getCoreFilePath(PLANNING_DIR, 'MISSION.md'), '# Mission');
      const vm2 = service.getViewModel();
      expect(vm2.artifactCount).toBe(0);
      expect(vm2).toBe(vm1); // same reference

      // Invalidate -- should now reflect the change
      service.invalidate();
      const vm3 = service.getViewModel();
      expect(vm3.artifactCount).toBe(1);
      expect(vm3).not.toBe(vm1); // different reference
    });

    it('artifacts array has correct length', () => {
      const vm = service.getViewModel();
      expect(vm.artifacts).toHaveLength(5);
    });

    it('artifact paths are correctly resolved', () => {
      const vm = service.getViewModel();
      expect(vm.artifacts[0]!.path).toBe('.planning/MISSION.md');
      expect(vm.artifacts[3]!.path).toBe('.planning/STATE.md');
    });
  });

  describe('invalidate', () => {
    it('clears the cached view model', () => {
      const vm1 = service.getViewModel();
      service.invalidate();
      const vm2 = service.getViewModel();
      expect(vm2).not.toBe(vm1);
    });
  });

  describe('bootstrap', () => {
    it('creates planning folder and all artifacts', async () => {
      await service.bootstrap();
      expect(adapter.folderExists(PLANNING_DIR)).toBe(true);
      for (const artifact of CORE_ARTIFACTS) {
        const path = getCoreFilePath(PLANNING_DIR, artifact.fileName);
        expect(adapter.fileExists(path)).toBe(true);
      }
    });

    it('does not overwrite existing artifacts', async () => {
      adapter.addFolder(PLANNING_DIR);
      adapter.addFile(getCoreFilePath(PLANNING_DIR, 'MISSION.md'), '# Custom mission');
      await service.bootstrap();
      const content = await adapter.readFile(getCoreFilePath(PLANNING_DIR, 'MISSION.md'));
      expect(content).toBe('# Custom mission');
    });

    it('invalidates cache after bootstrap', async () => {
      const vm1 = service.getViewModel();
      expect(vm1.workspaceStatus).toBe('missing');
      await service.bootstrap();
      const vm2 = service.getViewModel();
      expect(vm2.workspaceStatus).toBe('healthy');
    });
  });

  describe('ensureCoreFile', () => {
    it('returns created: false when file exists', async () => {
      adapter.addFolder(PLANNING_DIR);
      adapter.addFile(getCoreFilePath(PLANNING_DIR, 'MISSION.md'), '# Mission');
      const result = await service.ensureCoreFile('MISSION.md', '# New mission');
      expect(result.created).toBe(false);
      expect(result.path).toBe('.planning/MISSION.md');
    });

    it('creates file when it does not exist', async () => {
      const result = await service.ensureCoreFile('MISSION.md', '# New mission');
      expect(result.created).toBe(true);
      expect(adapter.fileExists('.planning/MISSION.md')).toBe(true);
    });
  });
});
