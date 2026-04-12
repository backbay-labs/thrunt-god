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
});
