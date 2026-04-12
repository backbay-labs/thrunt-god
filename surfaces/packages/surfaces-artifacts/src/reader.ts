/**
 * Artifact reader — real parsing of .planning/ files.
 *
 * Handles YAML-style frontmatter (including multiline list fields),
 * markdown section extraction, hypothesis parsing, findings parsing,
 * evidence review parsing, and huntmap phase parsing.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  CertificationBaselineChurnSummary,
  CertificationBaselineRecord,
  CaseSummary,
  CaseProgress,
  CertificationCampaignSummary,
  CertificationDriftTrendSummary,
  CertificationFreshnessSummary,
  CertificationStatusSummary,
  CertificationVendorHistorySummary,
  PhaseSummary,
  HypothesisSummary,
  QueryLogSummary,
  ReceiptSummary,
  FindingSummary,
  CapturedEvidenceSummary,
} from '@thrunt-surfaces/contracts';

// ─── Path resolution ───────────────────────────────────────────────────────

export interface PlanningPaths {
  programRoot: string;
  root: string;
  cases: string;
  caseSlug: string | null;
  mission: string;
  hypotheses: string;
  huntmap: string;
  state: string;
  findings: string;
  evidenceReview: string;
  queries: string;
  receipts: string;
  evidence: string;
  config: string;
  phases: string;
  certificationRoot: string;
  certificationStatus: string;
  certificationCampaigns: string;
  certificationHistory: string;
  certificationDriftTrends: string;
  certificationFreshness: string;
  certificationBaselineChurn: string;
  certificationBaselineInventory: string;
}

export function resolvePlanningPaths(projectRoot: string): PlanningPaths {
  const planningDir = process.env.THRUNT_PLANNING_DIR || '.planning';
  const programRoot = path.join(projectRoot, planningDir);
  const caseSlug = resolveActiveCase(projectRoot, programRoot);
  const root = caseSlug
    ? path.join(programRoot, 'cases', caseSlug)
    : programRoot;

  return {
    programRoot,
    root,
    cases: path.join(programRoot, 'cases'),
    caseSlug,
    mission: path.join(root, 'MISSION.md'),
    hypotheses: path.join(root, 'HYPOTHESES.md'),
    huntmap: path.join(root, 'HUNTMAP.md'),
    state: path.join(root, 'STATE.md'),
    findings: path.join(root, 'FINDINGS.md'),
    evidenceReview: path.join(root, 'EVIDENCE_REVIEW.md'),
    queries: path.join(root, 'QUERIES'),
    receipts: path.join(root, 'RECEIPTS'),
    evidence: path.join(root, 'EVIDENCE'),
    config: path.join(programRoot, 'config.json'),
    phases: path.join(root, 'phases'),
    certificationRoot: path.join(programRoot, 'certification'),
    certificationStatus: path.join(programRoot, 'certification', 'status.json'),
    certificationCampaigns: path.join(programRoot, 'certification', 'campaigns'),
    certificationHistory: path.join(programRoot, 'certification', 'history.json'),
    certificationDriftTrends: path.join(programRoot, 'certification', 'drift-trends.json'),
    certificationFreshness: path.join(programRoot, 'certification', 'freshness.json'),
    certificationBaselineChurn: path.join(programRoot, 'certification', 'baseline-churn.json'),
    certificationBaselineInventory: path.join(programRoot, 'certification', 'baselines', 'inventory.json'),
  };
}

export function planningExists(projectRoot: string): boolean {
  return fs.existsSync(resolvePlanningPaths(projectRoot).programRoot);
}

function resolveActiveCase(_projectRoot: string, programRoot: string): string | null {
  const envCase = process.env.THRUNT_CASE?.trim();
  if (envCase) {
    const envCaseDir = path.join(programRoot, 'cases', envCase);
    if (fs.existsSync(envCaseDir)) return envCase;
  }

  const activeCasePath = path.join(programRoot, '.active-case');
  const activeCase = readArtifact(activeCasePath)?.trim();
  if (!activeCase) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(activeCase)) return null;
  const caseDir = path.join(programRoot, 'cases', activeCase);
  return fs.existsSync(caseDir) ? activeCase : null;
}

// ─── Low-level file I/O ────────────────────────────────────────────────────

export function readArtifact(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export function listArtifactDir(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath).filter(f => f.endsWith('.md')).sort();
  } catch {
    return [];
  }
}

export function writeArtifact(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

// ─── Frontmatter parsing (YAML-aware) ──────────────────────────────────────

export interface FrontmatterResult {
  fields: Record<string, string>;
  lists: Record<string, string[]>;
  nested: Record<string, Record<string, string>>;
}

export function extractFrontmatter(content: string): Record<string, string> {
  return parseFrontmatter(content).fields;
}

export function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { fields: {}, lists: {}, nested: {} };

  const fields: Record<string, string> = {};
  const lists: Record<string, string[]> = {};
  const nested: Record<string, Record<string, string>> = {};
  const lines = match[1].split('\n');

  let currentKey: string | null = null;
  let currentList: string[] | null = null;
  let currentNested: Record<string, string> | null = null;

  for (const line of lines) {
    // Indented list item: "  - value"
    if (/^\s+-\s+/.test(line) && currentKey) {
      const value = line.replace(/^\s+-\s+/, '').trim();
      if (value) {
        if (!currentList) currentList = [];
        currentList.push(value.replace(/^["']|["']$/g, ''));
      }
      continue;
    }

    // Indented nested field: "  key: value"
    if (/^\s+\w/.test(line) && currentKey) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const k = line.slice(0, colonIdx).trim();
        const v = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (k && v) {
          if (!currentNested) currentNested = {};
          currentNested[k] = v;
        }
      }
      continue;
    }

    // Flush previous key
    if (currentKey) {
      if (currentList && currentList.length > 0) {
        lists[currentKey] = currentList;
      }
      if (currentNested && Object.keys(currentNested).length > 0) {
        nested[currentKey] = currentNested;
      }
    }

    // Top-level field: "key: value" or "key:"
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const k = line.slice(0, colonIdx).trim();
      const v = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
      currentKey = k;
      currentList = null;
      currentNested = null;
      if (v) {
        fields[k] = v;
      }
    } else {
      currentKey = null;
      currentList = null;
      currentNested = null;
    }
  }

  // Flush last key
  if (currentKey) {
    if (currentList && currentList.length > 0) {
      lists[currentKey] = currentList;
    }
    if (currentNested && Object.keys(currentNested).length > 0) {
      nested[currentKey] = currentNested;
    }
  }

  return { fields, lists, nested };
}

// ─── Section extraction ────────────────────────────────────────────────────

export function extractSection(content: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, 'i');
  const match = content.match(pattern);
  return match ? match[1].trim() : '';
}

function extractH3Sections(content: string): Array<{ id: string; title: string; body: string }> {
  const sections: Array<{ id: string; title: string; body: string }> = [];
  const pattern = /###\s+(HYP-\d+):\s*(.+)\n([\s\S]*?)(?=\n###\s|$)/gi;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    sections.push({ id: match[1], title: match[2].trim(), body: match[3].trim() });
  }
  return sections;
}

// ─── MISSION.md parser ─────────────────────────────────────────────────────

export function parseMission(content: string, projectRoot: string): CaseSummary {
  const fm = extractFrontmatter(content);
  // Mode/Owner/Status can be in frontmatter or bold fields in body
  const mode = fm.mode ?? extractBoldField(content, 'Mode') ?? 'case';
  const opened = fm.opened ?? extractBoldField(content, 'Opened') ?? '';
  const owner = fm.owner ?? extractBoldField(content, 'Owner') ?? '';
  const status = fm.status ?? extractBoldField(content, 'Status') ?? 'Open';

  return {
    caseRoot: projectRoot,
    title: content.match(/^#\s+(?:Mission:\s*)?(.+)/m)?.[1]?.trim() ?? 'Untitled Hunt',
    mode: mode.toLowerCase(),
    opened,
    owner,
    status,
    signal: extractSection(content, 'Signal'),
    desiredOutcome: extractSection(content, 'Desired Outcome'),
    scope: extractSection(content, 'Scope'),
    workingTheory: extractSection(content, 'Working Theory'),
  };
}

function extractBoldField(content: string, field: string): string | null {
  const re = new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+)`, 'i');
  const m = content.match(re);
  return m ? m[1].trim() : null;
}

// ─── STATE.md parser ───────────────────────────────────────────────────────

export function parseState(content: string): CaseProgress {
  const fm = parseFrontmatter(content);
  const progressNested = fm.nested.progress ?? {};

  const progress: CaseProgress = {
    milestone: fm.fields.milestone ?? '',
    milestoneName: fm.fields.milestone_name ?? '',
    currentPhase: 0,
    totalPhases: parseInt(progressNested.total_phases ?? '0', 10) || 0,
    currentPlan: 0,
    totalPlansInPhase: 0,
    percent: parseInt(progressNested.percent ?? '0', 10) || 0,
    phases: [],
    lastActivity: fm.fields.last_activity ?? '',
    lastUpdated: fm.fields.last_updated ?? '',
  };

  // Body parsing for "Phase: N of M" and "Plan: N of M"
  const phaseMatch = content.match(/Phase:\s*(\d+)\s*of\s*(\d+)/i);
  if (phaseMatch) {
    progress.currentPhase = parseInt(phaseMatch[1], 10);
    if (!progress.totalPhases) progress.totalPhases = parseInt(phaseMatch[2], 10);
  }

  const planMatch = content.match(/Plan:\s*(\d+)\s*of\s*(\d+)/i);
  if (planMatch) {
    progress.currentPlan = parseInt(planMatch[1], 10);
    progress.totalPlansInPhase = parseInt(planMatch[2], 10);
  }

  // Fallback percent from body
  if (!progress.percent) {
    const pctMatch = content.match(/(\d+)%/);
    if (pctMatch) progress.percent = parseInt(pctMatch[1], 10);
  }

  // Extract status
  const statusLine = content.match(/^Status:\s*(.+)/im);
  if (statusLine) {
    const s = statusLine[1].trim().toLowerCase();
    if (s.includes('complete')) progress.percent = 100;
  }

  return progress;
}

// ─── HYPOTHESES.md parser ──────────────────────────────────────────────────

export function parseHypotheses(content: string): HypothesisSummary[] {
  const results: HypothesisSummary[] = [];
  const sections = extractH3Sections(content);

  for (const section of sections) {
    const assertion = extractBoldFieldFromBlock(section.body, 'Assertion') ?? section.title;
    const priority = extractBoldFieldFromBlock(section.body, 'Priority') ?? 'Medium';
    const status = extractBoldFieldFromBlock(section.body, 'Status') ?? 'Open';
    const confidence = extractBoldFieldFromBlock(section.body, 'Confidence') ?? 'Low';

    results.push({
      id: section.id,
      assertion,
      priority: priority as HypothesisSummary['priority'],
      status: status as HypothesisSummary['status'],
      confidence: confidence as HypothesisSummary['confidence'],
    });
  }

  return results;
}

function extractBoldFieldFromBlock(body: string, field: string): string | null {
  const re = new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+)`, 'i');
  const m = body.match(re);
  if (m) return m[1].trim();
  // Also try "- **Field:** Value" list format
  const listRe = new RegExp(`-\\s+\\*\\*${field}:\\*\\*\\s*(.+)`, 'i');
  const lm = body.match(listRe);
  return lm ? lm[1].trim() : null;
}

// ─── FINDINGS.md parser ────────────────────────────────────────────────────

export function parseFindings(content: string): FindingSummary[] {
  const results: FindingSummary[] = [];

  // Parse hypothesis verdicts table: | Hypothesis | Verdict | Confidence | Evidence |
  const verdictsSection = extractSection(content, 'Hypothesis Verdicts');
  if (verdictsSection) {
    const rows = verdictsSection.split('\n')
      .filter(l => l.startsWith('|') && !l.includes('---'))
      .slice(1); // skip header

    for (const row of rows) {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      if (cells.length >= 3) {
        results.push({
          title: `${cells[0]}: ${cells[1]}`,
          severity: cells[1] === 'Supported' ? 'High' : cells[1] === 'Disproved' ? 'Low' : 'Medium',
          confidence: cells[2],
          relatedHypotheses: [cells[0]],
          recommendation: cells[3] ?? '',
        });
      }
    }
  }

  // Also parse "## Impacted Scope" as a finding if present
  const execSummary = extractSection(content, 'Executive Summary');
  if (execSummary && results.length === 0) {
    results.push({
      title: 'Executive Summary',
      severity: 'Medium',
      confidence: 'Medium',
      relatedHypotheses: [],
      recommendation: execSummary.slice(0, 300),
    });
  }

  return results;
}

// ─── EVIDENCE_REVIEW.md parser ─────────────────────────────────────────────

export interface EvidenceReviewItem {
  check: string;
  status: 'Pass' | 'Fail' | string;
  notes: string;
}

export interface EvidenceReviewSummary {
  publishabilityVerdict: string;
  checks: EvidenceReviewItem[];
  antiPatterns: EvidenceReviewItem[];
  followUpNeeded: string[];
  blindSpots: string[];
}

export function parseCapturedEvidence(content: string): CapturedEvidenceSummary {
  const fm = parseFrontmatter(content);
  const summary =
    content.match(/^#\s+(?:Evidence:\s*)?(.+)$/m)?.[1]?.trim() ??
    extractSection(content, 'Source') ??
    'Captured evidence';

  return {
    evidenceId: fm.fields.evidence_id ?? '',
    type: fm.fields.type ?? '',
    vendorId: fm.fields.vendor_id ?? '',
    capturedAt: fm.fields.captured_at ?? '',
    capturedBy: fm.fields.captured_by ?? '',
    sourceUrl: fm.fields.source_url ?? '',
    relatedHypotheses: fm.lists.related_hypotheses ?? [],
    reviewStatus: fm.fields.review_status ?? 'captured',
    summary: summary.slice(0, 200),
    classification: (fm.fields.classification as CapturedEvidenceSummary['classification']) ?? 'plain_evidence',
    canonicalizationReason: fm.fields.canonicalization_reason ?? null,
    relatedQueries: fm.lists.related_queries ?? [],
    relatedReceipts: fm.lists.related_receipts ?? [],
  };
}

export function parseEvidenceReview(content: string): EvidenceReviewSummary {
  // Publishability verdict
  const verdictSection = extractSection(content, 'Publishability Verdict');
  const publishabilityVerdict = verdictSection || 'Unknown';

  // Quality checks table
  const checksSection = extractSection(content, 'Evidence Quality Checks');
  const checks = parseStatusTable(checksSection);

  // Anti-pattern table
  const apSection = extractSection(content, 'Sequential Evidence Anti-Patterns');
  const antiPatterns = parseStatusTable(apSection);

  // Follow-up needed
  const fuSection = extractSection(content, 'Follow-Up Needed');
  const followUpNeeded = fuSection
    ? fuSection.split('\n').filter(l => l.startsWith('-')).map(l => l.replace(/^-\s+/, '').trim())
    : [];

  // Blind spots
  const bsSection = extractSection(content, 'Blind Spots');
  const blindSpots = bsSection
    ? bsSection.split('\n').filter(l => l.startsWith('-')).map(l => l.replace(/^-\s+/, '').trim())
    : [];

  return { publishabilityVerdict, checks, antiPatterns, followUpNeeded, blindSpots };
}

function parseStatusTable(section: string): EvidenceReviewItem[] {
  if (!section) return [];
  return section.split('\n')
    .filter(l => l.startsWith('|') && !l.includes('---'))
    .slice(1) // skip header
    .map(row => {
      const cells = row.split('|').map(c => c.trim()).filter(Boolean);
      return {
        check: cells[0] ?? '',
        status: (cells[1] ?? '') as EvidenceReviewItem['status'],
        notes: cells[2] ?? '',
      };
    })
    .filter(item => item.check);
}

// ─── HUNTMAP.md parser ─────────────────────────────────────────────────────

export function parseHuntmapPhases(content: string): PhaseSummary[] {
  const phases: PhaseSummary[] = [];

  // Match checkbox-style phases: - [x] **Phase N: Name** or - [ ] **Phase N: Name**
  const checkboxPattern = /- \[([ x])\]\s+\*\*Phase\s+(\d+):\s*(.+?)\*\*/gi;
  let match;
  while ((match = checkboxPattern.exec(content)) !== null) {
    const isComplete = match[1] === 'x';
    const number = parseInt(match[2], 10);
    const name = match[3].trim();

    // Try to find phase details under ### Phase N:
    const detailPattern = new RegExp(
      `###\\s+Phase\\s+${number}[:\\s].*?\\n([\\s\\S]*?)(?=\\n###\\s+Phase|$)`,
      'i'
    );
    const detailMatch = content.match(detailPattern);
    const details = detailMatch ? detailMatch[1] : '';

    const goal = extractBoldFieldFromBlock(details, 'Goal') ?? name;
    const dependsOn = extractBoldFieldFromBlock(details, 'Depends on') ?? '';
    const plansStr = extractBoldFieldFromBlock(details, 'Plans') ?? '0';
    const planCount = parseInt(plansStr, 10) || 0;

    // Count completed plans from "- [x]" in detail block
    const completedPlans = isComplete
      ? planCount
      : (details.match(/- \[x\]/gi) ?? []).length;

    phases.push({
      number,
      name,
      goal,
      status: isComplete ? 'complete' : 'planned',
      dependsOn,
      planCount,
      completedPlans,
    });
  }

  return phases;
}

// ─── Query log parser ──────────────────────────────────────────────────────

export function parseQueryLog(content: string): QueryLogSummary {
  const fm = parseFrontmatter(content);
  const title = content.match(/^#\s+(?:Query Log:\s*)?(.+)/m)?.[1]?.trim() ?? '';

  // Parse result summary for counts
  const resultSummary = extractSection(content, 'Result Summary');
  const eventMatch = resultSummary.match(/events?=(\d+)/i);
  const entityMatch = resultSummary.match(/entit(?:y|ies)=(\d+)/i);
  const templateMatch = resultSummary.match(/templates?=(\d+)/i);

  return {
    queryId: fm.fields.query_id ?? '',
    connectorId: fm.fields.connector_id ?? '',
    dataset: fm.fields.dataset ?? '',
    executedAt: fm.fields.executed_at ?? '',
    title,
    intent: extractSection(content, 'Intent'),
    eventCount: eventMatch ? parseInt(eventMatch[1], 10) : 0,
    entityCount: entityMatch ? parseInt(entityMatch[1], 10) : 0,
    templateCount: templateMatch ? parseInt(templateMatch[1], 10) : 0,
    relatedHypotheses: fm.lists.related_hypotheses ?? [],
    relatedReceipts: fm.lists.related_receipts ?? [],
  };
}

// ─── Receipt parser ────────────────────────────────────────────────────────

export function parseReceipt(content: string): ReceiptSummary {
  const fm = parseFrontmatter(content);

  return {
    receiptId: fm.fields.receipt_id ?? '',
    connectorId: fm.fields.connector_id ?? fm.fields.source ?? '',
    dataset: fm.fields.dataset ?? '',
    createdAt: fm.fields.created_at ?? '',
    resultStatus: fm.fields.result_status ?? '',
    claimStatus: (fm.fields.claim_status as ReceiptSummary['claimStatus']) ?? 'context',
    claim: extractSection(content, 'Claim'),
    relatedHypotheses: fm.lists.related_hypotheses ?? [],
    relatedQueries: fm.lists.related_queries ?? [],
    confidence: extractSection(content, 'Confidence'),
  };
}

// ─── Full case loader ──────────────────────────────────────────────────────

export interface LoadedArtifacts {
  mission: CaseSummary | null;
  progress: CaseProgress | null;
  hypotheses: HypothesisSummary[];
  queries: QueryLogSummary[];
  receipts: ReceiptSummary[];
  evidence: CapturedEvidenceSummary[];
  findings: FindingSummary[];
  evidenceReview: EvidenceReviewSummary | null;
  huntmapPhases: PhaseSummary[];
  blockers: string[];
  certification: CertificationStatusSummary[];
  certificationCampaigns: CertificationCampaignSummary[];
  certificationHistory: CertificationVendorHistorySummary[];
  certificationDriftTrends: CertificationDriftTrendSummary[];
  certificationBaselines: CertificationBaselineRecord[];
  certificationFreshness: CertificationFreshnessSummary[];
  certificationBaselineChurn: CertificationBaselineChurnSummary[];
}

export function loadAllArtifacts(projectRoot: string): LoadedArtifacts {
  const paths = resolvePlanningPaths(projectRoot);
  const result: LoadedArtifacts = {
    mission: null,
    progress: null,
    hypotheses: [],
    queries: [],
    receipts: [],
    evidence: [],
    findings: [],
    evidenceReview: null,
    huntmapPhases: [],
    blockers: [],
    certification: [],
    certificationCampaigns: [],
    certificationHistory: [],
    certificationDriftTrends: [],
    certificationBaselines: [],
    certificationFreshness: [],
    certificationBaselineChurn: [],
  };

  // MISSION.md
  const missionContent = readArtifact(paths.mission);
  if (missionContent) {
    result.mission = parseMission(missionContent, projectRoot);
  }

  // STATE.md
  const stateContent = readArtifact(paths.state);
  if (stateContent) {
    result.progress = parseState(stateContent);

    // Extract blockers from state
    const blockersSection = extractSection(stateContent, 'Blockers');
    if (blockersSection && !/^none\.?$/i.test(blockersSection.trim())) {
      const items = blockersSection.split('\n')
        .filter(l => l.startsWith('-'))
        .map(l => l.replace(/^-\s+/, '').trim())
        .filter(Boolean);
      result.blockers.push(...items);
    }
  }

  // HYPOTHESES.md
  const hypContent = readArtifact(paths.hypotheses);
  if (hypContent) {
    result.hypotheses = parseHypotheses(hypContent);
  }

  // HUNTMAP.md
  const huntmapContent = readArtifact(paths.huntmap);
  if (huntmapContent) {
    result.huntmapPhases = parseHuntmapPhases(huntmapContent);
    // Merge phases into progress
    if (result.progress) {
      result.progress.phases = result.huntmapPhases;
      if (!result.progress.totalPhases) {
        result.progress.totalPhases = result.huntmapPhases.length;
      }
    }
  }

  // FINDINGS.md
  const findingsContent = readArtifact(paths.findings);
  if (findingsContent) {
    result.findings = parseFindings(findingsContent);
  }

  // EVIDENCE_REVIEW.md
  const erContent = readArtifact(paths.evidenceReview);
  if (erContent) {
    result.evidenceReview = parseEvidenceReview(erContent);

    // Add evidence review blockers
    if (result.evidenceReview.followUpNeeded.length > 0) {
      result.blockers.push(...result.evidenceReview.followUpNeeded.map(f => `Evidence follow-up: ${f}`));
    }
    const failedChecks = result.evidenceReview.checks.filter(c => c.status === 'Fail');
    for (const fc of failedChecks) {
      result.blockers.push(`Evidence check failed: ${fc.check}`);
    }
  }

  // QUERIES/
  for (const file of listArtifactDir(paths.queries)) {
    const content = readArtifact(path.join(paths.queries, file));
    if (content) result.queries.push(parseQueryLog(content));
  }

  // RECEIPTS/
  for (const file of listArtifactDir(paths.receipts)) {
    const content = readArtifact(path.join(paths.receipts, file));
    if (content) result.receipts.push(parseReceipt(content));
  }

  // EVIDENCE/
  for (const file of listArtifactDir(paths.evidence)) {
    const content = readArtifact(path.join(paths.evidence, file));
    if (!content) continue;
    const evidence = parseCapturedEvidence(content);
    result.evidence.push(evidence);

    if (evidence.relatedHypotheses.length === 0) {
      result.blockers.push(`Captured evidence ${evidence.evidenceId || file} is not linked to a hypothesis`);
    }
    if (evidence.reviewStatus === 'needs_follow_up') {
      result.blockers.push(`Captured evidence ${evidence.evidenceId || file} still needs follow-up`);
    }
  }

  // certification/status.json
  const certificationRaw = readArtifact(paths.certificationStatus);
  if (certificationRaw) {
    try {
      const parsed = JSON.parse(certificationRaw) as { vendors?: CertificationStatusSummary[] };
      result.certification = Array.isArray(parsed.vendors) ? parsed.vendors : [];
    } catch {
      result.certification = [];
    }
  }

  if (fs.existsSync(paths.certificationCampaigns)) {
    try {
      const campaignDirs = fs.readdirSync(paths.certificationCampaigns, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(paths.certificationCampaigns, entry.name, 'campaign.json'))
        .filter((filePath) => fs.existsSync(filePath))
        .sort()
        .reverse();

      for (const campaignPath of campaignDirs) {
        const raw = readArtifact(campaignPath);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as CertificationCampaignSummary;
        result.certificationCampaigns.push(parsed);
      }
    } catch {
      result.certificationCampaigns = [];
    }
  }

  const certificationHistoryRaw = readArtifact(paths.certificationHistory);
  if (certificationHistoryRaw) {
    try {
      const parsed = JSON.parse(certificationHistoryRaw) as { vendors?: CertificationVendorHistorySummary[] };
      result.certificationHistory = Array.isArray(parsed.vendors) ? parsed.vendors : [];
    } catch {
      result.certificationHistory = [];
    }
  }

  const certificationDriftRaw = readArtifact(paths.certificationDriftTrends);
  if (certificationDriftRaw) {
    try {
      const parsed = JSON.parse(certificationDriftRaw) as { vendors?: CertificationDriftTrendSummary[] };
      result.certificationDriftTrends = Array.isArray(parsed.vendors) ? parsed.vendors : [];
    } catch {
      result.certificationDriftTrends = [];
    }
  }

  const certificationBaselineRaw = readArtifact(paths.certificationBaselineInventory);
  if (certificationBaselineRaw) {
    try {
      const parsed = JSON.parse(certificationBaselineRaw) as { records?: CertificationBaselineRecord[] };
      result.certificationBaselines = Array.isArray(parsed.records) ? parsed.records : [];
    } catch {
      result.certificationBaselines = [];
    }
  }

  const certificationFreshnessRaw = readArtifact(paths.certificationFreshness);
  if (certificationFreshnessRaw) {
    try {
      const parsed = JSON.parse(certificationFreshnessRaw) as { vendors?: CertificationFreshnessSummary[] };
      result.certificationFreshness = Array.isArray(parsed.vendors) ? parsed.vendors : [];
    } catch {
      result.certificationFreshness = [];
    }
  }

  const certificationBaselineChurnRaw = readArtifact(paths.certificationBaselineChurn);
  if (certificationBaselineChurnRaw) {
    try {
      const parsed = JSON.parse(certificationBaselineChurnRaw) as { vendors?: CertificationBaselineChurnSummary[] };
      result.certificationBaselineChurn = Array.isArray(parsed.vendors) ? parsed.vendors : [];
    } catch {
      result.certificationBaselineChurn = [];
    }
  }

  // Phase-level FINDINGS and EVIDENCE_REVIEW
  if (fs.existsSync(paths.phases)) {
    try {
      const phaseDirs = fs.readdirSync(paths.phases, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name)
        .sort();

      for (const dir of phaseDirs) {
        const phaseDir = path.join(paths.phases, dir);
        const phaseFiles = fs.readdirSync(phaseDir);

        for (const pf of phaseFiles) {
          if (pf.includes('FINDINGS') && pf.endsWith('.md')) {
            const c = readArtifact(path.join(phaseDir, pf));
            if (c) result.findings.push(...parseFindings(c));
          }
          if (pf.includes('EVIDENCE_REVIEW') && pf.endsWith('.md')) {
            const c = readArtifact(path.join(phaseDir, pf));
            if (c) {
              const er = parseEvidenceReview(c);
              const failedChecks = er.checks.filter(ch => ch.status === 'Fail');
              for (const fc of failedChecks) {
                result.blockers.push(`[${dir}] Evidence check failed: ${fc.check}`);
              }
            }
          }
        }
      }
    } catch { /* phases dir unreadable */ }
  }

  return result;
}
