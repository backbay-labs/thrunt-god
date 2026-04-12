import { Notice } from 'obsidian';
import type ThruntGodPlugin from './main';
import { CORE_ARTIFACTS } from './artifacts';
import { DEFAULT_SETTINGS } from './settings';
import { normalizePath, getEntityFolder, getPlanningDir } from './paths';
import { ENTITY_TYPES, ENTITY_FOLDERS } from './entity-schema';
import { McpSearchModal } from './mcp-search-modal';
import { HyperCopyModal } from './hyper-copy-modal';
import { PromptModal, CanvasTemplateModal, CompareHuntsModal } from './modals';
import { CopyChooserModal, CanvasChooserModal, IntelligenceChooserModal, VerdictSuggestModal, TechniqueSuggestModal, buildTechniqueItems } from './chooser-modals';
import { appendVerdictEntry, formatTimestamp, detectHuntId, type VerdictEntry } from './verdict';
import { updateFrontmatter } from './frontmatter-editor';
import { previewMigration, applyMigration, CURRENT_SCHEMA_VERSION } from './schema-migration';
import { refreshEntityIntelligence, type RefreshInput } from './entity-intelligence';
import type { ConfidenceFactors } from './confidence';
import { parseEntityNote, scanEntityNotes } from './entity-utils';
import type { HuntHistoryEntry } from './hunt-history';
import { appendFalsePositiveEntry, type FalsePositiveEntry } from './false-positive';
import { getTechniqueFileName } from './scaffold';

// ---------------------------------------------------------------------------
// registerCommands -- called once from plugin.onload()
// ---------------------------------------------------------------------------

export function registerCommands(plugin: ThruntGodPlugin): void {

  // =========================================================================
  // Visible top-level commands (9 total)
  // =========================================================================

  plugin.addCommand({
    id: 'open-thrunt-workspace',
    name: 'Open workspace',
    hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 't' }],
    callback: () => {
      void plugin.activateView();
    },
  });

  plugin.addCommand({
    id: 'create-thrunt-workspace',
    name: 'Create mission scaffold',
    callback: () => {
      void bootstrapWorkspace(plugin);
    },
  });

  plugin.addCommand({
    id: 'ingest-agent-output',
    name: 'Ingest agent output',
    hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'i' }],
    callback: () => {
      void runIngestion(plugin);
    },
  });

  plugin.addCommand({
    id: 'scaffold-attack-ontology',
    name: 'Scaffold ATT&CK ontology',
    callback: () => {
      void scaffoldAttack(plugin);
    },
  });

  // --- Grouped chooser commands ---

  plugin.addCommand({
    id: 'copy-chooser',
    name: 'Copy...',
    callback: () => {
      new CopyChooserModal(plugin.app, plugin).open();
    },
  });

  plugin.addCommand({
    id: 'canvas-chooser',
    name: 'Canvas...',
    callback: () => {
      new CanvasChooserModal(plugin.app, plugin).open();
    },
  });

  plugin.addCommand({
    id: 'intelligence-chooser',
    name: 'Intelligence...',
    callback: () => {
      new IntelligenceChooserModal(plugin.app, plugin).open();
    },
  });

  // --- Cross-hunt intelligence commands (Phase 77) ---

  plugin.addCommand({
    id: 'cross-hunt-intel',
    name: 'Cross-hunt intelligence report',
    callback: () => {
      void (async () => {
        const result = await plugin.workspaceService.crossHuntIntel();
        new Notice(result.message);
        if (result.success && result.reportPath) {
          const file = plugin.workspaceService.vaultAdapter.getFile(result.reportPath);
          if (file) {
            await plugin.app.workspace.getLeaf(true).openFile(file);
          }
        }
        await plugin.refreshViews();
      })();
    },
  });

  plugin.addCommand({
    id: 'compare-hunts',
    name: 'Compare hunts',
    callback: () => {
      new CompareHuntsModal(plugin.app, plugin.workspaceService, async (huntAPath, huntBPath) => {
        const result = await plugin.workspaceService.compareHuntsReport(huntAPath, huntBPath);
        new Notice(result.message);
        if (result.success && result.reportPath) {
          const file = plugin.workspaceService.vaultAdapter.getFile(result.reportPath);
          if (file) {
            await plugin.app.workspace.getLeaf(true).openFile(file);
          }
        }
        await plugin.refreshViews();
      }).open();
    },
  });

  // --- Verdict lifecycle command (Phase 82) ---

  plugin.addCommand({
    id: 'set-entity-verdict',
    name: 'Set entity verdict',
    checkCallback: (checking: boolean) => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) return false;
      const isEntity = ENTITY_FOLDERS.some((folder) => file.path.includes(folder));
      if (!isEntity) return false;
      if (checking) return true;
      void setEntityVerdict(plugin, file.path);
      return true;
    },
  });

  // --- Refresh entity intelligence command (Phase 83-02) ---

  plugin.addCommand({
    id: 'refresh-entity-intelligence',
    name: 'Refresh entity intelligence',
    checkCallback: (checking: boolean) => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) return false;
      const isEntity = ENTITY_FOLDERS.some((folder) => file.path.includes(folder));
      if (!isEntity) return false;
      if (checking) return true;
      void refreshEntityIntel(plugin, file.path);
      return true;
    },
  });

  // --- Add false positive command (Phase 84-02) ---

  plugin.addCommand({
    id: 'add-false-positive',
    name: 'Add false positive',
    callback: () => {
      void addFalsePositive(plugin);
    },
  });

  // --- Schema migration command (Phase 82-03) ---

  plugin.addCommand({
    id: 'migrate-entity-schema',
    name: 'Migrate entity schema',
    callback: () => {
      void (async () => {
        const planningDir = getPlanningDir(
          plugin.settings.planningDir,
          DEFAULT_SETTINGS.planningDir,
        );

        // Scan all entity folders for .md files
        const previews: Array<{ filePath: string; content: string }> = [];
        for (const folder of ENTITY_FOLDERS) {
          const folderPath = normalizePath(`${planningDir}/${folder}`);
          if (!plugin.workspaceService.vaultAdapter.folderExists(folderPath)) continue;
          const files = await plugin.workspaceService.vaultAdapter.listFiles(folderPath);
          const mdFiles = files.filter((f) => f.endsWith('.md'));
          for (const fileName of mdFiles) {
            const filePath = normalizePath(`${folderPath}/${fileName}`);
            try {
              const content = await plugin.workspaceService.vaultAdapter.readFile(filePath);
              const preview = previewMigration(content, filePath);
              if (preview) {
                previews.push({ filePath, content });
              }
            } catch {
              // Skip unreadable files
            }
          }
        }

        if (previews.length === 0) {
          new Notice(`All entity notes are up to date (schema v${CURRENT_SCHEMA_VERSION})`);
          return;
        }

        new Notice(`Found ${previews.length} notes to migrate. Applying...`);

        for (const { filePath, content } of previews) {
          const migrated = applyMigration(content);
          await plugin.workspaceService.vaultAdapter.modifyFile(filePath, migrated);
        }

        new Notice(`Migration complete: ${previews.length} notes updated to schema v${CURRENT_SCHEMA_VERSION}`);
        await plugin.refreshViews();
      })();
    },
  });

  // =========================================================================
  // Hidden aliases -- preserve old command IDs for hotkey bindings
  // =========================================================================

  // --- Artifact open commands (5) -- hidden from palette ---
  for (const artifact of CORE_ARTIFACTS) {
    plugin.addCommand({
      id: artifact.commandId,
      name: '',
      callback: () => {
        void openCoreFile(plugin, artifact.fileName);
      },
    });
  }

  // --- Copy group aliases (4) ---

  plugin.addCommand({
    id: 'hyper-copy-for-agent',
    name: '',
    hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'h' }],
    callback: () => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) {
        new Notice('No active file. Open a note first.');
        return;
      }
      const profiles = plugin.workspaceService.getAvailableProfiles();
      new HyperCopyModal(
        plugin.app,
        profiles,
        (agentId: string) =>
          plugin.workspaceService.assembleContextForProfile(file.path, agentId),
        (text: string, entry) => {
          void plugin.workspaceService.logExport(entry);
        },
      ).open();
    },
  });

  plugin.addCommand({
    id: 'copy-for-query-writer',
    name: '',
    callback: () => { void quickExport(plugin, 'query-writer', 'Query Writer'); },
  });

  plugin.addCommand({
    id: 'copy-for-intel-advisor',
    name: '',
    callback: () => { void quickExport(plugin, 'intel-advisor', 'Intel Advisor'); },
  });

  plugin.addCommand({
    id: 'copy-ioc-context',
    name: '',
    callback: () => { void quickExport(plugin, 'signal-triager', 'Signal Triager'); },
  });

  // --- Canvas group aliases (3) ---

  plugin.addCommand({
    id: 'generate-hunt-canvas',
    name: '',
    callback: () => {
      new CanvasTemplateModal(plugin.app, async (template) => {
        const result = await plugin.workspaceService.generateHuntCanvas(template);
        new Notice(result.message);
        if (result.success && result.canvasPath) {
          await plugin.app.workspace.openLinkText(result.canvasPath, '', true);
        }
        await plugin.refreshViews();
      }).open();
    },
  });

  plugin.addCommand({
    id: 'canvas-from-current-hunt',
    name: '',
    callback: () => {
      new CanvasTemplateModal(plugin.app, async (template) => {
        const result = await plugin.workspaceService.canvasFromCurrentHunt(template);
        new Notice(result.message);
        if (result.success && result.canvasPath) {
          await plugin.app.workspace.openLinkText(result.canvasPath, '', true);
        }
        await plugin.refreshViews();
      }).open();
    },
  });

  plugin.addCommand({
    id: 'generate-knowledge-dashboard',
    name: '',
    callback: () => {
      void (async () => {
        const result = await plugin.workspaceService.generateKnowledgeDashboard();
        new Notice(result.message);
        if (result.success && result.canvasPath) {
          await plugin.app.workspace.openLinkText(result.canvasPath, '', true);
        }
        await plugin.refreshViews();
      })();
    },
  });

  // --- Intelligence group aliases (5) ---

  plugin.addCommand({
    id: 'enrich-from-mcp',
    name: '',
    checkCallback: (checking: boolean) => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file || !file.path.includes('entities/ttps/')) return false;
      if (checking) return true;
      void enrichFromMcp(plugin, file.path);
      return true;
    },
  });

  plugin.addCommand({
    id: 'analyze-detection-coverage',
    name: '',
    callback: () => {
      void runCoverageAnalysis(plugin);
    },
  });

  plugin.addCommand({
    id: 'log-hunt-decision',
    name: '',
    checkCallback: (checking: boolean) => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file || !file.path.includes('entities/ttps/')) return false;
      if (checking) return true;
      void promptAndLogDecision(plugin, file.path);
      return true;
    },
  });

  plugin.addCommand({
    id: 'log-hunt-learning',
    name: '',
    callback: () => {
      void promptAndLogLearning(plugin);
    },
  });

  plugin.addCommand({
    id: 'search-knowledge-graph',
    name: '',
    callback: () => {
      void openSearchModal(plugin);
    },
  });

  plugin.addCommand({
    id: 'add-false-positive-alias',
    name: '',
    callback: () => {
      void addFalsePositive(plugin);
    },
  });

  plugin.addCommand({
    id: 'refresh-entity-intel-alias',
    name: '',
    checkCallback: (checking: boolean) => {
      const file = plugin.app.workspace.getActiveFile();
      if (!file) return false;
      const isEntity = ENTITY_FOLDERS.some((folder) => file.path.includes(folder));
      if (!isEntity) return false;
      if (checking) return true;
      void refreshEntityIntel(plugin, file.path);
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Command helper functions (private to this module)
// ---------------------------------------------------------------------------

async function openCoreFile(plugin: ThruntGodPlugin, fileName: string): Promise<void> {
  const path = plugin.workspaceService.getFilePath(fileName);
  const file = plugin.workspaceService.vaultAdapter.getFile(path);

  if (!file) {
    new Notice(
      `THRUNT file not found: ${path}. Use the workspace view to create it.`,
    );
    return;
  }

  await plugin.app.workspace.getLeaf(true).openFile(file);
}

async function bootstrapWorkspace(plugin: ThruntGodPlugin): Promise<void> {
  await plugin.workspaceService.bootstrap();
  const first = CORE_ARTIFACTS[0];
  if (first) {
    await openCoreFile(plugin, first.fileName);
  }
  await plugin.refreshViews();
  new Notice('THRUNT workspace scaffold created.');
}

async function runIngestion(plugin: ThruntGodPlugin): Promise<void> {
  const result = await plugin.workspaceService.runIngestion();
  await plugin.refreshViews();
  new Notice(
    `Ingestion complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
  );
}

async function scaffoldAttack(plugin: ThruntGodPlugin): Promise<void> {
  const { getParentTechniques, getTechniqueFileName, generateTechniqueNote } =
    await import('./scaffold');

  const planningDir = getPlanningDir(
    plugin.settings.planningDir,
    DEFAULT_SETTINGS.planningDir,
  );
  const ttpsFolder = getEntityFolder(planningDir, 'entities/ttps');
  await plugin.workspaceService.vaultAdapter.ensureFolder(ttpsFolder);

  const techniques = getParentTechniques();
  let created = 0;
  let skipped = 0;

  for (const technique of techniques) {
    const fileName = getTechniqueFileName(technique);
    const path = normalizePath(`${ttpsFolder}/${fileName}`);
    if (plugin.workspaceService.vaultAdapter.fileExists(path)) {
      skipped++;
      continue;
    }
    const content = generateTechniqueNote(technique);
    await plugin.workspaceService.vaultAdapter.createFile(path, content);
    created++;
  }

  plugin.workspaceService.invalidate();
  await plugin.refreshViews();
  new Notice(
    `ATT&CK ontology scaffolded: ${created} created, ${skipped} skipped.`,
  );
}

// ---------------------------------------------------------------------------
// MCP command helpers (Plan 02)
// ---------------------------------------------------------------------------

async function enrichFromMcp(plugin: ThruntGodPlugin, path: string): Promise<void> {
  if (!plugin.mcpClient.isConnected()) {
    new Notice('MCP is not connected. Enable in Settings > THRUNT God.');
    return;
  }
  const result = await plugin.workspaceService.enrichFromMcp(path);
  new Notice(result.message);
  if (result.success) {
    await plugin.refreshViews();
  }
}

async function runCoverageAnalysis(plugin: ThruntGodPlugin): Promise<void> {
  if (!plugin.mcpClient.isConnected()) {
    new Notice('MCP is not connected. Enable in Settings > THRUNT God.');
    return;
  }
  const result = await plugin.workspaceService.analyzeCoverage();
  new Notice(result.message);
  if (result.success) {
    const planningDir = getPlanningDir(
      plugin.settings.planningDir,
      DEFAULT_SETTINGS.planningDir,
    );
    const reportPath = normalizePath(`${planningDir}/COVERAGE_REPORT.md`);
    const file = plugin.workspaceService.vaultAdapter.getFile(reportPath);
    if (file) {
      await plugin.app.workspace.getLeaf(true).openFile(file);
    }
  }
}

async function promptAndLogDecision(plugin: ThruntGodPlugin, path: string): Promise<void> {
  if (!plugin.mcpClient.isConnected()) {
    new Notice('MCP is not connected. Enable in Settings > THRUNT God.');
    return;
  }
  new PromptModal(
    plugin.app,
    'Log Hunt Decision',
    [
      { label: 'Decision', placeholder: 'What did you decide?' },
      { label: 'Rationale', placeholder: 'Why?' },
    ],
    async (values) => {
      const [decision, rationale] = values;
      if (!decision || !rationale) {
        new Notice('Both fields are required.');
        return;
      }
      const result = await plugin.workspaceService.logDecision(path, decision, rationale);
      new Notice(result.message);
      if (result.success) {
        await plugin.refreshViews();
      }
    },
  ).open();
}

async function promptAndLogLearning(plugin: ThruntGodPlugin): Promise<void> {
  if (!plugin.mcpClient.isConnected()) {
    new Notice('MCP is not connected. Enable in Settings > THRUNT God.');
    return;
  }
  new PromptModal(
    plugin.app,
    'Log Hunt Learning',
    [
      { label: 'Topic', placeholder: 'What topic?' },
      { label: 'Learning', placeholder: 'What did you learn?' },
    ],
    async (values) => {
      const [topic, learning] = values;
      if (!topic || !learning) {
        new Notice('Both fields are required.');
        return;
      }
      const result = await plugin.workspaceService.logLearning(topic, learning);
      new Notice(result.message);
      if (result.success) {
        await plugin.refreshViews();
      }
    },
  ).open();
}

async function openSearchModal(plugin: ThruntGodPlugin): Promise<void> {
  if (!plugin.mcpClient.isConnected()) {
    new Notice('MCP is not connected. Enable in Settings > THRUNT God.');
    return;
  }

  const planningDir = getPlanningDir(
    plugin.settings.planningDir,
    DEFAULT_SETTINGS.planningDir,
  );

  new McpSearchModal(
    plugin.app,
    plugin.mcpClient,
    // onOpenNote: find file by path and open in new leaf
    (notePath: string) => {
      const file = plugin.workspaceService.vaultAdapter.getFile(notePath);
      if (file) {
        void plugin.app.workspace.getLeaf(true).openFile(file);
      } else {
        new Notice(`Note not found: ${notePath}`);
      }
    },
    // onCreateNote: create entity note in appropriate folder and open it
    (name: string, entityType: string) => {
      void (async () => {
        const entityDef = ENTITY_TYPES.find((def) => def.type === entityType);
        const folder = entityDef ? entityDef.folder : 'entities/ttps';
        const folderPath = normalizePath(`${planningDir}/${folder}`);
        const notePath = normalizePath(`${folderPath}/${name}.md`);

        if (plugin.workspaceService.vaultAdapter.fileExists(notePath)) {
          const file = plugin.workspaceService.vaultAdapter.getFile(notePath);
          if (file) {
            await plugin.app.workspace.getLeaf(true).openFile(file);
          }
          return;
        }

        const content = entityDef
          ? entityDef.starterTemplate(name)
          : `# ${name}\n\n## Sightings\n\n_No sightings recorded yet._\n\n## Related\n\n`;

        await plugin.workspaceService.vaultAdapter.ensureFolder(folderPath);
        await plugin.workspaceService.vaultAdapter.createFile(notePath, content);
        plugin.workspaceService.invalidate();

        const file = plugin.workspaceService.vaultAdapter.getFile(notePath);
        if (file) {
          await plugin.app.workspace.getLeaf(true).openFile(file);
        }
      })();
    },
  ).open();
}

// ---------------------------------------------------------------------------
// Verdict command helper (Plan 82-02)
// ---------------------------------------------------------------------------

async function setEntityVerdict(plugin: ThruntGodPlugin, filePath: string): Promise<void> {
  new VerdictSuggestModal(plugin.app, (selectedVerdict) => {
    new PromptModal(
      plugin.app,
      'Verdict Rationale',
      [{ label: 'Rationale', placeholder: 'Why this verdict?' }],
      (values) => {
        const rationale = values[0] || '';
        void (async () => {
          // Read current file content
          let content = await plugin.workspaceService.vaultAdapter.readFile(filePath);

          // Detect hunt ID from MISSION.md or planning dir
          const planningDir = getPlanningDir(
            plugin.settings.planningDir,
            DEFAULT_SETTINGS.planningDir,
          );
          let missionContent: string | null = null;
          try {
            const missionPath = normalizePath(`${planningDir}/MISSION.md`);
            missionContent = await plugin.workspaceService.vaultAdapter.readFile(missionPath);
          } catch {
            // MISSION.md not found -- will fall back to planning dir
          }
          const huntId = detectHuntId(missionContent, planningDir);

          // Build verdict entry
          const entry: VerdictEntry = {
            timestamp: formatTimestamp(new Date()),
            verdict: selectedVerdict,
            rationale,
            huntId,
          };

          // Append verdict history entry
          content = appendVerdictEntry(content, entry);

          // Update frontmatter verdict field
          content = updateFrontmatter(content, { verdict: selectedVerdict });

          // Write back
          await plugin.workspaceService.vaultAdapter.modifyFile(filePath, content);

          new Notice(`Verdict set to ${selectedVerdict}`);
          await plugin.refreshViews();
        })();
      },
    ).open();
  }).open();
}

// ---------------------------------------------------------------------------
// Refresh entity intelligence helper (Plan 83-02)
// ---------------------------------------------------------------------------

async function refreshEntityIntel(plugin: ThruntGodPlugin, filePath: string): Promise<void> {
  try {
    const planningDir = getPlanningDir(
      plugin.settings.planningDir,
      DEFAULT_SETTINGS.planningDir,
    );

    // Read and parse the entity note
    const content = await plugin.workspaceService.vaultAdapter.readFile(filePath);
    const fileName = filePath.split('/').pop() ?? filePath;
    const entity = parseEntityNote(content, fileName);

    // Scan all entity notes for co-occurrence
    const allEntities = await scanEntityNotes(
      plugin.workspaceService.vaultAdapter,
      planningDir,
      planningDir,
    );

    // Build HuntHistoryEntry[] from the entity's huntRefs
    const huntEntries: HuntHistoryEntry[] = entity.huntRefs.map((ref) => {
      const lastSeen = entity.frontmatter['last_seen'];
      const date = typeof lastSeen === 'string' && lastSeen
        ? lastSeen
        : new Date().toISOString().slice(0, 10);
      const verdict = entity.frontmatter['verdict'];
      const outcome = typeof verdict === 'string' && verdict
        ? verdict
        : 'unknown';
      return {
        huntId: ref,
        date,
        role: 'indicator' as const,
        outcome,
      };
    });

    // Extract confidence factors from frontmatter
    const confidenceFactors: ConfidenceFactors = {
      source_count:
        typeof entity.frontmatter['source_count'] === 'number'
          ? entity.frontmatter['source_count']
          : 0,
      reliability:
        typeof entity.frontmatter['reliability'] === 'number'
          ? entity.frontmatter['reliability']
          : 0,
      corroboration:
        typeof entity.frontmatter['corroboration'] === 'number'
          ? entity.frontmatter['corroboration']
          : 0,
      days_since_validation:
        typeof entity.frontmatter['days_since_validation'] === 'number'
          ? entity.frontmatter['days_since_validation']
          : 0,
    };

    const input: RefreshInput = {
      entityContent: content,
      entityName: entity.name,
      entityHuntRefs: entity.huntRefs,
      huntEntries,
      allEntities,
      confidenceFactors,
      confidenceConfig: { half_life_days: plugin.settings.halfLifeDays },
    };

    const result = refreshEntityIntelligence(input);

    await plugin.workspaceService.vaultAdapter.modifyFile(filePath, result.content);

    // If this is a technique note, also run technique-specific refresh
    if (filePath.includes('entities/ttps/')) {
      try {
        const techResult = await plugin.workspaceService.refreshTechniqueIntelligence(
          filePath,
          plugin.settings.staleCoverageDays,
        );
        if (techResult.success) {
          new Notice(
            `Entity + technique intelligence refreshed (${result.huntHistoryCount} hunts, ${result.coOccurrenceCount} co-occurrences, confidence: ${result.confidenceScore}, ${techResult.message})`,
          );
          await plugin.refreshViews();
          return;
        }
      } catch {
        // Fall through to standard notice if technique refresh fails
      }
    }

    new Notice(
      `Entity intelligence refreshed (${result.huntHistoryCount} hunts, ${result.coOccurrenceCount} co-occurrences, confidence: ${result.confidenceScore})`,
    );
    await plugin.refreshViews();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    new Notice(`Refresh failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Add false positive helper (Plan 84-02)
// ---------------------------------------------------------------------------

async function addFalsePositive(plugin: ThruntGodPlugin): Promise<void> {
  const file = plugin.app.workspace.getActiveFile();
  const planningDir = getPlanningDir(
    plugin.settings.planningDir,
    DEFAULT_SETTINGS.planningDir,
  );

  const promptForPattern = (techniqueFilePath: string, techniqueName: string) => {
    new PromptModal(
      plugin.app,
      'Add False Positive',
      [{ label: 'Pattern', placeholder: 'Describe the false positive pattern...' }],
      (values) => {
        const pattern = values[0];
        if (!pattern) {
          new Notice('Pattern description is required.');
          return;
        }
        void (async () => {
          try {
            const content = await plugin.workspaceService.vaultAdapter.readFile(techniqueFilePath);

            // Detect hunt ID
            let missionContent: string | null = null;
            try {
              const missionPath = normalizePath(`${planningDir}/MISSION.md`);
              missionContent = await plugin.workspaceService.vaultAdapter.readFile(missionPath);
            } catch {
              // MISSION.md not found
            }
            const huntId = detectHuntId(missionContent, planningDir);

            const entry: FalsePositiveEntry = {
              pattern,
              date: new Date().toISOString().slice(0, 10),
              huntId,
            };

            const updated = appendFalsePositiveEntry(content, entry);
            await plugin.workspaceService.vaultAdapter.modifyFile(techniqueFilePath, updated);
            new Notice(`False positive added to ${techniqueName}`);
            await plugin.refreshViews();
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            new Notice(`Failed to add false positive: ${message}`);
          }
        })();
      },
    ).open();
  };

  // If active file is a technique note, use it directly
  if (file && file.path.includes('entities/ttps/')) {
    const techniqueName = file.name.replace(/\.md$/, '');
    promptForPattern(file.path, techniqueName);
    return;
  }

  // Otherwise, show technique selection modal
  const techniques = buildTechniqueItems();
  new TechniqueSuggestModal(plugin.app, techniques, (selected) => {
    const fileName = getTechniqueFileName({ id: selected.id, name: selected.name });
    const ttpsFolder = normalizePath(`${planningDir}/entities/ttps`);
    const filePath = normalizePath(`${ttpsFolder}/${fileName}`);
    promptForPattern(filePath, selected.fullName);
  }).open();
}

export async function quickExport(plugin: ThruntGodPlugin, agentId: string, label: string): Promise<void> {
  const file = plugin.app.workspace.getActiveFile();
  if (!file) {
    new Notice('No active file. Open a note first.');
    return;
  }
  const result = await plugin.workspaceService.assembleContextForProfile(file.path, agentId);
  if ('error' in result) {
    new Notice(`Export failed: ${result.error}`);
    return;
  }
  const text = plugin.workspaceService.renderAssembledContext(result);
  await navigator.clipboard.writeText(text);
  const { buildExportLogEntry } = await import('./export-log');
  const entry = buildExportLogEntry(result, label);
  void plugin.workspaceService.logExport(entry);
  new Notice(`Copied ${result.tokenEstimate} tokens for ${label}`);
}
