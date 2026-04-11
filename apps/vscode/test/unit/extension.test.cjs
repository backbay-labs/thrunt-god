/**
 * Unit tests for extension exports (dist/extension.js).
 *
 * Tests run against the built CJS bundle using node:test.
 * The vscode mock is loaded via --require so require('vscode') resolves.
 */
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('path');

const BUNDLE_PATH = path.join(__dirname, '..', '..', 'dist', 'extension.js');

describe('extension exports', () => {
  it('exports activate function', () => {
    const ext = require(BUNDLE_PATH);
    assert.equal(typeof ext.activate, 'function');
  });

  it('exports deactivate function', () => {
    const ext = require(BUNDLE_PATH);
    assert.equal(typeof ext.deactivate, 'function');
  });

  it('deactivate() does not throw', () => {
    const ext = require(BUNDLE_PATH);
    assert.doesNotThrow(() => ext.deactivate());
  });

  it('exports expected top-level keys', () => {
    const ext = require(BUNDLE_PATH);
    const exportedKeys = Object.keys(ext).filter(
      (k) => k !== '__esModule'
    );
    // Core extension exports
    assert.ok(exportedKeys.includes('activate'));
    assert.ok(exportedKeys.includes('deactivate'));
    // Parser exports (added in Phase 8)
    assert.ok(exportedKeys.includes('parseMission'));
    assert.ok(exportedKeys.includes('parseHypotheses'));
    assert.ok(exportedKeys.includes('parseHuntMap'));
    assert.ok(exportedKeys.includes('parseState'));
    assert.ok(exportedKeys.includes('parseEvidenceReview'));
    assert.ok(exportedKeys.includes('parsePhaseSummary'));
    assert.ok(exportedKeys.includes('extractFrontmatter'));
    assert.ok(exportedKeys.includes('extractBody'));
    assert.ok(exportedKeys.includes('extractMarkdownSections'));
  });
});

describe('CLI parsing helpers', () => {
  it('preserves literal Windows path backslashes', () => {
    const ext = require(BUNDLE_PATH);
    assert.deepEqual(
      ext.parseCliInput('runtime execute --workspace C:\\Logs\\hunt'),
      ['runtime', 'execute', '--workspace', 'C:\\Logs\\hunt']
    );
  });

  it('still supports escaped delimiters in unquoted input', () => {
    const ext = require(BUNDLE_PATH);
    assert.deepEqual(
      ext.parseCliInput('runtime execute --label incident\\ response --note \\\"quoted\\\"'),
      ['runtime', 'execute', '--label', 'incident response', '--note', '"quoted"']
    );
  });

  it('rejects phase templates that require an unset packId', () => {
    const ext = require(BUNDLE_PATH);
    assert.throws(
      () => ext.resolvePhaseCommandTemplate('runtime execute --pack {packId} --phase {phase}', {
        phase: '4',
        phaseName: 'Collect Evidence',
        phaseNameSlug: 'collect-evidence',
        packId: '',
      }),
      /defaultPackId/
    );
  });

  it('allows phase templates that do not use packId', () => {
    const ext = require(BUNDLE_PATH);
    assert.deepEqual(
      ext.resolvePhaseCommandTemplate('runtime execute --phase {phase}', {
        phase: '4',
        phaseName: 'Collect Evidence',
        phaseNameSlug: 'collect-evidence',
        packId: '',
      }),
      {
        commandString: 'runtime execute --phase 4',
        args: ['runtime', 'execute', '--phase', '4'],
      }
    );
  });
});

describe('workspace MCP registration helpers', () => {
  it('builds a stdio MCP config for Copilot', () => {
    const ext = require(BUNDLE_PATH);
    assert.deepEqual(
      ext.buildThruntWorkspaceMcpServerConfig('/usr/local/bin/node', '/tmp/server.cjs', {
        THRUNT_INTEL_DB_DIR: '/tmp/thrunt-db',
      }),
      {
        type: 'stdio',
        command: '/usr/local/bin/node',
        args: ['/tmp/server.cjs'],
        env: {
          THRUNT_INTEL_DB_DIR: '/tmp/thrunt-db',
        },
      }
    );
  });

  it('merges the THRUNT MCP server into an existing workspace config', () => {
    const ext = require(BUNDLE_PATH);
    const merged = ext.mergeWorkspaceMcpConfiguration(
      {
        inputs: [{ id: 'api-token' }],
        servers: {
          github: {
            type: 'http',
            url: 'https://api.githubcopilot.com/mcp/',
          },
        },
      },
      ext.buildThruntWorkspaceMcpServerConfig('node', '/tmp/server.cjs')
    );

    assert.deepEqual(merged.inputs, [{ id: 'api-token' }]);
    assert.deepEqual(merged.servers.github, {
      type: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
    });
    assert.deepEqual(merged.servers.thruntGod, {
      type: 'stdio',
      command: 'node',
      args: ['/tmp/server.cjs'],
    });
  });

  it('writes .vscode/mcp.json with a THRUNT server entry', () => {
    const ext = require(BUNDLE_PATH);
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'thrunt-vscode-mcp-'));

    try {
      const result = ext.upsertWorkspaceMcpConfiguration(
        tmpRoot,
        ext.buildThruntWorkspaceMcpServerConfig('node', '/tmp/server.cjs')
      );

      assert.equal(result.changed, true);
      assert.equal(
        result.configPath,
        path.join(tmpRoot, '.vscode', 'mcp.json')
      );

      const written = JSON.parse(fs.readFileSync(result.configPath, 'utf8'));
      assert.deepEqual(written, {
        servers: {
          thruntGod: {
            type: 'stdio',
            command: 'node',
            args: ['/tmp/server.cjs'],
          },
        },
      });
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
