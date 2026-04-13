/**
 * Context assembly engine -- pure module that traverses wiki-links from a
 * source note, extracts relevant sections based on an ExportProfile, adds
 * provenance markers, and returns an AssembledContext.
 *
 * Zero Obsidian imports. All functions are pure -- they accept data and return
 * data. The actual vault I/O is wired via callback parameters.
 */

import type { ExportProfile, AssembledContext, ProvenanceSection } from './types';

// ---------------------------------------------------------------------------
// extractWikiLinks
// ---------------------------------------------------------------------------

/**
 * Extract wiki-link targets from markdown content.
 *
 * - Captures `[[Target]]` and `[[Target|display text]]` (returns "Target").
 * - Skips links inside fenced code blocks (``` ... ```).
 * - Returns a unique array of link targets.
 */
export function extractWikiLinks(content: string): string[] {
  const links: string[] = [];
  const seen = new Set<string>();

  // Split content to skip code fence blocks
  const lines = content.split('\n');
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) continue;

    const regex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const target = match[1]!;
      if (!seen.has(target)) {
        seen.add(target);
        links.push(target);
      }
    }
  }

  return links;
}

// ---------------------------------------------------------------------------
// addProvenanceMarker
// ---------------------------------------------------------------------------

/**
 * Create a ProvenanceSection with heading, content, and source file path.
 *
 * The provenance comment `<!-- source: {sourcePath} -->` is rendered when
 * assembling final output (see WorkspaceService.renderAssembledContext).
 */
export function addProvenanceMarker(
  heading: string,
  content: string,
  sourcePath: string,
): ProvenanceSection {
  return { heading, content, sourcePath };
}

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

/**
 * Rough token estimate: characters / 4, rounded up.
 * Returns 0 for empty string.
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

// ---------------------------------------------------------------------------
// extractSections
// ---------------------------------------------------------------------------

/**
 * Parse markdown content into sections by `## ` headings.
 *
 * - Content before the first `## ` heading is captured under heading "overview".
 * - If `includeSections` is empty, all sections are included.
 * - Otherwise, only sections whose heading matches one of `includeSections`
 *   (case-insensitive, normalized) are included.
 */
export function extractSections(
  content: string,
  includeSections: string[],
): Array<{ heading: string; content: string }> {
  const sections: Array<{ heading: string; content: string }> = [];
  const lines = content.split('\n');

  let currentHeading = 'overview';
  let currentContent: string[] = [];
  let hasContent = false;

  for (const line of lines) {
    const headingMatch = line.match(/^## (.+)$/);
    if (headingMatch) {
      // Flush previous section
      if (hasContent || currentContent.some(l => l.trim().length > 0)) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join('\n').trim(),
        });
      }
      currentHeading = headingMatch[1]!.trim();
      currentContent = [];
      hasContent = true;
    } else {
      currentContent.push(line);
    }
  }

  // Flush last section
  if (hasContent || currentContent.some(l => l.trim().length > 0)) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join('\n').trim(),
    });
  }

  // Filter empty overview
  const filtered = sections.filter(s => s.content.length > 0);

  if (includeSections.length === 0) {
    return filtered;
  }

  const normalizedIncludes = includeSections.map(s => s.toLowerCase().trim());
  return filtered.filter(s =>
    normalizedIncludes.includes(s.heading.toLowerCase().trim()),
  );
}

// ---------------------------------------------------------------------------
// assembleContext
// ---------------------------------------------------------------------------

/**
 * Assemble context by traversing wiki-links from a source note.
 *
 * 1. Read source note, extract sections matching profile.includeSections.
 * 2. Extract wiki-links from source note.
 * 3. For each linked note that matches profile.includeRelated.entityTypes
 *    (by checking if its resolved path starts with `{planningDir}/entities/{entityFolder}`):
 *    - Read the note and extract ALL sections (not filtered by includeSections).
 * 4. If depth >= 2, follow links from linked notes one more level (same filtering + dedup).
 * 5. Calculate token estimate from assembled content.
 */
export async function assembleContext(params: {
  sourceNotePath: string;
  profile: ExportProfile;
  readFile: (path: string) => Promise<string | null>;
  fileExists: (path: string) => boolean;
  planningDir: string;
}): Promise<AssembledContext> {
  const { sourceNotePath, profile, readFile, fileExists, planningDir } = params;
  const visited = new Set<string>();
  const allSections: ProvenanceSection[] = [];

  // Read source note
  const sourceContent = await readFile(sourceNotePath);
  if (!sourceContent) {
    return {
      sections: [],
      tokenEstimate: 0,
      profileUsed: profile.agentId,
      sourceNote: sourceNotePath,
    };
  }

  visited.add(sourceNotePath);

  // Extract sections from source note (filtered by profile.includeSections)
  const sourceSections = extractSections(sourceContent, profile.includeSections);
  for (const section of sourceSections) {
    allSections.push(addProvenanceMarker(section.heading, section.content, sourceNotePath));
  }

  // Extract wiki-links from source note
  const sourceLinks = extractWikiLinks(sourceContent);

  // Follow direct links (depth >= 1)
  const linkedNotePaths = resolveLinkedPaths(sourceLinks, fileExists, planningDir, profile);

  const depth1Links: string[] = [];

  for (const linkedPath of linkedNotePaths) {
    if (visited.has(linkedPath)) continue;
    visited.add(linkedPath);

    const linkedContent = await readFile(linkedPath);
    if (!linkedContent) continue;

    // Extract ALL sections from linked notes (not filtered)
    const linkedSections = extractSections(linkedContent, []);
    for (const section of linkedSections) {
      allSections.push(addProvenanceMarker(section.heading, section.content, linkedPath));
    }

    // Collect links from linked notes for depth=2
    if (profile.includeRelated.depth >= 2) {
      const innerLinks = extractWikiLinks(linkedContent);
      depth1Links.push(...innerLinks.map(link => ({ link, fromPath: linkedPath })).map(l => l.link));
    }
  }

  // Follow depth=2 links
  if (profile.includeRelated.depth >= 2 && depth1Links.length > 0) {
    const depth2Paths = resolveLinkedPaths(depth1Links, fileExists, planningDir, profile);
    for (const linkedPath of depth2Paths) {
      if (visited.has(linkedPath)) continue;
      visited.add(linkedPath);

      const linkedContent = await readFile(linkedPath);
      if (!linkedContent) continue;

      const linkedSections = extractSections(linkedContent, []);
      for (const section of linkedSections) {
        allSections.push(addProvenanceMarker(section.heading, section.content, linkedPath));
      }
    }
  }

  // Calculate token estimate from total assembled content
  const totalText = allSections.map(s => s.content).join('\n');
  const tokenEstimate = estimateTokens(totalText);

  return {
    sections: allSections,
    tokenEstimate,
    profileUsed: profile.agentId,
    sourceNote: sourceNotePath,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Entity type to folder name mapping.
 * Used to check if a wiki-link target path belongs to an allowed entity type.
 */
const ENTITY_TYPE_FOLDER_MAP: Record<string, string> = {
  ttp: 'entities/ttps',
  actor: 'entities/actors',
  tool: 'entities/tools',
  datasource: 'entities/datasources',
  infra: 'entities/infra',
  'ioc/ip': 'entities/iocs',
  'ioc/domain': 'entities/iocs',
  'ioc/hash': 'entities/iocs',
};

/**
 * Resolve wiki-link targets to vault paths, filtering by entity type.
 *
 * A wiki-link like `[[entities/ttps/T1059.001]]` resolves to the path
 * `entities/ttps/T1059.001.md`. The entity type is determined by checking
 * which entity folder the path falls under.
 */
function resolveLinkedPaths(
  links: string[],
  fileExists: (path: string) => boolean,
  planningDir: string,
  profile: ExportProfile,
): string[] {
  const resolved: string[] = [];
  const allowedFolders = new Set<string>();

  for (const entityType of profile.includeRelated.entityTypes) {
    const folder = ENTITY_TYPE_FOLDER_MAP[entityType];
    if (folder) {
      allowedFolders.add(folder);
    }
  }

  for (const link of links) {
    const directPath = link.endsWith('.md') ? link : `${link}.md`;

    // Try planningDir resolution for core artifacts (MISSION, STATE, etc.)
    const planningDirPath = `${planningDir}/${directPath}`;
    if (fileExists(planningDirPath)) {
      resolved.push(planningDirPath);
      continue; // Core artifact resolved -- skip entity type check
    }

    // Existing: entity folder resolution
    if (fileExists(directPath)) {
      // Check if path matches any allowed entity folder
      if (matchesEntityType(directPath, planningDir, allowedFolders)) {
        resolved.push(directPath);
      }
    }
  }

  return resolved;
}

/**
 * Check if a file path belongs to one of the allowed entity folders.
 *
 * Checks both absolute (with planningDir prefix) and relative forms:
 * - `{planningDir}/entities/ttps/T1.md` matches folder `entities/ttps`
 * - `entities/ttps/T1.md` also matches folder `entities/ttps`
 */
function matchesEntityType(
  filePath: string,
  planningDir: string,
  allowedFolders: Set<string>,
): boolean {
  // If no entity type restrictions, allow everything
  if (allowedFolders.size === 0) return true;

  for (const folder of allowedFolders) {
    // Check with planningDir prefix
    if (filePath.startsWith(`${planningDir}/${folder}/`)) return true;
    // Check without planningDir prefix (relative path)
    if (filePath.startsWith(`${folder}/`)) return true;
  }

  return false;
}
