import { z } from "zod"

// =============================================================================
// HUNT STATE — mirrored from .planning/ artifacts
// =============================================================================

export const HuntPhase = z.object({
  number: z.string(),
  name: z.string(),
  status: z.enum(["pending", "planned", "executing", "completed", "blocked"]),
  plans: z.number().int().nonnegative(),
  summaries: z.number().int().nonnegative(),
})

export const HuntStatus = z.object({
  currentPhase: z.string().nullable(),
  currentPhaseName: z.string().nullable(),
  totalPhases: z.number().nullable(),
  status: z.string().nullable(),
  progressPercent: z.number().nullable(),
  lastActivity: z.string().nullable(),
  blockers: z.array(z.string()),
  phases: z.array(HuntPhase),
  milestoneVersion: z.string().nullable(),
})

export const FindingVerdict = z.enum([
  "supported",
  "refuted",
  "inconclusive",
  "not_tested",
])

export const HypothesisVerdict = z.object({
  id: z.string(),
  text: z.string(),
  verdict: FindingVerdict,
  confidence: z.enum(["low", "medium", "high"]).optional(),
  evidence: z.string().optional(),
})

export const Receipt = z.object({
  id: z.string(),
  title: z.string(),
  source: z.string(),
  claimStatus: z.enum(["supports", "contradicts", "neutral"]),
  relatedHypotheses: z.array(z.string()),
  contentHash: z.string().optional(),
  createdAt: z.string().optional(),
})

export const Findings = z.object({
  summary: z.string(),
  hypotheses: z.array(HypothesisVerdict),
  impactScope: z.array(z.string()),
  recommendations: z.array(z.string()),
})

export type HuntPhase = z.infer<typeof HuntPhase>
export type HuntStatus = z.infer<typeof HuntStatus>
export type FindingVerdict = z.infer<typeof FindingVerdict>
export type HypothesisVerdict = z.infer<typeof HypothesisVerdict>
export type Receipt = z.infer<typeof Receipt>
export type Findings = z.infer<typeof Findings>

// =============================================================================
// CASE CREATION
// =============================================================================

export const IocType = z.enum([
  "ip",
  "domain",
  "hash",
  "url",
  "email",
  "file_path",
  "command",
])

export const CaseSource = z.object({
  /** Where this case originated */
  origin: z.enum(["slash_command", "message_shortcut", "alert_forward", "ioc_paste"]),
  /** Slack channel where the case was opened */
  channelId: z.string(),
  /** Slack thread timestamp (if from a thread) */
  threadTs: z.string().optional(),
  /** User who triggered the case */
  userId: z.string(),
  /** Raw text that triggered the case */
  rawText: z.string(),
  /** Extracted IOCs from the raw text */
  extractedIocs: z.array(z.object({
    type: IocType,
    value: z.string(),
  })),
})

export type IocType = z.infer<typeof IocType>
export type CaseSource = z.infer<typeof CaseSource>

// =============================================================================
// APPROVAL FLOW
// =============================================================================

export const ApprovalRequest = z.object({
  /** Unique ID for this approval */
  id: z.string(),
  /** What the bot wants to do next */
  action: z.string(),
  /** Why it wants to do it */
  rationale: z.string(),
  /** Phase this applies to */
  phase: z.string(),
  /** Timestamp when requested */
  requestedAt: z.string(),
  /** Current state */
  status: z.enum(["pending", "approved", "denied"]),
  /** Who responded */
  respondedBy: z.string().optional(),
  /** When they responded */
  respondedAt: z.string().optional(),
})

export type ApprovalRequest = z.infer<typeof ApprovalRequest>

// =============================================================================
// IOC EXTRACTION PATTERNS
// =============================================================================

interface IocPatternDefinition {
  source: string
  flags: string
}

function defineIocPattern(pattern: RegExp): IocPatternDefinition {
  return {
    source: pattern.source,
    flags: pattern.flags,
  }
}

export const IOC_PATTERNS: Record<IocType, IocPatternDefinition> = {
  ip: defineIocPattern(/\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g),
  domain: defineIocPattern(/\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|co|gov|edu|mil|xyz|info|biz|dev|app|cloud|ru|cn|de|uk|fr|jp|kr|br|au|nl|se|no|fi|dk|ch|at|be|it|es|pt)\b/g),
  hash: defineIocPattern(/\b[a-fA-F0-9]{64}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{32}\b/g),
  url: defineIocPattern(/https?:\/\/[^\s<>\"']+/g),
  email: defineIocPattern(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g),
  file_path: defineIocPattern(/(?:\/(?:tmp|var|etc|usr|home|opt|proc|sys|dev|mnt|root|Windows|Users|Program Files)[^\s;|&"']*)/g),
  command: defineIocPattern(/\b(?:powershell|cmd\.exe|bash|sh|python|curl|wget|certutil|bitsadmin|mshta|regsvr32|rundll32)\s+[^\n]{5,}/gi),
}
