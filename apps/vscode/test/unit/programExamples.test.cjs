'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');
const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const EXAMPLES_ROOT = path.join(REPO_ROOT, 'thrunt-god', 'examples');
const ext = require(BUNDLE_PATH);
const deriveEvidenceBoard = ext.HuntDataStore.prototype.deriveEvidenceBoard;

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function loadQueries(programRoot) {
  const queriesDir = path.join(programRoot, 'QUERIES');
  return new Map(
    fs.readdirSync(queriesDir)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .map((name) => {
        const parsed = ext.parseQuery(readFile(path.join(queriesDir, name)));
        const queryId = path.basename(name, '.md');
        return [queryId, parsed];
      })
  );
}

function loadReceipts(programRoot) {
  const receiptsDir = path.join(programRoot, 'RECEIPTS');
  return new Map(
    fs.readdirSync(receiptsDir)
      .filter((name) => name.endsWith('.md'))
      .sort()
      .map((name) => {
        const parsed = ext.parseReceipt(readFile(path.join(receiptsDir, name)));
        const receiptId = path.basename(name, '.md');
        return [receiptId, parsed];
      })
  );
}

function buildProgramEvidenceBoard(exampleSlug) {
  const programRoot = path.join(EXAMPLES_ROOT, exampleSlug, '.planning');
  const hypotheses = ext.parseHypotheses(readFile(path.join(programRoot, 'HYPOTHESES.md')));
  const mission = ext.parseMission(readFile(path.join(programRoot, 'MISSION.md')));
  const huntMap = ext.parseHuntMap(readFile(path.join(programRoot, 'HUNTMAP.md')));
  const state = ext.parseState(readFile(path.join(programRoot, 'STATE.md')));
  const evidenceReview = ext.parseEvidenceReview(
    readFile(path.join(programRoot, 'EVIDENCE_REVIEW.md'))
  );
  const queries = loadQueries(programRoot);
  const receipts = loadReceipts(programRoot);

  const hunt = {
    mission,
    hypotheses,
    huntMap,
    state,
  };

  const store = {
    getHunt: () => hunt,
    getQueries: () => queries,
    getReceipts: () => receipts,
    getEvidenceReview: () => evidenceReview,
  };

  return {
    mission,
    hypotheses,
    huntMap,
    state,
    evidenceReview,
    queries,
    receipts,
    viewModel: deriveEvidenceBoard.call(store),
  };
}

describe('program examples', () => {
  it('builds a non-empty evidence board for brute-force-to-persistence', () => {
    const snapshot = buildProgramEvidenceBoard('brute-force-to-persistence');

    assert.equal(snapshot.mission.status, 'loaded');
    assert.equal(snapshot.hypotheses.status, 'loaded');
    assert.equal(snapshot.huntMap.status, 'loaded');
    assert.equal(snapshot.state.status, 'loaded');
    assert.equal(snapshot.evidenceReview.status, 'loaded');
    assert.equal(snapshot.queries.size, 3);
    assert.equal(snapshot.receipts.size, 3);

    const nodeTypes = snapshot.viewModel.nodes.reduce((acc, node) => {
      acc[node.type] = (acc[node.type] ?? 0) + 1;
      return acc;
    }, {});

    assert.equal(nodeTypes.hypothesis, 3);
    assert.equal(nodeTypes.query, 3);
    assert.equal(nodeTypes.receipt, 3);
    assert.ok(snapshot.viewModel.edges.length >= 6);
    assert.ok(snapshot.viewModel.matrixCells.length >= 9);
    assert.ok(snapshot.viewModel.blindSpots.length > 0);
  });

  it('builds a non-empty evidence board for oauth-session-hijack', () => {
    const snapshot = buildProgramEvidenceBoard('oauth-session-hijack');

    assert.equal(snapshot.mission.status, 'loaded');
    assert.equal(snapshot.hypotheses.status, 'loaded');
    assert.equal(snapshot.huntMap.status, 'loaded');
    assert.equal(snapshot.state.status, 'loaded');
    assert.equal(snapshot.evidenceReview.status, 'loaded');
    assert.equal(snapshot.queries.size, 3);
    assert.equal(snapshot.receipts.size, 3);

    const nodeTypes = snapshot.viewModel.nodes.reduce((acc, node) => {
      acc[node.type] = (acc[node.type] ?? 0) + 1;
      return acc;
    }, {});

    assert.equal(nodeTypes.hypothesis, 3);
    assert.equal(nodeTypes.query, 3);
    assert.equal(nodeTypes.receipt, 3);
    assert.ok(snapshot.viewModel.edges.length >= 6);
    assert.ok(snapshot.viewModel.matrixCells.length >= 9);
    assert.ok(snapshot.viewModel.blindSpots.length > 0);
  });

  it('parses supported hypotheses in the oauth child case example', () => {
    const childHypothesesPath = path.join(
      EXAMPLES_ROOT,
      'oauth-session-hijack',
      '.planning',
      'cases',
      'oauth-session-hijack',
      'HYPOTHESES.md'
    );
    const parsed = ext.parseHypotheses(readFile(childHypothesesPath));

    assert.equal(parsed.status, 'loaded');
    assert.deepEqual(
      parsed.data.active.map((hypothesis) => hypothesis.id),
      ['HYP-01', 'HYP-02']
    );
    assert.deepEqual(
      parsed.data.disproved.map((hypothesis) => hypothesis.id),
      ['HYP-03']
    );
  });
});
