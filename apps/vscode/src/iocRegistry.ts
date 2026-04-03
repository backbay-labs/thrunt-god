import * as fs from 'fs';
import * as vscode from 'vscode';
import type { Query, Receipt, ArtifactChangeEvent } from './types';
import type { HuntDataStore } from './store';
import type {
  IOCArtifactType,
  IOCEntry,
  IOCMatchResult,
  IOCType,
} from '../shared/ioc';

const MAX_IOC_LENGTH = 2048;

interface TextSearchMatch {
  index: number;
  length: number;
  context: string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isValidIpv4(value: string): boolean {
  const octets = value.split('.');
  if (octets.length !== 4) {
    return false;
  }

  return octets.every((octet) => {
    if (!/^\d{1,3}$/.test(octet)) {
      return false;
    }
    const numeric = Number(octet);
    return numeric >= 0 && numeric <= 255;
  });
}

export function classifyIOC(value: string): IOCType {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'unknown';
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(trimmed) && isValidIpv4(trimmed)) {
    return 'ipv4';
  }
  if (/^[0-9a-fA-F:]{2,39}$/.test(trimmed) && trimmed.includes(':')) {
    return 'ipv6';
  }
  if (/^[a-fA-F0-9]{32}$/.test(trimmed)) {
    return 'md5';
  }
  if (/^[a-fA-F0-9]{40}$/.test(trimmed)) {
    return 'sha1';
  }
  if (/^[a-fA-F0-9]{64}$/.test(trimmed)) {
    return 'sha256';
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'email';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return 'url';
  }
  if (
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/.test(trimmed)
  ) {
    return 'domain';
  }

  return 'unknown';
}

export function normalizeIOCValue(value: string, type = classifyIOC(value)): string {
  const trimmed = value.trim();
  switch (type) {
    case 'domain':
    case 'email':
    case 'url':
    case 'md5':
    case 'sha1':
    case 'sha256':
      return trimmed.toLowerCase();
    default:
      return trimmed;
  }
}

export function validateIOC(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'Enter an IOC value.';
  }
  if (trimmed.length > MAX_IOC_LENGTH) {
    return `IOC must be ${MAX_IOC_LENGTH} characters or fewer.`;
  }
  return undefined;
}

function getPatternSource(value: string, type: IOCType): string {
  const escaped = escapeRegex(normalizeIOCValue(value, type));
  switch (type) {
    case 'ipv4':
      return `(?<![0-9.])${escaped}(?![0-9.])`;
    case 'ipv6':
      return `(?<![A-Fa-f0-9:])${escaped}(?![A-Fa-f0-9:])`;
    case 'md5':
    case 'sha1':
    case 'sha256':
      return `(?<![A-Fa-f0-9])${escaped}(?![A-Fa-f0-9])`;
    case 'email':
      return `(?<![A-Za-z0-9._%+-])${escaped}(?![A-Za-z0-9._%+-])`;
    case 'domain':
      return `(?<![A-Za-z0-9.-])${escaped}(?![A-Za-z0-9.-])`;
    default:
      return escaped;
  }
}

export function buildIOCRegExp(
  value: string,
  type = classifyIOC(value)
): RegExp {
  return new RegExp(getPatternSource(value, type), 'gi');
}

export function findIOCMatchesInText(
  text: string,
  value: string,
  type = classifyIOC(value),
  maxMatches = Number.POSITIVE_INFINITY
): TextSearchMatch[] {
  if (!text) {
    return [];
  }

  const matches: TextSearchMatch[] = [];
  const pattern = buildIOCRegExp(value, type);

  for (const match of text.matchAll(pattern)) {
    if (matches.length >= maxMatches) {
      break;
    }

    const fullMatch = match[0];
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0 || fullMatch.length === 0) {
      continue;
    }

    const contextStart = Math.max(0, matchIndex - 30);
    const contextEnd = Math.min(text.length, matchIndex + fullMatch.length + 30);
    matches.push({
      index: matchIndex,
      length: fullMatch.length,
      context: text.slice(contextStart, contextEnd).replace(/\s+/g, ' ').trim(),
    });
  }

  return matches;
}

function createIocId(): string {
  return `ioc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeMatches(
  artifactId: string,
  artifactType: IOCArtifactType,
  templateId: string | null,
  texts: string[],
  value: string,
  type: IOCType
): IOCMatchResult | null {
  let totalCount = 0;
  let matchContext = '';

  for (const text of texts) {
    const matches = findIOCMatchesInText(text, value, type);
    if (matches.length === 0) {
      continue;
    }

    totalCount += matches.length;
    if (!matchContext) {
      matchContext = matches[0].context;
    }
  }

  if (totalCount === 0) {
    return null;
  }

  return {
    artifactId,
    artifactType,
    templateId,
    matchContext,
    lineNumber: null,
    matchCount: totalCount,
  };
}

function extractTemplateSection(rawText: string, templateId: string): string {
  if (!rawText) {
    return '';
  }

  const escapedTemplateId = escapeRegex(templateId);
  const match = rawText.match(
    new RegExp(
      `### Template ${escapedTemplateId} Details[\\s\\S]*?(?=\\n### |\\n## |$)`,
      'i'
    )
  );
  return match?.[0] ?? '';
}

function matchQuery(entry: IOCEntry, query: Query, rawText = ''): IOCMatchResult[] {
  const results: IOCMatchResult[] = [];

  const generalMatch = summarizeMatches(
    query.queryId,
    'query',
    null,
    [query.title, query.intent, query.queryText, query.resultSummary],
    entry.value,
    entry.type
  );
  if (generalMatch) {
    results.push(generalMatch);
  } else if (rawText) {
    const rawMatch = summarizeMatches(
      query.queryId,
      'query',
      null,
      [rawText],
      entry.value,
      entry.type
    );
    if (rawMatch) {
      results.push(rawMatch);
    }
  }

  for (const template of query.templates) {
    const detail = query.templateDetails.find(
      (candidate) => candidate.templateId === template.templateId
    );
    const templateMatch = summarizeMatches(
      query.queryId,
      'query',
      template.templateId,
      [
        template.template,
        detail?.heading ?? '',
        detail?.summary ?? '',
        ...(detail?.detailLines ?? []),
        detail?.sampleEventText ?? '',
        ...(detail?.eventIds ?? []),
        extractTemplateSection(rawText, template.templateId),
      ],
      entry.value,
      entry.type
    );
    if (templateMatch) {
      results.push(templateMatch);
    }
  }

  return results;
}

function matchReceipt(entry: IOCEntry, receipt: Receipt): IOCMatchResult[] {
  const anomalyTexts = receipt.anomalyFrame
    ? [
        receipt.anomalyFrame.baseline,
        receipt.anomalyFrame.prediction,
        receipt.anomalyFrame.observation,
        ...receipt.anomalyFrame.attackMapping,
      ]
    : [];

  const match = summarizeMatches(
    receipt.receiptId,
    'receipt',
    null,
    [receipt.claim, receipt.evidence, receipt.confidence, ...anomalyTexts],
    entry.value,
    entry.type
  );

  return match ? [match] : [];
}

export function formatIOCTypeLabel(type: IOCType): string {
  switch (type) {
    case 'ipv4':
      return 'IPv4';
    case 'ipv6':
      return 'IPv6';
    case 'md5':
      return 'MD5';
    case 'sha1':
      return 'SHA1';
    case 'sha256':
      return 'SHA256';
    default:
      return type.toUpperCase();
  }
}

export class IOCRegistry implements vscode.Disposable {
  private readonly entries = new Map<string, IOCEntry>();
  private readonly valueToId = new Map<string, string>();
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange: vscode.Event<void> = this._onDidChange.event;
  private readonly storeSubscription: vscode.Disposable;

  constructor(private readonly store: HuntDataStore) {
    this.storeSubscription = this.store.onDidChange((event) => {
      this.handleStoreChange(event);
    });
  }

  list(): IOCEntry[] {
    return [...this.entries.values()].sort((left, right) =>
      left.addedAt.localeCompare(right.addedAt)
    );
  }

  getEntry(id: string): IOCEntry | undefined {
    return this.entries.get(id);
  }

  add(value: string): { entry: IOCEntry; duplicate: boolean } {
    const validationError = validateIOC(value);
    if (validationError) {
      throw new Error(validationError);
    }

    const type = classifyIOC(value);
    const normalizedValue = normalizeIOCValue(value, type);
    const existingId = this.valueToId.get(normalizedValue);
    if (existingId) {
      const existing = this.entries.get(existingId);
      if (!existing) {
        throw new Error('IOC registry is out of sync.');
      }
      return { entry: existing, duplicate: true };
    }

    const entry: IOCEntry = {
      id: createIocId(),
      value: value.trim(),
      normalizedValue,
      type,
      addedAt: new Date().toISOString(),
      matchResults: [],
    };

    entry.matchResults = this.scanEntry(entry);
    this.entries.set(entry.id, entry);
    this.valueToId.set(entry.normalizedValue, entry.id);
    this._onDidChange.fire();
    return { entry, duplicate: false };
  }

  remove(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) {
      return false;
    }

    this.entries.delete(id);
    this.valueToId.delete(entry.normalizedValue);
    this._onDidChange.fire();
    return true;
  }

  clear(): void {
    if (this.entries.size === 0) {
      return;
    }

    this.entries.clear();
    this.valueToId.clear();
    this._onDidChange.fire();
  }

  getMatchedValuesForArtifact(artifactId: string): string[] {
    const matchedValues = new Set<string>();

    for (const entry of this.entries.values()) {
      if (entry.matchResults.some((match) => match.artifactId === artifactId)) {
        matchedValues.add(entry.value);
      }
    }

    return [...matchedValues].sort((left, right) => left.localeCompare(right));
  }

  getTemplateMatchesForQuery(queryId: string): Map<string, string[]> {
    const templateMatches = new Map<string, Set<string>>();

    for (const entry of this.entries.values()) {
      for (const match of entry.matchResults) {
        if (match.artifactType !== 'query' || match.artifactId !== queryId || !match.templateId) {
          continue;
        }

        const values = templateMatches.get(match.templateId) ?? new Set<string>();
        values.add(entry.value);
        templateMatches.set(match.templateId, values);
      }
    }

    return new Map(
      [...templateMatches.entries()].map(([templateId, values]) => [
        templateId,
        [...values].sort((left, right) => left.localeCompare(right)),
      ])
    );
  }

  dispose(): void {
    this.storeSubscription.dispose();
    this._onDidChange.dispose();
    this.entries.clear();
    this.valueToId.clear();
  }

  private handleStoreChange(event: ArtifactChangeEvent): void {
    if (this.entries.size === 0) {
      return;
    }

    if (event.type === 'store:rebuilt') {
      for (const entry of this.entries.values()) {
        entry.matchResults = this.scanEntry(entry);
      }
      this._onDidChange.fire();
      return;
    }

    if (event.artifactType !== 'query' && event.artifactType !== 'receipt') {
      return;
    }

    let changed = false;
    for (const entry of this.entries.values()) {
      const preserved = entry.matchResults.filter(
        (match) => match.artifactId !== event.id
      );

      let updatedMatches: IOCMatchResult[] = [];
      if (event.type !== 'artifact:deleted') {
        updatedMatches = this.scanArtifact(entry, event.artifactType, event.id);
      }

      if (
        preserved.length !== entry.matchResults.length ||
        updatedMatches.length > 0
      ) {
        entry.matchResults = [...preserved, ...updatedMatches];
        changed = true;
      }
    }

    if (changed) {
      this._onDidChange.fire();
    }
  }

  private scanEntry(entry: IOCEntry): IOCMatchResult[] {
    const queryMatches = [...this.store.getQueries().values()]
      .filter((query): query is { status: 'loaded'; data: Query } => query.status === 'loaded')
      .flatMap((query) => matchQuery(entry, query.data, this.readArtifactText(query.data.queryId)));

    const receiptMatches = [...this.store.getReceipts().values()]
      .filter((receipt): receipt is { status: 'loaded'; data: Receipt } => receipt.status === 'loaded')
      .flatMap((receipt) => matchReceipt(entry, receipt.data));

    return [...queryMatches, ...receiptMatches];
  }

  private scanArtifact(
    entry: IOCEntry,
    artifactType: IOCArtifactType,
    artifactId: string
  ): IOCMatchResult[] {
    if (artifactType === 'query') {
      const query = this.store.getQuery(artifactId);
      return query?.status === 'loaded'
        ? matchQuery(entry, query.data, this.readArtifactText(artifactId))
        : [];
    }

    const receipt = this.store.getReceipt(artifactId);
    return receipt?.status === 'loaded' ? matchReceipt(entry, receipt.data) : [];
  }

  private readArtifactText(artifactId: string): string {
    const artifactPath = this.store.getArtifactPath(artifactId);
    if (!artifactPath) {
      return '';
    }

    try {
      return fs.readFileSync(artifactPath, 'utf-8');
    } catch {
      const workspaceWithMocks = vscode.workspace as typeof vscode.workspace & {
        _mockFiles?: Map<string, { content?: string }>;
      };
      const mockEntry = workspaceWithMocks._mockFiles?.get(artifactPath);
      return typeof mockEntry?.content === 'string' ? mockEntry.content : '';
    }
  }
}
