/**
 * Elastic / Kibana content script adapter.
 *
 * Delegates all extraction to @thrunt-surfaces/site-adapters.
 * This content script is a thin wrapper that initializes the shared adapter
 * and wires it into the browser extension message bus.
 */

import { createElasticAdapter } from '@thrunt-surfaces/site-adapters/browser';
import { initializeAdapter } from './base-adapter.ts';

initializeAdapter(createElasticAdapter());
