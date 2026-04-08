'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// ── Helpers ────────────────────────────────────────────────────────────────

function makeTempDir() {
  const dir = path.join(os.tmpdir(), `thrunt-prompts-test-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Lazy-load modules
let prompts, intel;
function loadPrompts() {
  if (!prompts) prompts = require('../mcp-hunt-intel/lib/prompts.cjs');
  return prompts;
}
function loadIntel() {
  if (!intel) intel = require('../mcp-hunt-intel/lib/intel.cjs');
  return intel;
}

// ── MCP Prompt Tests ──────────────────────────────────────────────────────

describe('prompts.cjs - PROMPT_DEFS', () => {
  it('defines exactly 4 prompt entries', () => {
    const { PROMPT_DEFS } = loadPrompts();
    const names = Object.keys(PROMPT_DEFS);
    assert.equal(names.length, 4);
    assert.ok(names.includes('ransomware-readiness'));
    assert.ok(names.includes('apt-emulation'));
    assert.ok(names.includes('detection-sprint'));
    assert.ok(names.includes('soc-investigation'));
  });
});

describe('prompts.cjs - registerPrompts', () => {
  it('registers exactly 4 prompts on a server instance', () => {
    const { registerPrompts } = loadPrompts();
    const registered = [];
    const fakeServer = {
      prompt: (name, _desc, ...rest) => {
        registered.push(name);
      },
    };
    const fakeDb = {};
    registerPrompts(fakeServer, fakeDb);
    assert.equal(registered.length, 4);
    assert.ok(registered.includes('ransomware-readiness'));
    assert.ok(registered.includes('apt-emulation'));
    assert.ok(registered.includes('detection-sprint'));
    assert.ok(registered.includes('soc-investigation'));
  });
});

describe('prompts.cjs - buildPromptContent', () => {
  let db, tmpDir;

  before(() => {
    tmpDir = makeTempDir();
    const { openIntelDb } = loadIntel();
    db = openIntelDb({ dbDir: tmpDir });
  });

  after(() => {
    if (db) db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('ransomware-readiness includes T1486 and expected sections', () => {
    const { buildPromptContent, PROMPT_DEFS } = loadPrompts();
    const content = buildPromptContent(db, PROMPT_DEFS['ransomware-readiness']);

    assert.ok(content.includes('T1486'), 'Should include T1486 (Data Encrypted for Impact)');
    assert.ok(content.includes('Coverage Summary'), 'Should include Coverage Summary section');
    assert.ok(content.includes('Technique Details'), 'Should include Technique Details section');
    assert.ok(content.includes('Suggested Approach'), 'Should include Suggested Approach section');
    assert.ok(content.includes('Threat Profiles'), 'Should include Threat Profiles section');
  });

  it('apt-emulation includes T1566 and expected sections', () => {
    const { buildPromptContent, PROMPT_DEFS } = loadPrompts();
    const content = buildPromptContent(db, PROMPT_DEFS['apt-emulation']);

    assert.ok(content.includes('T1566'), 'Should include T1566 (Phishing)');
    assert.ok(content.includes('Coverage Summary'), 'Should include Coverage Summary section');
    assert.ok(content.includes('Technique Details'), 'Should include Technique Details section');
    assert.ok(content.includes('Suggested Approach'), 'Should include Suggested Approach section');
  });

  it('detection-sprint combines all 6 threat profiles', () => {
    const { buildPromptContent, PROMPT_DEFS } = loadPrompts();
    const content = buildPromptContent(db, PROMPT_DEFS['detection-sprint']);

    // Should include techniques from multiple profiles
    assert.ok(content.includes('T1486'), 'Should include T1486 from ransomware profile');
    assert.ok(content.includes('T1566'), 'Should include T1566 from APT profile');
    assert.ok(content.includes('Coverage Summary'), 'Should include Coverage Summary section');
    assert.ok(content.includes('Suggested Approach'), 'Should include Suggested Approach section');
    // Should reference all 6 profiles
    assert.ok(content.includes('ransomware'), 'Should reference ransomware profile');
    assert.ok(content.includes('apt'), 'Should reference apt profile');
    assert.ok(content.includes('initial-access'), 'Should reference initial-access profile');
    assert.ok(content.includes('persistence'), 'Should reference persistence profile');
    assert.ok(content.includes('credential-access'), 'Should reference credential-access profile');
    assert.ok(content.includes('defense-evasion'), 'Should reference defense-evasion profile');
  });

  it('soc-investigation combines initial-access + persistence + credential-access profiles', () => {
    const { buildPromptContent, PROMPT_DEFS } = loadPrompts();
    const content = buildPromptContent(db, PROMPT_DEFS['soc-investigation']);

    // T1078 (Valid Accounts) is in initial-access AND persistence profiles
    assert.ok(content.includes('T1078'), 'Should include T1078 (Valid Accounts)');
    assert.ok(content.includes('Coverage Summary'), 'Should include Coverage Summary section');
    assert.ok(content.includes('Suggested Approach'), 'Should include Suggested Approach section');
    // Should reference the 3 combined profiles
    assert.ok(content.includes('initial-access'), 'Should reference initial-access profile');
    assert.ok(content.includes('persistence'), 'Should reference persistence profile');
    assert.ok(content.includes('credential-access'), 'Should reference credential-access profile');
  });

  it('each prompt response includes suggested_approach with actionable guidance', () => {
    const { buildPromptContent, PROMPT_DEFS } = loadPrompts();

    for (const [name, def] of Object.entries(PROMPT_DEFS)) {
      const content = buildPromptContent(db, def);
      assert.ok(
        content.includes('## Suggested Approach'),
        `${name} should include Suggested Approach heading`
      );
      // Each approach has numbered steps
      assert.ok(
        content.includes('1.'),
        `${name} should include numbered steps in suggested approach`
      );
    }
  });

  it('each prompt response includes coverage_summary with covered/gap counts', () => {
    const { buildPromptContent, PROMPT_DEFS } = loadPrompts();

    for (const [name, def] of Object.entries(PROMPT_DEFS)) {
      const content = buildPromptContent(db, def);
      assert.ok(
        content.includes('## Coverage Summary'),
        `${name} should include Coverage Summary heading`
      );
      assert.ok(
        content.includes('**Covered**'),
        `${name} should include Covered count`
      );
      assert.ok(
        content.includes('**Gaps**'),
        `${name} should include Gaps count`
      );
    }
  });

  it('registerPrompts does not throw when called with real McpServer', () => {
    const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
    const { registerPrompts } = loadPrompts();

    const server = new McpServer({ name: 'test-prompts', version: '0.1.0' });
    // Should not throw
    assert.doesNotThrow(() => registerPrompts(server, db));
  });
});
