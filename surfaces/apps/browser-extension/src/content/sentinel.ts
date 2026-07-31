import { createSentinelAdapter } from '@thrunt-surfaces/site-adapters/browser';
import { initializeAdapter } from './base-adapter.ts';

initializeAdapter(createSentinelAdapter());
