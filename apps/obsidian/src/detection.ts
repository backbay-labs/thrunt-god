/**
 * Detection note generation -- pure functional detection template creation.
 *
 * Generates detection note markdown with:
 * - YAML frontmatter (type: detection, rule_language, source_hunt, etc.)
 * - Rule section with fenced code block for the detection language
 * - Context, Source Hunt, and Related sections
 *
 * Pure module -- zero Obsidian imports. Safe for testing and CLI usage.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectionNoteParams {
  name: string;
  ruleLanguage: 'sigma' | 'kql' | 'spl';
  sourceHunt: string;
  linkedTechniques: string[];
  linkedEntities: string[];
}

// ---------------------------------------------------------------------------
// createDetectionNote
// ---------------------------------------------------------------------------

/**
 * Create a complete detection note markdown string.
 *
 * Produces frontmatter with schema_version, type: detection, rule_language,
 * source_hunt, linked_techniques/entities (inline arrays), status: draft,
 * rule_content, and body sections for Rule, Context, Source Hunt, and Related.
 *
 * @param params - Detection note parameters
 * @returns Complete markdown string for the detection note
 */
export function createDetectionNote(params: DetectionNoteParams): string {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  lines.push('schema_version: 1');
  lines.push('type: detection');
  lines.push(`rule_language: ${params.ruleLanguage}`);
  lines.push(`source_hunt: ${params.sourceHunt}`);
  lines.push(`linked_techniques: [${params.linkedTechniques.join(', ')}]`);
  lines.push(`linked_entities: [${params.linkedEntities.join(', ')}]`);
  lines.push('status: draft');
  lines.push('rule_content: ""');
  lines.push('---');
  lines.push('');

  // Body
  lines.push(`# ${params.name}`);
  lines.push('');

  // ## Rule
  lines.push('## Rule');
  lines.push('');
  lines.push(`\`\`\`${params.ruleLanguage}`);
  lines.push('# TODO: Add detection rule');
  lines.push('```');
  lines.push('');

  // ## Context
  lines.push('## Context');
  lines.push('');
  lines.push('_Describe the detection context, data sources, and expected behavior._');
  lines.push('');

  // ## Source Hunt
  lines.push('## Source Hunt');
  lines.push('');
  lines.push(`Derived from hunt: ${params.sourceHunt}`);
  lines.push('');

  // ## Related
  lines.push('## Related');
  lines.push('');
  lines.push('_Link related detection notes, playbooks, and entity notes._');
  lines.push('');

  return lines.join('\n');
}
