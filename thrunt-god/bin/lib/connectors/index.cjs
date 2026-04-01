'use strict';

const { createConnectorRegistry } = require('../connector-sdk.cjs');

// SIEM connectors
const { createSplunkAdapter } = require('./splunk.cjs');
const { createElasticAdapter } = require('./elastic.cjs');
const { createSentinelAdapter } = require('./sentinel.cjs');
const { createOpenSearchAdapter } = require('./opensearch.cjs');
const { createDefenderXDRAdapter } = require('./defender-xdr.cjs');

// Identity, endpoint, and cloud connectors
const { createOktaAdapter } = require('./okta.cjs');
const { createM365Adapter } = require('./m365.cjs');
const { createCrowdStrikeAdapter } = require('./crowdstrike.cjs');
const { createAwsAdapter } = require('./aws.cjs');
const { createGcpAdapter } = require('./gcp.cjs');

function createBuiltInConnectorRegistry() {
  return createConnectorRegistry([
    createSplunkAdapter(),
    createElasticAdapter(),
    createSentinelAdapter(),
    createOpenSearchAdapter(),
    createDefenderXDRAdapter(),
    createOktaAdapter(),
    createM365Adapter(),
    createCrowdStrikeAdapter(),
    createAwsAdapter(),
    createGcpAdapter(),
  ]);
}

module.exports = { createBuiltInConnectorRegistry };
