/**
 * ATT&CK ontology scaffold generator.
 *
 * Pure-function module -- NO Obsidian imports. Generates technique notes
 * with typed YAML frontmatter from the bundled MITRE ATT&CK Enterprise
 * JSON data. Multi-tactic techniques produce YAML arrays queryable by
 * Dataview. File names are sanitized for all OS platforms.
 */

import attackData from '../data/mitre-attack-enterprise.json';

export interface TechniqueData {
  id: string;
  name: string;
  tactic: string;
  description: string;
  sub_techniques: Array<{ id: string; name: string }>;
  platforms: string[];
  data_sources: string[];
}

export interface ScaffoldResult {
  created: number;
  skipped: number;
  total: number;
}

/** Characters unsafe in file names on Windows, macOS, and Linux. */
const UNSAFE_CHARS = /[/\\:*?"<>|]/g;

/**
 * Replace OS-unsafe characters with hyphens.
 *
 * "Scheduled Task/Job" -> "Scheduled Task-Job"
 */
export function sanitizeFileName(name: string): string {
  return name.replace(UNSAFE_CHARS, '-');
}

/**
 * Build the file name for a technique note.
 *
 * Format: "T1053 -- Scheduled Task-Job.md"
 */
export function getTechniqueFileName(
  technique: Pick<TechniqueData, 'id' | 'name'>,
): string {
  const safeName = sanitizeFileName(technique.name);
  return `${technique.id} -- ${safeName}.md`;
}

/**
 * Return all 161 parent techniques from the bundled ATT&CK JSON.
 */
export function getParentTechniques(): TechniqueData[] {
  return (attackData as unknown as { techniques: TechniqueData[] }).techniques;
}

/**
 * Generate a complete technique note with YAML frontmatter.
 *
 * Multi-tactic techniques (e.g. "Initial Access, Persistence") produce a
 * YAML array: `tactic: ["Initial Access", "Persistence"]`
 *
 * Single-tactic techniques produce a bare string: `tactic: "Initial Access"`
 */
export function generateTechniqueNote(technique: TechniqueData): string {
  // Parse multi-tactic: "Initial Access, Persistence" -> array
  const tactics = technique.tactic.split(',').map((t) => t.trim());
  const tacticYaml =
    tactics.length === 1
      ? `"${tactics[0]}"`
      : `[${tactics.map((t) => `"${t}"`).join(', ')}]`;

  const platformsYaml = `[${technique.platforms.map((p) => `"${p}"`).join(', ')}]`;
  const dataSourcesYaml = `[${technique.data_sources.map((d) => `"${d}"`).join(', ')}]`;

  let content = `---
type: ttp
mitre_id: "${technique.id}"
tactic: ${tacticYaml}
name: "${technique.name}"
platforms: ${platformsYaml}
data_sources: ${dataSourcesYaml}
hunt_count: 0
last_hunted: ""
---
# ${technique.id} -- ${technique.name}

${technique.description}

`;

  if (technique.sub_techniques.length > 0) {
    content += `## Sub-Techniques\n\n`;
    for (const sub of technique.sub_techniques) {
      content += `- **${sub.id}** ${sub.name}\n`;
    }
    content += '\n';
  }

  content += `## Sightings

_No hunts have targeted this technique yet._

## Detections

## Related

`;

  return content;
}
