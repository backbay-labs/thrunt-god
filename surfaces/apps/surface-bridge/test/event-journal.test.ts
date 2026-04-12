import { describe, test, expect } from 'bun:test';
import { createEventJournal } from '../src/event-journal.ts';
import { classifyArtifactType } from '../src/file-watcher.ts';
import type { EventBridgeEnvelope } from '@thrunt-surfaces/contracts';

// ─── Helper ───────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<Omit<EventBridgeEnvelope, 'seq'>> = {}): Omit<EventBridgeEnvelope, 'seq'> {
  return {
    v: 1,
    ts: new Date().toISOString(),
    type: 'artifact.created',
    data: {
      artifactPath: 'QUERIES/QRY-001.md',
      artifactType: 'query',
      diff: { previousHash: null, currentHash: 'abc123', changedFrontmatterKeys: [] },
    },
    ...overrides,
  };
}

// ─── Event Journal tests ──────────────────────────────────────────────────

describe('EventJournal', () => {
  test('append() assigns monotonically increasing seq starting at 1', () => {
    const journal = createEventJournal();
    const e1 = journal.append(makeEvent());
    const e2 = journal.append(makeEvent());
    const e3 = journal.append(makeEvent());

    expect(e1.seq).toBe(1);
    expect(e2.seq).toBe(2);
    expect(e3.seq).toBe(3);
  });

  test('replayFrom returns events after given seq', () => {
    const journal = createEventJournal();
    for (let i = 0; i < 5; i++) journal.append(makeEvent());

    const result = journal.replayFrom(2);
    expect('events' in result).toBe(true);
    if ('events' in result) {
      expect(result.events.length).toBe(3);
      expect(result.events[0]!.seq).toBe(3);
      expect(result.events[1]!.seq).toBe(4);
      expect(result.events[2]!.seq).toBe(5);
    }
  });

  test('replayFrom(0) returns all events', () => {
    const journal = createEventJournal();
    for (let i = 0; i < 3; i++) journal.append(makeEvent());

    const result = journal.replayFrom(0);
    expect('events' in result).toBe(true);
    if ('events' in result) {
      expect(result.events.length).toBe(3);
      expect(result.events[0]!.seq).toBe(1);
      expect(result.events[1]!.seq).toBe(2);
      expect(result.events[2]!.seq).toBe(3);
    }
  });

  test('replayFrom returns overflow when requested seq is too old', () => {
    const journal = createEventJournal(5);
    for (let i = 0; i < 10; i++) journal.append(makeEvent());

    const result = journal.replayFrom(2);
    expect('overflow' in result).toBe(true);
    if ('overflow' in result) {
      expect(result.overflow).toBe(true);
      expect(result.oldestSeq).toBe(6);
      expect(result.currentSeq).toBe(10);
    }
  });

  test('currentSeq returns latest seq after appends', () => {
    const journal = createEventJournal();
    for (let i = 0; i < 7; i++) journal.append(makeEvent());

    expect(journal.currentSeq()).toBe(7);
  });

  test('size returns min of appended count and capacity', () => {
    const journal = createEventJournal(5);

    for (let i = 0; i < 3; i++) journal.append(makeEvent());
    expect(journal.size()).toBe(3);

    for (let i = 0; i < 5; i++) journal.append(makeEvent());
    expect(journal.size()).toBe(5);
  });

  test('ring buffer wraps correctly', () => {
    const journal = createEventJournal(3);
    for (let i = 0; i < 5; i++) journal.append(makeEvent());

    // Buffer should contain events 3, 4, 5 (oldest is 3)
    const result = journal.replayFrom(3);
    expect('events' in result).toBe(true);
    if ('events' in result) {
      expect(result.events.length).toBe(2);
      expect(result.events[0]!.seq).toBe(4);
      expect(result.events[1]!.seq).toBe(5);
    }

    // Requesting from 0 should overflow since oldest is 3
    const overflow = journal.replayFrom(0);
    expect('overflow' in overflow).toBe(true);
    if ('overflow' in overflow) {
      expect(overflow.overflow).toBe(true);
      expect(overflow.oldestSeq).toBe(3);
      expect(overflow.currentSeq).toBe(5);
    }
  });

  test('append stamps ts if not present', () => {
    const journal = createEventJournal();
    const event = makeEvent();
    const result = journal.append({ ...event, ts: '' });
    expect(result.ts).toBeTruthy();
    expect(typeof result.ts).toBe('string');
  });
});

// ─── Artifact classification tests ────────────────────────────────────────

describe('classifyArtifactType', () => {
  test('recognizes query paths', () => {
    expect(classifyArtifactType('cases/my-case/QUERIES/QRY-001.md')).toBe('query');
    expect(classifyArtifactType('QRY-20260412.md')).toBe('query');
  });

  test('recognizes receipt paths', () => {
    expect(classifyArtifactType('cases/my-case/RECEIPTS/RCT-001.md')).toBe('receipt');
    expect(classifyArtifactType('RCT-20260412.md')).toBe('receipt');
  });

  test('recognizes evidence paths', () => {
    expect(classifyArtifactType('cases/my-case/EVIDENCE/EV-001.md')).toBe('evidence');
    expect(classifyArtifactType('EVD-capture.md')).toBe('evidence');
  });

  test('recognizes finding paths', () => {
    expect(classifyArtifactType('cases/my-case/FINDINGS/FND-001.md')).toBe('finding');
    expect(classifyArtifactType('FND-lateral-movement.md')).toBe('finding');
  });

  test('recognizes hypothesis paths', () => {
    expect(classifyArtifactType('HYPOTHESES.md')).toBe('hypothesis');
    expect(classifyArtifactType('HYP-credential-abuse.md')).toBe('hypothesis');
  });

  test('recognizes manifest paths', () => {
    expect(classifyArtifactType('cases/my-case/MANIFESTS/MAN-001.md')).toBe('manifest');
    expect(classifyArtifactType('MAN-v1.md')).toBe('manifest');
  });

  test('recognizes metric paths', () => {
    expect(classifyArtifactType('cases/my-case/METRICS/MET-001.md')).toBe('metric');
    expect(classifyArtifactType('MET-coverage.md')).toBe('metric');
  });

  test('recognizes config paths', () => {
    expect(classifyArtifactType('config.json')).toBe('config');
    expect(classifyArtifactType('STATE.md')).toBe('config');
    expect(classifyArtifactType('ROADMAP.md')).toBe('config');
  });

  test('returns unknown for unrecognized paths', () => {
    expect(classifyArtifactType('random-file.txt')).toBe('unknown');
    expect(classifyArtifactType('notes/scratch.md')).toBe('unknown');
  });
});
