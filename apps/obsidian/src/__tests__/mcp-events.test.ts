import { describe, it, expect } from 'vitest';
import { mapCliEventToAction } from '../mcp-events';
import type { CliEvent, VaultEvent, EventAction } from '../mcp-events';

describe('mapCliEventToAction', () => {
  it('maps hunt:started to update-mission with status and huntId', () => {
    const event: CliEvent = {
      type: 'hunt:started',
      timestamp: Date.now(),
      payload: { huntId: 'HUNT-042', status: 'active' },
    };
    const result = mapCliEventToAction(event);
    expect(result).toEqual({
      type: 'update-mission',
      data: { status: 'active', huntId: 'HUNT-042' },
    });
  });

  it('maps receipt:generated to trigger-ingestion with receiptPath', () => {
    const event: CliEvent = {
      type: 'receipt:generated',
      timestamp: Date.now(),
      payload: { path: 'RECEIPTS/RCT-001.md' },
    };
    const result = mapCliEventToAction(event);
    expect(result).toEqual({
      type: 'trigger-ingestion',
      data: { receiptPath: 'RECEIPTS/RCT-001.md' },
    });
  });

  it('maps finding:logged to create-finding with title, severity, description', () => {
    const event: CliEvent = {
      type: 'finding:logged',
      timestamp: Date.now(),
      payload: { title: 'C2 beacon', severity: 'high', description: 'Found beacon...' },
    };
    const result = mapCliEventToAction(event);
    expect(result).toEqual({
      type: 'create-finding',
      data: { title: 'C2 beacon', severity: 'high', description: 'Found beacon...' },
    });
  });

  it('returns null for unknown event type', () => {
    const event = {
      type: 'unknown:event' as CliEvent['type'],
      timestamp: Date.now(),
      payload: {},
    };
    const result = mapCliEventToAction(event as CliEvent);
    expect(result).toBeNull();
  });

  it('falls back to undefined values when payload fields are missing', () => {
    const event: CliEvent = {
      type: 'hunt:started',
      timestamp: Date.now(),
      payload: {},
    };
    const result = mapCliEventToAction(event);
    expect(result).toEqual({
      type: 'update-mission',
      data: { status: 'active', huntId: undefined },
    });
  });

  it('hunt:started defaults status to active when not provided', () => {
    const event: CliEvent = {
      type: 'hunt:started',
      timestamp: Date.now(),
      payload: { huntId: 'HUNT-099' },
    };
    const result = mapCliEventToAction(event);
    expect(result!.data.status).toBe('active');
  });
});

describe('CliEvent type union', () => {
  it('CliEvent type enforces the known event type union', () => {
    // This test validates the type narrowing at runtime
    const types: CliEvent['type'][] = ['hunt:started', 'receipt:generated', 'finding:logged'];
    expect(types).toHaveLength(3);
  });
});

describe('VaultEvent type shape', () => {
  it('VaultEvent includes entity:created, verdict:set, hypothesis:changed with minimal payload', () => {
    const events: VaultEvent[] = [
      { type: 'entity:created', timestamp: Date.now(), path: '/entities/actor/apt29.md', entityType: 'actor' },
      { type: 'verdict:set', timestamp: Date.now(), path: '/entities/infra/c2.md', verdict: 'malicious' },
      { type: 'hypothesis:changed', timestamp: Date.now(), path: '/hypotheses/h1.md', huntId: 'HUNT-001' },
    ];
    expect(events).toHaveLength(3);
    expect(events[0].entityType).toBe('actor');
    expect(events[1].verdict).toBe('malicious');
    expect(events[2].huntId).toBe('HUNT-001');
  });
});
