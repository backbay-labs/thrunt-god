import type { BridgeHealthResponse } from '@thrunt-surfaces/contracts';

export const mockBridgeHealth: BridgeHealthResponse = {
  status: 'ok',
  version: '0.1.0',
  mockMode: true,
  projectRoot: '/home/analyst/hunts/oauth-session-hijack',
  planningExists: true,
  caseOpen: true,
  uptime: 3600,
  wsClients: 0,
  activeCaseId: null,
  lastFileWatcherEvent: null,
  subprocessAvailable: true,
};
