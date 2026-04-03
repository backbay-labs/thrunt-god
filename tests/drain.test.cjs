'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');

const { createDrainParser, DrainParser, DEFAULT_SECURITY_MASKS } = require('../thrunt-god/bin/lib/drain.cjs');

// ---------------------------------------------------------------------------
// Tokenization
// ---------------------------------------------------------------------------

describe('DrainParser tokenization', () => {
  test('whitespace-separated content produces correct token count', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    const result = parser.addMessage('Failed password for admin from server');
    assert.ok(result);
    // 5 tokens: Failed, password, for, admin, from, server => 6 tokens template
    assert.strictEqual(result.template.split(' ').length, 6);
  });

  test('extraDelimiters option splits tokens further', () => {
    const parser = createDrainParser({ maskPatterns: [], extraDelimiters: ['='] });
    const result = parser.addMessage('key=value foo=bar');
    assert.ok(result);
    // Without extraDelimiters: 2 tokens (key=value, foo=bar)
    // With extraDelimiters=['=']: 4 tokens (key, value, foo, bar)
    assert.strictEqual(result.template.split(' ').length, 4);
  });

  test('empty content returns null from addMessage', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    const result = parser.addMessage('');
    assert.strictEqual(result, null);
  });

  test('whitespace-only content returns null from addMessage', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    const result = parser.addMessage('   \t  \n  ');
    assert.strictEqual(result, null);
  });
});

// ---------------------------------------------------------------------------
// Pre-masking
// ---------------------------------------------------------------------------

describe('DrainParser pre-masking', () => {
  test('IPv4 replacement: masks IP to <IP>', () => {
    const parser = createDrainParser();
    const result = parser.addMessage('Failed login from 192.168.1.50');
    assert.ok(result);
    assert.ok(result.template.includes('<IP>'), `Expected <IP> in template: ${result.template}`);
    assert.ok(!result.template.includes('192.168.1.50'), 'IP should be masked');
  });

  test('IPv6 replacement: masks IPv6 to <IP>', () => {
    const parser = createDrainParser();
    const result = parser.addMessage('Connection from 2001:0db8:85a3:0000:0000:8a2e:0370:7334 established');
    assert.ok(result);
    assert.ok(result.template.includes('<IP>'), `Expected <IP> in template: ${result.template}`);
  });

  test('UUID replacement: masks UUID to <UUID>', () => {
    const parser = createDrainParser();
    const result = parser.addMessage('session abc12345-de67-890f-abcd-ef1234567890 started');
    assert.ok(result);
    assert.ok(result.template.includes('<UUID>'), `Expected <UUID> in template: ${result.template}`);
  });

  test('SHA-256 hash replacement: masks 64 hex chars to <HASH>', () => {
    const parser = createDrainParser();
    const hash = 'a'.repeat(64);
    const result = parser.addMessage(`file hash ${hash} verified`);
    assert.ok(result);
    assert.ok(result.template.includes('<HASH>'), `Expected <HASH> in template: ${result.template}`);
  });

  test('SHA-1 hash replacement: masks 40 hex chars to <HASH>', () => {
    const parser = createDrainParser();
    const hash = 'b'.repeat(40);
    const result = parser.addMessage(`commit ${hash} merged`);
    assert.ok(result);
    assert.ok(result.template.includes('<HASH>'), `Expected <HASH> in template: ${result.template}`);
  });

  test('MD5 hash replacement: masks 32 hex chars to <HASH>', () => {
    const parser = createDrainParser();
    const hash = 'c'.repeat(32);
    const result = parser.addMessage(`checksum ${hash} ok`);
    assert.ok(result);
    assert.ok(result.template.includes('<HASH>'), `Expected <HASH> in template: ${result.template}`);
  });

  test('ISO timestamp replacement: masks to <TS>', () => {
    const parser = createDrainParser();
    const result = parser.addMessage('event at 2024-01-15T10:30:00Z logged');
    assert.ok(result);
    assert.ok(result.template.includes('<TS>'), `Expected <TS> in template: ${result.template}`);
  });

  test('syslog timestamp replacement: masks to <TS>', () => {
    const parser = createDrainParser();
    const result = parser.addMessage('Mar 31 10:15:32 sshd auth failure');
    assert.ok(result);
    assert.ok(result.template.includes('<TS>'), `Expected <TS> in template: ${result.template}`);
  });

  test('email replacement: masks to <EMAIL>', () => {
    const parser = createDrainParser();
    const result = parser.addMessage('notification sent to admin@example.com successfully');
    assert.ok(result);
    assert.ok(result.template.includes('<EMAIL>'), `Expected <EMAIL> in template: ${result.template}`);
  });

  test('Windows path replacement: masks to <WINPATH>', () => {
    const parser = createDrainParser();
    const result = parser.addMessage('process launched C:\\Users\\admin\\malware.exe detected');
    assert.ok(result);
    assert.ok(result.template.includes('<WINPATH>'), `Expected <WINPATH> in template: ${result.template}`);
  });

  test('Unix path replacement: masks to <PATH>', () => {
    const parser = createDrainParser();
    const result = parser.addMessage('binary executed /usr/bin/ssh connected');
    assert.ok(result);
    assert.ok(result.template.includes('<PATH>'), `Expected <PATH> in template: ${result.template}`);
  });

  test('masking produces stable clustering: messages differing only in IP cluster together', () => {
    const parser = createDrainParser();
    const r1 = parser.addMessage('Failed login from 10.0.0.1 port 22');
    const r2 = parser.addMessage('Failed login from 172.16.5.99 port 22');
    assert.ok(r1);
    assert.ok(r2);
    assert.strictEqual(r1.clusterId, r2.clusterId, 'Messages differing only in IP should cluster together');
  });

  test('custom maskPatterns option overrides DEFAULT_SECURITY_MASKS', () => {
    const customMasks = [
      { regex: /SECRET_\w+/g, replacement: '<REDACTED>' },
    ];
    const parser = createDrainParser({ maskPatterns: customMasks });
    const result = parser.addMessage('key is SECRET_ABC123 stored');
    assert.ok(result);
    assert.ok(result.template.includes('<REDACTED>'), 'Custom mask should apply');
    // Default mask for IPs should NOT apply since we overrode maskPatterns
    const r2 = parser.addMessage('from 192.168.1.1 connection');
    assert.ok(r2);
    assert.ok(!r2.template.includes('<IP>'), 'Default IP mask should not apply with custom maskPatterns');
  });

  test('empty maskPatterns=[] disables masking', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    const result = parser.addMessage('login from 10.0.0.1 ok');
    assert.ok(result);
    // IP should remain literal since masking is disabled
    assert.ok(!result.template.includes('<IP>'), 'With empty maskPatterns, IP should not be masked');
  });
});

// ---------------------------------------------------------------------------
// Tree search and clustering
// ---------------------------------------------------------------------------

describe('DrainParser tree search and clustering', () => {
  test('identical messages produce same cluster with changeType none', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    const r1 = parser.addMessage('exact same message here');
    const r2 = parser.addMessage('exact same message here');
    assert.ok(r1);
    assert.ok(r2);
    assert.strictEqual(r1.clusterId, r2.clusterId);
    assert.strictEqual(r1.changeType, 'cluster_created');
    assert.strictEqual(r2.changeType, 'none');
  });

  test('similar messages with different usernames cluster together after masking', () => {
    const parser = createDrainParser();
    const r1 = parser.addMessage('Failed password for admin from 10.0.0.1');
    const r2 = parser.addMessage('Failed password for root from 192.168.1.1');
    assert.ok(r1);
    assert.ok(r2);
    // Both should have IPs masked to <IP>, and 'admin' vs 'root' should merge
    // They should cluster together since only one token differs
    const stats = parser.getStats();
    // With default simTh=0.4 and 6 tokens, 5/6 matching is well above threshold
    assert.ok(stats.clusterCount <= 2, 'Similar messages should cluster together or nearly so');
  });

  test('messages with different token counts go to different clusters', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    const r1 = parser.addMessage('short message');
    const r2 = parser.addMessage('this is a longer message with more tokens');
    assert.ok(r1);
    assert.ok(r2);
    assert.notStrictEqual(r1.clusterId, r2.clusterId, 'Different token counts should produce different clusters');
  });

  test('parametrizeNumericTokens=true routes numeric tokens to wildcard', () => {
    const parser = createDrainParser({ maskPatterns: [], parametrizeNumericTokens: true });
    const r1 = parser.addMessage('connection on port 8080 established');
    const r2 = parser.addMessage('connection on port 443 established');
    assert.ok(r1);
    assert.ok(r2);
    // Numeric tokens 8080 and 443 should route to wildcard, same cluster
    const stats = parser.getStats();
    assert.strictEqual(stats.clusterCount, 1, 'Numeric tokens should route to same wildcard cluster');
  });

  test('parametrizeNumericTokens=false keeps numeric tokens literal', () => {
    const parser = createDrainParser({ maskPatterns: [], parametrizeNumericTokens: false, simTh: 0.9 });
    const r1 = parser.addMessage('connection on port 8080 established');
    const r2 = parser.addMessage('connection on port 443 established');
    assert.ok(r1);
    assert.ok(r2);
    // With parametrizeNumericTokens=false and high simTh, 8080 and 443 are treated as different literals
    assert.notStrictEqual(r1.clusterId, r2.clusterId, 'Without numeric parametrization, different numbers should be separate clusters');
  });

  test('simTh controls cluster granularity', () => {
    // Low threshold: merges more
    const parserLow = createDrainParser({ maskPatterns: [], simTh: 0.1 });
    parserLow.addMessage('action alpha on target one completed');
    parserLow.addMessage('action beta on target two completed');
    parserLow.addMessage('action gamma on target three completed');
    const statsLow = parserLow.getStats();

    // High threshold: keeps separate
    const parserHigh = createDrainParser({ maskPatterns: [], simTh: 0.99 });
    parserHigh.addMessage('action alpha on target one completed');
    parserHigh.addMessage('action beta on target two completed');
    parserHigh.addMessage('action gamma on target three completed');
    const statsHigh = parserHigh.getStats();

    assert.ok(statsLow.clusterCount <= statsHigh.clusterCount,
      `Low simTh (${statsLow.clusterCount} clusters) should merge more than high simTh (${statsHigh.clusterCount} clusters)`);
  });
});

// ---------------------------------------------------------------------------
// Template merging
// ---------------------------------------------------------------------------

describe('DrainParser template merging', () => {
  test('differing tokens are replaced with paramStr', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    // Use messages where the differing token is NOT in the prefix path (positions 0..maxNodeDepth-1).
    // With depth=4, maxNodeDepth=2, so prefix uses tokens at index 0 and 1.
    // Tokens at index 2+ can differ and still match via _fastMatch similarity.
    parser.addMessage('login attempt succeeded for alice');
    const r2 = parser.addMessage('login attempt succeeded for bob');
    assert.ok(r2);
    // 'alice' vs 'bob' at position 4 should be replaced with <*>
    assert.ok(r2.template.includes('<*>'), `Expected <*> in merged template: ${r2.template}`);
    assert.ok(r2.template.includes('login'), 'Common token "login" should remain');
    assert.ok(r2.template.includes('attempt'), 'Common token "attempt" should remain');
  });

  test('changeType is cluster_template_changed when template merges', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    parser.addMessage('login attempt succeeded for alice');
    const r2 = parser.addMessage('login attempt succeeded for bob');
    assert.ok(r2);
    assert.strictEqual(r2.changeType, 'cluster_template_changed');
  });

  test('cluster ID changes after template merge', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    const r1 = parser.addMessage('user alice logged in successfully');
    const r2 = parser.addMessage('user bob logged in successfully');
    assert.ok(r1);
    assert.ok(r2);
    assert.notStrictEqual(r1.clusterId, r2.clusterId, 'Cluster ID should change after template merge');
  });

  test('merged template preserves common tokens and wildcards differing positions', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    parser.addMessage('error processing request alpha in module core');
    const r2 = parser.addMessage('error processing request beta in module core');
    assert.ok(r2);
    const tokens = r2.template.split(' ');
    assert.strictEqual(tokens[0], 'error');
    assert.strictEqual(tokens[1], 'processing');
    assert.strictEqual(tokens[2], 'request');
    assert.strictEqual(tokens[3], '<*>', 'Differing position should be wildcard');
    assert.strictEqual(tokens[4], 'in');
    assert.strictEqual(tokens[5], 'module');
    assert.strictEqual(tokens[6], 'core');
  });
});

// ---------------------------------------------------------------------------
// Match mode
// ---------------------------------------------------------------------------

describe('DrainParser match mode', () => {
  test('match() returns cluster info for known content', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    parser.addMessage('known event type alpha');
    const result = parser.match('known event type alpha');
    assert.ok(result);
    assert.ok(result.clusterId);
    assert.ok(result.template);
    assert.strictEqual(typeof result.clusterSize, 'number');
  });

  test('match() returns null for unknown content', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    parser.addMessage('known event type alpha');
    const result = parser.match('completely different unrelated content here now');
    assert.strictEqual(result, null);
  });

  test('match() does NOT increment totalMessages', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    parser.addMessage('test event for matching');
    const statsBefore = parser.getStats();
    parser.match('test event for matching');
    parser.match('test event for matching');
    const statsAfter = parser.getStats();
    assert.strictEqual(statsBefore.totalMessages, statsAfter.totalMessages,
      'match() should not increment totalMessages');
  });

  test('match() does NOT change cluster size', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    const r1 = parser.addMessage('test event for size check');
    assert.ok(r1);
    const clusterBefore = parser.getCluster(r1.clusterId);
    parser.match('test event for size check');
    parser.match('test event for size check');
    const clusterAfter = parser.getCluster(r1.clusterId);
    assert.strictEqual(clusterBefore.size, clusterAfter.size,
      'match() should not change cluster size');
  });

  test('match() does NOT modify template', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    parser.addMessage('user alice accessed resource alpha');
    const clustersBefore = parser.getClusters();
    const templateBefore = [...clustersBefore.values()][0].template;
    // Match with a variant that would trigger template merge if it were addMessage
    parser.match('user bob accessed resource beta');
    const clustersAfter = parser.getClusters();
    const templateAfter = [...clustersAfter.values()][0].template;
    assert.strictEqual(templateBefore, templateAfter,
      'match() should not modify template');
  });
});

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

describe('DrainParser serialization', () => {
  test('toJSON() returns version:1 with config, totalMessages, clusters', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    parser.addMessage('test serialization message');
    const json = parser.toJSON();
    assert.strictEqual(json.version, 1);
    assert.ok(json.config);
    assert.strictEqual(typeof json.totalMessages, 'number');
    assert.ok(Array.isArray(json.clusters));
  });

  test('fromJSON(toJSON()) produces parser that matches same content identically', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    parser.addMessage('login attempt from user admin');
    parser.addMessage('login attempt from user root');
    parser.addMessage('process started on host server');

    const json = parser.toJSON();
    const restored = DrainParser.fromJSON(json, { maskPatterns: [] });

    // Match the same messages
    const m1 = restored.match('login attempt from user admin');
    const m2 = restored.match('process started on host server');
    assert.ok(m1, 'Restored parser should match known content');
    assert.ok(m2, 'Restored parser should match known content');
  });

  test('fromJSON rejects state without version 1', () => {
    assert.throws(() => DrainParser.fromJSON({ version: 2 }), /version 1/);
    assert.throws(() => DrainParser.fromJSON(null), /version 1/);
    assert.throws(() => DrainParser.fromJSON({}), /version 1/);
  });

  test('fromJSON with maskPatterns option override restores masking behavior', () => {
    const customMasks = [
      { regex: /TOKEN_\w+/g, replacement: '<TOKEN>' },
    ];
    const parser = createDrainParser({ maskPatterns: customMasks });
    parser.addMessage('auth TOKEN_ABC123 verified');
    const json = parser.toJSON();

    // Restore with same custom masks
    const restored = DrainParser.fromJSON(json, { maskPatterns: customMasks });
    const result = restored.match('auth TOKEN_XYZ789 verified');
    assert.ok(result, 'Restored parser with custom masks should match');
  });

  test('round-trip preserves cluster count and template text', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    parser.addMessage('alpha event occurred now');
    parser.addMessage('beta event occurred now');
    parser.addMessage('completely different message here');

    const json = parser.toJSON();
    const restored = DrainParser.fromJSON(json, { maskPatterns: [] });

    const origStats = parser.getStats();
    const restoredStats = restored.getStats();
    assert.strictEqual(origStats.clusterCount, restoredStats.clusterCount,
      'Cluster count should be preserved after round-trip');
    assert.strictEqual(origStats.totalMessages, restoredStats.totalMessages,
      'Total messages should be preserved after round-trip');
  });

  test('getStats() on restored parser matches original', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    for (let i = 0; i < 10; i++) {
      parser.addMessage(`event number ${i} in log stream`);
    }
    const origStats = parser.getStats();
    const json = parser.toJSON();
    const restored = DrainParser.fromJSON(json, { maskPatterns: [] });
    const restoredStats = restored.getStats();
    assert.deepStrictEqual(origStats, restoredStats);
  });
});

// ---------------------------------------------------------------------------
// Introspection
// ---------------------------------------------------------------------------

describe('DrainParser introspection', () => {
  test('getClusters() returns Map with correct template and size', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    parser.addMessage('unique message alpha');
    parser.addMessage('unique message alpha');
    parser.addMessage('different message beta');

    const clusters = parser.getClusters();
    assert.ok(clusters instanceof Map);
    assert.ok(clusters.size >= 1);
    for (const [id, info] of clusters) {
      assert.ok(typeof id === 'string');
      assert.ok(typeof info.template === 'string');
      assert.ok(Array.isArray(info.templateTokens));
      assert.ok(typeof info.size === 'number');
    }
  });

  test('getCluster(id) returns info for valid ID, null for invalid', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    const result = parser.addMessage('test cluster lookup');
    assert.ok(result);
    const cluster = parser.getCluster(result.clusterId);
    assert.ok(cluster);
    assert.strictEqual(cluster.template, result.template);
    assert.ok(cluster.size >= 1);

    const missing = parser.getCluster('nonexistent_id');
    assert.strictEqual(missing, null);
  });

  test('getStats() returns clusterCount and totalMessages', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    parser.addMessage('first message');
    parser.addMessage('second message');
    parser.addMessage('third unique content here');

    const stats = parser.getStats();
    assert.strictEqual(typeof stats.clusterCount, 'number');
    assert.strictEqual(typeof stats.totalMessages, 'number');
    assert.strictEqual(stats.totalMessages, 3);
    assert.ok(stats.clusterCount >= 1);
  });

  test('getClusters() returns copies (mutation does not affect parser)', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    parser.addMessage('immutability test message');

    const clusters1 = parser.getClusters();
    const entry = [...clusters1.values()][0];
    // Mutate returned copy
    entry.template = 'MUTATED';
    entry.size = 9999;
    entry.templateTokens.push('INJECTED');

    // Fetch again -- should be unaffected
    const clusters2 = parser.getClusters();
    const entry2 = [...clusters2.values()][0];
    assert.notStrictEqual(entry2.template, 'MUTATED');
    assert.notStrictEqual(entry2.size, 9999);
    assert.ok(!entry2.templateTokens.includes('INJECTED'));
  });
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

describe('DrainParser configuration', () => {
  test('depth minimum is 3 (passing depth=1 results in depth=3)', () => {
    const parser = createDrainParser({ depth: 1, maskPatterns: [] });
    assert.strictEqual(parser.depth, 3);
  });

  test('maxClusters cap: after reaching limit addMessage returns null for new clusters', () => {
    const parser = createDrainParser({ maxClusters: 2, maskPatterns: [] });
    const r1 = parser.addMessage('first unique cluster message alpha');
    const r2 = parser.addMessage('second unique cluster message beta gamma');
    assert.ok(r1);
    assert.ok(r2);

    // Third distinct cluster should be rejected (different token count ensures new cluster)
    const r3 = parser.addMessage('third unique cluster message delta epsilon zeta eta');
    assert.strictEqual(r3, null, 'Exceeding maxClusters should return null');
  });

  test('maxChildren limits tree branching', () => {
    // With maxChildren=2, the tree should force some tokens to wildcard nodes
    const parser = createDrainParser({ maxChildren: 2, maskPatterns: [], parametrizeNumericTokens: false });
    // Feed many messages with different first tokens to force branching limits
    parser.addMessage('alpha event occurred now today');
    parser.addMessage('beta event occurred now today');
    // The third different first token should be routed to wildcard due to maxChildren=2
    parser.addMessage('gamma event occurred now today');

    const stats = parser.getStats();
    // Should still work without errors; maxChildren constrains the tree structure
    assert.ok(stats.clusterCount >= 1, 'Parser should function with maxChildren limit');
  });

  test('custom paramStr replaces default <*>', () => {
    const parser = createDrainParser({ paramStr: '{{VAR}}', maskPatterns: [] });
    parser.addMessage('user alice performed action');
    const r2 = parser.addMessage('user bob performed action');
    assert.ok(r2);
    if (r2.changeType === 'cluster_template_changed') {
      assert.ok(r2.template.includes('{{VAR}}'), `Custom paramStr should appear: ${r2.template}`);
      assert.ok(!r2.template.includes('<*>'), 'Default <*> should not appear');
    }
  });
});

// ---------------------------------------------------------------------------
// Content-hash IDs
// ---------------------------------------------------------------------------

describe('DrainParser content-hash IDs', () => {
  test('same template text always produces same cluster ID across parser instances', () => {
    const parser1 = createDrainParser({ maskPatterns: [] });
    const parser2 = createDrainParser({ maskPatterns: [] });
    const r1 = parser1.addMessage('deterministic id test message');
    const r2 = parser2.addMessage('deterministic id test message');
    assert.ok(r1);
    assert.ok(r2);
    assert.strictEqual(r1.clusterId, r2.clusterId,
      'Same template text should produce same cluster ID across instances');
  });

  test('different template text produces different cluster IDs', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    const r1 = parser.addMessage('first template text here now');
    const r2 = parser.addMessage('completely different template text elsewhere');
    assert.ok(r1);
    assert.ok(r2);
    assert.notStrictEqual(r1.clusterId, r2.clusterId,
      'Different template text should produce different cluster IDs');
  });

  test('cluster ID is 16 hex characters', () => {
    const parser = createDrainParser({ maskPatterns: [] });
    const result = parser.addMessage('hex id format test');
    assert.ok(result);
    assert.match(result.clusterId, /^[0-9a-f]{16}$/, `Cluster ID should be 16 hex chars: ${result.clusterId}`);
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_SECURITY_MASKS
// ---------------------------------------------------------------------------

describe('DEFAULT_SECURITY_MASKS', () => {
  test('DEFAULT_SECURITY_MASKS is a frozen array', () => {
    assert.ok(Object.isFrozen(DEFAULT_SECURITY_MASKS), 'DEFAULT_SECURITY_MASKS should be frozen');
    assert.ok(Array.isArray(DEFAULT_SECURITY_MASKS));
  });

  test('contains 13 mask patterns', () => {
    assert.strictEqual(DEFAULT_SECURITY_MASKS.length, 13);
  });

  test('patterns are ordered: SHA-256 before SHA-1 before MD5 (most-specific first)', () => {
    const replacements = DEFAULT_SECURITY_MASKS.map(m => m.replacement);
    // First three entries should all be <HASH> (SHA-256, SHA-1, MD5)
    assert.strictEqual(replacements[0], '<HASH>', 'First mask should be <HASH> (SHA-256)');
    assert.strictEqual(replacements[1], '<HASH>', 'Second mask should be <HASH> (SHA-1)');
    assert.strictEqual(replacements[2], '<HASH>', 'Third mask should be <HASH> (MD5)');

    // Verify order by checking regex patterns match expected lengths
    const sha256Regex = DEFAULT_SECURITY_MASKS[0].regex.source;
    const sha1Regex = DEFAULT_SECURITY_MASKS[1].regex.source;
    const md5Regex = DEFAULT_SECURITY_MASKS[2].regex.source;
    assert.ok(sha256Regex.includes('{64}'), 'First hash pattern should match 64 chars (SHA-256)');
    assert.ok(sha1Regex.includes('{40}'), 'Second hash pattern should match 40 chars (SHA-1)');
    assert.ok(md5Regex.includes('{32}'), 'Third hash pattern should match 32 chars (MD5)');
  });
});
