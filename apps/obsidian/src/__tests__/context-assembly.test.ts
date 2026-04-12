import { describe, it, expect } from 'vitest';
import {
  extractWikiLinks,
  addProvenanceMarker,
  estimateTokens,
  extractSections,
  assembleContext,
} from '../context-assembly';
import type { ExportProfile, AssembledContext } from '../types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Mock readFile callback: returns content from a map, null for missing */
function makeReadFile(files: Record<string, string>): (path: string) => Promise<string | null> {
  return async (path: string) => files[path] ?? null;
}

/** Mock fileExists callback: returns true if path is in the files map */
function makeFileExists(files: Record<string, string>): (path: string) => boolean {
  return (path: string) => path in files;
}

/** Minimal profile factory */
function makeProfile(overrides: Partial<ExportProfile> = {}): ExportProfile {
  return {
    agentId: 'test-agent',
    label: 'Test Agent',
    includeSections: [],
    includeRelated: {
      entityTypes: [],
      depth: 1,
    },
    promptTemplate: '{{context}}',
    maxTokenEstimate: 8000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// extractWikiLinks
// ---------------------------------------------------------------------------

describe('extractWikiLinks', () => {
  it('extracts [[Target Note]] from markdown', () => {
    const content = 'See [[Target Note]] for details.';
    expect(extractWikiLinks(content)).toEqual(['Target Note']);
  });

  it('extracts multiple links [[A]] and [[B]]', () => {
    const content = 'Link to [[A]] and also [[B]] here.';
    expect(extractWikiLinks(content)).toEqual(['A', 'B']);
  });

  it('handles [[Note|display text]] alias format, returns "Note"', () => {
    const content = 'Check [[Note|display text]] for info.';
    expect(extractWikiLinks(content)).toEqual(['Note']);
  });

  it('returns empty array for content with no wiki-links', () => {
    const content = 'No links here, just plain text.';
    expect(extractWikiLinks(content)).toEqual([]);
  });

  it('deduplicates same link appearing twice', () => {
    const content = 'See [[Note]] and also [[Note]] again.';
    expect(extractWikiLinks(content)).toEqual(['Note']);
  });

  it('ignores links inside code blocks', () => {
    const content = `Some text

\`\`\`
[[Inside Code Block]]
\`\`\`

And [[Outside Code]] here.`;
    expect(extractWikiLinks(content)).toEqual(['Outside Code']);
  });
});

// ---------------------------------------------------------------------------
// addProvenanceMarker
// ---------------------------------------------------------------------------

describe('addProvenanceMarker', () => {
  it('returns ProvenanceSection with heading, content, and sourcePath', () => {
    const section = addProvenanceMarker('Hypothesis', 'Some hypothesis text', 'path/to/file.md');
    expect(section.heading).toBe('Hypothesis');
    expect(section.content).toBe('Some hypothesis text');
    expect(section.sourcePath).toBe('path/to/file.md');
  });

  it('provenance sourcePath allows rendering <!-- source: path/to/file.md -->', () => {
    const section = addProvenanceMarker('Evidence', 'Data here', 'notes/evidence.md');
    const rendered = `<!-- source: ${section.sourcePath} -->`;
    expect(rendered).toContain('<!-- source: notes/evidence.md -->');
  });
});

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe('estimateTokens', () => {
  it('estimates tokens as Math.ceil(text.length / 4)', () => {
    const text = 'Hello world!'; // 12 chars -> ceil(12/4) = 3
    expect(estimateTokens(text)).toBe(3);
  });

  it('empty string returns 0', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('handles odd-length strings correctly', () => {
    const text = 'abcde'; // 5 chars -> ceil(5/4) = 2
    expect(estimateTokens(text)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// extractSections
// ---------------------------------------------------------------------------

describe('extractSections', () => {
  const content = `# Title

Overview paragraph here.

## Hypothesis

The attacker used lateral movement.

## Evidence

Process logs show activity.

## Conclusion

All clear.
`;

  it('extracts all sections when includeSections is empty', () => {
    const sections = extractSections(content, []);
    expect(sections.length).toBeGreaterThanOrEqual(4); // overview + 3 headings
  });

  it('filters by includeSections (case-insensitive)', () => {
    const sections = extractSections(content, ['hypothesis']);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading.toLowerCase()).toBe('hypothesis');
  });

  it('captures content before first heading as "overview"', () => {
    const sections = extractSections(content, ['overview']);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBe('overview');
    expect(sections[0]!.content).toContain('Overview paragraph here.');
  });

  it('returns empty array when no sections match includeSections', () => {
    const sections = extractSections(content, ['nonexistent-section']);
    expect(sections).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// assembleContext
// ---------------------------------------------------------------------------

describe('assembleContext', () => {
  const SOURCE_NOTE = `# Hunt Note

Overview of the hunt.

## Hypothesis

The attacker used [[entities/ttps/T1059.001]] for execution.

## Evidence

Found in process logs.
`;

  const LINKED_TTP_NOTE = `---
type: ttp
mitre_id: T1059.001
---

# T1059.001

## Description

PowerShell command execution technique.

## Sightings

- **RCT-001** (2026-04-10): Observed in process logs [[RCT-001.md]]
`;

  it('given a source note with no wiki-links, returns only source note sections', async () => {
    const noLinksNote = `# Simple Note

## Hypothesis

Just a hypothesis, no links.
`;
    const files: Record<string, string> = {
      'notes/simple.md': noLinksNote,
    };
    const profile = makeProfile({ includeSections: ['hypothesis'] });
    const result = await assembleContext({
      sourceNotePath: 'notes/simple.md',
      profile,
      readFile: makeReadFile(files),
      fileExists: makeFileExists(files),
      planningDir: '.planning',
    });

    expect(result.sections.length).toBeGreaterThanOrEqual(1);
    expect(result.sections.every(s => s.sourcePath === 'notes/simple.md')).toBe(true);
    expect(result.sourceNote).toBe('notes/simple.md');
    expect(result.profileUsed).toBe('test-agent');
  });

  it('given a source note with [[linked-note]], follows link and includes linked note sections', async () => {
    const files: Record<string, string> = {
      'notes/hunt.md': SOURCE_NOTE,
      'entities/ttps/T1059.001.md': LINKED_TTP_NOTE,
    };
    const profile = makeProfile({
      includeSections: ['hypothesis'],
      includeRelated: { entityTypes: ['ttp'], depth: 1 },
    });
    const result = await assembleContext({
      sourceNotePath: 'notes/hunt.md',
      profile,
      readFile: makeReadFile(files),
      fileExists: makeFileExists(files),
      planningDir: '.planning',
    });

    // Should have source note sections AND linked note sections
    const sourcePaths = result.sections.map(s => s.sourcePath);
    expect(sourcePaths).toContain('notes/hunt.md');
    expect(sourcePaths).toContain('entities/ttps/T1059.001.md');
  });

  it('depth=1 follows direct links only, not links within linked notes', async () => {
    const noteA = '# A\n\n## Info\n\nLinks to [[entities/ttps/B]]\n';
    const noteB = '# B\n\n## Info\n\nLinks to [[entities/ttps/C]]\n';
    const noteC = '# C\n\n## Info\n\nEnd of chain.\n';
    const files: Record<string, string> = {
      'notes/a.md': noteA,
      'entities/ttps/B.md': noteB,
      'entities/ttps/C.md': noteC,
    };
    const profile = makeProfile({
      includeSections: [],
      includeRelated: { entityTypes: ['ttp'], depth: 1 },
    });
    const result = await assembleContext({
      sourceNotePath: 'notes/a.md',
      profile,
      readFile: makeReadFile(files),
      fileExists: makeFileExists(files),
      planningDir: '.planning',
    });

    const sourcePaths = [...new Set(result.sections.map(s => s.sourcePath))];
    expect(sourcePaths).toContain('notes/a.md');
    expect(sourcePaths).toContain('entities/ttps/B.md');
    expect(sourcePaths).not.toContain('entities/ttps/C.md');
  });

  it('depth=2 follows links within linked notes (neighbors of neighbors)', async () => {
    const noteA = '# A\n\n## Info\n\nLinks to [[entities/ttps/B]]\n';
    const noteB = '# B\n\n## Info\n\nLinks to [[entities/ttps/C]]\n';
    const noteC = '# C\n\n## Info\n\nEnd of chain.\n';
    const files: Record<string, string> = {
      'notes/a.md': noteA,
      'entities/ttps/B.md': noteB,
      'entities/ttps/C.md': noteC,
    };
    const profile = makeProfile({
      includeSections: [],
      includeRelated: { entityTypes: ['ttp'], depth: 2 },
    });
    const result = await assembleContext({
      sourceNotePath: 'notes/a.md',
      profile,
      readFile: makeReadFile(files),
      fileExists: makeFileExists(files),
      planningDir: '.planning',
    });

    const sourcePaths = [...new Set(result.sections.map(s => s.sourcePath))];
    expect(sourcePaths).toContain('notes/a.md');
    expect(sourcePaths).toContain('entities/ttps/B.md');
    expect(sourcePaths).toContain('entities/ttps/C.md');
  });

  it('circular links (A->B->A) do not cause infinite recursion', async () => {
    const noteA = '# A\n\n## Info\n\nLinks to [[entities/ttps/B]]\n';
    const noteB = '# B\n\n## Info\n\nLinks back to [[notes/a]]\n';
    const files: Record<string, string> = {
      'notes/a.md': noteA,
      'entities/ttps/B.md': noteB,
    };
    const profile = makeProfile({
      includeSections: [],
      includeRelated: { entityTypes: ['ttp'], depth: 2 },
    });

    // Should not hang or throw
    const result = await assembleContext({
      sourceNotePath: 'notes/a.md',
      profile,
      readFile: makeReadFile(files),
      fileExists: makeFileExists(files),
      planningDir: '.planning',
    });

    expect(result.sections.length).toBeGreaterThanOrEqual(1);
  });

  it('non-existent linked file is silently skipped', async () => {
    const noteWithBadLink = '# Note\n\n## Info\n\nLinks to [[entities/ttps/Missing]]\n';
    const files: Record<string, string> = {
      'notes/source.md': noteWithBadLink,
    };
    const profile = makeProfile({
      includeSections: [],
      includeRelated: { entityTypes: ['ttp'], depth: 1 },
    });

    const result = await assembleContext({
      sourceNotePath: 'notes/source.md',
      profile,
      readFile: makeReadFile(files),
      fileExists: makeFileExists(files),
      planningDir: '.planning',
    });

    // Should have only source note sections, no error
    const sourcePaths = [...new Set(result.sections.map(s => s.sourcePath))];
    expect(sourcePaths).toEqual(['notes/source.md']);
  });

  it('assembled sections have correct sourcePath provenance', async () => {
    const files: Record<string, string> = {
      'notes/hunt.md': SOURCE_NOTE,
      'entities/ttps/T1059.001.md': LINKED_TTP_NOTE,
    };
    const profile = makeProfile({
      includeSections: ['hypothesis'],
      includeRelated: { entityTypes: ['ttp'], depth: 1 },
    });
    const result = await assembleContext({
      sourceNotePath: 'notes/hunt.md',
      profile,
      readFile: makeReadFile(files),
      fileExists: makeFileExists(files),
      planningDir: '.planning',
    });

    for (const section of result.sections) {
      expect(section.sourcePath).toBeTruthy();
      expect(typeof section.sourcePath).toBe('string');
    }
  });

  it('tokenEstimate is populated based on total assembled content', async () => {
    const files: Record<string, string> = {
      'notes/hunt.md': SOURCE_NOTE,
    };
    const profile = makeProfile({ includeSections: [] });
    const result = await assembleContext({
      sourceNotePath: 'notes/hunt.md',
      profile,
      readFile: makeReadFile(files),
      fileExists: makeFileExists(files),
      planningDir: '.planning',
    });

    expect(result.tokenEstimate).toBeGreaterThan(0);
    expect(typeof result.tokenEstimate).toBe('number');
  });

  it('sections are filtered by profile.includeSections (only matching headings extracted)', async () => {
    const files: Record<string, string> = {
      'notes/hunt.md': SOURCE_NOTE,
    };
    const profile = makeProfile({ includeSections: ['hypothesis'] });
    const result = await assembleContext({
      sourceNotePath: 'notes/hunt.md',
      profile,
      readFile: makeReadFile(files),
      fileExists: makeFileExists(files),
      planningDir: '.planning',
    });

    // Only "hypothesis" sections from the source note
    for (const section of result.sections) {
      if (section.sourcePath === 'notes/hunt.md') {
        expect(section.heading.toLowerCase()).toBe('hypothesis');
      }
    }
  });

  it('profile.includeRelated.entityTypes filters which linked notes to follow', async () => {
    const noteWithMixed = '# Hunt\n\n## Info\n\nLinks to [[entities/ttps/T1]] and [[entities/iocs/evil-ip]]\n';
    const ttpNote = '# T1\n\n## Description\n\nTTP content.\n';
    const iocNote = '# evil-ip\n\n## Sightings\n\nIOC content.\n';
    const files: Record<string, string> = {
      'notes/hunt.md': noteWithMixed,
      'entities/ttps/T1.md': ttpNote,
      'entities/iocs/evil-ip.md': iocNote,
    };
    // Only follow TTP entity types
    const profile = makeProfile({
      includeSections: [],
      includeRelated: { entityTypes: ['ttp'], depth: 1 },
    });
    const result = await assembleContext({
      sourceNotePath: 'notes/hunt.md',
      profile,
      readFile: makeReadFile(files),
      fileExists: makeFileExists(files),
      planningDir: '.planning',
    });

    const sourcePaths = [...new Set(result.sections.map(s => s.sourcePath))];
    expect(sourcePaths).toContain('notes/hunt.md');
    expect(sourcePaths).toContain('entities/ttps/T1.md');
    // IOC should NOT be followed since entityTypes only includes 'ttp'
    expect(sourcePaths).not.toContain('entities/iocs/evil-ip.md');
  });
});
