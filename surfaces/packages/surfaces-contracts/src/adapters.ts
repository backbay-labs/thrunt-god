/**
 * Site adapter interfaces — one adapter per vendor console.
 *
 * Content scripts use these to extract structured data from vendor pages.
 */

// --- Site adapter interface ---

export interface SiteAdapter {
  /** Unique adapter identifier (e.g., 'splunk', 'elastic', 'sentinel') */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** URL patterns this adapter matches */
  urlPatterns: string[];
  /** CSS selectors or heuristics to confirm we're on the right page */
  detect(): boolean;
  /** Extract the current page context */
  extractContext(): VendorPageContext;
  /** Extract a query from the current page (if applicable) */
  extractQuery(): ExtractedQuery | null;
  /** Extract table data from the current page (if applicable) */
  extractTable(): ExtractedTable | null;
  /** Extract selected entities from the current page */
  extractEntities(): ExtractedEntity[];
  /** Get a list of supported capture actions for the current page */
  supportedActions(): CaptureAction[];
}

// --- Extracted data types ---

export interface ExtractionAssessment {
  supported: boolean;
  confidence: 'high' | 'medium' | 'low';
  completeness: 'complete' | 'partial' | 'unsupported';
  failureReasons: string[];
  detectedSignals: string[];
}

export interface VendorPageContext {
  vendorId: string;
  consoleName: string;
  pageType: VendorPageType;
  pageUrl: string;
  pageTitle: string;
  /** Vendor-specific metadata */
  metadata: Record<string, unknown>;
  /** Extraction quality and graceful-degradation signals */
  extraction?: ExtractionAssessment;
}

export type VendorPageType =
  | 'search'
  | 'dashboard'
  | 'alert_detail'
  | 'entity_detail'
  | 'incident'
  | 'log_viewer'
  | 'settings'
  | 'unknown';

export interface ExtractedQuery {
  language: string;
  statement: string;
  timeRange?: { start: string; end: string };
  parameters?: Record<string, unknown>;
}

export interface ExtractedTable {
  headers: string[];
  rows: string[][];
  totalRows: number;
  /** Whether more rows exist beyond what was extracted */
  truncated: boolean;
}

export interface ExtractedEntity {
  type: 'ip' | 'domain' | 'hash' | 'user' | 'host' | 'url' | 'email' | 'file_path' | 'other';
  value: string;
  context?: string;
}

export type CaptureAction =
  | 'clip_query'
  | 'clip_table'
  | 'clip_entity'
  | 'clip_screenshot_metadata'
  | 'attach_page_context'
  | 'capture_live_snapshot';

// --- Surface command protocol (extension -> bridge) ---

export type SurfaceCommand =
  | { type: 'open_case'; signal: string; vendorContext: VendorPageContext }
  | { type: 'attach_evidence'; attachment: import('./case.ts').EvidenceAttachment }
  | { type: 'clip_query'; query: ExtractedQuery; vendorContext: VendorPageContext }
  | { type: 'clip_table'; table: ExtractedTable; vendorContext: VendorPageContext }
  | { type: 'clip_entity'; entity: ExtractedEntity; vendorContext: VendorPageContext }
  | { type: 'refresh_case' }
  | { type: 'execute_next' }
  | { type: 'preview_runtime'; packId?: string; target?: string; parameters?: Record<string, unknown>; vendorContext?: VendorPageContext }
  | { type: 'execute_pack'; packId?: string; target?: string; parameters?: Record<string, unknown>; vendorContext?: VendorPageContext };
