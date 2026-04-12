import type {
  CaptureAction,
  ExtractedEntity,
  ExtractedQuery,
  ExtractedTable,
  ExtractionAssessment,
  SiteAdapter,
  VendorPageContext,
  VendorPageType,
} from '@thrunt-surfaces/contracts';

export function hasAnySelector(selectors: string[]): boolean {
  return selectors.some((selector) => document.querySelector(selector));
}

export function firstText(selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = document.querySelector(selector)?.textContent?.trim();
    if (value) return value;
  }
  return null;
}

export function firstValue(selectors: string[]): string | null {
  for (const selector of selectors) {
    const node = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
    const value = node?.value?.trim();
    if (value) return value;
  }
  return null;
}

export function safeTitle(): string {
  return document.title?.trim() || 'Untitled page';
}

export function dedupeEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  const seen = new Set<string>();
  const deduped: ExtractedEntity[] = [];

  for (const entity of entities) {
    const value = entity.value.trim();
    if (!value) continue;

    const key = `${entity.type}:${value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...entity, value });
  }

  return deduped;
}

export function inferEntityType(value: string): ExtractedEntity['type'] {
  const normalized = value.trim();
  if (!normalized) return 'other';
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized) || /^[0-9a-f:]+$/i.test(normalized)) return 'ip';
  if (normalized.includes('@')) return 'email';
  if (/^arn:aws:/i.test(normalized)) return 'other';
  if (/^[a-f0-9]{32,128}$/i.test(normalized)) return 'hash';
  if (/^[a-z0-9._-]+\.[a-z]{2,}$/i.test(normalized)) return 'domain';
  if (normalized.startsWith('/') || normalized.includes('\\')) return 'file_path';
  return 'other';
}

export function extractTableFromSelectors(selectors: string[], maxRows = 200): ExtractedTable | null {
  for (const selector of selectors) {
    const table = document.querySelector<HTMLTableElement>(selector);
    if (!table) continue;

    const headerCells = Array.from(table.querySelectorAll('thead th')).map((cell) => cell.textContent?.trim() ?? '').filter(Boolean);
    if (headerCells.length === 0) continue;

    const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
    const rows = bodyRows.slice(0, maxRows).map((row) => (
      Array.from(row.querySelectorAll('td')).map((cell) => normalizeWhitespace(cell.textContent ?? ''))
    ));

    return {
      headers: headerCells,
      rows,
      totalRows: bodyRows.length,
      truncated: bodyRows.length > maxRows,
    };
  }

  return null;
}

export function collectColumnEntities(
  table: ExtractedTable | null,
  candidates: Array<{ headerIncludes: string[]; type?: ExtractedEntity['type']; context: string }>,
): ExtractedEntity[] {
  if (!table) return [];

  const entities: ExtractedEntity[] = [];
  const normalizedHeaders = table.headers.map((header) => header.toLowerCase());

  for (const candidate of candidates) {
    const columnIndex = normalizedHeaders.findIndex((header) => (
      candidate.headerIncludes.some((fragment) => header.includes(fragment))
    ));
    if (columnIndex === -1) continue;

    for (const row of table.rows) {
      const rawValue = row[columnIndex]?.trim();
      if (!rawValue) continue;
      entities.push({
        type: candidate.type ?? inferEntityType(rawValue),
        value: rawValue,
        context: candidate.context,
      });
    }
  }

  return entities;
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function baseContext(
  context: Omit<VendorPageContext, 'extraction'>,
  extraction: ExtractionAssessment,
): VendorPageContext {
  return {
    ...context,
    extraction,
  };
}

export function buildAssessment(options: {
  supported: boolean;
  pageType: VendorPageType;
  failureReasons?: string[];
  detectedSignals?: string[];
  queryPresent?: boolean;
  tablePresent?: boolean;
  entityCount?: number;
}): ExtractionAssessment {
  const failureReasons = uniqueStrings(options.failureReasons ?? []);
  const detectedSignals = uniqueStrings(options.detectedSignals ?? []);
  const entityCount = options.entityCount ?? 0;

  if (!options.supported) {
    return {
      supported: false,
      confidence: 'low',
      completeness: 'unsupported',
      failureReasons,
      detectedSignals,
    };
  }

  const signalScore =
    (options.queryPresent ? 1 : 0) +
    (options.tablePresent ? 1 : 0) +
    (entityCount > 0 ? 1 : 0) +
    detectedSignals.length;

  const completeness =
    failureReasons.length === 0 && (options.tablePresent || options.queryPresent || entityCount > 0)
      ? 'complete'
      : 'partial';

  const confidence =
    failureReasons.length === 0 && signalScore >= 4
      ? 'high'
      : signalScore >= 2
        ? 'medium'
        : 'low';

  return {
    supported: true,
    confidence,
    completeness,
    failureReasons,
    detectedSignals,
  };
}

export function filterSupportedActions(
  baseActions: CaptureAction[],
  extraction: ExtractionAssessment,
  availability: {
    query?: boolean;
    table?: boolean;
    entities?: boolean;
  },
): CaptureAction[] {
  if (!extraction.supported) {
    return baseActions.filter((action) => action === 'attach_page_context');
  }

  return baseActions.filter((action) => {
    switch (action) {
      case 'clip_query':
        return Boolean(availability.query);
      case 'clip_table':
        return Boolean(availability.table);
      case 'clip_entity':
        return Boolean(availability.entities);
      default:
        return true;
    }
  });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

// --- Adapter pipeline abstraction ---

export interface AdapterPipelineConfig {
  /** Unique adapter identifier */
  vendorId: string;
  /** Human-readable display name */
  consoleName: string;
  /** URL patterns the adapter matches */
  urlPatterns: string[];
  /** Base capture actions supported by this adapter */
  baseActions: CaptureAction[];
  /** DOM-based detection: returns true if the adapter's vendor page is loaded */
  detect(): boolean;
  /** Classify the current page into a VendorPageType */
  classifyPage(): VendorPageType;
  /** Determine whether the page type is extraction-supported */
  isSupported?(pageType: VendorPageType, detected: boolean): boolean;
  /** Extract query from the current page */
  extractQuery(): ExtractedQuery | null;
  /** Extract table data from the current page */
  extractTable(): ExtractedTable | null;
  /** Extract entities from the current page (receives table for column extraction) */
  extractEntities(table: ExtractedTable | null): ExtractedEntity[];
  /** Compute failure reasons based on page state */
  computeFailureReasons(options: { supported: boolean; pageType: VendorPageType; query: ExtractedQuery | null; table: ExtractedTable | null }): string[];
  /** Compute detected signals for the assessment */
  computeDetectedSignals(options: { pageType: VendorPageType; query: ExtractedQuery | null; table: ExtractedTable | null }): string[];
  /** Build vendor-specific metadata for the context */
  buildMetadata(options: { pageType: VendorPageType; supportedActions: CaptureAction[] }): Record<string, unknown>;
}

/**
 * Run the full adapter pipeline: detect -> classify -> extract -> assess -> filter actions -> build context.
 * Used by both `extractContext()` and `supportedActions()` to eliminate duplication.
 */
export function runAdapterPipeline(config: AdapterPipelineConfig): { context: VendorPageContext; query: ExtractedQuery | null; table: ExtractedTable | null; entities: ExtractedEntity[]; supportedActions: CaptureAction[] } {
  const detected = config.detect();
  const rawPageType = config.classifyPage();
  const pageType: VendorPageType = detected ? rawPageType : 'unknown';

  const query = config.extractQuery();
  const table = config.extractTable();
  const entities = config.extractEntities(table);

  const supported = config.isSupported
    ? config.isSupported(pageType, detected)
    : (detected && pageType !== 'unknown');

  const failureReasons = config.computeFailureReasons({ supported, pageType, query, table });
  const detectedSignals = config.computeDetectedSignals({ pageType, query, table });

  const extraction = buildAssessment({
    supported,
    pageType,
    failureReasons,
    detectedSignals,
    queryPresent: Boolean(query),
    tablePresent: Boolean(table),
    entityCount: entities.length,
  });

  const actions = filterSupportedActions(config.baseActions, extraction, {
    query: Boolean(query),
    table: Boolean(table),
    entities: entities.length > 0,
  });

  const context = baseContext({
    vendorId: config.vendorId,
    consoleName: config.consoleName,
    pageType,
    pageUrl: window.location.href,
    pageTitle: document.title,
    metadata: config.buildMetadata({ pageType, supportedActions: actions }),
  }, extraction);

  return { context, query, table, entities, supportedActions: actions };
}

/**
 * Build a complete SiteAdapter from a pipeline config.
 * Eliminates the detect/classify/extract/assess duplication between extractContext() and supportedActions().
 */
export function buildAdapter(config: AdapterPipelineConfig): SiteAdapter {
  return {
    id: config.vendorId,
    displayName: config.consoleName,
    urlPatterns: config.urlPatterns,

    detect(): boolean {
      return config.detect();
    },

    extractContext(): VendorPageContext {
      return runAdapterPipeline(config).context;
    },

    extractQuery(): ExtractedQuery | null {
      return config.extractQuery();
    },

    extractTable(): ExtractedTable | null {
      return config.extractTable();
    },

    extractEntities(): ExtractedEntity[] {
      return config.extractEntities(config.extractTable());
    },

    supportedActions(): CaptureAction[] {
      return runAdapterPipeline(config).supportedActions;
    },
  };
}
