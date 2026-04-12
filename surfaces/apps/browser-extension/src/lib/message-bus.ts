/**
 * Message bus — typed communication between content scripts, background worker, and side panel.
 */

import type { SurfaceCommand, VendorPageContext, ExtractedQuery, ExtractedTable, ExtractedEntity } from '@thrunt-surfaces/contracts';

// --- Message types ---

export type ExtensionMessage =
  // Content script -> Background
  | { type: 'adapter:detected'; vendorId: string; context: VendorPageContext }
  | { type: 'capture:query'; vendorId: string; query: ExtractedQuery; context: VendorPageContext }
  | { type: 'capture:table'; vendorId: string; table: ExtractedTable; query?: ExtractedQuery | null; context: VendorPageContext }
  | { type: 'capture:entity'; vendorId: string; entity: ExtractedEntity; query?: ExtractedQuery | null; context: VendorPageContext }
  | { type: 'capture:page_context'; context: VendorPageContext }
  | {
    type: 'capture:live_snapshot';
    vendorId: string;
    context: VendorPageContext;
    snapshot: {
      html: string;
      query: ExtractedQuery | null;
      table: ExtractedTable | null;
      entities: ExtractedEntity[];
      supportedActions: string[];
    };
  }
  // Background -> Side panel
  | { type: 'bridge:status'; connected: boolean }
  | { type: 'bridge:case_updated'; data: unknown }
  | { type: 'bridge:event'; data: unknown }
  | { type: 'vendor:detected'; vendorId: string; context: VendorPageContext }
  // Side panel -> Background
  | { type: 'command'; command: SurfaceCommand }
  | { type: 'request:case_view' }
  | { type: 'request:bridge_status' };

// --- Typed message sender ---

export function sendToBackground(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message);
}

export function sendToTab(tabId: number, message: ExtensionMessage): void {
  chrome.tabs.sendMessage(tabId, message);
}

// --- Typed message listener ---

export function onMessage(handler: (message: ExtensionMessage, sender: chrome.runtime.MessageSender) => void): void {
  chrome.runtime.onMessage.addListener((message, sender) => {
    handler(message as ExtensionMessage, sender);
  });
}
