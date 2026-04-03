'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const drain = require('../thrunt-god/bin/lib/drain.cjs');

describe('reduceEvents', () => {
  test('is exported as a function', () => {
    assert.strictEqual(typeof drain.reduceEvents, 'function');
  });

  test('empty array returns base structure', () => {
    const result = drain.reduceEvents([]);
    assert.strictEqual(result.algorithm, 'drain');
    assert.strictEqual(result.cluster_count, 0);
    assert.ok(Array.isArray(result.clusters));
    assert.strictEqual(result.clusters.length, 0);
    assert.ok(typeof result.reduced_at === 'string');
    assert.ok(result.config);
  });

  test('non-array input returns base structure', () => {
    const result = drain.reduceEvents(null);
    assert.strictEqual(result.algorithm, 'drain');
    assert.strictEqual(result.cluster_count, 0);
  });

  test('clusters events by title+summary content', () => {
    const events = [
      { id: 'e1', title: 'Failed login', summary: 'user admin from 10.0.0.1' },
      { id: 'e2', title: 'Failed login', summary: 'user root from 192.168.1.1' },
      { id: 'e3', title: 'Process created', summary: 'cmd.exe /c whoami' },
    ];
    const result = drain.reduceEvents(events);
    assert.strictEqual(result.algorithm, 'drain');
    assert.ok(result.cluster_count >= 1);
    assert.ok(result.clusters.length >= 1);
    // Each cluster has required shape
    for (const cluster of result.clusters) {
      assert.ok(typeof cluster.template_id === 'string');
      assert.ok(typeof cluster.template === 'string');
      assert.ok(typeof cluster.count === 'number');
      assert.ok(cluster.sample_event_id !== undefined);
      assert.ok(Array.isArray(cluster.event_ids));
    }
  });

  test('sample_event_id is first event in cluster', () => {
    const events = [
      { id: 'first', title: 'Login attempt', summary: 'user foo from host-1' },
      { id: 'second', title: 'Login attempt', summary: 'user bar from host-2' },
    ];
    const result = drain.reduceEvents(events);
    // At least one cluster should have 'first' as sample_event_id
    const cluster = result.clusters.find(c => c.event_ids.includes('first'));
    assert.ok(cluster);
    assert.strictEqual(cluster.sample_event_id, 'first');
  });

  test('event_ids are capped at 100', () => {
    const events = Array.from({ length: 150 }, (_, i) => ({
      id: `e${i}`,
      title: 'Same event type',
      summary: 'same detail content',
    }));
    const result = drain.reduceEvents(events);
    const maxIds = Math.max(...result.clusters.map(c => c.event_ids.length));
    assert.ok(maxIds <= 100, `event_ids exceeded 100: got ${maxIds}`);
  });

  test('config contains depth, similarity_threshold, max_clusters', () => {
    const events = [
      { id: 'e1', title: 'Test', summary: 'something' },
    ];
    const result = drain.reduceEvents(events);
    assert.ok(typeof result.config.depth === 'number');
    assert.ok(typeof result.config.similarity_threshold === 'number');
    assert.ok('max_clusters' in result.config);
  });

  test('passes options through to createDrainParser', () => {
    const events = [
      { id: 'e1', title: 'Test', summary: 'something' },
    ];
    const result = drain.reduceEvents(events, { similarity_threshold: 0.8 });
    assert.strictEqual(result.config.similarity_threshold, 0.8);
  });

  test('events with no title and no summary are skipped', () => {
    const events = [
      { id: 'e1', title: null, summary: null },
      { id: 'e2', title: undefined, summary: undefined },
      { id: 'e3', title: 'Real event', summary: 'actual content' },
    ];
    const result = drain.reduceEvents(events);
    // Only e3 should be processed
    const allEventIds = result.clusters.flatMap(c => c.event_ids);
    assert.ok(!allEventIds.includes('e1'), 'e1 should be skipped');
    assert.ok(!allEventIds.includes('e2'), 'e2 should be skipped');
    assert.ok(allEventIds.includes('e3'), 'e3 should be included');
  });

  test('events with only title or only summary are included', () => {
    const events = [
      { id: 'e1', title: 'Only title', summary: null },
      { id: 'e2', title: null, summary: 'Only summary' },
    ];
    const result = drain.reduceEvents(events);
    const allEventIds = result.clusters.flatMap(c => c.event_ids);
    assert.ok(allEventIds.includes('e1'), 'e1 with only title should be included');
    assert.ok(allEventIds.includes('e2'), 'e2 with only summary should be included');
  });

  test('existing exports are preserved', () => {
    assert.strictEqual(typeof drain.createDrainParser, 'function');
    assert.strictEqual(typeof drain.DrainParser, 'function');
    assert.ok(Array.isArray(drain.DEFAULT_SECURITY_MASKS));
  });
});
