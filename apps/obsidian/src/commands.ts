import { Notice } from 'obsidian';
import type ThruntGodPlugin from './main';
import { CORE_ARTIFACTS } from './artifacts';
import { DEFAULT_SETTINGS } from './settings';
import { normalizePath, getEntityFolder, getPlanningDir } from './paths';
import { ENTITY_TYPES } from './entity-schema';
import { McpSearchModal } from './mcp-search-modal';
import { HyperCopyModal } from './hyper-copy-modal';
import { PromptModal, CanvasTemplateModal, CompareHuntsModal } from './modals';

// ---------------------------------------------------------------------------
// registerCommands -- called once from plugin.onload()
// ---------------------------------------------------------------------------

export function registerCommands(plugin: ThruntGodPlugin): void {
  plugin.addCommand({
    id: 'open-thrunt-workspace',
    name: 'Open workspace',
    hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 't' }],
    callback: () => {
      void plugin.activateView();
    },
  });

  // Register open commands for all 5 artifacts from registry
  for (const artifact of CORE_ARTIFACTS) {
    plugin.addCommand({
      id: artifact.commandId,
      name: artifact.commandName,
      callback: () => {
        void openCoreFile(plugin, artifact.fileName);
      },
    });
  }

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

  // --- MCP enrichment commands (Plan 02) ---

  plugin.addCommand({
    id: 'enrich-from-mcp',
    name: 'Enrich from MCP',
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
    name: 'Analyze detection coverage',
    callback: () => {
      void runCoverageAnalysis(plugin);
    },
  });

  plugin.addCommand({
    id: 'log-hunt-decision',
    name: 'Log hunt decision',
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
    name: 'Log hunt learning',
    callback: () => {
      void promptAndLogLearning(plugin);
    },
  });

  plugin.addCommand({
    id: 'search-knowledge-graph',
    name: 'Search THRUNT knowledge graph',
    callback: () => {
      void openSearchModal(plugin);
    },
  });

  // --- Hyper Copy commands (Phase 75) ---

  plugin.addCommand({
    id: 'hyper-copy-for-agent',
    name: 'Hyper Copy for Agent',
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
    name: 'Copy for Query Writer',
    callback: () => { void quickExport(plugin, 'query-writer', 'Query Writer'); },
  });

  plugin.addCommand({
    id: 'copy-for-intel-advisor',
    name: 'Copy for Intel Advisor',
    callback: () => { void quickExport(plugin, 'intel-advisor', 'Intel Advisor'); },
  });

  plugin.addCommand({
    id: 'copy-ioc-context',
    name: 'Copy IOC context',
    callback: () => { void quickExport(plugin, 'signal-triager', 'Signal Triager'); },
  });

  // --- Canvas commands (Phase 76) ---

  plugin.addCommand({
    id: 'generate-hunt-canvas',
    name: 'Generate hunt canvas',
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
    name: 'Canvas from current hunt',
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

  plugin.addCommand({
    id: 'generate-knowledge-dashboard',
    name: 'Generate knowledge dashboard',
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

async function quickExport(plugin: ThruntGodPlugin, agentId: string, label: string): Promise<void> {
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
