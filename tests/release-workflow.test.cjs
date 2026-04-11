/**
 * Release workflow contract tests
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('release workflow', () => {
  test('release workflow publishes from tags with npm, VS Code, and Obsidian release guards', () => {
    const workflow = fs.readFileSync(
      path.join(__dirname, '..', '.github', 'workflows', 'release.yml'),
      'utf-8'
    );

    assert.match(workflow, /name:\s+Release/);
    assert.match(workflow, /push:\s*\n\s*tags:\s*\n\s*-\s+'v\*'/);
    assert.match(workflow, /workflow_dispatch:/);
    assert.match(workflow, /NPM_TOKEN/);
    assert.match(workflow, /registry-url:\s+'https:\/\/registry\.npmjs\.org'/);
    assert.match(workflow, /npm ci/);
    assert.match(workflow, /apps\/obsidian\/package-lock\.json/);
    assert.match(workflow, /npm --prefix apps\/obsidian ci/);
    assert.match(workflow, /npm run test:coverage/);
    assert.match(workflow, /npm publish --access public --provenance/);
    assert.match(workflow, /Tag .* does not match package\.json version/);
    assert.match(workflow, /package\.json repository\.url must be/);
    assert.match(workflow, /assertObsidianVersionSync/);
    assert.match(workflow, /apps\/obsidian\/package\.json/);
    assert.match(workflow, /apps\/obsidian\/manifest\.json/);
    assert.match(workflow, /apps\/obsidian\/versions\.json/);
    assert.match(workflow, /npm run bundle:obsidian-release/);
    assert.match(workflow, /dist\/obsidian-release\/main\.js/);
    assert.match(workflow, /dist\/obsidian-release\/manifest\.json/);
    assert.match(workflow, /dist\/obsidian-release\/styles\.css/);
    assert.match(workflow, /dist\/obsidian-release\/versions\.json/);
    assert.match(workflow, /THRUNT God Release/);
    assert.doesNotMatch(workflow, /VS Code Extension Alpha/);
    assert.match(workflow, /gh release create/);
  });
});
