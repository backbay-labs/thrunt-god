/**
 * Shared entity utility functions extracted from WorkspaceService.
 *
 * Pure extractions of private methods from workspace.ts (lines 1288-1441).
 * These functions are used by both IntelligenceService and CanvasService,
 * avoiding duplication and circular dependencies between domain services.
 *
 * Pure functions -- NO Obsidian imports. Safe for testing and CLI usage.
 */

import type { EntityNote } from './cross-hunt';
import type { VaultAdapter } from './vault-adapter';
import { ENTITY_FOLDERS } from './entity-schema';
import { normalizePath } from './paths';

/**
 * Parse an entity note's content into an EntityNote object.
 * Extracts frontmatter fields and counts sightings lines.
 *
 * Extracted from workspace.ts lines 1288-1352.
 */
export function parseEntityNote(content: string, fileName: string): EntityNote {
  const name = fileName.replace(/\.md$/, '');
  const result: EntityNote = {
    name,
    entityType: '',
    frontmatter: {},
    sightingsCount: 0,
    huntRefs: [],
  };

  // Parse frontmatter
  if (content.startsWith('---')) {
    const end = content.indexOf('\n---', 3);
    if (end !== -1) {
      const block = content.slice(4, end);
      const lines = block.split(/\r?\n/);

      for (const line of lines) {
        const typeMatch = line.match(/^type:\s*(.+)$/);
        if (typeMatch && typeMatch[1]) {
          const val = typeMatch[1].trim().replace(/^["']|["']$/g, '');
          result.entityType = val;
          result.frontmatter['type'] = val;
        }

        const tacticMatch = line.match(/^tactic:\s*(.+)$/);
        if (tacticMatch && tacticMatch[1]) {
          let val = tacticMatch[1].trim().replace(/^["']|["']$/g, '');
          if (val.startsWith('[') && val.endsWith(']')) {
            val = val.slice(1, -1).split(',')[0]?.trim() ?? '';
          }
          if (val) {
            result.frontmatter['tactic'] = val;
          }
        }

        const huntCountMatch = line.match(/^hunt_count:\s*(\d+)$/);
        if (huntCountMatch && huntCountMatch[1]) {
          result.frontmatter['hunt_count'] = parseInt(huntCountMatch[1], 10);
        }

        const confidenceMatch = line.match(/^confidence:\s*(.+)$/);
        if (confidenceMatch && confidenceMatch[1]) {
          result.frontmatter['confidence'] = confidenceMatch[1].trim().replace(/^["']|["']$/g, '');
        }

        const huntRefsMatch = line.match(/^hunt_refs:\s*\[(.+)\]$/);
        if (huntRefsMatch && huntRefsMatch[1]) {
          result.huntRefs = huntRefsMatch[1].split(',').map(r => r.trim().replace(/^["']|["']$/g, ''));
        }
      }
    }
  }

  // Count sightings
  const sightingsSection = content.match(/^## Sightings\s*$([\s\S]*?)(?=^## |\n$|$)/m);
  if (sightingsSection && sightingsSection[1]) {
    const sightingLines = sightingsSection[1]
      .split(/\r?\n/)
      .filter(l => l.startsWith('- ') && !l.includes('_No sightings recorded yet._'));
    result.sightingsCount = sightingLines.length;
  }

  return result;
}

/**
 * Scan ENTITY_FOLDERS for .md files and parse each into an EntityNote.
 *
 * Extracted from workspace.ts lines 1357-1380.
 */
export async function scanEntityNotes(
  vaultAdapter: VaultAdapter,
  planningDir: string,
  basePath: string,
): Promise<EntityNote[]> {
  const notes: EntityNote[] = [];

  for (const folder of ENTITY_FOLDERS) {
    const folderPath = normalizePath(`${basePath}/${folder}`);
    if (!vaultAdapter.folderExists(folderPath)) continue;

    const files = await vaultAdapter.listFiles(folderPath);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    for (const fileName of mdFiles) {
      try {
        const filePath = normalizePath(`${folderPath}/${fileName}`);
        const content = await vaultAdapter.readFile(filePath);
        const note = parseEntityNote(content, fileName);
        notes.push(note);
      } catch {
        // Skip unreadable files
      }
    }
  }

  return notes;
}

/**
 * Parse simple frontmatter fields (type, tactic, hunt_count, mitre_id) from markdown content.
 * Manual parsing -- no library dependency.
 *
 * Extracted from workspace.ts lines 1386-1441.
 */
export function parseFrontmatterFields(content: string): { type: string; tactic: string; hunt_count: string; mitre_id: string } {
  const result = { type: '', tactic: '', hunt_count: '', mitre_id: '' };
  if (!content.startsWith('---')) return result;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return result;
  const block = content.slice(4, end);
  const lines = block.split(/\r?\n/);

  for (const line of lines) {
    const typeMatch = line.match(/^type:\s*(.+)$/);
    if (typeMatch && typeMatch[1]) {
      result.type = typeMatch[1].trim().replace(/^["']|["']$/g, '');
    }
    const huntCountMatch = line.match(/^hunt_count:\s*(.+)$/);
    if (huntCountMatch && huntCountMatch[1]) {
      result.hunt_count = huntCountMatch[1].trim().replace(/^["']|["']$/g, '');
    }
    const mitreIdMatch = line.match(/^mitre_id:\s*(.+)$/);
    if (mitreIdMatch && mitreIdMatch[1]) {
      result.mitre_id = mitreIdMatch[1].trim().replace(/^["']|["']$/g, '');
    }
    const tacticMatch = line.match(/^tactic:\s*(.+)$/);
    if (tacticMatch && tacticMatch[1]) {
      let val = tacticMatch[1].trim().replace(/^["']|["']$/g, '');
      // Handle YAML array on same line: [Persistence, Privilege Escalation]
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',')[0]?.trim() ?? '';
      }
      // Handle YAML array continuation (tactic: followed by - items on next lines)
      // This simple parser takes the inline value only
      result.tactic = val;
    }
  }

  // Handle tactic as YAML array with dash items
  if (!result.tactic) {
    let capturingTactic = false;
    for (const line of lines) {
      if (/^tactic:\s*$/.test(line)) {
        capturingTactic = true;
        continue;
      }
      if (capturingTactic) {
        const itemMatch = line.match(/^\s+-\s+(.+)$/);
        if (itemMatch && itemMatch[1]) {
          result.tactic = itemMatch[1].trim().replace(/^["']|["']$/g, '');
          break; // take first tactic only
        } else {
          capturingTactic = false;
        }
      }
    }
  }

  return result;
}
