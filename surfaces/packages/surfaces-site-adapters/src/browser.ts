/**
 * Browser-safe site adapter entrypoint.
 *
 * Keep this limited to runtime adapter code that can execute inside a browser
 * extension bundle. Node-only certification and campaign helpers stay on the
 * package root export.
 */

export { SiteAdapterRegistry, createDefaultRegistry } from './registry.ts';

export { createSplunkAdapter } from './adapters/splunk.ts';
export { createElasticAdapter } from './adapters/elastic.ts';
export { createSentinelAdapter } from './adapters/sentinel.ts';
export { createOktaAdapter } from './adapters/okta.ts';
export { createM365DefenderAdapter } from './adapters/m365-defender.ts';
export { createCrowdStrikeAdapter } from './adapters/crowdstrike.ts';
export { createAwsAdapter } from './adapters/aws.ts';
export { createGcpAdapter } from './adapters/gcp.ts';
export { createJiraAdapter } from './adapters/jira.ts';
export { createConfluenceAdapter } from './adapters/confluence.ts';
export { createServiceNowAdapter } from './adapters/servicenow.ts';
