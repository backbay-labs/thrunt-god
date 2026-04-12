import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../services/event-bus';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('on() + emit() delivers typed event data to handler', () => {
    const received: Array<{ name: string; entityType: string; sourcePath: string }> = [];
    bus.on('entity:created', (data) => {
      received.push(data);
    });

    bus.emit('entity:created', { name: 'test-ioc', entityType: 'ioc/ip', sourcePath: 'entities/iocs/test-ioc.md' });

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      name: 'test-ioc',
      entityType: 'ioc/ip',
      sourcePath: 'entities/iocs/test-ioc.md',
    });
  });

  it('off() removes handler, subsequent emit does not call it', () => {
    let callCount = 0;
    const handler = () => { callCount++; };

    bus.on('cache:invalidated', handler);
    bus.emit('cache:invalidated');
    expect(callCount).toBe(1);

    bus.off('cache:invalidated', handler);
    bus.emit('cache:invalidated');
    expect(callCount).toBe(1);
  });

  it('emit with no handlers does not throw', () => {
    expect(() => {
      bus.emit('ingestion:complete', { created: 1, updated: 2, skipped: 3 });
    }).not.toThrow();
  });

  it('multiple handlers on same event all fire', () => {
    const calls: string[] = [];
    bus.on('entity:modified', () => { calls.push('handler1'); });
    bus.on('entity:modified', () => { calls.push('handler2'); });
    bus.on('entity:modified', () => { calls.push('handler3'); });

    bus.emit('entity:modified', { path: 'entities/iocs/test.md' });

    expect(calls).toEqual(['handler1', 'handler2', 'handler3']);
  });

  it('removeAllListeners() clears all handlers', () => {
    let calls = 0;
    bus.on('cache:invalidated', () => { calls++; });
    bus.on('entity:modified', () => { calls++; });

    bus.removeAllListeners();

    bus.emit('cache:invalidated');
    bus.emit('entity:modified', { path: 'test.md' });
    expect(calls).toBe(0);
  });

  it('void-typed events emit without data argument', () => {
    let fired = false;
    bus.on('cache:invalidated', () => {
      fired = true;
    });

    // cache:invalidated is typed as void -- emit without data
    bus.emit('cache:invalidated');
    expect(fired).toBe(true);
  });
});
