/**
 * Release workflow contract tests
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('release workflow', () => {
  test('release workflow publishes from tags with NPM_TOKEN and metadata guards', () => {
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
    assert.match(workflow, /npm run test:coverage/);
    assert.match(workflow, /npm publish --access public --provenance/);
    assert.match(workflow, /Tag .* does not match package\.json version/);
    assert.match(workflow, /package\.json repository\.url must be/);
    assert.match(workflow, /gh release create/);
  });
});
