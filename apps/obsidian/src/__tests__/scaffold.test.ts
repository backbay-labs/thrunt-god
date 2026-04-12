import { describe, it, expect } from 'vitest';
import {
  getParentTechniques,
  sanitizeFileName,
  getTechniqueFileName,
  generateTechniqueNote,
  type TechniqueData,
  type ScaffoldResult,
} from '../scaffold';

describe('sanitizeFileName', () => {
  it('replaces forward slashes with hyphens', () => {
    expect(sanitizeFileName('Scheduled Task/Job')).toBe(
      'Scheduled Task-Job',
    );
  });

  it('replaces multiple unsafe characters', () => {
    expect(
      sanitizeFileName('Deobfuscate/Decode Files or Information'),
    ).toBe('Deobfuscate-Decode Files or Information');
  });

  it('returns clean names unchanged', () => {
    expect(sanitizeFileName('Normal Name')).toBe('Normal Name');
    expect(sanitizeFileName('Phishing')).toBe('Phishing');
  });

  it('replaces backslashes, colons, and other OS-unsafe chars', () => {
    expect(sanitizeFileName('A\\B:C*D?"E<F>G|H')).toBe(
      'A-B-C-D---E-F-G-H',
    );
  });
});

describe('getTechniqueFileName', () => {
  it('produces ID -- sanitized-name.md format', () => {
    const technique: TechniqueData = {
      id: 'T1053',
      name: 'Scheduled Task/Job',
      tactic: 'Execution, Persistence, Privilege Escalation',
      description: 'Adversaries may abuse task scheduling...',
      sub_techniques: [],
      platforms: ['Windows', 'Linux', 'macOS'],
      data_sources: ['Process Creation', 'Command: Command Execution'],
    };
    expect(getTechniqueFileName(technique)).toBe(
      'T1053 -- Scheduled Task-Job.md',
    );
  });

  it('works with clean names', () => {
    const technique: TechniqueData = {
      id: 'T1189',
      name: 'Drive-by Compromise',
      tactic: 'Initial Access',
      description: '',
      sub_techniques: [],
      platforms: [],
      data_sources: [],
    };
    expect(getTechniqueFileName(technique)).toBe(
      'T1189 -- Drive-by Compromise.md',
    );
  });
});

describe('getParentTechniques', () => {
  it('returns exactly 161 parent techniques', () => {
    const techniques = getParentTechniques();
    expect(techniques).toHaveLength(161);
  });

  it('returns objects with required fields', () => {
    const techniques = getParentTechniques();
    const first = techniques[0]!;
    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('tactic');
    expect(first).toHaveProperty('description');
    expect(first).toHaveProperty('sub_techniques');
    expect(first).toHaveProperty('platforms');
    expect(first).toHaveProperty('data_sources');
  });

  it('every technique has an id starting with T', () => {
    const techniques = getParentTechniques();
    for (const t of techniques) {
      expect(t.id).toMatch(/^T\d+$/);
    }
  });
});

describe('generateTechniqueNote', () => {
  const singleTacticTechnique: TechniqueData = {
    id: 'T1189',
    name: 'Drive-by Compromise',
    tactic: 'Initial Access',
    description:
      'Adversaries may gain access through a user visiting a website.',
    sub_techniques: [],
    platforms: ['Windows', 'Linux', 'macOS'],
    data_sources: ['Network Traffic', 'File Creation', 'Process Creation'],
  };

  const multiTacticTechnique: TechniqueData = {
    id: 'T1133',
    name: 'External Remote Services',
    tactic: 'Initial Access, Persistence',
    description: 'Adversaries may leverage external-facing remote services.',
    sub_techniques: [],
    platforms: ['Windows', 'Linux', 'macOS', 'Cloud'],
    data_sources: ['Logon Session', 'Network Traffic'],
  };

  const techniqueWithSubs: TechniqueData = {
    id: 'T1059',
    name: 'Command and Scripting Interpreter',
    tactic: 'Execution',
    description: 'Adversaries may abuse command and script interpreters.',
    sub_techniques: [
      { id: 'T1059.001', name: 'PowerShell' },
      { id: 'T1059.003', name: 'Windows Command Shell' },
      { id: 'T1059.005', name: 'Visual Basic' },
    ],
    platforms: ['Windows', 'Linux', 'macOS'],
    data_sources: ['Process Creation', 'Command: Command Execution'],
  };

  it('produces single-tactic as bare string in YAML', () => {
    const note = generateTechniqueNote(singleTacticTechnique);
    expect(note).toContain('tactic: "Initial Access"');
  });

  it('produces multi-tactic as YAML array', () => {
    const note = generateTechniqueNote(multiTacticTechnique);
    expect(note).toContain(
      'tactic: ["Initial Access", "Persistence"]',
    );
  });

  it('includes type: ttp in frontmatter', () => {
    const note = generateTechniqueNote(singleTacticTechnique);
    expect(note).toContain('type: ttp');
  });

  it('includes mitre_id in frontmatter', () => {
    const note = generateTechniqueNote(singleTacticTechnique);
    expect(note).toContain('mitre_id: "T1189"');
  });

  it('includes hunt_count: 0 in frontmatter', () => {
    const note = generateTechniqueNote(singleTacticTechnique);
    expect(note).toContain('hunt_count: 0');
  });

  it('includes last_hunted: "" in frontmatter', () => {
    const note = generateTechniqueNote(singleTacticTechnique);
    expect(note).toContain('last_hunted: ""');
  });

  it('includes name in frontmatter', () => {
    const note = generateTechniqueNote(singleTacticTechnique);
    expect(note).toContain('name: "Drive-by Compromise"');
  });

  it('includes platforms array in frontmatter', () => {
    const note = generateTechniqueNote(singleTacticTechnique);
    expect(note).toContain(
      'platforms: ["Windows", "Linux", "macOS"]',
    );
  });

  it('includes data_sources array in frontmatter', () => {
    const note = generateTechniqueNote(singleTacticTechnique);
    expect(note).toContain(
      'data_sources: ["Network Traffic", "File Creation", "Process Creation"]',
    );
  });

  it('includes Sub-Techniques section when sub_techniques is non-empty', () => {
    const note = generateTechniqueNote(techniqueWithSubs);
    expect(note).toContain('## Sub-Techniques');
    expect(note).toContain('- **T1059.001** PowerShell');
    expect(note).toContain('- **T1059.003** Windows Command Shell');
    expect(note).toContain('- **T1059.005** Visual Basic');
  });

  it('omits Sub-Techniques section when sub_techniques is empty', () => {
    const note = generateTechniqueNote(singleTacticTechnique);
    expect(note).not.toContain('## Sub-Techniques');
  });

  it('includes Sightings section', () => {
    const note = generateTechniqueNote(singleTacticTechnique);
    expect(note).toContain('## Sightings');
  });

  it('includes Detections section', () => {
    const note = generateTechniqueNote(singleTacticTechnique);
    expect(note).toContain('## Detections');
  });

  it('includes Related section', () => {
    const note = generateTechniqueNote(singleTacticTechnique);
    expect(note).toContain('## Related');
  });

  it('includes heading with ID and name', () => {
    const note = generateTechniqueNote(singleTacticTechnique);
    expect(note).toContain('# T1189 -- Drive-by Compromise');
  });

  it('includes description in body', () => {
    const note = generateTechniqueNote(singleTacticTechnique);
    expect(note).toContain(
      'Adversaries may gain access through a user visiting a website.',
    );
  });
});

describe('scaffoldAttack integration', () => {
  it('creates files for techniques and skips existing ones', async () => {
    const { getParentTechniques, getTechniqueFileName, generateTechniqueNote } = await import('../scaffold');
    const { normalizePath } = await import('../paths');

    // Mock vault adapter with in-memory file store
    const files = new Map<string, string>();
    const adapter = {
      fileExists: (path: string) => files.has(path),
      createFile: async (path: string, content: string) => {
        files.set(path, content);
      },
      ensureFolder: async (_path: string) => {},
    };

    const ttpsFolder = 'THRUNT/entities/ttps';
    const techniques = getParentTechniques();

    // First run: should create all files
    let created = 0;
    let skipped = 0;
    for (const technique of techniques) {
      const fileName = getTechniqueFileName(technique);
      const path = normalizePath(`${ttpsFolder}/${fileName}`);
      if (adapter.fileExists(path)) {
        skipped++;
        continue;
      }
      const content = generateTechniqueNote(technique);
      await adapter.createFile(path, content);
      created++;
    }

    const result1: ScaffoldResult = {
      created,
      skipped,
      total: techniques.length,
    };

    expect(result1.created).toBe(161);
    expect(result1.skipped).toBe(0);
    expect(result1.total).toBe(161);
    expect(files.size).toBe(161);

    // Second run: should skip all files (idempotent)
    created = 0;
    skipped = 0;
    for (const technique of techniques) {
      const fileName = getTechniqueFileName(technique);
      const path = normalizePath(`${ttpsFolder}/${fileName}`);
      if (adapter.fileExists(path)) {
        skipped++;
        continue;
      }
      const content = generateTechniqueNote(technique);
      await adapter.createFile(path, content);
      created++;
    }

    const result2: ScaffoldResult = {
      created,
      skipped,
      total: techniques.length,
    };

    expect(result2.created).toBe(0);
    expect(result2.skipped).toBe(161);
    expect(result2.total).toBe(161);
    expect(files.size).toBe(161);
  });
});
