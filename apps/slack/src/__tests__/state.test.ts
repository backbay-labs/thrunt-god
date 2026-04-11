import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  readHuntStatus,
  readFindings,
  readReceipts,
  readMission,
  listCases,
} from "../hunt/state.ts"

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "state-test-"))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

/** Helper: scaffold .planning/ with optional files */
async function scaffold(files: Record<string, string>): Promise<void> {
  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(tmpDir, relPath)
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"))
    await mkdir(dir, { recursive: true })
    await writeFile(fullPath, content)
  }
}

// =============================================================================
// readHuntStatus
// =============================================================================

describe("readHuntStatus", () => {
  test("returns defaults when .planning/ is empty", async () => {
    await mkdir(join(tmpDir, ".planning"), { recursive: true })

    const status = await readHuntStatus(tmpDir)

    expect(status.currentPhase).toBeNull()
    expect(status.currentPhaseName).toBeNull()
    expect(status.totalPhases).toBeNull()
    expect(status.status).toBeNull()
    expect(status.progressPercent).toBeNull()
    expect(status.lastActivity).toBeNull()
    expect(status.blockers).toEqual([])
    expect(status.phases).toEqual([])
    expect(status.milestoneVersion).toBeNull()
  })

  test("returns defaults when .planning/ does not exist", async () => {
    const status = await readHuntStatus(tmpDir)

    expect(status.currentPhase).toBeNull()
    expect(status.phases).toEqual([])
    expect(status.blockers).toEqual([])
  })

  test("parses STATE.md for status, current phase, and last activity", async () => {
    await scaffold({
      ".planning/STATE.md": `# Hunt State

**Status**: Executing
**Current Phase**: 2 - Lateral Movement Analysis
**Last Activity**: 2026-03-28 - Completed signal triage

## Blockers

- Waiting for EDR telemetry access
- Need Okta admin credentials
`,
    })

    const status = await readHuntStatus(tmpDir)

    expect(status.status).toBe("Executing")
    expect(status.currentPhase).toBe("2")
    expect(status.currentPhaseName).toBe("Lateral Movement Analysis")
    expect(status.lastActivity).toBe(
      "2026-03-28 - Completed signal triage",
    )
    expect(status.blockers).toHaveLength(2)
    expect(status.blockers[0]).toBe("Waiting for EDR telemetry access")
    expect(status.blockers[1]).toBe("Need Okta admin credentials")
  })

  test("parses STATE.md with em-dash separator in phase", async () => {
    await scaffold({
      ".planning/STATE.md": `# Hunt State

**Status**: Planned
**Current Phase**: 1.1 \u2014 Initial Triage
`,
    })

    const status = await readHuntStatus(tmpDir)
    expect(status.currentPhase).toBe("1.1")
    expect(status.currentPhaseName).toBe("Initial Triage")
  })

  test("parses STATE.md with phase number only (no name)", async () => {
    await scaffold({
      ".planning/STATE.md": `# State

**Status**: Active
**Current Phase**: 3
`,
    })

    const status = await readHuntStatus(tmpDir)
    expect(status.currentPhase).toBe("3")
    expect(status.currentPhaseName).toBeNull()
  })

  test("parses HUNTMAP.md pipe-table format for phases and milestone version", async () => {
    await scaffold({
      ".planning/HUNTMAP.md": `# Huntmap v1.2.0

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | Signal Triage | completed |
| 2 | Lateral Movement | executing |
| 3 | Impact Assessment | pending |
`,
    })

    const status = await readHuntStatus(tmpDir)

    expect(status.milestoneVersion).toBe("1.2.0")
    expect(status.phases).toHaveLength(3)
    expect(status.phases[0]).toEqual({
      number: "1",
      name: "Signal Triage",
      status: "completed",
      plans: 0,
      summaries: 0,
    })
    expect(status.phases[1].status).toBe("executing")
    expect(status.phases[2].status).toBe("pending")
  })

  test("parses HUNTMAP.md checkbox-list format", async () => {
    await scaffold({
      ".planning/HUNTMAP.md": `# Huntmap: acme.corp OAuth Abuse Response Program

## Phases

- [x] **Phase 1: Program Intake** - Define scope and root artifacts
- [x] **Phase 2: Case Preservation** - Keep case with published findings
- [ ] **Phase 3: Rollup Readiness** - Record case roster and metadata
`,
    })

    const status = await readHuntStatus(tmpDir)

    expect(status.phases).toHaveLength(3)
    expect(status.phases[0]).toEqual({
      number: "1",
      name: "Program Intake",
      status: "completed",
      plans: 0,
      summaries: 0,
    })
    expect(status.phases[1]).toEqual({
      number: "2",
      name: "Case Preservation",
      status: "completed",
      plans: 0,
      summaries: 0,
    })
    expect(status.phases[2]).toEqual({
      number: "3",
      name: "Rollup Readiness",
      status: "pending",
      plans: 0,
      summaries: 0,
    })
  })

  test("checkbox-list format computes progress correctly", async () => {
    await scaffold({
      ".planning/HUNTMAP.md": `# Huntmap

## Phases

- [x] **Phase 1: Done** - Complete
- [x] **Phase 2: Also Done** - Complete
- [ ] **Phase 3: Not Done** - Pending
`,
    })

    const status = await readHuntStatus(tmpDir)

    expect(status.totalPhases).toBe(3)
    expect(status.progressPercent).toBe(67) // 2/3
  })

  test("calculates progress percentage from completed phases", async () => {
    await scaffold({
      ".planning/HUNTMAP.md": `# Huntmap

| Phase | Name | Status |
|-------|------|--------|
| 1 | Phase A | completed |
| 2 | Phase B | completed |
| 3 | Phase C | executing |
| 4 | Phase D | pending |
`,
    })

    const status = await readHuntStatus(tmpDir)

    expect(status.totalPhases).toBe(4)
    expect(status.progressPercent).toBe(50) // 2/4 = 50%
  })

  test("counts plan and summary artifacts per phase", async () => {
    await scaffold({
      ".planning/HUNTMAP.md": `# Huntmap

| Phase | Name | Status |
|-------|------|--------|
| 1 | Signal Triage | completed |
`,
      ".planning/phase-1/PLAN-01-01.md": "Plan content",
      ".planning/phase-1/PLAN-01-02.md": "Plan content 2",
      ".planning/phase-1/SUMMARY-01.md": "Summary content",
    })

    const status = await readHuntStatus(tmpDir)

    expect(status.phases[0].plans).toBe(2)
    expect(status.phases[0].summaries).toBe(1)
  })

  test("combined STATE.md and HUNTMAP.md", async () => {
    await scaffold({
      ".planning/STATE.md": `# State

**Status**: Executing
**Current Phase**: 2 - Deep Dive
**Last Activity**: 2026-04-01 - Started phase 2
`,
      ".planning/HUNTMAP.md": `# Huntmap v0.5.0

| Phase | Name | Status |
|-------|------|--------|
| 1 | Triage | completed |
| 2 | Deep Dive | executing |
`,
    })

    const status = await readHuntStatus(tmpDir)

    expect(status.status).toBe("Executing")
    expect(status.currentPhase).toBe("2")
    expect(status.currentPhaseName).toBe("Deep Dive")
    expect(status.milestoneVersion).toBe("0.5.0")
    expect(status.phases).toHaveLength(2)
    expect(status.progressPercent).toBe(50)
  })

  test("parses STATE.md with YAML frontmatter (program-level)", async () => {
    await scaffold({
      ".planning/STATE.md": `---
thrunt_state_version: 1.0
status: completed
last_activity: "2026-03-28 - Program summary updated"
---

# Hunt State

**Active signal:** acme.corp OAuth abuse response program
`,
    })

    const status = await readHuntStatus(tmpDir)

    expect(status.status).toBe("completed")
    expect(status.lastActivity).toBe(
      "2026-03-28 - Program summary updated",
    )
  })

  test("parses STATE.md with YAML frontmatter (child case)", async () => {
    await scaffold({
      ".planning/STATE.md": `---
title: "OAuth Phishing Campaign - acme.corp M365"
status: closed
opened_at: "2026-03-28"
closed_at: "2026-03-28"
last_activity: "2026-03-28 - Completed evidence review and findings"
technique_ids: [T1566, T1078, T1098]
---

# Hunt State

## Current Position

Phase: 3 of 3 (Evidence Correlation)
`,
    })

    const status = await readHuntStatus(tmpDir)

    expect(status.status).toBe("closed")
    expect(status.lastActivity).toBe(
      "2026-03-28 - Completed evidence review and findings",
    )
  })

  test("bold-markdown fields override frontmatter values", async () => {
    await scaffold({
      ".planning/STATE.md": `---
status: closed
last_activity: "frontmatter activity"
---

# Hunt State

**Status**: Executing
**Last Activity**: 2026-04-01 - markdown activity
`,
    })

    const status = await readHuntStatus(tmpDir)

    // Bold-markdown overrides because it's processed after frontmatter
    expect(status.status).toBe("Executing")
    expect(status.lastActivity).toBe("2026-04-01 - markdown activity")
  })

  test("handles STATE.md with no blockers section", async () => {
    await scaffold({
      ".planning/STATE.md": `# State

**Status**: Complete

## Notes

Some notes here.
`,
    })

    const status = await readHuntStatus(tmpDir)
    expect(status.status).toBe("Complete")
    expect(status.blockers).toEqual([])
  })

  test("blockers section ends when next section starts", async () => {
    await scaffold({
      ".planning/STATE.md": `# State

**Status**: Blocked

## Blockers

- Need API access
- Waiting for approval

## Notes

Not a blocker.
- This bullet is not a blocker either
`,
    })

    const status = await readHuntStatus(tmpDir)
    expect(status.blockers).toHaveLength(2)
    expect(status.blockers).toContain("Need API access")
    expect(status.blockers).toContain("Waiting for approval")
  })
})

// =============================================================================
// readFindings
// =============================================================================

describe("readFindings", () => {
  test("returns null when FINDINGS.md does not exist", async () => {
    await mkdir(join(tmpDir, ".planning"), { recursive: true })
    const findings = await readFindings(tmpDir)
    expect(findings).toBeNull()
  })

  test("parses executive summary", async () => {
    await scaffold({
      ".planning/FINDINGS.md": `# Findings

## Executive Summary

The investigation revealed a sophisticated phishing campaign targeting OAuth tokens. Multiple user accounts were compromised through consent grant abuse.

## Hypothesis Verdicts

| Hypothesis | Verdict | Confidence | Evidence |
|------------|---------|------------|----------|

## Impacted Scope

## Recommendations
`,
    })

    const findings = await readFindings(tmpDir)
    expect(findings).not.toBeNull()
    expect(findings!.summary).toContain("sophisticated phishing campaign")
    expect(findings!.summary).toContain("consent grant abuse")
  })

  test("parses hypothesis verdicts from table", async () => {
    await scaffold({
      ".planning/FINDINGS.md": `# Findings

## Executive Summary

Summary text here.

## Hypothesis Verdicts

| Hypothesis | Verdict | Confidence | Evidence |
|------------|---------|------------|----------|
| HYP-01 | Supported | High | RCT-20260409-201 |
| HYP-02 | Refuted | Medium | RCT-20260409-202 |
| HYP-03 | Inconclusive | Low | |
`,
    })

    const findings = await readFindings(tmpDir)
    expect(findings!.hypotheses).toHaveLength(3)

    expect(findings!.hypotheses[0]).toEqual({
      id: "HYP-01",
      text: "HYP-01",
      verdict: "supported",
      confidence: "high",
      evidence: "RCT-20260409-201",
    })

    expect(findings!.hypotheses[1]).toEqual({
      id: "HYP-02",
      text: "HYP-02",
      verdict: "refuted",
      confidence: "medium",
      evidence: "RCT-20260409-202",
    })

    expect(findings!.hypotheses[2]).toEqual({
      id: "HYP-03",
      text: "HYP-03",
      verdict: "inconclusive",
      confidence: "low",
      evidence: undefined,
    })
  })

  test("parses impacted scope as bullet list", async () => {
    await scaffold({
      ".planning/FINDINGS.md": `# Findings

## Executive Summary

Brief summary.

## Impacted Scope

- **Production servers:** web-01, web-02
- **User accounts:** admin@acme.corp, svc-oauth@acme.corp
- **OAuth applications:** 3 malicious consent grants

## Recommendations
`,
    })

    const findings = await readFindings(tmpDir)
    expect(findings!.impactScope).toHaveLength(3)
    expect(findings!.impactScope[0]).toContain("Production servers")
    expect(findings!.impactScope[2]).toContain("OAuth applications")
  })

  test("parses recommendations as bullet list", async () => {
    await scaffold({
      ".planning/FINDINGS.md": `# Findings

## Executive Summary

Brief.

## Recommendations

- Revoke all compromised OAuth tokens immediately
- Enable conditional access policies for OAuth consent
- Review audit logs for past 30 days
`,
    })

    const findings = await readFindings(tmpDir)
    expect(findings!.recommendations).toHaveLength(3)
    expect(findings!.recommendations[0]).toContain("Revoke all compromised")
    expect(findings!.recommendations[2]).toContain("Review audit logs")
  })

  test("handles FINDINGS.md with all sections populated", async () => {
    await scaffold({
      ".planning/FINDINGS.md": `# Findings: OAuth Abuse Investigation

## Executive Summary

The acme.corp OAuth-abuse program identified three compromised accounts via illicit consent grants.

## Hypothesis Verdicts

| Hypothesis | Verdict | Confidence | Evidence |
|------------|---------|------------|----------|
| HYP-01 | Supported | High | RCT-20260409-201 |
| HYP-02 | Supported | High | RCT-20260409-202 |

## Impacted Scope

- M365 tenant: acme.corp
- 3 user mailboxes with forwarding rules

## Recommendations

- Reset credentials for all impacted accounts
- Remove malicious OAuth applications
`,
    })

    const findings = await readFindings(tmpDir)
    expect(findings!.summary).toContain("three compromised accounts")
    expect(findings!.hypotheses).toHaveLength(2)
    expect(findings!.impactScope).toHaveLength(2)
    expect(findings!.recommendations).toHaveLength(2)
  })

  test("Attack Timeline section does not contaminate other sections", async () => {
    await scaffold({
      ".planning/FINDINGS.md": `# Findings

## Executive Summary

Brief summary only.

## Attack Timeline

- 2026-03-25: Phishing email sent
- 2026-03-26: OAuth consent granted
- 2026-03-27: Mailbox rules created

## Hypothesis Verdicts

| Hypothesis | Verdict | Confidence | Evidence |
|------------|---------|------------|----------|
| HYP-01 | Supported | High | RCT-001 |

## Impacted Scope

- M365 tenant

## Recommendations

- Revoke tokens
`,
    })

    const findings = await readFindings(tmpDir)
    expect(findings!.summary).toBe("Brief summary only.")
    expect(findings!.summary).not.toContain("Phishing email sent")
    expect(findings!.hypotheses).toHaveLength(1)
    expect(findings!.hypotheses[0].id).toBe("HYP-01")
    expect(findings!.impactScope).toEqual(["M365 tenant"])
    expect(findings!.impactScope).not.toContain("2026-03-25: Phishing email sent")
    expect(findings!.recommendations).toEqual(["Revoke tokens"])
  })

  test("handles FINDINGS.md with empty sections", async () => {
    await scaffold({
      ".planning/FINDINGS.md": `# Findings

## Executive Summary

## Hypothesis Verdicts

| Hypothesis | Verdict | Confidence | Evidence |
|------------|---------|------------|----------|

## Impacted Scope

## Recommendations
`,
    })

    const findings = await readFindings(tmpDir)
    expect(findings!.summary).toBe("")
    expect(findings!.hypotheses).toEqual([])
    expect(findings!.impactScope).toEqual([])
    expect(findings!.recommendations).toEqual([])
  })
})

// =============================================================================
// readReceipts
// =============================================================================

describe("readReceipts", () => {
  test("returns empty array when RECEIPTS/ does not exist", async () => {
    await mkdir(join(tmpDir, ".planning"), { recursive: true })
    const receipts = await readReceipts(tmpDir)
    expect(receipts).toEqual([])
  })

  test("returns empty array when RECEIPTS/ is empty", async () => {
    await mkdir(join(tmpDir, ".planning", "RECEIPTS"), { recursive: true })
    const receipts = await readReceipts(tmpDir)
    expect(receipts).toEqual([])
  })

  test("parses a single receipt file", async () => {
    await scaffold({
      ".planning/RECEIPTS/RCT-20260409-001.md": `source: Workspace Inventory
claim_status: supports
related_hypotheses: HYP-01
content_hash: sha256:abc123
created_at: 2026-04-09T14:25:00Z

# Receipt: Program Intake Artifacts Parse Cleanly

## Claim

The program workspace contains all required artifacts.

## Evidence

All files present and readable.
`,
    })

    const receipts = await readReceipts(tmpDir)
    expect(receipts).toHaveLength(1)
    expect(receipts[0].id).toBe("RCT-20260409-001")
    expect(receipts[0].title).toBe("Program Intake Artifacts Parse Cleanly")
    expect(receipts[0].source).toBe("Workspace Inventory")
    expect(receipts[0].claimStatus).toBe("supports")
    expect(receipts[0].relatedHypotheses).toContain("HYP-01")
    expect(receipts[0].contentHash).toBe("sha256:abc123")
    expect(receipts[0].createdAt).toBe("2026-04-09T14:25:00Z")
  })

  test("parses multiple receipts sorted by ID", async () => {
    await scaffold({
      ".planning/RECEIPTS/RCT-20260409-003.md": `source: Log Query
claim_status: contradicts
related_hypotheses: HYP-01, HYP-02

# Receipt: No Lateral Movement Observed
`,
      ".planning/RECEIPTS/RCT-20260409-001.md": `source: EDR
claim_status: supports
related_hypotheses: HYP-01

# Receipt: Malware Detected
`,
      ".planning/RECEIPTS/RCT-20260409-002.md": `source: SIEM
claim_status: neutral
related_hypotheses: HYP-03

# Receipt: Inconclusive Log Data
`,
    })

    const receipts = await readReceipts(tmpDir)
    expect(receipts).toHaveLength(3)
    expect(receipts[0].id).toBe("RCT-20260409-001")
    expect(receipts[1].id).toBe("RCT-20260409-002")
    expect(receipts[2].id).toBe("RCT-20260409-003")
  })

  test("handles receipt with contradicts claim status", async () => {
    await scaffold({
      ".planning/RECEIPTS/RCT-20260410-001.md": `source: Threat Intel
claim_status: contradicts
related_hypotheses: HYP-02

# Receipt: Hash Not in Known Malware DB
`,
    })

    const receipts = await readReceipts(tmpDir)
    expect(receipts[0].claimStatus).toBe("contradicts")
  })

  test("defaults to neutral when claim_status is missing", async () => {
    await scaffold({
      ".planning/RECEIPTS/RCT-20260410-002.md": `source: Manual Review

# Receipt: Analyst Notes
`,
    })

    const receipts = await readReceipts(tmpDir)
    expect(receipts[0].claimStatus).toBe("neutral")
  })

  test("ignores non-RCT files in RECEIPTS/", async () => {
    await scaffold({
      ".planning/RECEIPTS/RCT-20260409-001.md": `source: EDR
claim_status: supports
related_hypotheses: HYP-01

# Receipt: Valid Receipt
`,
      ".planning/RECEIPTS/README.md": "This is not a receipt.",
      ".planning/RECEIPTS/notes.txt": "Random notes.",
    })

    const receipts = await readReceipts(tmpDir)
    expect(receipts).toHaveLength(1)
    expect(receipts[0].id).toBe("RCT-20260409-001")
  })

  test("uses receipt ID as title fallback when no title header", async () => {
    await scaffold({
      ".planning/RECEIPTS/RCT-20260409-001.md": `source: SIEM
claim_status: neutral

Just some evidence text without a title header.
`,
    })

    const receipts = await readReceipts(tmpDir)
    expect(receipts[0].title).toBe("RCT-20260409-001")
  })

  test("parses multiple related hypotheses (inline format)", async () => {
    await scaffold({
      ".planning/RECEIPTS/RCT-20260409-001.md": `source: EDR
claim_status: supports
related_hypotheses: HYP-01, HYP-02, HYP-03

# Receipt: Multi-hypothesis Evidence
`,
    })

    const receipts = await readReceipts(tmpDir)
    expect(receipts[0].relatedHypotheses).toEqual([
      "HYP-01",
      "HYP-02",
      "HYP-03",
    ])
  })

  test("parses related_hypotheses in YAML-list format", async () => {
    await scaffold({
      ".planning/RECEIPTS/RCT-20260409-001.md": `source: Workspace Inventory
claim_status: supports
related_hypotheses:
  - HYP-01
  - HYP-02
content_hash: sha256:abc123

# Receipt: YAML List Evidence
`,
    })

    const receipts = await readReceipts(tmpDir)
    expect(receipts[0].relatedHypotheses).toEqual(["HYP-01", "HYP-02"])
    expect(receipts[0].contentHash).toBe("sha256:abc123")
  })

  test("parses receipt with real YAML frontmatter format", async () => {
    await scaffold({
      ".planning/RECEIPTS/RCT-20260409-201.md": `---
receipt_id: RCT-20260409-201
query_spec_version: "1.0"
created_at: 2026-04-09T14:25:00Z
source: Workspace Inventory
connector_id: filesystem
dataset: workspace
result_status: ok
claim_status: supports
related_hypotheses:
  - HYP-01
content_hash: sha256:e8bc0907f5324e6ca0465595d9ba805fb7051669ea1db69c1ccf4d2357a79201
manifest_id: MAN-20260409-201
---

# Receipt: Program Intake Artifacts Parse Cleanly

## Claim

The acme.corp example root exposes the required program-level artifacts.

## Evidence

Observable facts from QRY-20260409-201.
`,
    })

    const receipts = await readReceipts(tmpDir)
    expect(receipts).toHaveLength(1)
    expect(receipts[0].id).toBe("RCT-20260409-201")
    expect(receipts[0].title).toBe("Program Intake Artifacts Parse Cleanly")
    expect(receipts[0].source).toBe("Workspace Inventory")
    expect(receipts[0].claimStatus).toBe("supports")
    expect(receipts[0].relatedHypotheses).toEqual(["HYP-01"])
    expect(receipts[0].contentHash).toBe(
      "sha256:e8bc0907f5324e6ca0465595d9ba805fb7051669ea1db69c1ccf4d2357a79201",
    )
    expect(receipts[0].createdAt).toBe("2026-04-09T14:25:00Z")
  })
})

// =============================================================================
// readMission
// =============================================================================

describe("readMission", () => {
  test("returns null when MISSION.md does not exist", async () => {
    await mkdir(join(tmpDir, ".planning"), { recursive: true })
    const mission = await readMission(tmpDir)
    expect(mission).toBeNull()
  })

  test("parses mission title", async () => {
    await scaffold({
      ".planning/MISSION.md": `# Mission: OAuth Phishing Campaign Investigation

**Mode**: hunt
**Owner**: SOC Tier 2

## Signal

Detected phishing emails targeting OAuth consent flows.

## Scope

- M365 tenant
`,
    })

    const mission = await readMission(tmpDir)
    expect(mission).not.toBeNull()
    expect(mission!.title).toBe("OAuth Phishing Campaign Investigation")
  })

  test("parses owner field", async () => {
    await scaffold({
      ".planning/MISSION.md": `# Mission: Test Hunt

**Owner**: <@U12345> (via Slack)

## Signal

Test signal.

## Scope

Test scope.
`,
    })

    const mission = await readMission(tmpDir)
    expect(mission!.owner).toBe("<@U12345> (via Slack)")
  })

  test("parses signal section content", async () => {
    await scaffold({
      ".planning/MISSION.md": `# Mission: Beacon Detection

## Signal

Multiple hosts beaconing to suspicious C2 infrastructure at 10.0.0.99 on port 443 with periodic intervals.

## Scope

- Internal network segment
`,
    })

    const mission = await readMission(tmpDir)
    expect(mission!.signal).toContain("Multiple hosts beaconing")
    expect(mission!.signal).toContain("10.0.0.99")
  })

  test("parses scope section content", async () => {
    await scaffold({
      ".planning/MISSION.md": `# Mission: Lateral Movement

## Signal

Alert from SIEM.

## Scope

- **ip**: \`192.168.1.100\`
- **domain**: \`evil.com\`
- Production web servers

## Working Theory

TBD
`,
    })

    const mission = await readMission(tmpDir)
    expect(mission!.scope).toContain("192.168.1.100")
    expect(mission!.scope).toContain("evil.com")
    expect(mission!.scope).toContain("Production web servers")
  })

  test("returns 'Untitled Hunt' when no title in header", async () => {
    await scaffold({
      ".planning/MISSION.md": `# Not a mission header

## Signal

Some signal.
`,
    })

    const mission = await readMission(tmpDir)
    expect(mission!.title).toBe("Untitled Hunt")
  })

  test("signal section stops at next section heading", async () => {
    await scaffold({
      ".planning/MISSION.md": `# Mission: Test

## Signal

First signal line.
Second signal line.

## Scope

This is scope, not signal.
`,
    })

    const mission = await readMission(tmpDir)
    expect(mission!.signal).toContain("First signal line.")
    expect(mission!.signal).toContain("Second signal line.")
    expect(mission!.signal).not.toContain("scope")
  })

  test("parses realistic mission file matching example format", async () => {
    await scaffold({
      ".planning/MISSION.md": `# Mission: acme.corp OAuth Abuse Response Program

**Mode**: program
**Opened**: 2026-03-28
**Owner**: SOC Tier 2 - threat hunting team
**Status**: Complete

## Signal

acme.corp OAuth abuse response program

## Desired Outcome

Keep completed OAuth abuse investigations in a program workspace.

## Scope

- **Cases**: 1 closed case at \`cases/oauth-session-hijack\`
- **Theme**: OAuth phishing, illicit consent grants
- **Environment**: acme.corp Microsoft 365 tenant

## Working Theory

OAuth abuse cases benefit from a program-level view.
`,
    })

    const mission = await readMission(tmpDir)
    expect(mission!.title).toBe("acme.corp OAuth Abuse Response Program")
    expect(mission!.owner).toBe("SOC Tier 2 - threat hunting team")
    expect(mission!.signal).toBe("acme.corp OAuth abuse response program")
    expect(mission!.scope).toContain("**Cases**")
  })
})

// =============================================================================
// listCases
// =============================================================================

describe("listCases", () => {
  test("returns empty array when cases/ does not exist", async () => {
    await mkdir(join(tmpDir, ".planning"), { recursive: true })
    const cases = await listCases(tmpDir)
    expect(cases).toEqual([])
  })

  test("returns empty array when .planning/ does not exist", async () => {
    const cases = await listCases(tmpDir)
    expect(cases).toEqual([])
  })

  test("lists case directories", async () => {
    await scaffold({
      ".planning/cases/oauth-phish/MISSION.md": "content",
      ".planning/cases/lateral-movement/MISSION.md": "content",
      ".planning/cases/data-exfil/MISSION.md": "content",
    })

    const cases = await listCases(tmpDir)
    expect(cases).toHaveLength(3)
    expect(cases).toContain("oauth-phish")
    expect(cases).toContain("lateral-movement")
    expect(cases).toContain("data-exfil")
  })

  test("ignores files in cases/ (only returns directories)", async () => {
    await scaffold({
      ".planning/cases/real-case/MISSION.md": "content",
      ".planning/cases/README.md": "This is a file, not a case",
    })

    const cases = await listCases(tmpDir)
    expect(cases).toHaveLength(1)
    expect(cases[0]).toBe("real-case")
  })
})
