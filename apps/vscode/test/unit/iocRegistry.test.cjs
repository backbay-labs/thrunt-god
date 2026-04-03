'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const ext = require(BUNDLE_PATH);
const vscode = require('vscode');

const FIXTURES = path.join(__dirname, '..', 'fixtures', 'brute-force-hunt');

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
}

function createMockWatcher() {
  const emitter = new vscode.EventEmitter();
  return {
    onDidChange: emitter.event,
    fire: (paths) => emitter.fire(paths),
    dispose: () => emitter.dispose(),
  };
}

function createMockOutputChannel() {
  return {
    appendLine: () => {},
    dispose: () => {},
  };
}

function populateMockFiles(huntRoot) {
  const mockFiles = vscode.workspace._mockFiles;
  mockFiles.clear();

  const artifacts = [
    'MISSION.md',
    'HYPOTHESES.md',
    'HUNTMAP.md',
    'STATE.md',
    'EVIDENCE_REVIEW.md',
    'FINDINGS.md',
    'QUERIES/QRY-20260329-001.md',
    'QUERIES/QRY-20260329-002.md',
    'QUERIES/QRY-20260329-003.md',
    'RECEIPTS/RCT-20260329-001.md',
    'RECEIPTS/RCT-20260329-002.md',
    'RECEIPTS/RCT-20260329-003.md',
    'RECEIPTS/RCT-20260329-004.md',
  ];

  for (const name of artifacts) {
    const absPath = path.join(huntRoot, name);
    const content = fixture(name);
    mockFiles.set(absPath, {
      content,
      mtime: Date.now(),
      size: Buffer.byteLength(content),
    });
  }
}

describe('IOC helpers', () => {
  it('classifies common IOC types', () => {
    assert.equal(ext.classifyIOC('198.51.100.42'), 'ipv4');
    assert.equal(ext.classifyIOC('david.park@meridian.io'), 'email');
    assert.equal(ext.classifyIOC('https://evil.example.com/login'), 'url');
    assert.equal(
      ext.classifyIOC('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
      'sha256'
    );
    assert.equal(ext.classifyIOC('meridian.io'), 'domain');
    assert.equal(ext.classifyIOC('not an ioc'), 'unknown');
  });

  it('finds case-insensitive IOC matches in text', () => {
    const matches = ext.findIOCMatchesInText(
      'User DAVID.PARK@MERIDIAN.IO signed in from 198.51.100.42',
      'david.park@meridian.io',
      'email'
    );

    assert.equal(matches.length, 1);
    assert.match(matches[0].context, /DAVID\.PARK@MERIDIAN\.IO/i);
  });
});

describe('IOCRegistry', () => {
  const huntRoot = '/mock-hunt-root';
  let mockWatcher;
  let outputChannel;
  let store;
  let registry;

  beforeEach(async () => {
    mockWatcher = createMockWatcher();
    outputChannel = createMockOutputChannel();
    populateMockFiles(huntRoot);

    store = new ext.HuntDataStore(
      vscode.Uri.file(huntRoot),
      mockWatcher,
      outputChannel
    );
    await store.initialScanComplete();
    registry = new ext.IOCRegistry(store);
  });

  afterEach(() => {
    registry?.dispose();
    store?.dispose();
    mockWatcher?.dispose();
    vscode.workspace._mockFiles.clear();
    vscode.window.visibleTextEditors = [];
  });

  it('adds an IOC and derives query and receipt matches', () => {
    const { entry, duplicate } = registry.add('david.park@meridian.io');

    assert.equal(duplicate, false);
    assert.equal(entry.type, 'email');
    assert.ok(
      entry.matchResults.some((match) => match.artifactType === 'query' && match.artifactId === 'QRY-20260329-001')
    );
    assert.ok(
      entry.matchResults.some((match) => match.artifactType === 'receipt' && match.artifactId === 'RCT-20260329-002')
    );

    const templateMatches = registry.getTemplateMatchesForQuery('QRY-20260329-001');
    const flattened = [...templateMatches.values()].flat();
    assert.ok(flattened.includes('david.park@meridian.io'));
  });

  it('deduplicates IOC values by normalized form', () => {
    const first = registry.add('DAVID.PARK@MERIDIAN.IO');
    const second = registry.add('david.park@meridian.io');

    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(registry.list().length, 1);
  });

  it('applies editor decorations for matching IOC values', () => {
    registry.add('198.51.100.42');

    const editor = {
      document: {
        uri: vscode.Uri.file('/mock-hunt-root/QUERIES/QRY-20260329-001.md'),
        getText: () => fixture('QUERIES/QRY-20260329-001.md'),
      },
      setDecorations: (_decorationType, decorations) => {
        editor.decorations = decorations;
      },
      decorations: [],
    };
    vscode.window.visibleTextEditors = [editor];

    const manager = new ext.IOCDecorationManager(registry);
    manager.applyAll();

    assert.ok(editor.decorations.length > 0);
    assert.match(
      editor.decorations[0].hoverMessage.value,
      /IOC: 198\.51\.100\.42/
    );

    manager.dispose();
  });
});
