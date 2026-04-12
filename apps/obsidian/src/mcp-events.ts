/**
 * MCP event types and mapping -- pure module for bidirectional event bridge.
 *
 * Defines CLI-to-Obsidian (inbound) and Obsidian-to-CLI (outbound) event types,
 * plus a pure mapping function from CLI events to vault actions.
 *
 * NO Obsidian imports. Pure TypeScript only.
 */

// ---------------------------------------------------------------------------
// CLI event types (inbound: MCP server -> Obsidian)
// ---------------------------------------------------------------------------

export type CliEventType = 'hunt:started' | 'receipt:generated' | 'finding:logged';

export interface CliEvent {
  type: CliEventType;
  timestamp: number;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Vault event types (outbound: Obsidian -> MCP server)
// ---------------------------------------------------------------------------

export interface VaultEvent {
  type: 'entity:created' | 'verdict:set' | 'hypothesis:changed';
  timestamp: number;
  path: string;
  entityType?: string;
  verdict?: string;
  huntId?: string;
}

// ---------------------------------------------------------------------------
// Action types (result of mapping a CLI event to a vault operation)
// ---------------------------------------------------------------------------

export interface EventAction {
  type: 'update-mission' | 'trigger-ingestion' | 'create-finding';
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Mapping function: CLI event -> vault action (pure, no side effects)
// ---------------------------------------------------------------------------

export function mapCliEventToAction(event: CliEvent): EventAction | null {
  switch (event.type) {
    case 'hunt:started':
      return {
        type: 'update-mission',
        data: {
          status: (event.payload.status as string) ?? 'active',
          huntId: event.payload.huntId,
        },
      };

    case 'receipt:generated':
      return {
        type: 'trigger-ingestion',
        data: {
          receiptPath: event.payload.path,
        },
      };

    case 'finding:logged':
      return {
        type: 'create-finding',
        data: {
          title: event.payload.title,
          severity: event.payload.severity,
          description: event.payload.description,
        },
      };

    default:
      return null;
  }
}
