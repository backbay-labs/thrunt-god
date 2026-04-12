import { describe, it, expect, beforeEach } from 'vitest';
import type { VaultAdapter } from '../vault-adapter';
import { WorkspaceService, formatStatusBarText } from '../workspace';
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
  setFolderChildren(path: string, children: string[]): void {
    this.folderChildren.set(path, children);
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

    it('creates all 6 entity folders', async () => {
      await service.bootstrap();
      expect(adapter.folderExists('.planning/entities/iocs')).toBe(true);
      expect(adapter.folderExists('.planning/entities/ttps')).toBe(true);
      expect(adapter.folderExists('.planning/entities/actors')).toBe(true);
      expect(adapter.folderExists('.planning/entities/tools')).toBe(true);
      expect(adapter.folderExists('.planning/entities/infra')).toBe(true);
      expect(adapter.folderExists('.planning/entities/datasources')).toBe(true);
    });

    it('entity folder creation is idempotent', async () => {
      await service.bootstrap();
      // Second bootstrap should not throw
      await service.bootstrap();
      expect(adapter.folderExists('.planning/entities/iocs')).toBe(true);
      expect(adapter.folderExists('.planning/entities/ttps')).toBe(true);
    });

    it('creates entity folders under planningDir not vault root', async () => {
      // Recreate service with custom planningDir
      const customService = new WorkspaceService(
        null as any,
        adapter,
        () => ({ planningDir: '.hunt' }),
        '.hunt',
      );
      await customService.bootstrap();
      expect(adapter.folderExists('.hunt/entities/iocs')).toBe(true);
      expect(adapter.folderExists('.hunt/entities/ttps')).toBe(true);
      expect(adapter.folderExists('.hunt/entities/actors')).toBe(true);
      // Verify NOT at vault root
      expect(adapter.folderExists('entities/iocs')).toBe(false);
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

  // -------------------------------------------------------------------------
  // formatStatusBarText
  // -------------------------------------------------------------------------

  describe('formatStatusBarText', () => {
    const healthyBase = {
      workspaceStatus: 'healthy' as const,
      planningDir: '.planning',
      artifactCount: 5,
      artifactTotal: 5,
      artifacts: [],
      stateSnapshot: null,
      hypothesisSnapshot: null,
      phaseDirectories: { count: 0, highest: null, highestName: null },
    };

    it('returns "THRUNT not detected" for missing workspace', () => {
      const vm = {
        workspaceStatus: 'missing' as const,
        planningDir: '.planning',
        artifactCount: 0,
        artifactTotal: 5,
        artifacts: [],
        stateSnapshot: null,
        hypothesisSnapshot: null,
        phaseDirectories: { count: 0, highest: null, highestName: null },
      };
      expect(formatStatusBarText(vm)).toBe('THRUNT not detected');
    });

    it('returns partial format with artifact counts', () => {
      const vm = {
        workspaceStatus: 'partial' as const,
        planningDir: '.planning',
        artifactCount: 3,
        artifactTotal: 5,
        artifacts: [],
        stateSnapshot: null,
        hypothesisSnapshot: null,
        phaseDirectories: { count: 0, highest: null, highestName: null },
      };
      expect(formatStatusBarText(vm)).toBe('THRUNT .planning (3/5)');
    });

    it('returns phase + hypotheses + blocker for healthy parseable state', () => {
      const vm = {
        workspaceStatus: 'healthy' as const,
        planningDir: '.planning',
        artifactCount: 5,
        artifactTotal: 5,
        artifacts: [],
        stateSnapshot: { currentPhase: 'Phase 3', blockers: ['x'], nextActions: [] },
        hypothesisSnapshot: { total: 5, validated: 1, pending: 2, rejected: 1, unknown: 1 },
        phaseDirectories: { count: 3, highest: 3, highestName: 'phase-03' },
      };
      expect(formatStatusBarText(vm)).toBe('Phase 3 | 2/5 hypotheses active | 1 blocker');
    });

    it('returns fallback format for healthy with null stateSnapshot', () => {
      const vm = {
        ...healthyBase,
        stateSnapshot: null,
        hypothesisSnapshot: null,
      };
      expect(formatStatusBarText(vm)).toBe('THRUNT .planning (5/5)');
    });

    it('returns fallback format for healthy with unknown currentPhase', () => {
      const vm = {
        ...healthyBase,
        stateSnapshot: { currentPhase: 'unknown', blockers: [], nextActions: [] },
        hypothesisSnapshot: null,
      };
      expect(formatStatusBarText(vm)).toBe('THRUNT .planning (5/5)');
    });

    it('uses plural "blockers" for multiple blockers', () => {
      const vm = {
        ...healthyBase,
        stateSnapshot: { currentPhase: 'Recon', blockers: ['a', 'b'], nextActions: [] },
        hypothesisSnapshot: null,
      };
      expect(formatStatusBarText(vm)).toBe('Recon | 2 blockers');
    });

    it('returns just phase when no hypotheses and no blockers', () => {
      const vm = {
        ...healthyBase,
        stateSnapshot: { currentPhase: 'Recon', blockers: [], nextActions: [] },
        hypothesisSnapshot: null,
      };
      expect(formatStatusBarText(vm)).toBe('Recon');
    });
  });

  // -------------------------------------------------------------------------
  // detectPhaseDirectories (via getViewModel)
  // -------------------------------------------------------------------------

  describe('detectPhaseDirectories', () => {
    it('returns empty info when no phase directories exist', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.setFolderChildren(PLANNING_DIR, []);
      const vm = await service.getViewModel();
      expect(vm.phaseDirectories).toEqual({ count: 0, highest: null, highestName: null });
    });

    it('counts only phase-NN directories in mixed listing', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.setFolderChildren(PLANNING_DIR, ['phase-01', 'phase-recon', 'notes']);
      const vm = await service.getViewModel();
      expect(vm.phaseDirectories).toEqual({ count: 1, highest: 1, highestName: 'phase-01' });
    });

    it('ignores all non-numeric directory names', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.setFolderChildren(PLANNING_DIR, ['phase-recon', 'notes', 'archive']);
      const vm = await service.getViewModel();
      expect(vm.phaseDirectories).toEqual({ count: 0, highest: null, highestName: null });
    });

    it('correctly identifies highest phase from multiple directories', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.setFolderChildren(PLANNING_DIR, ['phase-01', 'phase-02', 'phase-03']);
      const vm = await service.getViewModel();
      expect(vm.phaseDirectories).toEqual({ count: 3, highest: 3, highestName: 'phase-03' });
    });

    it('getViewModel includes parsed snapshots when STATE.md and HYPOTHESES.md exist', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      // The starter templates include default content for STATE.md and HYPOTHESES.md
      const vm = await service.getViewModel();
      // stateSnapshot should not be null since STATE.md was added via addAllArtifacts
      expect(vm.stateSnapshot).not.toBeNull();
      // hypothesisSnapshot depends on whether the starter template has a table
      // Just verify the field is present
      expect(vm).toHaveProperty('hypothesisSnapshot');
    });
  });
});
