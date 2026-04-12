/**
 * @thrunt-surfaces/auth — Session and auth abstraction for bridge / extension.
 */

export {
  createInitialSession,
  markConnected,
  markDisconnected,
} from './session.ts';
export type { SessionState } from './session.ts';
