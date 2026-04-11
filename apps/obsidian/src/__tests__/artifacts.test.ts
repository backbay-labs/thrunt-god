import { describe, it, expect } from 'vitest';
import { CORE_ARTIFACTS } from '../artifacts';

describe('CORE_ARTIFACTS', () => {
  it('has exactly 5 entries', () => {
    expect(CORE_ARTIFACTS).toHaveLength(5);
  });
  it('has no duplicate fileName values', () => {
    const fileNames = CORE_ARTIFACTS.map((a) => a.fileName);
    expect(new Set(fileNames).size).toBe(fileNames.length);
  });
  it('has no duplicate commandId values', () => {
    const commandIds = CORE_ARTIFACTS.map((a) => a.commandId);
    expect(new Set(commandIds).size).toBe(commandIds.length);
  });
  it('all entries have non-empty starterTemplate', () => {
    for (const artifact of CORE_ARTIFACTS) {
      expect(artifact.starterTemplate.trim().length).toBeGreaterThan(0);
    }
  });
  it('canonical order is MISSION, HYPOTHESES, HUNTMAP, STATE, FINDINGS', () => {
    const fileNames = CORE_ARTIFACTS.map((a) => a.fileName);
    expect(fileNames).toEqual([
      'MISSION.md',
      'HYPOTHESES.md',
      'HUNTMAP.md',
      'STATE.md',
      'FINDINGS.md',
    ]);
  });
  it('STATE.md template includes Next actions section', () => {
    const state = CORE_ARTIFACTS.find((a) => a.fileName === 'STATE.md');
    expect(state).toBeDefined();
    expect(state!.starterTemplate).toContain('## Next actions');
  });
  it('all entries have valid commandId format', () => {
    for (const artifact of CORE_ARTIFACTS) {
      expect(artifact.commandId).toMatch(/^open-thrunt-[a-z]+$/);
    }
  });
  it('all entries have non-empty label and description', () => {
    for (const artifact of CORE_ARTIFACTS) {
      expect(artifact.label.trim().length).toBeGreaterThan(0);
      expect(artifact.description.trim().length).toBeGreaterThan(0);
    }
  });
});
