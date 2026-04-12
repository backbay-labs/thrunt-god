import { createAwsAdapter } from '@thrunt-surfaces/site-adapters/browser';
import { initializeAdapter } from './base-adapter.ts';

initializeAdapter(createAwsAdapter());
