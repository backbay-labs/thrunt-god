/**
 * McpBridgeService -- domain service for MCP enrichment, coverage analysis,
 * decision logging, and learning logging.
 *
 * Shell created in Plan 79-01. Logic moved from WorkspaceService in Plan 79-02.
 */

import type { VaultAdapter } from '../vault-adapter';
import type { EventBus } from './event-bus';
import type { McpClient } from '../mcp-client';
import type { EnrichmentData, CoverageReport, CoverageTactic } from '../types';
import { normalizePath } from '../paths';
import { mergeEnrichment, buildCoverageReport, formatDecisionEntry, formatLearningEntry } from '../mcp-enrichment';
import { parseFrontmatterFields } from '../entity-utils';

export class McpBridgeService {
  constructor(
    private vaultAdapter: VaultAdapter,
    private getPlanningDir: () => string,
    private mcpClient?: McpClient,
    private eventBus?: EventBus,
  ) {}

  async enrichFromMcp(notePath: string): Promise<{ success: boolean; message: string }> {
    if (!this.mcpClient || !this.mcpClient.isConnected()) {
      return { success: false, message: 'MCP is not connected. Enable MCP in settings.' };
    }

    const content = await this.vaultAdapter.readFile(notePath);

    // Parse mitre_id from YAML frontmatter
    const mitreMatch = content.match(/^mitre_id:\s*"?([^"\n]+)"?$/m);
    if (!mitreMatch || !mitreMatch[1]) {
      return { success: false, message: 'No mitre_id found in frontmatter.' };
    }
    const mitreId = mitreMatch[1].trim();

    const result = await this.mcpClient.callTool('lookupTechnique', { id: mitreId });
    if (!result || result.isError) {
      return { success: false, message: 'MCP lookup failed.' };
    }

    let enrichmentData: EnrichmentData;
    try {
      enrichmentData = JSON.parse(result.content[0]!.text) as EnrichmentData;
    } catch {
      return { success: false, message: 'MCP lookup failed.' };
    }

    const updatedContent = mergeEnrichment(content, enrichmentData);
    await this.vaultAdapter.modifyFile(notePath, updatedContent);
    return { success: true, message: `Enriched ${mitreId} from MCP.` };
  }

  async analyzeCoverage(): Promise<{ success: boolean; message: string }> {
    const planningDir = this.getPlanningDir();

    const ttpsFolder = normalizePath(`${planningDir}/entities/ttps`);
    if (!this.vaultAdapter.folderExists(ttpsFolder)) {
      return { success: false, message: 'No TTP entities found.' };
    }

    const files = await this.vaultAdapter.listFiles(ttpsFolder);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    // --- MCP path (when connected) ---
    if (this.mcpClient && this.mcpClient.isConnected()) {
      const techniqueIds: string[] = [];
      for (const fileName of mdFiles) {
        try {
          const filePath = normalizePath(`${ttpsFolder}/${fileName}`);
          const fileContent = await this.vaultAdapter.readFile(filePath);
          const match = fileContent.match(/^mitre_id:\s*"?([^"\n]+)"?$/m);
          if (match && match[1]) {
            techniqueIds.push(match[1].trim());
          }
        } catch {
          // Skip unreadable files
        }
      }

      const result = await this.mcpClient.callTool('analyzeCoverage', { techniqueIds });
      if (!result || result.isError) {
        return { success: false, message: 'MCP coverage analysis failed.' };
      }

      let report: CoverageReport;
      try {
        report = JSON.parse(result.content[0]!.text) as CoverageReport;
      } catch {
        return { success: false, message: 'MCP coverage analysis failed.' };
      }

      const reportContent = buildCoverageReport(
        report.tactics,
        report.totalTechniques,
        report.huntedTechniques,
        report.overallPercentage,
        report.gaps,
      );

      const reportPath = normalizePath(`${planningDir}/COVERAGE_REPORT.md`);
      if (this.vaultAdapter.fileExists(reportPath)) {
        await this.vaultAdapter.modifyFile(reportPath, reportContent);
      } else {
        await this.vaultAdapter.createFile(reportPath, reportContent);
      }

      return { success: true, message: 'Coverage report written to COVERAGE_REPORT.md' };
    }

    // --- Offline fallback: build coverage from vault frontmatter ---
    const tacticMap = new Map<string, { total: number; hunted: number }>();
    const gaps: string[] = [];
    let totalTechniques = 0;
    let huntedTechniques = 0;

    for (const fileName of mdFiles) {
      try {
        const filePath = normalizePath(`${ttpsFolder}/${fileName}`);
        const content = await this.vaultAdapter.readFile(filePath);
        const fm = parseFrontmatterFields(content);

        const tactic = fm.tactic || 'Unknown';
        const huntCount = parseInt(fm.hunt_count || '0', 10) || 0;
        const mitreId = fm.mitre_id || fileName.replace(/\.md$/, '');

        // Handle YAML array tactic values (e.g. "- Initial Access\n- Execution")
        const tactics = Array.isArray(tactic) ? tactic : [tactic];

        for (const t of tactics) {
          const tacticName = String(t).trim();
          if (!tacticMap.has(tacticName)) {
            tacticMap.set(tacticName, { total: 0, hunted: 0 });
          }
          const entry = tacticMap.get(tacticName)!;
          entry.total++;
          if (huntCount > 0) entry.hunted++;
        }

        totalTechniques++;
        if (huntCount > 0) {
          huntedTechniques++;
        } else {
          gaps.push(mitreId);
        }
      } catch {
        // Skip unreadable files
      }
    }

    const coverageTactics: CoverageTactic[] = [...tacticMap.entries()].map(([tactic, counts]) => ({
      tactic,
      total: counts.total,
      hunted: counts.hunted,
      percentage: counts.total > 0
        ? Math.round((counts.hunted / counts.total) * 1000) / 10
        : 0,
    }));

    const overallPercentage = totalTechniques > 0
      ? Math.round((huntedTechniques / totalTechniques) * 1000) / 10
      : 0;

    const reportContent = buildCoverageReport(
      coverageTactics,
      totalTechniques,
      huntedTechniques,
      overallPercentage,
      gaps,
    );

    const reportPath = normalizePath(`${planningDir}/COVERAGE_REPORT.md`);
    if (this.vaultAdapter.fileExists(reportPath)) {
      await this.vaultAdapter.modifyFile(reportPath, reportContent);
    } else {
      await this.vaultAdapter.createFile(reportPath, reportContent);
    }

    return { success: true, message: 'Coverage report written to COVERAGE_REPORT.md (offline)' };
  }

  async logDecision(
    notePath: string,
    decision: string,
    rationale: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!this.mcpClient || !this.mcpClient.isConnected()) {
      return { success: false, message: 'MCP is not connected.' };
    }

    const content = await this.vaultAdapter.readFile(notePath);

    const mitreMatch = content.match(/^mitre_id:\s*"?([^"\n]+)"?$/m);
    if (!mitreMatch || !mitreMatch[1]) {
      return { success: false, message: 'No mitre_id found in frontmatter.' };
    }
    const mitreId = mitreMatch[1].trim();

    // Log to MCP server (fire and forget -- local write still succeeds)
    await this.mcpClient.callTool('logDecision', { technique: mitreId, decision, rationale });

    const entry = formatDecisionEntry(mitreId, decision, rationale);

    // Find ## Decisions section or add one
    let updatedContent: string;
    const decisionsMatch = content.match(/^## Decisions\s*$/m);
    if (decisionsMatch && decisionsMatch.index !== undefined) {
      const insertPos = decisionsMatch.index + decisionsMatch[0].length;
      updatedContent =
        content.slice(0, insertPos) +
        '\n\n' + entry +
        content.slice(insertPos);
    } else {
      updatedContent = content.trimEnd() + '\n\n## Decisions\n\n' + entry;
    }

    await this.vaultAdapter.modifyFile(notePath, updatedContent);
    return { success: true, message: `Decision logged for ${mitreId}.` };
  }

  async logLearning(
    topic: string,
    learning: string,
  ): Promise<{ success: boolean; message: string }> {
    if (!this.mcpClient || !this.mcpClient.isConnected()) {
      return { success: false, message: 'MCP is not connected.' };
    }

    // Log to MCP server
    await this.mcpClient.callTool('logLearning', { topic, learning });

    const entry = formatLearningEntry(topic, learning);

    const planningDir = this.getPlanningDir();
    const learningsPath = normalizePath(`${planningDir}/LEARNINGS.md`);

    if (this.vaultAdapter.fileExists(learningsPath)) {
      const existing = await this.vaultAdapter.readFile(learningsPath);
      await this.vaultAdapter.modifyFile(learningsPath, existing.trimEnd() + '\n\n' + entry);
    } else {
      await this.vaultAdapter.createFile(learningsPath, '# Hunt Learnings\n\n' + entry);
    }

    return { success: true, message: `Learning logged for ${topic}.` };
  }
}
