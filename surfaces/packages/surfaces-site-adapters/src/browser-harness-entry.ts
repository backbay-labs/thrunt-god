import {
  createAwsAdapter,
} from './adapters/aws.ts';
import {
  createCrowdStrikeAdapter,
} from './adapters/crowdstrike.ts';
import {
  createElasticAdapter,
} from './adapters/elastic.ts';
import {
  createM365DefenderAdapter,
} from './adapters/m365-defender.ts';
import {
  createOktaAdapter,
} from './adapters/okta.ts';
import {
  createSentinelAdapter,
} from './adapters/sentinel.ts';

declare global {
  interface Window {
    __thruntSurfaces?: {
      runAdapter: (vendorId: string) => unknown;
    };
  }
}

const factories = {
  aws: createAwsAdapter,
  crowdstrike: createCrowdStrikeAdapter,
  elastic: createElasticAdapter,
  'm365-defender': createM365DefenderAdapter,
  okta: createOktaAdapter,
  sentinel: createSentinelAdapter,
};

window.__thruntSurfaces = {
  runAdapter(vendorId: string) {
    const factory = factories[vendorId as keyof typeof factories];
    if (!factory) {
      throw new Error(`Unknown adapter: ${vendorId}`);
    }

    const adapter = factory();
    return {
      detect: adapter.detect(),
      context: adapter.extractContext(),
      query: adapter.extractQuery(),
      table: adapter.extractTable(),
      entities: adapter.extractEntities(),
      supportedActions: adapter.supportedActions(),
    };
  },
};
