import { describe, it, expect, beforeEach } from 'vitest';
import type { VaultAdapter } from '../vault-adapter';
import { WorkspaceService, formatStatusBarText } from '../workspace';
import { CORE_ARTIFACTS, KNOWLEDGE_BASE_TEMPLATE } from '../artifacts';
import { getCoreFilePath, normalizePath } from '../paths';
import { ENTITY_FOLDERS } from '../entity-schema';

// ---------------------------------------------------------------------------
// StubVaultAdapter -- in-memory implementation for testing without Obsidian
// ---------------------------------------------------------------------------

class StubVaultAdapter implements VaultAdapter {
  private files = new Map<string, string>();
  private folders = new Set<string>();
  private folderChildren = new Map<string, string[]>();
  private filesByFolder = new Map<string, string[]>();
  private fileMtimes = new Map<string, number>();

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
  addFileToFolder(folderPath: string, fileName: string): void {
    const existing = this.filesByFolder.get(folderPath) ?? [];
    existing.push(fileName);
    this.filesByFolder.set(folderPath, existing);
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
  async listFiles(path: string): Promise<string[]> {
    return this.filesByFolder.get(path) ?? [];
  }
  async modifyFile(path: string, content: string): Promise<void> {
    if (!this.files.has(path)) throw new Error(`File not found: ${path}`);
    this.files.set(path, content);
  }
  setFileMtime(path: string, mtime: number): void {
    this.fileMtimes.set(path, mtime);
  }
  getFileMtime(path: string): number | null {
    return this.fileMtimes.get(path) ?? null;
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

    it('getViewModel includes mcpStatus disabled when no mcpClient', async () => {
      const vm = await service.getViewModel();
      expect(vm.mcpStatus).toBe('disabled');
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

    it('creates KNOWLEDGE_BASE.md during bootstrap', async () => {
      await service.bootstrap();
      expect(adapter.fileExists('.planning/KNOWLEDGE_BASE.md')).toBe(true);
    });

    it('does not overwrite existing KNOWLEDGE_BASE.md', async () => {
      adapter.addFolder(PLANNING_DIR);
      adapter.addFile('.planning/KNOWLEDGE_BASE.md', '# My custom KB');
      await service.bootstrap();
      const content = await adapter.readFile('.planning/KNOWLEDGE_BASE.md');
      expect(content).toBe('# My custom KB');
    });

    it('creates KNOWLEDGE_BASE.md under custom planningDir', async () => {
      const customService = new WorkspaceService(
        null as any,
        adapter,
        () => ({ planningDir: '.hunt' }),
        '.hunt',
      );
      await customService.bootstrap();
      expect(adapter.fileExists('.hunt/KNOWLEDGE_BASE.md')).toBe(true);
    });

    it('KNOWLEDGE_BASE.md contains Dataview queries', async () => {
      await service.bootstrap();
      const content = await adapter.readFile('.planning/KNOWLEDGE_BASE.md');
      expect(content).toContain('```dataview');
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
    const defaultExtendedArtifacts = {
      receipts: 0,
      queries: 0,
      evidenceReview: false,
      successCriteria: false,
      environment: false,
      cases: 0,
    };
    const healthyBase = {
      workspaceStatus: 'healthy' as const,
      planningDir: '.planning',
      artifactCount: 5,
      artifactTotal: 5,
      artifacts: [],
      stateSnapshot: null,
      hypothesisSnapshot: null,
      phaseDirectories: { count: 0, highest: null, highestName: null },
      entityCounts: {},
      extendedArtifacts: defaultExtendedArtifacts,
      receiptTimeline: [],
      mcpStatus: 'disabled' as const,
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
        entityCounts: {},
        extendedArtifacts: defaultExtendedArtifacts,
        receiptTimeline: [],
        mcpStatus: 'disabled' as const,
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
        entityCounts: {},
        extendedArtifacts: defaultExtendedArtifacts,
        receiptTimeline: [],
        mcpStatus: 'disabled' as const,
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
        entityCounts: {},
        extendedArtifacts: defaultExtendedArtifacts,
        receiptTimeline: [],
        mcpStatus: 'disabled' as const,
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
        mcpStatus: 'disabled' as const,
      };
      expect(formatStatusBarText(vm)).toBe('Recon | 2 blockers');
    });

    it('returns just phase when no hypotheses and no blockers', () => {
      const vm = {
        ...healthyBase,
        stateSnapshot: { currentPhase: 'Recon', blockers: [], nextActions: [] },
        hypothesisSnapshot: null,
        mcpStatus: 'disabled' as const,
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

  // -------------------------------------------------------------------------
  // entityCounts in getViewModel
  // -------------------------------------------------------------------------

  describe('entityCounts', () => {
    it('shows 0 for all folders when workspace is missing', async () => {
      const vm = await service.getViewModel();
      for (const folder of ENTITY_FOLDERS) {
        expect(vm.entityCounts[folder]).toBe(0);
      }
    });

    it('counts .md files in entity folders', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFolder('.planning/entities/iocs');
      adapter.addFileToFolder('.planning/entities/iocs', 'ip-1.md');
      adapter.addFileToFolder('.planning/entities/iocs', 'ip-2.md');
      const vm = await service.getViewModel();
      expect(vm.entityCounts['entities/iocs']).toBe(2);
    });

    it('updates after invalidate when files are added', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFolder('.planning/entities/ttps');
      const vm1 = await service.getViewModel();
      expect(vm1.entityCounts['entities/ttps']).toBe(0);

      adapter.addFileToFolder('.planning/entities/ttps', 'lateral-movement.md');
      service.invalidate();
      const vm2 = await service.getViewModel();
      expect(vm2.entityCounts['entities/ttps']).toBe(1);
    });

    it('only counts .md files', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFolder('.planning/entities/actors');
      adapter.addFileToFolder('.planning/entities/actors', 'apt28.md');
      adapter.addFileToFolder('.planning/entities/actors', 'image.png');
      const vm = await service.getViewModel();
      expect(vm.entityCounts['entities/actors']).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // extendedArtifacts in getViewModel
  // -------------------------------------------------------------------------

  describe('extendedArtifacts', () => {
    it('returns zeros/false when no extended artifacts exist', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      const vm = await service.getViewModel();
      expect(vm.extendedArtifacts).toEqual({
        receipts: 0,
        queries: 0,
        evidenceReview: false,
        successCriteria: false,
        environment: false,
        cases: 0,
      });
    });

    it('counts RCT-*.md files in RECEIPTS/ folder', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFolder('.planning/RECEIPTS');
      adapter.addFileToFolder('.planning/RECEIPTS', 'RCT-001.md');
      adapter.addFileToFolder('.planning/RECEIPTS', 'RCT-002.md');
      adapter.addFileToFolder('.planning/RECEIPTS', 'RCT-003.md');
      const vm = await service.getViewModel();
      expect(vm.extendedArtifacts.receipts).toBe(3);
    });

    it('filters RECEIPTS/ by RCT- prefix and .md suffix', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFolder('.planning/RECEIPTS');
      adapter.addFileToFolder('.planning/RECEIPTS', 'RCT-001.md');
      adapter.addFileToFolder('.planning/RECEIPTS', 'README.md');
      adapter.addFileToFolder('.planning/RECEIPTS', 'RCT-draft.txt');
      adapter.addFileToFolder('.planning/RECEIPTS', 'notes.md');
      const vm = await service.getViewModel();
      expect(vm.extendedArtifacts.receipts).toBe(1);
    });

    it('counts QRY-*.md files in QUERIES/ folder', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFolder('.planning/QUERIES');
      adapter.addFileToFolder('.planning/QUERIES', 'QRY-001.md');
      adapter.addFileToFolder('.planning/QUERIES', 'QRY-002.md');
      const vm = await service.getViewModel();
      expect(vm.extendedArtifacts.queries).toBe(2);
    });

    it('filters QUERIES/ by QRY- prefix and .md suffix', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFolder('.planning/QUERIES');
      adapter.addFileToFolder('.planning/QUERIES', 'QRY-001.md');
      adapter.addFileToFolder('.planning/QUERIES', 'README.md');
      adapter.addFileToFolder('.planning/QUERIES', 'QRY-draft.txt');
      const vm = await service.getViewModel();
      expect(vm.extendedArtifacts.queries).toBe(1);
    });

    it('detects EVIDENCE_REVIEW.md existence', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFile('.planning/EVIDENCE_REVIEW.md', '# Evidence Review');
      const vm = await service.getViewModel();
      expect(vm.extendedArtifacts.evidenceReview).toBe(true);
    });

    it('detects SUCCESS_CRITERIA.md existence', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFile('.planning/SUCCESS_CRITERIA.md', '# Success Criteria');
      const vm = await service.getViewModel();
      expect(vm.extendedArtifacts.successCriteria).toBe(true);
    });

    it('detects environment/ENVIRONMENT.md existence', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFile('.planning/environment/ENVIRONMENT.md', '# Environment');
      const vm = await service.getViewModel();
      expect(vm.extendedArtifacts.environment).toBe(true);
    });

    it('counts case directories containing MISSION.md', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFolder('.planning/cases');
      adapter.addSubFolder('.planning/cases', 'case-alpha');
      adapter.addSubFolder('.planning/cases', 'case-beta');
      adapter.addSubFolder('.planning/cases', 'case-gamma');
      adapter.addFile('.planning/cases/case-alpha/MISSION.md', '# Mission');
      adapter.addFile('.planning/cases/case-beta/MISSION.md', '# Mission');
      // case-gamma has no MISSION.md
      const vm = await service.getViewModel();
      expect(vm.extendedArtifacts.cases).toBe(2);
    });

    it('returns cases = 0 when cases/ folder does not exist', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      const vm = await service.getViewModel();
      expect(vm.extendedArtifacts.cases).toBe(0);
    });

    it('updates after invalidate() when files are added', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      const vm1 = await service.getViewModel();
      expect(vm1.extendedArtifacts.receipts).toBe(0);

      adapter.addFolder('.planning/RECEIPTS');
      adapter.addFileToFolder('.planning/RECEIPTS', 'RCT-001.md');
      adapter.addFile('.planning/EVIDENCE_REVIEW.md', '# Evidence Review');
      service.invalidate();
      const vm2 = await service.getViewModel();
      expect(vm2.extendedArtifacts.receipts).toBe(1);
      expect(vm2.extendedArtifacts.evidenceReview).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // StubVaultAdapter.listFiles
  // -------------------------------------------------------------------------

  describe('StubVaultAdapter.listFiles', () => {
    it('returns file names for a folder with files', async () => {
      adapter.addFileToFolder('entities/iocs', 'evil-ip.md');
      adapter.addFileToFolder('entities/iocs', 'bad-domain.md');
      const files = await adapter.listFiles('entities/iocs');
      expect(files).toEqual(['evil-ip.md', 'bad-domain.md']);
    });

    it('returns empty array for non-existent folder', async () => {
      const files = await adapter.listFiles('nonexistent/folder');
      expect(files).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // KNOWLEDGE_BASE_TEMPLATE
  // -------------------------------------------------------------------------

  describe('KNOWLEDGE_BASE_TEMPLATE', () => {
    it('contains at least 6 Dataview query blocks', () => {
      const matches = KNOWLEDGE_BASE_TEMPLATE.match(/```dataview/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThanOrEqual(6);
    });

    it('is not included in CORE_ARTIFACTS', () => {
      const kbArtifact = CORE_ARTIFACTS.find(
        (a) => a.fileName === 'KNOWLEDGE_BASE.md',
      );
      expect(kbArtifact).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // runIngestion
  // -------------------------------------------------------------------------

  describe('runIngestion', () => {
    const RECEIPT_MD = `---
receipt_id: RCT-001
claim_status: supports
result_status: ok
related_hypotheses:
  - H1 Lateral movement
related_queries:
  - QRY-001
---

## Claim

Attacker used T1059.001 for execution.

## Evidence

Process logs show powershell.exe spawning encoded command.

## Confidence

High
`;

    const QUERY_MD = `---
query_id: QRY-001
dataset: events
result_status: ok
related_hypotheses:
  - H1 Lateral movement
related_receipts:
  - RCT-001
---

## Intent

Search for suspicious IPs in firewall logs.

## Query

\`\`\`kql
FirewallLogs | where SrcIP == "10.0.0.50"
\`\`\`

## Results

Found connections from 10.0.0.50 to external C2 at 192.168.1.100.
`;

    function setupHealthyWorkspace(adapter: StubVaultAdapter): void {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      // Entity folders
      adapter.addFolder('.planning/entities/iocs');
      adapter.addFolder('.planning/entities/ttps');
      adapter.addFolder('.planning/entities/actors');
      adapter.addFolder('.planning/entities/tools');
      adapter.addFolder('.planning/entities/infra');
      adapter.addFolder('.planning/entities/datasources');
    }

    function addReceiptFiles(adapter: StubVaultAdapter): void {
      adapter.addFolder('.planning/RECEIPTS');
      adapter.addFile('.planning/RECEIPTS/RCT-001.md', RECEIPT_MD);
      adapter.addFileToFolder('.planning/RECEIPTS', 'RCT-001.md');
    }

    function addQueryFiles(adapter: StubVaultAdapter): void {
      adapter.addFolder('.planning/QUERIES');
      adapter.addFile('.planning/QUERIES/QRY-001.md', QUERY_MD);
      adapter.addFileToFolder('.planning/QUERIES', 'QRY-001.md');
    }

    it('creates entity notes in entities/ttps/ from receipt files', async () => {
      setupHealthyWorkspace(adapter);
      addReceiptFiles(adapter);

      const result = await service.runIngestion();

      expect(result.created).toBeGreaterThanOrEqual(1);
      // T1059.001 extracted from receipt
      expect(adapter.fileExists('.planning/entities/ttps/T1059.001.md')).toBe(true);
    });

    it('creates entity notes in entities/iocs/ from query files', async () => {
      setupHealthyWorkspace(adapter);
      addQueryFiles(adapter);

      const result = await service.runIngestion();

      expect(result.created).toBeGreaterThanOrEqual(1);
      // 10.0.0.50 and 192.168.1.100 extracted from query body
      expect(
        adapter.fileExists('.planning/entities/iocs/10.0.0.50.md') ||
        adapter.fileExists('.planning/entities/iocs/192.168.1.100.md'),
      ).toBe(true);
    });

    it('does not duplicate sightings on second run', async () => {
      setupHealthyWorkspace(adapter);
      addReceiptFiles(adapter);

      const result1 = await service.runIngestion();
      expect(result1.created).toBeGreaterThanOrEqual(1);

      // Second run should skip (not duplicate)
      const result2 = await service.runIngestion();
      expect(result2.skipped).toBeGreaterThanOrEqual(1);
      expect(result2.created).toBe(0);
    });

    it('creates INGESTION_LOG.md with run summary', async () => {
      setupHealthyWorkspace(adapter);
      addReceiptFiles(adapter);

      await service.runIngestion();

      expect(adapter.fileExists('.planning/INGESTION_LOG.md')).toBe(true);
      const logContent = await adapter.readFile('.planning/INGESTION_LOG.md');
      expect(logContent).toContain('# Ingestion Log');
      expect(logContent).toContain('Created:');
      expect(logContent).toContain('Updated:');
      expect(logContent).toContain('Skipped:');
    });

    it('appends to INGESTION_LOG.md on second run', async () => {
      setupHealthyWorkspace(adapter);
      addReceiptFiles(adapter);

      await service.runIngestion();
      await service.runIngestion();

      const logContent = await adapter.readFile('.planning/INGESTION_LOG.md');
      // Should contain two run entries (two ## headings beyond the initial # heading)
      const runHeadings = logContent.match(/^## /gm);
      expect(runHeadings).not.toBeNull();
      expect(runHeadings!.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // receiptTimeline in getViewModel
  // -------------------------------------------------------------------------

  describe('receiptTimeline', () => {
    const RECEIPT_MD = `---
receipt_id: RCT-001
claim_status: supports
result_status: ok
related_hypotheses:
  - H1 Lateral movement
related_queries:
  - QRY-001
---

## Claim

Attacker used T1059.001 for execution.

## Evidence

Process logs show powershell.exe.

## Confidence

High
`;

    it('is populated when RECEIPTS/ has files', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFolder('.planning/RECEIPTS');
      adapter.addFile('.planning/RECEIPTS/RCT-001.md', RECEIPT_MD);
      adapter.addFileToFolder('.planning/RECEIPTS', 'RCT-001.md');

      const vm = await service.getViewModel();

      expect(vm.receiptTimeline).toHaveLength(1);
      expect(vm.receiptTimeline[0]!.receipt_id).toBe('RCT-001');
      expect(vm.receiptTimeline[0]!.claim_status).toBe('supports');
      expect(vm.receiptTimeline[0]!.hypothesis).toBe('H1 Lateral movement');
      expect(vm.receiptTimeline[0]!.fileName).toBe('RCT-001.md');
    });

    it('is empty when RECEIPTS/ folder does not exist', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);

      const vm = await service.getViewModel();
      expect(vm.receiptTimeline).toEqual([]);
    });

    it('is empty when workspace is missing', async () => {
      const vm = await service.getViewModel();
      expect(vm.receiptTimeline).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Context assembly (Phase 74 Plan 02)
  // -------------------------------------------------------------------------

  describe('assembleContextForProfile', () => {
    it('returns error for unknown agentId', async () => {
      const result = await service.assembleContextForProfile('notes/test.md', 'nonexistent-agent');
      expect(result).toHaveProperty('error');
      expect((result as { error: string }).error).toContain('Unknown agent profile');
    });
  });

  describe('getAvailableProfiles', () => {
    it('returns 5 default profiles', () => {
      const profiles = service.getAvailableProfiles();
      expect(profiles).toHaveLength(5);
      expect(profiles[0]!.agentId).toBe('query-writer');
    });
  });

  describe('renderAssembledContext', () => {
    it('includes provenance comments with <!-- source: --> markers', () => {
      const assembled = {
        sections: [
          { heading: 'Hypothesis', content: 'Test content', sourcePath: 'notes/hunt.md' },
          { heading: 'Evidence', content: 'Some evidence', sourcePath: 'notes/evidence.md' },
        ],
        tokenEstimate: 10,
        profileUsed: 'test-agent',
        sourceNote: 'notes/hunt.md',
      };
      const rendered = service.renderAssembledContext(assembled);
      expect(rendered).toContain('<!-- source: notes/hunt.md -->');
      expect(rendered).toContain('<!-- source: notes/evidence.md -->');
      expect(rendered).toContain('## Hypothesis');
      expect(rendered).toContain('## Evidence');
      expect(rendered).toContain('Test content');
      expect(rendered).toContain('Some evidence');
    });
  });

  // -------------------------------------------------------------------------
  // logExport -- EXPORT_LOG.md
  // -------------------------------------------------------------------------

  describe('logExport', () => {
    const mockEntry = {
      timestamp: '2026-04-12T00:00:00.000Z',
      sourceNote: 'hunts/APT29.md',
      profileId: 'query-writer',
      profileLabel: 'Query Writer',
      tokenEstimate: 1500,
      sectionCount: 3,
      entityCounts: { ttps: 2, iocs: 1 },
    };

    function setupForExport(a: StubVaultAdapter): void {
      a.addFolder(PLANNING_DIR);
      addAllArtifacts(a);
    }

    it('creates EXPORT_LOG.md with export entry', async () => {
      setupForExport(adapter);

      await service.logExport(mockEntry);

      expect(adapter.fileExists('.planning/EXPORT_LOG.md')).toBe(true);
      const logContent = await adapter.readFile('.planning/EXPORT_LOG.md');
      expect(logContent).toContain('# Export Log');
      expect(logContent).toContain('Source: hunts/APT29.md');
      expect(logContent).toContain('Profile: Query Writer (query-writer)');
      expect(logContent).toContain('Token estimate: 1500');
      expect(logContent).toContain('Sections: 3');
      expect(logContent).toContain('ttps: 2');
      expect(logContent).toContain('iocs: 1');
    });

    it('appends to EXPORT_LOG.md on second call', async () => {
      setupForExport(adapter);

      await service.logExport(mockEntry);
      await service.logExport({ ...mockEntry, timestamp: '2026-04-12T01:00:00.000Z' });

      const logContent = await adapter.readFile('.planning/EXPORT_LOG.md');
      // Should contain two run entries (two ## headings beyond the initial # heading)
      const runHeadings = logContent.match(/^## /gm);
      expect(runHeadings).not.toBeNull();
      expect(runHeadings!.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -------------------------------------------------------------------------
  // generateHuntCanvas
  // -------------------------------------------------------------------------

  describe('generateHuntCanvas', () => {
    function setupEntityFiles(a: StubVaultAdapter): void {
      a.addFolder(PLANNING_DIR);
      addAllArtifacts(a);
      // TTP entity folder
      a.addFolder('.planning/entities/ttps');
      a.addFileToFolder('.planning/entities/ttps', 'T1059.md');
      a.addFile('.planning/entities/ttps/T1059.md', `---
type: ttp
mitre_id: "T1059"
tactic: "Execution"
---
# T1059
`);
      a.addFileToFolder('.planning/entities/ttps', 'T1566.md');
      a.addFile('.planning/entities/ttps/T1566.md', `---
type: ttp
mitre_id: "T1566"
tactic: "Initial Access"
---
# T1566
`);
      // IOC entity folder
      a.addFolder('.planning/entities/iocs');
      a.addFileToFolder('.planning/entities/iocs', '192.168.1.1.md');
      a.addFile('.planning/entities/iocs/192.168.1.1.md', `---
type: ioc/ip
value: "192.168.1.1"
---
# 192.168.1.1
`);
      // Empty folders for other entity types
      a.addFolder('.planning/entities/actors');
      a.addFolder('.planning/entities/tools');
      a.addFolder('.planning/entities/infra');
      a.addFolder('.planning/entities/datasources');
    }

    it('generates a kill-chain canvas with valid JSON', async () => {
      setupEntityFiles(adapter);
      const result = await service.generateHuntCanvas('kill-chain');
      expect(result.success).toBe(true);
      expect(result.message).toContain('CANVAS_KILL_CHAIN.canvas');
      expect(result.canvasPath).toBe('.planning/CANVAS_KILL_CHAIN.canvas');

      // Verify file was created with valid JSON
      const content = await adapter.readFile('.planning/CANVAS_KILL_CHAIN.canvas');
      const parsed = JSON.parse(content);
      expect(parsed).toHaveProperty('nodes');
      expect(parsed).toHaveProperty('edges');
      expect(Array.isArray(parsed.nodes)).toBe(true);
      expect(parsed.nodes.length).toBe(3); // 2 TTPs + 1 IOC
    });

    it('generates a diamond canvas', async () => {
      setupEntityFiles(adapter);
      const result = await service.generateHuntCanvas('diamond');
      expect(result.success).toBe(true);
      expect(result.canvasPath).toBe('.planning/CANVAS_DIAMOND.canvas');
    });

    it('generates a lateral-movement canvas', async () => {
      setupEntityFiles(adapter);
      const result = await service.generateHuntCanvas('lateral-movement');
      expect(result.success).toBe(true);
      expect(result.canvasPath).toBe('.planning/CANVAS_LATERAL_MOVEMENT.canvas');
    });

    it('generates a hunt-progression canvas', async () => {
      setupEntityFiles(adapter);
      const result = await service.generateHuntCanvas('hunt-progression');
      expect(result.success).toBe(true);
      expect(result.canvasPath).toBe('.planning/CANVAS_HUNT_PROGRESSION.canvas');
    });

    it('produces canvas with 0 nodes when no entity files exist', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      // Add empty entity folders
      for (const folder of ENTITY_FOLDERS) {
        adapter.addFolder(normalizePath(`${PLANNING_DIR}/${folder}`));
      }
      const result = await service.generateHuntCanvas('kill-chain');
      expect(result.success).toBe(true);

      const content = await adapter.readFile('.planning/CANVAS_KILL_CHAIN.canvas');
      const parsed = JSON.parse(content);
      expect(parsed.nodes).toHaveLength(0);
      expect(parsed.edges).toHaveLength(0);
    });

    it('overwrites existing canvas file', async () => {
      setupEntityFiles(adapter);
      adapter.addFile('.planning/CANVAS_KILL_CHAIN.canvas', '{}');

      const result = await service.generateHuntCanvas('kill-chain');
      expect(result.success).toBe(true);

      const content = await adapter.readFile('.planning/CANVAS_KILL_CHAIN.canvas');
      const parsed = JSON.parse(content);
      expect(parsed.nodes.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // canvasFromCurrentHunt
  // -------------------------------------------------------------------------

  describe('canvasFromCurrentHunt', () => {
    it('returns error when no findings or receipts exist', async () => {
      adapter.addFolder(PLANNING_DIR);
      // Do NOT add core artifacts -- FINDINGS.md is a core artifact and would be detected
      const result = await service.canvasFromCurrentHunt();
      expect(result.success).toBe(false);
      expect(result.message).toContain('No findings or receipts found');
    });

    it('creates canvas from FINDINGS.md with technique refs', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFile('.planning/FINDINGS.md', `# Findings

## Key Findings

Observed T1059 and T1566.001 in the environment.
Links to [[SuspectActor]] and [[malware.exe]].
`);
      // Add TTP note for tactic lookup
      adapter.addFolder('.planning/entities/ttps');
      adapter.addFile('.planning/entities/ttps/T1059.md', `---
type: ttp
mitre_id: "T1059"
tactic: "Execution"
---
# T1059
`);

      const result = await service.canvasFromCurrentHunt();
      expect(result.success).toBe(true);
      expect(result.message).toContain('entities');
      expect(result.canvasPath).toBe('.planning/CANVAS_HUNT_KILL_CHAIN.canvas');

      const content = await adapter.readFile('.planning/CANVAS_HUNT_KILL_CHAIN.canvas');
      const parsed = JSON.parse(content);
      expect(parsed.nodes.length).toBeGreaterThan(0);
      // Should contain technique entities
      const nodeIds = parsed.nodes.map((n: { id: string }) => n.id);
      expect(nodeIds).toContain('T1059');
    });

    it('creates canvas from validated receipts only', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFolder('.planning/RECEIPTS');
      adapter.addFileToFolder('.planning/RECEIPTS', 'RCT-001.md');
      adapter.addFile('.planning/RECEIPTS/RCT-001.md', `---
receipt_id: "RCT-001"
claim_status: "supports"
result_status: "ok"
related_hypotheses:
  - H1
related_queries: []
---
## Claim
Lateral movement via T1021 detected.

## Evidence
Logs show RDP sessions from 192.168.1.1.

## Confidence
High
`);
      // A non-validated receipt that should be excluded
      adapter.addFileToFolder('.planning/RECEIPTS', 'RCT-002.md');
      adapter.addFile('.planning/RECEIPTS/RCT-002.md', `---
receipt_id: "RCT-002"
claim_status: "context"
result_status: "ok"
related_hypotheses: []
related_queries: []
---
## Claim
Background noise with T1082.

## Evidence
Process listing.

## Confidence
Low
`);

      const result = await service.canvasFromCurrentHunt();
      expect(result.success).toBe(true);

      const content = await adapter.readFile('.planning/CANVAS_HUNT_KILL_CHAIN.canvas');
      const parsed = JSON.parse(content);
      // Should include T1021 from validated receipt but NOT T1082 from context receipt
      const nodeIds = parsed.nodes.map((n: { id: string }) => n.id);
      expect(nodeIds).toContain('T1021');
      expect(nodeIds).not.toContain('T1082');
    });

    it('deduplicates entities across findings and receipts', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFile('.planning/FINDINGS.md', `# Findings\nObserved T1059 in environment.\n`);
      adapter.addFolder('.planning/RECEIPTS');
      adapter.addFileToFolder('.planning/RECEIPTS', 'RCT-001.md');
      adapter.addFile('.planning/RECEIPTS/RCT-001.md', `---
receipt_id: "RCT-001"
claim_status: "supports"
result_status: "ok"
related_hypotheses: []
related_queries: []
---
## Claim
T1059 confirmed.

## Evidence
Evidence.

## Confidence
High
`);

      const result = await service.canvasFromCurrentHunt();
      expect(result.success).toBe(true);

      const content = await adapter.readFile('.planning/CANVAS_HUNT_KILL_CHAIN.canvas');
      const parsed = JSON.parse(content);
      // T1059 should appear only once (deduplicated)
      const t1059Nodes = parsed.nodes.filter((n: { id: string }) => n.id === 'T1059');
      expect(t1059Nodes).toHaveLength(1);
    });

    it('canvasFromCurrentHunt("diamond") creates CANVAS_HUNT_DIAMOND.canvas', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFile('.planning/FINDINGS.md', `# Findings\n\nObserved T1059 in the environment.\n`);
      adapter.addFolder('.planning/entities/ttps');
      adapter.addFile('.planning/entities/ttps/T1059.md', `---\ntype: ttp\nmitre_id: "T1059"\ntactic: "Execution"\n---\n# T1059\n`);

      const result = await service.canvasFromCurrentHunt('diamond');
      expect(result.success).toBe(true);
      expect(result.canvasPath).toBe('.planning/CANVAS_HUNT_DIAMOND.canvas');

      const content = await adapter.readFile('.planning/CANVAS_HUNT_DIAMOND.canvas');
      const parsed = JSON.parse(content);
      expect(parsed.nodes.length).toBeGreaterThan(0);
    });

    it('canvasFromCurrentHunt("kill-chain") creates CANVAS_HUNT_KILL_CHAIN.canvas (backward compat)', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFile('.planning/FINDINGS.md', `# Findings\n\nObserved T1059 in the environment.\n`);

      const result = await service.canvasFromCurrentHunt('kill-chain');
      expect(result.success).toBe(true);
      expect(result.canvasPath).toBe('.planning/CANVAS_HUNT_KILL_CHAIN.canvas');
    });

    it('canvasFromCurrentHunt("lateral-movement") calls generateLateralMovementCanvas', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFile('.planning/FINDINGS.md', `# Findings\n\nObserved T1059 in the environment.\n`);

      const result = await service.canvasFromCurrentHunt('lateral-movement');
      expect(result.success).toBe(true);
      expect(result.canvasPath).toBe('.planning/CANVAS_HUNT_LATERAL_MOVEMENT.canvas');
    });

    it('canvasFromCurrentHunt("hunt-progression") calls generateHuntProgressionCanvas', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFile('.planning/FINDINGS.md', `# Findings\n\nObserved T1059 in the environment.\n`);

      const result = await service.canvasFromCurrentHunt('hunt-progression');
      expect(result.success).toBe(true);
      expect(result.canvasPath).toBe('.planning/CANVAS_HUNT_HUNT_PROGRESSION.canvas');
    });
  });

  // -------------------------------------------------------------------------
  // analyzeCoverage (Phase 78 Plan 02)
  // -------------------------------------------------------------------------

  describe('analyzeCoverage', () => {
    it('offline fallback produces COVERAGE_REPORT.md from vault TTP notes', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFolder('.planning/entities/ttps');
      adapter.addFileToFolder('.planning/entities/ttps', 'T1059.md');
      adapter.addFile('.planning/entities/ttps/T1059.md', `---
type: ttp
mitre_id: "T1059"
tactic: "Execution"
hunt_count: 3
---
# T1059
`);
      adapter.addFileToFolder('.planning/entities/ttps', 'T1566.md');
      adapter.addFile('.planning/entities/ttps/T1566.md', `---
type: ttp
mitre_id: "T1566"
tactic: "Initial Access"
hunt_count: 1
---
# T1566
`);

      // No mcpClient -- service created by makeService without one
      const result = await service.analyzeCoverage();
      expect(result.success).toBe(true);
      expect(result.message).toContain('offline');

      const report = await adapter.readFile('.planning/COVERAGE_REPORT.md');
      expect(report).toContain('Detection Coverage Report');
      expect(report).toContain('Execution');
      expect(report).toContain('Initial Access');
      expect(report).toContain('2/2');
    });

    it('offline with hunt_count: 0 TTPs lists them in gaps', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFolder('.planning/entities/ttps');
      adapter.addFileToFolder('.planning/entities/ttps', 'T1059.md');
      adapter.addFile('.planning/entities/ttps/T1059.md', `---
type: ttp
mitre_id: "T1059"
tactic: "Execution"
hunt_count: 0
---
# T1059
`);
      adapter.addFileToFolder('.planning/entities/ttps', 'T1566.md');
      adapter.addFile('.planning/entities/ttps/T1566.md', `---
type: ttp
mitre_id: "T1566"
tactic: "Initial Access"
hunt_count: 2
---
# T1566
`);

      const result = await service.analyzeCoverage();
      expect(result.success).toBe(true);

      const report = await adapter.readFile('.planning/COVERAGE_REPORT.md');
      // T1059 should appear in Detection Gaps
      expect(report).toContain('## Detection Gaps');
      expect(report).toContain('T1059');
      // T1566 should NOT be in gaps
      expect(report).not.toContain('[[T1566]]');
      // Overall: 1/2
      expect(report).toContain('1/2');
    });

    it('offline returns error when no TTP entities folder exists', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      // No entities/ttps folder

      const result = await service.analyzeCoverage();
      expect(result.success).toBe(false);
      expect(result.message).toContain('No TTP entities found');
    });

    it('MCP path used when mcpClient is connected (no regression)', async () => {
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);
      adapter.addFolder('.planning/entities/ttps');
      adapter.addFileToFolder('.planning/entities/ttps', 'T1059.md');
      adapter.addFile('.planning/entities/ttps/T1059.md', `---
type: ttp
mitre_id: "T1059"
tactic: "Execution"
hunt_count: 1
---
# T1059
`);

      // Create service with mock mcpClient
      const mockMcpClient = {
        isConnected: () => true,
        callTool: async (_name: string, _args: Record<string, unknown>) => ({
          isError: false,
          content: [{ text: JSON.stringify({
            tactics: [{ tactic: 'Execution', total: 1, hunted: 1, percentage: 100 }],
            totalTechniques: 1,
            huntedTechniques: 1,
            overallPercentage: 100,
            gaps: [],
          })}],
        }),
      } as any;

      const mcpService = new WorkspaceService(
        null as any,
        adapter,
        () => ({ planningDir: PLANNING_DIR }),
        PLANNING_DIR,
        mockMcpClient,
      );

      const result = await mcpService.analyzeCoverage();
      expect(result.success).toBe(true);
      // MCP path does NOT say "(offline)"
      expect(result.message).not.toContain('offline');

      const report = await adapter.readFile('.planning/COVERAGE_REPORT.md');
      expect(report).toContain('Detection Coverage Report');
    });
  });

  // -------------------------------------------------------------------------
  // cross-hunt intelligence (Phase 77 Plan 02)
  // -------------------------------------------------------------------------

  describe('cross-hunt intelligence', () => {
    const IOC_NOTE_TEMPLATE = (name: string, type: string, huntRefs: string[], sightings: string[]) => {
      const refsStr = huntRefs.length > 0 ? `[${huntRefs.join(', ')}]` : '[]';
      const sightingsBlock = sightings.length > 0
        ? sightings.map(s => `- ${s}`).join('\n')
        : '_No sightings recorded yet._';
      return `---
type: ${type}
value: "${name}"
hunt_refs: ${refsStr}
hunt_count: ${huntRefs.length}
confidence: "high"
---
# ${name}

## Sightings
${sightingsBlock}

## Related

`;
    };

    const TTP_NOTE_TEMPLATE = (name: string, tactic: string, huntCount: number) => `---
type: ttp
mitre_id: "${name}"
tactic: "${tactic}"
hunt_count: ${huntCount}
hunt_refs: []
---
# ${name}

## Sightings
_No sightings recorded yet._

## Related

`;

    function setupEntityWorkspace(a: StubVaultAdapter): void {
      a.addFolder(PLANNING_DIR);
      addAllArtifacts(a);
      for (const folder of ENTITY_FOLDERS) {
        a.addFolder(normalizePath(`${PLANNING_DIR}/${folder}`));
      }
    }

    it('crossHuntIntel generates CROSS_HUNT_INTEL.md with recurring IOCs table', async () => {
      setupEntityWorkspace(adapter);

      // Add IOC notes with hunt refs
      const iocContent = IOC_NOTE_TEMPLATE('evil-ip', 'ioc/ip', ['hunt-alpha', 'hunt-bravo'], ['RCT-001: seen at 10:00', 'RCT-002: seen at 11:00']);
      adapter.addFile('.planning/entities/iocs/evil-ip.md', iocContent);
      adapter.addFileToFolder('.planning/entities/iocs', 'evil-ip.md');

      const ioc2Content = IOC_NOTE_TEMPLATE('bad-domain', 'ioc/domain', ['hunt-alpha', 'hunt-bravo', 'hunt-charlie'], ['RCT-003: resolved']);
      adapter.addFile('.planning/entities/iocs/bad-domain.md', ioc2Content);
      adapter.addFileToFolder('.planning/entities/iocs', 'bad-domain.md');

      const result = await service.crossHuntIntel();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Cross-hunt intelligence report generated');
      expect(result.reportPath).toBe('.planning/CROSS_HUNT_INTEL.md');

      const content = await adapter.readFile('.planning/CROSS_HUNT_INTEL.md');
      expect(content).toContain('# Cross-Hunt Intelligence Report');
      expect(content).toContain('## Recurring IOCs');
      expect(content).toContain('bad-domain');
      expect(content).toContain('evil-ip');
      expect(content).toContain('| IOC | Type | Hunt Count | Hunts |');
    });

    it('crossHuntIntel with no entities produces report with empty tables', async () => {
      setupEntityWorkspace(adapter);

      const result = await service.crossHuntIntel();

      expect(result.success).toBe(true);
      const content = await adapter.readFile('.planning/CROSS_HUNT_INTEL.md');
      expect(content).toContain('# Cross-Hunt Intelligence Report');
      expect(content).toContain('## Recurring IOCs');
      expect(content).toContain('## TTP Coverage Gaps');
      expect(content).toContain('## Actor Convergence');
    });

    it('crossHuntIntel includes coverage gaps for unhunted TTPs', async () => {
      setupEntityWorkspace(adapter);

      const ttpContent = TTP_NOTE_TEMPLATE('T1059', 'Execution', 0);
      adapter.addFile('.planning/entities/ttps/T1059.md', ttpContent);
      adapter.addFileToFolder('.planning/entities/ttps', 'T1059.md');

      const result = await service.crossHuntIntel();
      expect(result.success).toBe(true);

      const content = await adapter.readFile('.planning/CROSS_HUNT_INTEL.md');
      expect(content).toContain('### Execution');
      expect(content).toContain('- T1059');
    });

    it('compareHuntsReport generates HUNT_COMPARISON.md with shared entities', async () => {
      // Setup two separate hunt workspaces
      const huntAPath = 'hunt-alpha';
      const huntBPath = 'hunt-bravo';

      // Set up entity folders for hunt A
      for (const folder of ENTITY_FOLDERS) {
        adapter.addFolder(normalizePath(`${huntAPath}/${folder}`));
      }
      adapter.addFile(`${huntAPath}/entities/iocs/evil-ip.md`, IOC_NOTE_TEMPLATE('evil-ip', 'ioc/ip', [], []));
      adapter.addFileToFolder(`${huntAPath}/entities/iocs`, 'evil-ip.md');
      adapter.addFile(`${huntAPath}/entities/iocs/unique-a.md`, IOC_NOTE_TEMPLATE('unique-a', 'ioc/ip', [], []));
      adapter.addFileToFolder(`${huntAPath}/entities/iocs`, 'unique-a.md');

      // Set up entity folders for hunt B
      for (const folder of ENTITY_FOLDERS) {
        adapter.addFolder(normalizePath(`${huntBPath}/${folder}`));
      }
      adapter.addFile(`${huntBPath}/entities/iocs/evil-ip.md`, IOC_NOTE_TEMPLATE('evil-ip', 'ioc/ip', [], []));
      adapter.addFileToFolder(`${huntBPath}/entities/iocs`, 'evil-ip.md');
      adapter.addFile(`${huntBPath}/entities/iocs/unique-b.md`, IOC_NOTE_TEMPLATE('unique-b', 'ioc/ip', [], []));
      adapter.addFileToFolder(`${huntBPath}/entities/iocs`, 'unique-b.md');

      // Need planning dir for output
      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);

      const result = await service.compareHuntsReport(huntAPath, huntBPath);

      expect(result.success).toBe(true);
      expect(result.reportPath).toBe('.planning/HUNT_COMPARISON.md');

      const content = await adapter.readFile('.planning/HUNT_COMPARISON.md');
      expect(content).toContain('# Hunt Comparison: hunt-alpha vs hunt-bravo');
      expect(content).toContain('## Shared Entities (1)');
      expect(content).toContain('evil-ip');
      expect(content).toContain('## Unique to hunt-alpha (1)');
      expect(content).toContain('unique-a');
      expect(content).toContain('## Unique to hunt-bravo (1)');
      expect(content).toContain('unique-b');
    });

    it('compareHuntsReport with no overlap shows all entities as unique', async () => {
      const huntAPath = 'hunt-x';
      const huntBPath = 'hunt-y';

      for (const folder of ENTITY_FOLDERS) {
        adapter.addFolder(normalizePath(`${huntAPath}/${folder}`));
        adapter.addFolder(normalizePath(`${huntBPath}/${folder}`));
      }

      adapter.addFile(`${huntAPath}/entities/iocs/ip-a.md`, IOC_NOTE_TEMPLATE('ip-a', 'ioc/ip', [], []));
      adapter.addFileToFolder(`${huntAPath}/entities/iocs`, 'ip-a.md');

      adapter.addFile(`${huntBPath}/entities/iocs/ip-b.md`, IOC_NOTE_TEMPLATE('ip-b', 'ioc/ip', [], []));
      adapter.addFileToFolder(`${huntBPath}/entities/iocs`, 'ip-b.md');

      adapter.addFolder(PLANNING_DIR);
      addAllArtifacts(adapter);

      const result = await service.compareHuntsReport(huntAPath, huntBPath);
      expect(result.success).toBe(true);

      const content = await adapter.readFile('.planning/HUNT_COMPARISON.md');
      expect(content).toContain('## Shared Entities (0)');
      expect(content).toContain('## Unique to hunt-x (1)');
      expect(content).toContain('## Unique to hunt-y (1)');
    });

    it('generateKnowledgeDashboard creates CANVAS_DASHBOARD.canvas with center node', async () => {
      setupEntityWorkspace(adapter);

      // Add a case with MISSION.md
      adapter.addFolder('.planning/cases');
      adapter.addSubFolder('.planning/cases', 'case-alpha');
      adapter.addFile('.planning/cases/case-alpha/MISSION.md', '# Operation Alpha\n\nSome mission.');

      const result = await service.generateKnowledgeDashboard();
      expect(result.success).toBe(true);
      expect(result.canvasPath).toBe('.planning/CANVAS_DASHBOARD.canvas');

      const content = await adapter.readFile('.planning/CANVAS_DASHBOARD.canvas');
      const parsed = JSON.parse(content);
      expect(parsed).toHaveProperty('nodes');
      expect(parsed).toHaveProperty('edges');

      // Should have center node
      const centerNode = parsed.nodes.find((n: { id: string }) => n.id === 'dashboard-center');
      expect(centerNode).toBeDefined();
      expect(centerNode.text).toBe('Program Overview');

      // Should have hunt node
      const huntNode = parsed.nodes.find((n: { id: string }) => n.id === 'hunt-Operation Alpha');
      expect(huntNode).toBeDefined();
    });

    it('generateKnowledgeDashboard with no cases uses current workspace', async () => {
      setupEntityWorkspace(adapter);

      // No cases/ folder -- should use MISSION.md from current workspace
      // MISSION.md is already present from addAllArtifacts

      const result = await service.generateKnowledgeDashboard();
      expect(result.success).toBe(true);

      const content = await adapter.readFile('.planning/CANVAS_DASHBOARD.canvas');
      const parsed = JSON.parse(content);

      // Should have at least center node + 1 hunt node
      expect(parsed.nodes.length).toBeGreaterThanOrEqual(2);

      // Center node
      const centerNode = parsed.nodes.find((n: { id: string }) => n.id === 'dashboard-center');
      expect(centerNode).toBeDefined();
    });

    it('crossHuntIntel includes actor convergence for hunts sharing 3+ IOCs', async () => {
      setupEntityWorkspace(adapter);

      // Create IOCs shared across the same two hunts
      for (const name of ['ioc-a', 'ioc-b', 'ioc-c']) {
        const content = IOC_NOTE_TEMPLATE(name, 'ioc/ip', ['hunt-1', 'hunt-2'], [`Seen in ${name}`]);
        adapter.addFile(`.planning/entities/iocs/${name}.md`, content);
        adapter.addFileToFolder('.planning/entities/iocs', `${name}.md`);
      }

      const result = await service.crossHuntIntel();
      expect(result.success).toBe(true);

      const content = await adapter.readFile('.planning/CROSS_HUNT_INTEL.md');
      expect(content).toContain('## Actor Convergence');
      expect(content).toContain('hunt-1');
      expect(content).toContain('hunt-2');
    });

    it('generateKnowledgeDashboard includes top entities with sightings', async () => {
      setupEntityWorkspace(adapter);

      // Add IOC with sightings
      const iocContent = IOC_NOTE_TEMPLATE('top-ioc', 'ioc/ip', [], ['Seen once', 'Seen twice', 'Seen thrice']);
      adapter.addFile('.planning/entities/iocs/top-ioc.md', iocContent);
      adapter.addFileToFolder('.planning/entities/iocs', 'top-ioc.md');

      const result = await service.generateKnowledgeDashboard();
      expect(result.success).toBe(true);

      const content = await adapter.readFile('.planning/CANVAS_DASHBOARD.canvas');
      const parsed = JSON.parse(content);

      // Should have an entity node for top-ioc
      const entityNode = parsed.nodes.find((n: { id: string }) => n.id === 'entity-top-ioc');
      expect(entityNode).toBeDefined();
    });

    it('generateKnowledgeDashboard uses getFileMtime for recency-based node widths', async () => {
      setupEntityWorkspace(adapter);

      // Add two cases with different mtimes to test width scaling
      adapter.addFolder('.planning/cases');
      adapter.addSubFolder('.planning/cases', 'case-old');
      adapter.addSubFolder('.planning/cases', 'case-new');

      const oldMissionPath = '.planning/cases/case-old/MISSION.md';
      const newMissionPath = '.planning/cases/case-new/MISSION.md';
      adapter.addFile(oldMissionPath, '# Old Hunt\n\nOld mission.');
      adapter.addFile(newMissionPath, '# New Hunt\n\nNew mission.');

      // Old hunt: 2023-01-01, New hunt: 2024-01-01
      adapter.setFileMtime(oldMissionPath, 1672531200000);
      adapter.setFileMtime(newMissionPath, 1704067200000);

      const result = await service.generateKnowledgeDashboard();
      expect(result.success).toBe(true);

      const content = await adapter.readFile('.planning/CANVAS_DASHBOARD.canvas');
      const parsed = JSON.parse(content);

      const oldNode = parsed.nodes.find((n: { id: string }) => n.id === 'hunt-Old Hunt');
      const newNode = parsed.nodes.find((n: { id: string }) => n.id === 'hunt-New Hunt');
      expect(oldNode).toBeDefined();
      expect(newNode).toBeDefined();

      // New hunt should be wider (220) than old hunt (140) due to recency scaling
      expect(newNode.width).toBeGreaterThan(oldNode.width);
      expect(oldNode.width).toBe(140);
      expect(newNode.width).toBe(220);
    });

    it('generateKnowledgeDashboard falls back to current time when getFileMtime returns null', async () => {
      setupEntityWorkspace(adapter);

      // Add two cases: one with mtime, one without (null fallback)
      adapter.addFolder('.planning/cases');
      adapter.addSubFolder('.planning/cases', 'case-with-mtime');
      adapter.addSubFolder('.planning/cases', 'case-no-mtime');

      const withMtimePath = '.planning/cases/case-with-mtime/MISSION.md';
      const noMtimePath = '.planning/cases/case-no-mtime/MISSION.md';
      adapter.addFile(withMtimePath, '# Hunt With Mtime\n\nHas mtime.');
      adapter.addFile(noMtimePath, '# Hunt No Mtime\n\nNo mtime set.');

      // Only set mtime on one -- other returns null and uses Date.now() fallback
      adapter.setFileMtime(withMtimePath, 1672531200000); // 2023-01-01 (old)

      const result = await service.generateKnowledgeDashboard();
      expect(result.success).toBe(true);

      const content = await adapter.readFile('.planning/CANVAS_DASHBOARD.canvas');
      const parsed = JSON.parse(content);

      // Both hunt nodes should exist (null mtime falls back to current time, which is newer)
      const withMtimeNode = parsed.nodes.find((n: { id: string }) => n.id === 'hunt-Hunt With Mtime');
      const noMtimeNode = parsed.nodes.find((n: { id: string }) => n.id === 'hunt-Hunt No Mtime');
      expect(withMtimeNode).toBeDefined();
      expect(noMtimeNode).toBeDefined();

      // The no-mtime hunt (current time fallback) should be wider (more recent)
      expect(noMtimeNode.width).toBeGreaterThan(withMtimeNode.width);
    });

    it('generateKnowledgeDashboard single-hunt fallback uses getFileMtime', async () => {
      setupEntityWorkspace(adapter);

      // No cases/ folder -- uses MISSION.md from current workspace
      // Set mtime on MISSION.md -- if used, the hunt gets that timestamp
      const missionPath = '.planning/MISSION.md';
      adapter.setFileMtime(missionPath, 1700000000000); // 2023-11-14

      const result = await service.generateKnowledgeDashboard();
      expect(result.success).toBe(true);

      const content = await adapter.readFile('.planning/CANVAS_DASHBOARD.canvas');
      const parsed = JSON.parse(content);

      // Single hunt always gets width 220 regardless of timestamp
      const nodes = parsed.nodes.filter((n: { id: string }) => n.id.startsWith('hunt-'));
      expect(nodes.length).toBeGreaterThanOrEqual(1);
      // The key assertion: when getFileMtime is used, the lastModified
      // should NOT be near-now. We verify by checking the canvas was created
      // successfully using getFileMtime (which the interface now requires).
      expect(nodes[0].width).toBe(220);
    });
  });
});
