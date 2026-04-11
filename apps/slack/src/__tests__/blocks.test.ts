import { describe, test, expect } from "bun:test"
import {
  header,
  section,
  divider,
  fields,
  context,
  actions,
  statusEmoji,
  verdictEmoji,
} from "../blocks/common.ts"
import { huntStatusBlocks, huntStatusOneliner } from "../blocks/status.ts"
import {
  approvalRequestBlocks,
  approvalResponseBlocks,
} from "../blocks/approval.ts"
import { findingsBlocks, receiptSummaryBlocks } from "../blocks/findings.ts"
import { caseCreatedBlocks, caseModalBlocks } from "../blocks/case.ts"
import type { HuntStatus, ApprovalRequest, Findings, Receipt } from "../types.ts"
import type { MissionSummary } from "../hunt/state.ts"
import type { CreateCaseResult } from "../hunt/case.ts"
import type { CaseSource } from "../types.ts"

// =============================================================================
// common.ts — primitives
// =============================================================================

describe("common block builders", () => {
  describe("header", () => {
    test("returns header block with plain_text", () => {
      const block = header("Test Header")
      expect(block.type).toBe("header")
      expect((block as any).text.type).toBe("plain_text")
      expect((block as any).text.text).toBe("Test Header")
      expect((block as any).text.emoji).toBe(true)
    })
  })

  describe("section", () => {
    test("returns section block with mrkdwn text", () => {
      const block = section("Hello *world*")
      expect(block.type).toBe("section")
      expect((block as any).text.type).toBe("mrkdwn")
      expect((block as any).text.text).toBe("Hello *world*")
    })
  })

  describe("divider", () => {
    test("returns divider block", () => {
      const block = divider()
      expect(block.type).toBe("divider")
    })
  })

  describe("fields", () => {
    test("returns section block with field pairs", () => {
      const block = fields([
        ["Label A", "Value A"],
        ["Label B", "Value B"],
      ])
      expect(block.type).toBe("section")
      const f = (block as any).fields
      expect(f).toHaveLength(2)
      expect(f[0].type).toBe("mrkdwn")
      expect(f[0].text).toBe("*Label A*\nValue A")
      expect(f[1].text).toBe("*Label B*\nValue B")
    })

    test("handles single field pair", () => {
      const block = fields([["Only", "One"]])
      expect((block as any).fields).toHaveLength(1)
    })

    test("handles empty fields array", () => {
      const block = fields([])
      expect((block as any).fields).toEqual([])
    })
  })

  describe("context", () => {
    test("returns context block with mrkdwn elements", () => {
      const block = context(["First", "Second"])
      expect(block.type).toBe("context")
      const elements = (block as any).elements
      expect(elements).toHaveLength(2)
      expect(elements[0].type).toBe("mrkdwn")
      expect(elements[0].text).toBe("First")
      expect(elements[1].text).toBe("Second")
    })
  })

  describe("actions", () => {
    test("returns actions block with buttons", () => {
      const block = actions("test_block", [
        { text: "Click Me", actionId: "btn_click", value: "val1" },
        {
          text: "Danger",
          actionId: "btn_danger",
          value: "val2",
          style: "danger",
        },
      ])

      expect(block.type).toBe("actions")
      expect((block as any).block_id).toBe("test_block")
      const elements = (block as any).elements
      expect(elements).toHaveLength(2)

      expect(elements[0].type).toBe("button")
      expect(elements[0].text.type).toBe("plain_text")
      expect(elements[0].text.text).toBe("Click Me")
      expect(elements[0].action_id).toBe("btn_click")
      expect(elements[0].value).toBe("val1")
      expect(elements[0].style).toBeUndefined()

      expect(elements[1].style).toBe("danger")
    })

    test("includes primary style when specified", () => {
      const block = actions("test", [
        { text: "Go", actionId: "go", style: "primary" },
      ])
      expect((block as any).elements[0].style).toBe("primary")
    })

    test("omits style property when not specified", () => {
      const block = actions("test", [
        { text: "Plain", actionId: "plain" },
      ])
      expect((block as any).elements[0]).not.toHaveProperty("style")
    })
  })

  describe("statusEmoji", () => {
    test("returns correct emoji for known statuses", () => {
      expect(statusEmoji("pending")).toBe(":white_circle:")
      expect(statusEmoji("planned")).toBe(":large_blue_circle:")
      expect(statusEmoji("executing")).toBe(":spinner:")
      expect(statusEmoji("completed")).toBe(":white_check_mark:")
      expect(statusEmoji("blocked")).toBe(":no_entry:")
    })

    test("returns question mark for unknown status", () => {
      expect(statusEmoji("unknown")).toBe(":question:")
      expect(statusEmoji("")).toBe(":question:")
    })

    test("is case-insensitive", () => {
      expect(statusEmoji("COMPLETED")).toBe(":white_check_mark:")
      expect(statusEmoji("Executing")).toBe(":spinner:")
    })
  })

  describe("verdictEmoji", () => {
    test("returns correct emoji for known verdicts", () => {
      expect(verdictEmoji("supported")).toBe(":white_check_mark:")
      expect(verdictEmoji("refuted")).toBe(":x:")
      expect(verdictEmoji("inconclusive")).toBe(":grey_question:")
      expect(verdictEmoji("not_tested")).toBe(":white_circle:")
    })

    test("returns question mark for unknown verdict", () => {
      expect(verdictEmoji("unknown")).toBe(":question:")
    })

    test("is case-insensitive", () => {
      expect(verdictEmoji("SUPPORTED")).toBe(":white_check_mark:")
      expect(verdictEmoji("Refuted")).toBe(":x:")
    })
  })
})

// =============================================================================
// status.ts — huntStatusBlocks, huntStatusOneliner
// =============================================================================

describe("huntStatusBlocks", () => {
  const baseStatus: HuntStatus = {
    currentPhase: null,
    currentPhaseName: null,
    totalPhases: null,
    status: null,
    progressPercent: null,
    lastActivity: null,
    blockers: [],
    phases: [],
    milestoneVersion: null,
  }

  test("includes header with mission title when available", () => {
    const mission: MissionSummary = {
      title: "OAuth Investigation",
      signal: "Phishing detected",
      scope: "M365 tenant",
      owner: "SOC Team",
    }
    const blocks = huntStatusBlocks(baseStatus, mission)

    const headerBlock = blocks.find((b) => b.type === "header") as any
    expect(headerBlock).toBeDefined()
    expect(headerBlock.text.text).toBe("OAuth Investigation")
  })

  test("uses default header when no mission", () => {
    const blocks = huntStatusBlocks(baseStatus, null)
    const headerBlock = blocks.find((b) => b.type === "header") as any
    expect(headerBlock.text.text).toBe("Hunt Status")
  })

  test("includes mission signal as quote", () => {
    const mission: MissionSummary = {
      title: "Test",
      signal: "Suspicious C2 traffic observed",
      scope: "",
      owner: null,
    }
    const blocks = huntStatusBlocks(baseStatus, mission)

    const sectionBlocks = blocks.filter((b) => b.type === "section")
    const signalBlock = sectionBlocks.find((b) =>
      (b as any).text?.text?.startsWith(">"),
    )
    expect(signalBlock).toBeDefined()
    expect((signalBlock as any).text.text).toContain(
      "Suspicious C2 traffic observed",
    )
  })

  test("includes status and progress fields", () => {
    const status: HuntStatus = {
      ...baseStatus,
      status: "Executing",
      progressPercent: 75,
    }
    const blocks = huntStatusBlocks(status, null)

    const fieldBlocks = blocks.filter(
      (b) => b.type === "section" && (b as any).fields,
    )
    expect(fieldBlocks.length).toBeGreaterThanOrEqual(1)

    const allFieldTexts = fieldBlocks.flatMap((b: any) =>
      b.fields.map((f: any) => f.text),
    )
    expect(allFieldTexts.some((t: string) => t.includes("Executing"))).toBe(
      true,
    )
    expect(allFieldTexts.some((t: string) => t.includes("75%"))).toBe(true)
  })

  test("shows current phase when set", () => {
    const status: HuntStatus = {
      ...baseStatus,
      currentPhase: "2",
      currentPhaseName: "Lateral Movement",
    }
    const blocks = huntStatusBlocks(status, null)

    const fieldBlocks = blocks.filter(
      (b) => b.type === "section" && (b as any).fields,
    )
    const allFieldTexts = fieldBlocks.flatMap((b: any) =>
      b.fields.map((f: any) => f.text),
    )
    expect(
      allFieldTexts.some((t: string) => t.includes("Phase 2")),
    ).toBe(true)
    expect(
      allFieldTexts.some((t: string) => t.includes("Lateral Movement")),
    ).toBe(true)
  })

  test("shows milestone version when set", () => {
    const status: HuntStatus = {
      ...baseStatus,
      milestoneVersion: "1.2.0",
    }
    const blocks = huntStatusBlocks(status, null)

    const fieldBlocks = blocks.filter(
      (b) => b.type === "section" && (b as any).fields,
    )
    const allFieldTexts = fieldBlocks.flatMap((b: any) =>
      b.fields.map((f: any) => f.text),
    )
    expect(
      allFieldTexts.some((t: string) => t.includes("v1.2.0")),
    ).toBe(true)
  })

  test("renders phase list with status emoji", () => {
    const status: HuntStatus = {
      ...baseStatus,
      phases: [
        {
          number: "1",
          name: "Triage",
          status: "completed",
          plans: 0,
          summaries: 0,
        },
        {
          number: "2",
          name: "Deep Dive",
          status: "executing",
          plans: 0,
          summaries: 0,
        },
      ],
    }
    const blocks = huntStatusBlocks(status, null)

    // Should have divider before phases
    expect(blocks.some((b) => b.type === "divider")).toBe(true)

    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    const phaseText = sectionTexts.find(
      (t: string) => t.includes("Triage") && t.includes("Deep Dive"),
    )
    expect(phaseText).toBeDefined()
    expect(phaseText).toContain(":white_check_mark:")
    expect(phaseText).toContain(":spinner:")
  })

  test("renders blockers section", () => {
    const status: HuntStatus = {
      ...baseStatus,
      blockers: ["Need EDR access", "Awaiting approval"],
    }
    const blocks = huntStatusBlocks(status, null)

    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    expect(
      sectionTexts.some((t: string) => t.includes(":no_entry:")),
    ).toBe(true)
    expect(
      sectionTexts.some(
        (t: string) =>
          t.includes("Need EDR access") && t.includes("Awaiting approval"),
      ),
    ).toBe(true)
  })

  test("omits blockers section when empty", () => {
    const blocks = huntStatusBlocks(baseStatus, null)

    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    expect(
      sectionTexts.some((t: string) => t.includes("Blocker")),
    ).toBe(false)
  })

  test("shows last activity in context", () => {
    const status: HuntStatus = {
      ...baseStatus,
      lastActivity: "2026-04-01 - Phase 2 started",
    }
    const blocks = huntStatusBlocks(status, null)

    const ctxBlocks = blocks.filter((b) => b.type === "context")
    expect(ctxBlocks.length).toBeGreaterThanOrEqual(1)
    const ctxTexts = ctxBlocks.flatMap((b: any) =>
      b.elements.map((e: any) => e.text),
    )
    expect(
      ctxTexts.some((t: string) => t.includes("2026-04-01")),
    ).toBe(true)
  })

  test("all blocks have valid type property", () => {
    const status: HuntStatus = {
      ...baseStatus,
      status: "Executing",
      currentPhase: "1",
      currentPhaseName: "Triage",
      progressPercent: 33,
      lastActivity: "now",
      blockers: ["something"],
      phases: [
        {
          number: "1",
          name: "Triage",
          status: "executing",
          plans: 1,
          summaries: 0,
        },
      ],
      milestoneVersion: "1.0.0",
    }
    const mission: MissionSummary = {
      title: "Full Test",
      signal: "Signal text",
      scope: "Scope",
      owner: "Owner",
    }
    const blocks = huntStatusBlocks(status, mission)

    const validTypes = [
      "header",
      "section",
      "divider",
      "context",
      "actions",
      "image",
      "input",
      "file",
      "rich_text",
      "video",
    ]
    for (const block of blocks) {
      expect(validTypes).toContain(block.type)
    }
  })
})

describe("huntStatusOneliner", () => {
  const baseStatus: HuntStatus = {
    currentPhase: null,
    currentPhaseName: null,
    totalPhases: null,
    status: null,
    progressPercent: null,
    lastActivity: null,
    blockers: [],
    phases: [],
    milestoneVersion: null,
  }

  test("shows phase and progress", () => {
    const status: HuntStatus = {
      ...baseStatus,
      currentPhase: "2",
      progressPercent: 50,
    }
    const result = huntStatusOneliner(status)
    expect(result).toBe("Phase 2 | 50% complete")
  })

  test("shows 'No active phase' when no phase", () => {
    const result = huntStatusOneliner(baseStatus)
    expect(result).toContain("No active phase")
  })

  test("shows '?' when progress is null", () => {
    const result = huntStatusOneliner(baseStatus)
    expect(result).toContain("? complete")
  })

  test("includes blocker count", () => {
    const status: HuntStatus = {
      ...baseStatus,
      currentPhase: "1",
      progressPercent: 25,
      blockers: ["a", "b", "c"],
    }
    const result = huntStatusOneliner(status)
    expect(result).toContain("3 blocker(s)")
    expect(result).toContain(":no_entry:")
  })

  test("omits blocker suffix when no blockers", () => {
    const status: HuntStatus = {
      ...baseStatus,
      currentPhase: "1",
      progressPercent: 100,
    }
    const result = huntStatusOneliner(status)
    expect(result).not.toContain("blocker")
  })
})

// =============================================================================
// approval.ts — approvalRequestBlocks, approvalResponseBlocks
// =============================================================================

describe("approvalRequestBlocks", () => {
  const req: ApprovalRequest = {
    id: "apr-001",
    action: "Run lateral movement queries on SIEM",
    rationale:
      "Phase 2 requires cross-host correlation to validate HYP-01",
    phase: "2",
    requestedAt: "2026-04-01T12:00:00Z",
    status: "pending",
  }

  test("returns array of valid blocks", () => {
    const blocks = approvalRequestBlocks(req)
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) {
      expect(block.type).toBeDefined()
    }
  })

  test("includes header", () => {
    const blocks = approvalRequestBlocks(req)
    const h = blocks.find((b) => b.type === "header") as any
    expect(h).toBeDefined()
    expect(h.text.text).toBe("Approval Required")
  })

  test("shows action and phase in fields", () => {
    const blocks = approvalRequestBlocks(req)
    const fieldBlocks = blocks.filter(
      (b) => b.type === "section" && (b as any).fields,
    )
    const allFieldTexts = fieldBlocks.flatMap((b: any) =>
      b.fields.map((f: any) => f.text),
    )

    expect(
      allFieldTexts.some((t: string) =>
        t.includes("Run lateral movement queries"),
      ),
    ).toBe(true)
    expect(allFieldTexts.some((t: string) => t.includes("2"))).toBe(true)
  })

  test("shows rationale", () => {
    const blocks = approvalRequestBlocks(req)
    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    expect(
      sectionTexts.some((t: string) =>
        t.includes("cross-host correlation"),
      ),
    ).toBe(true)
  })

  test("includes approve and deny action buttons", () => {
    const blocks = approvalRequestBlocks(req)
    const actionsBlock = blocks.find((b) => b.type === "actions") as any
    expect(actionsBlock).toBeDefined()
    expect(actionsBlock.block_id).toBe("approval_actions")

    const elements = actionsBlock.elements
    expect(elements).toHaveLength(2)

    const approveBtn = elements.find(
      (e: any) => e.action_id === "approval_approve",
    )
    expect(approveBtn).toBeDefined()
    expect(approveBtn.text.text).toBe("Approve")
    expect(approveBtn.style).toBe("primary")
    expect(approveBtn.value).toBe("apr-001")

    const denyBtn = elements.find(
      (e: any) => e.action_id === "approval_deny",
    )
    expect(denyBtn).toBeDefined()
    expect(denyBtn.text.text).toBe("Deny")
    expect(denyBtn.style).toBe("danger")
    expect(denyBtn.value).toBe("apr-001")
  })

  test("includes timestamp in context", () => {
    const blocks = approvalRequestBlocks(req)
    const ctxBlocks = blocks.filter((b) => b.type === "context")
    const ctxTexts = ctxBlocks.flatMap((b: any) =>
      b.elements.map((e: any) => e.text),
    )
    expect(
      ctxTexts.some((t: string) => t.includes("2026-04-01T12:00:00Z")),
    ).toBe(true)
  })
})

describe("approvalResponseBlocks", () => {
  const req: ApprovalRequest = {
    id: "apr-002",
    action: "Execute detection rule",
    rationale: "Automated response",
    phase: "3",
    requestedAt: "2026-04-01T14:00:00Z",
    status: "approved",
    respondedBy: "U12345",
  }

  test("shows approved verdict with responder", () => {
    const blocks = approvalResponseBlocks(req, true, "U12345")

    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    expect(
      sectionTexts.some(
        (t: string) =>
          t.includes(":white_check_mark:") && t.includes("<@U12345>"),
      ),
    ).toBe(true)
  })

  test("shows denied verdict with responder", () => {
    const blocks = approvalResponseBlocks(req, false, "U99999")

    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    expect(
      sectionTexts.some(
        (t: string) => t.includes(":x:") && t.includes("<@U99999>"),
      ),
    ).toBe(true)
  })

  test("includes action and phase fields", () => {
    const blocks = approvalResponseBlocks(req, true, "U12345")

    const fieldBlocks = blocks.filter(
      (b) => b.type === "section" && (b as any).fields,
    )
    expect(fieldBlocks.length).toBeGreaterThanOrEqual(1)
  })

  test("includes response timestamp in context", () => {
    const blocks = approvalResponseBlocks(req, true, "U12345")
    const ctxBlocks = blocks.filter((b) => b.type === "context")
    expect(ctxBlocks.length).toBeGreaterThanOrEqual(1)
  })
})

// =============================================================================
// findings.ts — findingsBlocks, receiptSummaryBlocks
// =============================================================================

describe("findingsBlocks", () => {
  test("returns header block", () => {
    const findings: Findings = {
      summary: "",
      hypotheses: [],
      impactScope: [],
      recommendations: [],
    }
    const blocks = findingsBlocks(findings)
    const h = blocks.find((b) => b.type === "header") as any
    expect(h).toBeDefined()
    expect(h.text.text).toBe("Hunt Findings")
  })

  test("includes summary when present", () => {
    const findings: Findings = {
      summary: "Investigation revealed widespread compromise.",
      hypotheses: [],
      impactScope: [],
      recommendations: [],
    }
    const blocks = findingsBlocks(findings)

    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    expect(
      sectionTexts.some((t: string) =>
        t.includes("widespread compromise"),
      ),
    ).toBe(true)
  })

  test("omits summary section when empty", () => {
    const findings: Findings = {
      summary: "",
      hypotheses: [],
      impactScope: [],
      recommendations: [],
    }
    const blocks = findingsBlocks(findings)
    // Should only have the header, no summary section
    expect(blocks).toHaveLength(1)
  })

  test("renders hypothesis verdicts with emoji", () => {
    const findings: Findings = {
      summary: "Brief.",
      hypotheses: [
        {
          id: "HYP-01",
          text: "HYP-01",
          verdict: "supported",
          confidence: "high",
          evidence: "RCT-001",
        },
        {
          id: "HYP-02",
          text: "HYP-02",
          verdict: "refuted",
        },
      ],
      impactScope: [],
      recommendations: [],
    }
    const blocks = findingsBlocks(findings)

    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    const verdictText = sectionTexts.find(
      (t: string) => t.includes("HYP-01") && t.includes("HYP-02"),
    )
    expect(verdictText).toBeDefined()
    expect(verdictText).toContain(":white_check_mark:")
    expect(verdictText).toContain(":x:")
    expect(verdictText).toContain("high")
    expect(verdictText).toContain("RCT-001")
  })

  test("renders impact scope", () => {
    const findings: Findings = {
      summary: "x",
      hypotheses: [],
      impactScope: ["Production servers", "User accounts"],
      recommendations: [],
    }
    const blocks = findingsBlocks(findings)

    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    expect(
      sectionTexts.some((t: string) => t.includes("Production servers")),
    ).toBe(true)
    expect(
      sectionTexts.some((t: string) => t.includes("User accounts")),
    ).toBe(true)
  })

  test("renders recommendations", () => {
    const findings: Findings = {
      summary: "x",
      hypotheses: [],
      impactScope: [],
      recommendations: ["Revoke tokens", "Enable MFA"],
    }
    const blocks = findingsBlocks(findings)

    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    expect(
      sectionTexts.some((t: string) => t.includes("Revoke tokens")),
    ).toBe(true)
    expect(
      sectionTexts.some((t: string) => t.includes("Enable MFA")),
    ).toBe(true)
  })

  test("renders fully populated findings with all sections", () => {
    const findings: Findings = {
      summary: "Full investigation complete.",
      hypotheses: [
        {
          id: "HYP-01",
          text: "HYP-01",
          verdict: "supported",
          confidence: "high",
        },
      ],
      impactScope: ["Scope item"],
      recommendations: ["Recommendation item"],
    }
    const blocks = findingsBlocks(findings)

    // header + summary + divider + hyp header + hyp content +
    // divider + impact header + impact content + divider + rec header + rec content
    expect(blocks.length).toBeGreaterThanOrEqual(8)

    const dividers = blocks.filter((b) => b.type === "divider")
    expect(dividers).toHaveLength(3)
  })
})

describe("receiptSummaryBlocks", () => {
  test("returns 'no receipts' message for empty array", () => {
    const blocks = receiptSummaryBlocks([])
    expect(blocks).toHaveLength(1)
    expect((blocks[0] as any).text.text).toContain("No receipts found")
  })

  test("shows receipt count in header", () => {
    const receipts: Receipt[] = [
      {
        id: "RCT-20260409-001",
        title: "Receipt A",
        source: "EDR",
        claimStatus: "supports",
        relatedHypotheses: ["HYP-01"],
      },
      {
        id: "RCT-20260409-002",
        title: "Receipt B",
        source: "SIEM",
        claimStatus: "neutral",
        relatedHypotheses: [],
      },
    ]
    const blocks = receiptSummaryBlocks(receipts)

    const h = blocks.find((b) => b.type === "header") as any
    expect(h.text.text).toBe("Evidence Receipts (2)")
  })

  test("renders claim status with correct emoji", () => {
    const receipts: Receipt[] = [
      {
        id: "RCT-20260409-001",
        title: "Supports",
        source: "EDR",
        claimStatus: "supports",
        relatedHypotheses: [],
      },
      {
        id: "RCT-20260409-002",
        title: "Contradicts",
        source: "SIEM",
        claimStatus: "contradicts",
        relatedHypotheses: [],
      },
      {
        id: "RCT-20260409-003",
        title: "Neutral",
        source: "Manual",
        claimStatus: "neutral",
        relatedHypotheses: [],
      },
    ]
    const blocks = receiptSummaryBlocks(receipts)

    const fieldBlocks = blocks.filter(
      (b) => b.type === "section" && (b as any).fields,
    )
    const allFieldTexts = fieldBlocks.flatMap((b: any) =>
      b.fields.map((f: any) => f.text),
    )

    expect(
      allFieldTexts.some(
        (t: string) =>
          t.includes(":white_check_mark:") && t.includes("supports"),
      ),
    ).toBe(true)
    expect(
      allFieldTexts.some(
        (t: string) => t.includes(":x:") && t.includes("contradicts"),
      ),
    ).toBe(true)
    expect(
      allFieldTexts.some(
        (t: string) =>
          t.includes(":white_circle:") && t.includes("neutral"),
      ),
    ).toBe(true)
  })

  test("shows related hypotheses in context", () => {
    const receipts: Receipt[] = [
      {
        id: "RCT-20260409-001",
        title: "Test",
        source: "EDR",
        claimStatus: "supports",
        relatedHypotheses: ["HYP-01", "HYP-02"],
      },
    ]
    const blocks = receiptSummaryBlocks(receipts)

    const ctxBlocks = blocks.filter((b) => b.type === "context")
    const ctxTexts = ctxBlocks.flatMap((b: any) =>
      b.elements.map((e: any) => e.text),
    )
    expect(
      ctxTexts.some(
        (t: string) => t.includes("HYP-01") && t.includes("HYP-02"),
      ),
    ).toBe(true)
  })

  test("limits display to 15 receipts and shows overflow", () => {
    const receipts: Receipt[] = Array.from({ length: 20 }, (_, i) => ({
      id: `RCT-20260409-${String(i + 1).padStart(3, "0")}`,
      title: `Receipt ${i + 1}`,
      source: "Auto",
      claimStatus: "neutral" as const,
      relatedHypotheses: [],
    }))

    const blocks = receiptSummaryBlocks(receipts)

    const ctxBlocks = blocks.filter((b) => b.type === "context")
    const overflowCtx = ctxBlocks.find((b: any) =>
      b.elements.some((e: any) => e.text.includes("5 more")),
    )
    expect(overflowCtx).toBeDefined()
  })

  test("no overflow context when exactly 15 receipts", () => {
    const receipts: Receipt[] = Array.from({ length: 15 }, (_, i) => ({
      id: `RCT-20260409-${String(i + 1).padStart(3, "0")}`,
      title: `Receipt ${i + 1}`,
      source: "Auto",
      claimStatus: "neutral" as const,
      relatedHypotheses: [],
    }))

    const blocks = receiptSummaryBlocks(receipts)

    const ctxBlocks = blocks.filter((b) => b.type === "context")
    const overflowCtx = ctxBlocks.find((b: any) =>
      b.elements.some((e: any) => e.text.includes("more")),
    )
    expect(overflowCtx).toBeUndefined()
  })
})

// =============================================================================
// case.ts — caseCreatedBlocks, caseModalBlocks
// =============================================================================

describe("caseCreatedBlocks", () => {
  const result: CreateCaseResult = {
    caseDir: "/workspace/.planning/cases/oauth-phish",
    slug: "oauth-phish",
    title: "OAuth Phishing Case",
  }

  const source: CaseSource = {
    origin: "slash_command",
    channelId: "C0123456",
    userId: "U9876543",
    rawText: "Suspicious OAuth consent grant detected",
    extractedIocs: [
      { type: "ip", value: "192.168.1.100" },
      { type: "domain", value: "evil.com" },
    ],
  }

  test("includes Case Opened header", () => {
    const blocks = caseCreatedBlocks(result, source)
    const h = blocks.find((b) => b.type === "header") as any
    expect(h).toBeDefined()
    expect(h.text.text).toBe("Case Opened")
  })

  test("shows title and user fields", () => {
    const blocks = caseCreatedBlocks(result, source)
    const fieldBlocks = blocks.filter(
      (b) => b.type === "section" && (b as any).fields,
    )
    const allFieldTexts = fieldBlocks.flatMap((b: any) =>
      b.fields.map((f: any) => f.text),
    )

    expect(
      allFieldTexts.some((t: string) =>
        t.includes("OAuth Phishing Case"),
      ),
    ).toBe(true)
    expect(
      allFieldTexts.some((t: string) => t.includes("<@U9876543>")),
    ).toBe(true)
  })

  test("shows source origin (underscores replaced with spaces)", () => {
    const blocks = caseCreatedBlocks(result, source)
    const fieldBlocks = blocks.filter(
      (b) => b.type === "section" && (b as any).fields,
    )
    const allFieldTexts = fieldBlocks.flatMap((b: any) =>
      b.fields.map((f: any) => f.text),
    )

    expect(
      allFieldTexts.some((t: string) => t.includes("slash command")),
    ).toBe(true)
  })

  test("shows slug as path", () => {
    const blocks = caseCreatedBlocks(result, source)
    const fieldBlocks = blocks.filter(
      (b) => b.type === "section" && (b as any).fields,
    )
    const allFieldTexts = fieldBlocks.flatMap((b: any) =>
      b.fields.map((f: any) => f.text),
    )

    expect(
      allFieldTexts.some((t: string) => t.includes("oauth-phish")),
    ).toBe(true)
  })

  test("lists extracted IOCs", () => {
    const blocks = caseCreatedBlocks(result, source)
    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    expect(
      sectionTexts.some((t: string) => t.includes("192.168.1.100")),
    ).toBe(true)
    expect(
      sectionTexts.some((t: string) => t.includes("evil.com")),
    ).toBe(true)
  })

  test("omits IOC section when no IOCs", () => {
    const noIocSource: CaseSource = {
      ...source,
      extractedIocs: [],
    }
    const blocks = caseCreatedBlocks(result, noIocSource)
    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    expect(
      sectionTexts.some((t: string) => t.includes("Extracted IOCs")),
    ).toBe(false)
  })

  test("shows overflow context when more than 20 IOCs", () => {
    const manyIocs: CaseSource = {
      ...source,
      extractedIocs: Array.from({ length: 25 }, (_, i) => ({
        type: "ip" as const,
        value: `10.0.0.${i + 1}`,
      })),
    }
    const blocks = caseCreatedBlocks(result, manyIocs)
    const ctxBlocks = blocks.filter((b) => b.type === "context")
    const ctxTexts = ctxBlocks.flatMap((b: any) =>
      b.elements.map((e: any) => e.text),
    )
    expect(ctxTexts.some((t: string) => t.includes("5 more"))).toBe(true)
  })

  test("includes View Status and Start Hunt action buttons", () => {
    const blocks = caseCreatedBlocks(result, source)
    const actionsBlock = blocks.find((b) => b.type === "actions") as any
    expect(actionsBlock).toBeDefined()
    expect(actionsBlock.block_id).toBe("case_actions")

    const viewBtn = actionsBlock.elements.find(
      (e: any) => e.action_id === "case_view_status",
    )
    expect(viewBtn).toBeDefined()
    expect(viewBtn.text.text).toBe("View Status")
    expect(viewBtn.value).toBe("oauth-phish")

    const startBtn = actionsBlock.elements.find(
      (e: any) => e.action_id === "case_start_hunt",
    )
    expect(startBtn).toBeDefined()
    expect(startBtn.text.text).toBe("Start Hunt")
    expect(startBtn.style).toBe("primary")
  })
})

describe("caseModalBlocks", () => {
  test("includes signal text as blockquote", () => {
    const blocks = caseModalBlocks("Suspicious activity detected", [])
    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    expect(
      sectionTexts.some((t: string) =>
        t.includes("Suspicious activity detected"),
      ),
    ).toBe(true)
  })

  test("truncates long signal text to 500 chars", () => {
    const longText = "x".repeat(1000)
    const blocks = caseModalBlocks(longText, [])
    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    const signalBlock = sectionTexts.find((t: string) =>
      t.includes("Signal"),
    )
    // The signal text gets wrapped with >  prefix, but the raw text portion is truncated at 500
    expect(signalBlock).toBeDefined()
    expect(signalBlock!.length).toBeLessThan(1000)
  })

  test("shows detected IOCs when present", () => {
    const iocs = [
      { type: "ip" as const, value: "10.0.0.1" },
      { type: "domain" as const, value: "malware.com" },
    ]
    const blocks = caseModalBlocks("alert text", iocs)

    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    expect(
      sectionTexts.some((t: string) => t.includes("Detected IOCs")),
    ).toBe(true)
    expect(
      sectionTexts.some((t: string) => t.includes("10.0.0.1")),
    ).toBe(true)
    expect(
      sectionTexts.some((t: string) => t.includes("malware.com")),
    ).toBe(true)
  })

  test("shows 'No IOCs detected' message when empty", () => {
    const blocks = caseModalBlocks("just some text", [])

    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    expect(
      sectionTexts.some((t: string) => t.includes("No IOCs detected")),
    ).toBe(true)
  })

  test("limits IOC display to 10", () => {
    const iocs = Array.from({ length: 15 }, (_, i) => ({
      type: "ip" as const,
      value: `10.0.0.${i + 1}`,
    }))
    const blocks = caseModalBlocks("alert", iocs)

    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    const iocSection = sectionTexts.find((t: string) => t.includes("10.0.0."))
    expect(iocSection).toBeDefined()
    // Should have at most 10 IOC entries
    const iocLines = iocSection!.split("\n").filter((l: string) =>
      l.startsWith("\u2022"),
    )
    expect(iocLines).toHaveLength(10)
  })

  test("includes review instruction text", () => {
    const blocks = caseModalBlocks("text", [])
    const sectionTexts = blocks
      .filter((b) => b.type === "section" && (b as any).text)
      .map((b) => (b as any).text.text)

    expect(
      sectionTexts.some((t: string) => t.includes("Review")),
    ).toBe(true)
  })

  test("includes divider", () => {
    const blocks = caseModalBlocks("text", [])
    expect(blocks.some((b) => b.type === "divider")).toBe(true)
  })
})
