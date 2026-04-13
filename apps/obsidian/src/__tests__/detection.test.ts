import { describe, it, expect } from 'vitest';
import { createDetectionNote, type DetectionNoteParams } from '../detection';

// ---------------------------------------------------------------------------
// createDetectionNote
// ---------------------------------------------------------------------------

describe('createDetectionNote', () => {
  const defaultParams: DetectionNoteParams = {
    name: 'Detect Lateral Movement via RDP',
    ruleLanguage: 'sigma',
    sourceHunt: 'HUNT-042',
    linkedTechniques: ['T1021.001', 'T1059.001'],
    linkedEntities: ['192.168.1.100', 'evil.example.com'],
  };

  it('produces valid frontmatter with all required fields', () => {
    const result = createDetectionNote(defaultParams);
    expect(result).toContain('type: detection');
    expect(result).toContain('schema_version: 1');
    expect(result).toContain('rule_language: sigma');
    expect(result).toContain('source_hunt: HUNT-042');
    expect(result).toContain('status: draft');
    expect(result).toContain('rule_content: ""');
  });

  it('body includes ## Rule section with fenced code block placeholder', () => {
    const result = createDetectionNote(defaultParams);
    expect(result).toContain('## Rule');
    expect(result).toContain('```sigma');
    expect(result).toContain('```');
  });

  it('body includes ## Context, ## Source Hunt, ## Related sections', () => {
    const result = createDetectionNote(defaultParams);
    expect(result).toContain('## Context');
    expect(result).toContain('## Source Hunt');
    expect(result).toContain('## Related');
  });

  it('custom rule_language (kql) appears in frontmatter and code block', () => {
    const kqlParams: DetectionNoteParams = { ...defaultParams, ruleLanguage: 'kql' };
    const result = createDetectionNote(kqlParams);
    expect(result).toContain('rule_language: kql');
    expect(result).toContain('```kql');
  });

  it('custom rule_language (spl) appears in frontmatter and code block', () => {
    const splParams: DetectionNoteParams = { ...defaultParams, ruleLanguage: 'spl' };
    const result = createDetectionNote(splParams);
    expect(result).toContain('rule_language: spl');
    expect(result).toContain('```spl');
  });

  it('linked_techniques populated from input array using inline [] format', () => {
    const result = createDetectionNote(defaultParams);
    expect(result).toContain('linked_techniques: [T1021.001, T1059.001]');
  });

  it('linked_entities populated from input array using inline [] format', () => {
    const result = createDetectionNote(defaultParams);
    expect(result).toContain('linked_entities: [192.168.1.100, evil.example.com]');
  });

  it('source_hunt populated from huntId parameter', () => {
    const result = createDetectionNote(defaultParams);
    expect(result).toContain('source_hunt: HUNT-042');
  });

  it('empty arrays produce [] in frontmatter (not missing keys)', () => {
    const emptyParams: DetectionNoteParams = {
      ...defaultParams,
      linkedTechniques: [],
      linkedEntities: [],
    };
    const result = createDetectionNote(emptyParams);
    expect(result).toContain('linked_techniques: []');
    expect(result).toContain('linked_entities: []');
  });

  it('title appears as # heading in body', () => {
    const result = createDetectionNote(defaultParams);
    expect(result).toContain('# Detect Lateral Movement via RDP');
  });

  it('## Source Hunt references the source hunt', () => {
    const result = createDetectionNote(defaultParams);
    const sourceHuntSection = result.split('## Source Hunt')[1]!.split('##')[0]!;
    expect(sourceHuntSection).toContain('HUNT-042');
  });
});
