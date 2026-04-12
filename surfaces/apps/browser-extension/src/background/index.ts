/**
 * Background service worker — manages bridge connection, auth handshake, and message routing.
 *
 * Phase two: real handshake, token-based auth, error propagation.
 */

import { ExtensionBridgeClient } from '../lib/bridge-client.ts';
import type { ExtensionMessage } from '../lib/message-bus.ts';

const bridge = new ExtensionBridgeClient();
let pollInterval: ReturnType<typeof setInterval> | null = null;
let wsUnsub: (() => void) | null = null;
type ActionResultKind = 'success' | 'warning' | 'error' | 'info';

function toPlainRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

// --- Health polling ---

async function pollBridge() {
  const health = await bridge.checkHealth();
  const connected = bridge.isConnected() || bridge.isMockMode();

  broadcastToExtension({
    type: 'bridge:status',
    connected,
    mockMode: bridge.isMockMode(),
  } as any);

  if (connected) {
    reconnectWs();
  } else if (wsUnsub) {
    wsUnsub();
    wsUnsub = null;
  }

  if (connected && health.caseOpen) {
    try {
      const view = await bridge.getCaseView();
      broadcastToExtension({
        type: 'bridge:case_updated',
        data: { view: view.view, mockMode: bridge.isMockMode() },
      } as any);
    } catch {
      broadcastToExtension({
        type: 'bridge:error',
        message: 'Failed to load case view',
      } as any);
    }
  } else if (connected && !health.caseOpen) {
    broadcastToExtension({
      type: 'bridge:case_updated',
      data: { error: 'no_case' },
    } as any);
  }
}

function broadcastToExtension(message: any): void {
  chrome.runtime.sendMessage(message).catch(() => {});
}

function emitActionResult(message: string, kind: ActionResultKind = 'success'): void {
  broadcastToExtension({
    type: 'action:result',
    message,
    kind,
  } as any);
}

// Start polling
chrome.runtime.onInstalled?.addListener?.(() => {
  pollBridge();
  pollInterval = setInterval(pollBridge, 5_000);
});

chrome.runtime.onStartup?.addListener?.(() => {
  pollBridge();
  if (!pollInterval) pollInterval = setInterval(pollBridge, 5_000);
});

function reconnectWs() {
  if (wsUnsub) return;
  wsUnsub = bridge.subscribeEvents((event) => {
    if (event.type === 'bridge:heartbeat') return;
    broadcastToExtension({ type: 'bridge:event', data: event } as any);
    // Refresh case on artifact changes
    if (event.type === 'case:updated' || event.type === 'evidence:attached' || event.type === 'execution:completed') {
      pollBridge();
    }
  });
}

// --- Sender validation ---

const ALLOWED_SENDER_DOMAINS = [
  'splunk.com', 'splunkcloud.com',
  'elastic.co', 'cloud.es.io', 'kb.elastic.co',
  'crowdstrike.com',
  'microsoft.com', 'portal.azure.com',
  'okta.com', 'oktapreview.com',
  'aws.amazon.com', 'console.aws.amazon.com',
  'console.cloud.google.com',
  'service-now.com', 'servicenow.com',
  'atlassian.net',
];

function isAllowedSender(sender: chrome.runtime.MessageSender): boolean {
  // Messages from extension pages (sidepanel, popup) are always allowed
  if (!sender.tab) return true;
  const url = sender.tab.url ?? sender.url ?? '';
  try {
    const hostname = new URL(url).hostname;
    return ALLOWED_SENDER_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

// --- Message routing ---

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender) => {
  if (!isAllowedSender(sender)) {
    console.warn('[bridge] rejected message from unauthorized sender:', sender.tab?.url);
    return;
  }

  switch (message.type) {
    case 'request:bridge_status':
      pollBridge();
      if (bridge.isConnected()) reconnectWs();
      break;

    case 'request:case_view':
      bridge.getCaseView().then(view => {
        broadcastToExtension({
          type: 'bridge:case_updated',
          data: { view: view.view, mockMode: bridge.isMockMode() },
        });
      }).catch(() => {
        broadcastToExtension({ type: 'bridge:error', message: 'Failed to load case' });
      });
      break;

    case 'adapter:detected':
      broadcastToExtension({
        type: 'vendor:detected',
        vendorId: message.vendorId,
        context: message.context,
      } as any);
      break;

    case 'capture:query':
    case 'capture:table':
    case 'capture:entity':
    case 'capture:page_context': {
      const attachment = buildAttachment(message, sender);
      if (attachment) {
        bridge.attachEvidence(attachment).then(result => {
          if (result.success) {
            if (result.artifactKind === 'query') {
              emitActionResult(`Query captured: ${result.attachmentId}`, 'success');
            } else if (result.artifactKind === 'receipt') {
              emitActionResult(`Receipt captured: ${result.attachmentId}`, 'success');
            } else {
              emitActionResult(
                result.classification === 'ambiguous' || result.classification === 'plain_evidence'
                  ? `Saved as evidence note: ${result.attachmentId}`
                  : `Evidence captured: ${result.attachmentId}`,
                result.classification === 'ambiguous' || result.classification === 'plain_evidence' ? 'warning' : 'success',
              );
            }
          } else {
            emitActionResult(`Capture failed: ${result.message}`, 'error');
          }
          if (result.success) pollBridge();
        }).catch(err => {
          broadcastToExtension({ type: 'bridge:error', message: `Capture error: ${err.message}` } as any);
        });
      }
      break;
    }

    case 'capture:live_snapshot':
      bridge.captureCertificationSnapshot({
        vendorId: message.vendorId,
        pageUrl: message.context.pageUrl,
        pageTitle: message.context.pageTitle,
        rawHtml: message.snapshot.html,
        extraction: {
          detect: true,
          context: toPlainRecord(message.context),
          query: message.snapshot.query ? toPlainRecord(message.snapshot.query) : null,
          table: message.snapshot.table ? toPlainRecord(message.snapshot.table) : null,
          entities: message.snapshot.entities.map((entity) => toPlainRecord(entity)),
          supportedActions: message.snapshot.supportedActions,
        },
      }).then((result) => {
        emitActionResult(
          result.success
            ? `Live campaign captured: ${result.campaignId}`
            : `Live snapshot failed: ${result.message}`,
          result.success ? 'success' : 'error',
        );
        if (result.success) pollBridge();
      }).catch((error) => {
        broadcastToExtension({
          type: 'bridge:error',
          message: error instanceof Error ? error.message : 'Live snapshot capture failed',
        } as any);
      });
      break;

    case 'command':
      handleSurfaceCommand(message.command);
      break;
  }
});

function buildAttachment(message: ExtensionMessage, sender: chrome.runtime.MessageSender) {
  const url = sender.tab?.url ?? '';
  const now = new Date().toISOString();

  if (message.type === 'capture:query') {
    return {
      surfaceId: 'browser-extension',
      type: 'query_clip' as const,
      vendorId: message.vendorId,
      sourceUrl: url,
      capturedAt: now,
      capturedBy: 'operator',
      hypothesisIds: [] as string[],
      context: buildAttachmentContext(message.context, message.query),
      payload: { kind: 'query' as const, language: message.query.language, statement: message.query.statement, parameters: message.query.parameters },
    };
  }

  if (message.type === 'capture:table') {
    return {
      surfaceId: 'browser-extension',
      type: 'table_clip' as const,
      vendorId: message.vendorId,
      sourceUrl: url,
      capturedAt: now,
      capturedBy: 'operator',
      hypothesisIds: [] as string[],
      context: buildAttachmentContext(message.context, message.query),
      payload: { kind: 'table' as const, headers: message.table.headers, rows: message.table.rows, rowCount: message.table.totalRows },
    };
  }

  if (message.type === 'capture:entity') {
    return {
      surfaceId: 'browser-extension',
      type: 'entity_clip' as const,
      vendorId: message.vendorId,
      sourceUrl: url,
      capturedAt: now,
      capturedBy: 'operator',
      hypothesisIds: [] as string[],
      context: buildAttachmentContext(message.context, message.query),
      payload: { kind: 'entity' as const, entityType: message.entity.type, value: message.entity.value },
    };
  }

  if (message.type === 'capture:page_context') {
    return {
      surfaceId: 'browser-extension',
      type: 'page_context' as const,
      vendorId: message.context.vendorId,
      sourceUrl: message.context.pageUrl,
      capturedAt: now,
      capturedBy: 'operator',
      hypothesisIds: [] as string[],
      context: buildAttachmentContext(message.context, null),
      payload: { kind: 'page_context' as const, title: message.context.pageTitle, url: message.context.pageUrl },
    };
  }

  return null;
}

function buildAttachmentContext(
  context: import('@thrunt-surfaces/contracts').VendorPageContext,
  query: import('@thrunt-surfaces/contracts').ExtractedQuery | null | undefined,
) {
  return {
    pageTitle: context.pageTitle,
    pageType: context.pageType,
    metadata: context.metadata,
    extraction: context.extraction,
    sourceQuery: query ?? null,
  };
}

async function handleSurfaceCommand(command: import('@thrunt-surfaces/contracts').SurfaceCommand) {
  switch (command.type) {
    case 'open_case': {
      try {
        const result = await bridge.openCase({
          signal: command.signal,
          vendorContext: toBridgeVendorContext(command.vendorContext),
        });
        emitActionResult(result.message, 'success');
        await pollBridge();
      } catch (error) {
        broadcastToExtension({
          type: 'bridge:error',
          message: error instanceof Error ? error.message : 'Failed to open case',
        } as any);
      }
      break;
    }
    case 'refresh_case':
      pollBridge();
      break;
    case 'preview_runtime': {
      const result = await bridge.executePack({
        packId: command.packId,
        target: command.target,
        parameters: command.parameters,
        dryRun: true,
        vendorContext: command.vendorContext ? toBridgeVendorContext(command.vendorContext) : undefined,
      });
      emitActionResult(
        result.success ? result.message : `Preview failed: ${result.message}`,
        result.success
          ? result.previewState?.ready === false ? 'warning' : 'success'
          : 'error',
      );
      if (result.view) {
        broadcastToExtension({
          type: 'bridge:case_updated',
          data: { view: result.view, mockMode: bridge.isMockMode() },
        } as any);
      } else {
        await pollBridge();
      }
      break;
    }
    case 'execute_pack': {
      const result = await bridge.executePack({
        packId: command.packId,
        target: command.target,
        parameters: command.parameters,
        vendorContext: command.vendorContext ? toBridgeVendorContext(command.vendorContext) : undefined,
      });
      emitActionResult(
        result.success ? result.message : `Runtime execute failed: ${result.message}`,
        result.success
          ? result.executionState?.status === 'partial' ? 'warning' : 'success'
          : 'error',
      );
      if (result.view) {
        broadcastToExtension({
          type: 'bridge:case_updated',
          data: { view: result.view, mockMode: bridge.isMockMode() },
        } as any);
      } else if (result.success) {
        await pollBridge();
      }
      break;
    }
    case 'execute_next': {
      const result = await bridge.executeNext();
      emitActionResult(
        result.success ? result.message : `Execute failed: ${result.message}`,
        result.success ? 'success' : 'error',
      );
      if (result.success) pollBridge();
      break;
    }
  }
}

function toBridgeVendorContext(context: import('@thrunt-surfaces/contracts').VendorPageContext): import('@thrunt-surfaces/contracts').VendorContext {
  return {
    ...context,
    capturedAt: new Date().toISOString(),
  };
}

// --- Context menu ---

chrome.contextMenus?.create?.({
  id: 'thrunt-clip-selection',
  title: 'Clip to THRUNT case',
  contexts: ['selection'],
});

chrome.contextMenus?.onClicked?.addListener?.((info, tab) => {
  if (info.menuItemId === 'thrunt-clip-selection' && info.selectionText) {
    bridge.attachEvidence({
      surfaceId: 'browser-extension',
      type: 'manual_note',
      vendorId: 'unknown',
      sourceUrl: tab?.url ?? '',
      capturedAt: new Date().toISOString(),
      capturedBy: 'operator',
      hypothesisIds: [],
      payload: { kind: 'note', text: info.selectionText },
    }).then(result => {
      emitActionResult(
        result.success ? `Clipped: ${result.attachmentId}` : 'Clip failed',
        result.success ? 'success' : 'error',
      );
    }).catch(() => {});
  }
});

// --- Side panel ---

chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});
