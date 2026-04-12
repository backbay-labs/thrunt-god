import type { WorkspaceStatus } from './types';

export interface SidebarState {
  expandedSections: Record<string, boolean>;
}

export const DEFAULT_SIDEBAR_STATE: SidebarState = {
  expandedSections: {
    'hunt-status': true,
    'knowledge-base': true,
    'extended-artifacts': false,
    'receipt-timeline': false,
    'core-artifacts': false,
    'prior-hunt-suggestions': false,
  },
};

/**
 * Compute effective expanded sections by merging persisted state with
 * context-aware auto-expansion based on workspace status.
 */
export function getEffectiveExpandedSections(
  persisted: Record<string, boolean>,
  workspaceStatus: WorkspaceStatus,
): Record<string, boolean> {
  const result = { ...persisted };
  switch (workspaceStatus) {
    case 'missing':
      result['core-artifacts'] = true;
      break;
    case 'partial':
      result['knowledge-base'] = true;
      break;
    case 'healthy':
      result['receipt-timeline'] = true;
      break;
  }
  return result;
}
