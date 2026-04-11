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
  private folderChildren = new Map<string, string[]>();

  addFolder(path: string): void {
    this.folders.add(path);
  }
  addFile(path: string, content: string): void {
    this.files.set(path, content);
  }
  addSubFolder(parentPath: string, childName: string): void {
    this.folders.add(`${parentPath}/${childName}`);
    const existing = this.folderChildren.get(parentPath) ?? [];
    existing.push(childName);
    this.folderChildren.set(parentPath, existing);
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
  async listFolders(path: string): Promise<string[]> {
    return this.folderChildren.get(path) ?? [];
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
    it('returns missing when planning folder does not exist', async () => {
      const vm = await service.getViewModel();
      expect(vm.workspaceStatus).toBe('missing');
      expect(vm.artifactCount).toBe(0);
      expect(vm.artifactTotal).toBe(5);
    });

    it('returns partial when folder exists but no artifacts', async () => {
      adapter.addFolder(PLANNING_DIR);
      const vm = await service.getViewModel();
      expect(vm.workspaceStatus).toBe('partial');
      expect(vm.artifactCount).toBe(0);
    });

    it('returns partial when folder exists with some artifacts', async () => {
      adapter.addFolder(PLANNING_DIR);
      adapter.addFile(getCoreFilePath(PLANNING_DIR, 'MISSION.md'), '# Mission');
      adapter.addFile(getCoreFilePath(PLANNING_DIR, 'STATE.md'), '# State');
      const vm = await service.getViewModel();
      expect(vm.workspaceStatus).toBe('partial');
      expect(vm.artifactCount).toBe(2);
      expect(vm.artifactTotal).toBe(5);
    });

    it('returns healthy when all artifacts exist', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      const vm = await service.getViewModel();
      expect(vm.workspaceStatus).toBe('healthy');
      expect(vm.artifactCount).toBe(5);
      expect(vm.artifactTotal).toBe(5);
    });

    it('caches the view model until invalidated', async () => {
      adapter.addFolder(PLANNING_DIR);
      const vm1 = await service.getViewModel();
      expect(vm1.artifactCount).toBe(0);

      // Add a file after caching -- should NOT be reflected yet
      adapter.addFile(getCoreFilePath(PLANNING_DIR, 'MISSION.md'), '# Mission');
      const vm2 = await service.getViewModel();
      expect(vm2.artifactCount).toBe(0);
      expect(vm2).toBe(vm1); // same reference

      // Invalidate -- should now reflect the change
      service.invalidate();
      const vm3 = await service.getViewModel();
      expect(vm3.artifactCount).toBe(1);
      expect(vm3).not.toBe(vm1); // different reference
    });

    it('artifacts array has correct length', async () => {
      const vm = await service.getViewModel();
      expect(vm.artifacts).toHaveLength(5);
    });

    it('artifact paths are correctly resolved', async () => {
      const vm = await service.getViewModel();
      expect(vm.artifacts[0]!.path).toBe('.planning/MISSION.md');
      expect(vm.artifacts[3]!.path).toBe('.planning/STATE.md');
    });

    it('populates stateSnapshot when STATE.md exists', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFile(getCoreFilePath(PLANNING_DIR, 'STATE.md'), '## Current phase\nLateral movement\n\n## Blockers\n- Need EDR access\n\n## Next actions\n- Query logs');
      const vm = await service.getViewModel();
      expect(vm.stateSnapshot).not.toBeNull();
      expect(vm.stateSnapshot!.currentPhase).toBe('Lateral movement');
      expect(vm.stateSnapshot!.blockers).toEqual(['Need EDR access']);
      expect(vm.stateSnapshot!.nextActions).toEqual(['Query logs']);
    });

    it('populates hypothesisSnapshot when HYPOTHESES.md exists', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFile(getCoreFilePath(PLANNING_DIR, 'HYPOTHESES.md'), '| ID | Hypothesis | Status |\n|---|---|---|\n| H1 | Lateral movement | validated |\n| H2 | Data exfil | pending |\n| H3 | Persistence | rejected |');
      const vm = await service.getViewModel();
      expect(vm.hypothesisSnapshot).not.toBeNull();
      expect(vm.hypothesisSnapshot!.total).toBe(3);
      expect(vm.hypothesisSnapshot!.validated).toBe(1);
      expect(vm.hypothesisSnapshot!.pending).toBe(1);
      expect(vm.hypothesisSnapshot!.rejected).toBe(1);
    });

    it('detects phase directories', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addSubFolder(PLANNING_DIR, 'phase-01');
      adapter.addSubFolder(PLANNING_DIR, 'phase-02');
      adapter.addSubFolder(PLANNING_DIR, 'phase-03');
      adapter.addSubFolder(PLANNING_DIR, 'notes'); // non-phase directory
      const vm = await service.getViewModel();
      expect(vm.phaseDirectories.count).toBe(3);
      expect(vm.phaseDirectories.highest).toBe(3);
      expect(vm.phaseDirectories.highestName).toBe('phase-03');
    });

    it('returns null snapshots when artifacts do not exist', async () => {
      const vm = await service.getViewModel();
      expect(vm.stateSnapshot).toBeNull();
      expect(vm.hypothesisSnapshot).toBeNull();
      expect(vm.phaseDirectories.count).toBe(0);
    });
  });

  describe('invalidate', () => {
    it('clears the cached view model', async () => {
      const vm1 = await service.getViewModel();
      service.invalidate();
      const vm2 = await service.getViewModel();
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
      const vm1 = await service.getViewModel();
      expect(vm1.workspaceStatus).toBe('missing');
      await service.bootstrap();
      const vm2 = await service.getViewModel();
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
