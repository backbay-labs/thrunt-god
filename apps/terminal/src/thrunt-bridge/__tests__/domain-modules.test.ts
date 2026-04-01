import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { listConnectors, runtimeDoctor } from "../connector"
import { listDetections, detectionStatus } from "../detection"
import { auditEvidence } from "../evidence"
import { analyzeHuntmap, getPhaseDetail } from "../huntmap"
import { listPacks, showPack } from "../pack"

type MockCommandResponse = {
  stdout?: unknown
  stderr?: string
  exitCode?: number
}

async function installMockThruntTools(
  responses: Record<string, MockCommandResponse>,
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "thrunt-domain-"))

  const projectRoot = path.join(tempDir, "project")
  const toolsDir = path.join(projectRoot, "thrunt-god", "bin")
  const scriptPath = path.join(toolsDir, "thrunt-tools.cjs")
  const script = `#!/usr/bin/env node
const fs = require('fs');
const responses = ${JSON.stringify(responses)};
const args = process.argv.slice(2);
const key = args.join(' ');

const response = responses[key];
if (!response) {
  fs.writeSync(2, 'Unknown command: ' + key);
  process.exit(1);
}

if (response.stderr) {
  fs.writeSync(2, response.stderr);
}

if (response.stdout !== undefined) {
  fs.writeSync(1, JSON.stringify(response.stdout));
}

process.exit(response.exitCode ?? 0);
`

  await fs.mkdir(toolsDir, { recursive: true })
  await fs.writeFile(scriptPath, script, { mode: 0o755 })
  await fs.chmod(scriptPath, 0o755)
  return projectRoot
}

async function installSingleResponse(
  args: string[],
  response: MockCommandResponse,
): Promise<string> {
  return installMockThruntTools({ [args.join(" ")]: response })
}

async function withSingleResponse<T>(
  args: string[],
  response: MockCommandResponse,
  run: (cwd: string) => Promise<T>,
): Promise<T> {
  const projectRoot = await installSingleResponse(args, response)

  try {
    return await run(projectRoot)
  } finally {
    await fs.rm(path.dirname(projectRoot), { recursive: true, force: true }).catch(() => {})
  }
}

describe("auditEvidence", () => {
  test("calls runThruntCommand with ['audit-evidence', '--raw'] and returns EvidenceAuditResult[]", async () => {
    const mockData = [
      {
        phase: "23",
        phase_dir: ".planning/phases/23-bridge-foundation",
        file: "evidence-review.yaml",
        file_path: ".planning/phases/23-bridge-foundation/evidence-review.yaml",
        type: "evidence_review",
        status: "complete",
        items: [{ id: "EV-001", text: "Bridge executor tested", status: "verified" }],
      },
    ]

    const result = await withSingleResponse(
      ["audit-evidence", "--raw"],
      { stdout: mockData },
      (cwd) => auditEvidence({ cwd }),
    )

    expect(result).toHaveLength(1)
    expect(result[0].phase).toBe("23")
    expect(result[0].type).toBe("evidence_review")
    expect(result[0].items[0].id).toBe("EV-001")
  })

  test("returns empty array when subprocess fails (ok: false)", async () => {
    const result = await withSingleResponse(
      ["audit-evidence", "--raw"],
      { stderr: "not found", exitCode: 1 },
      (cwd) => auditEvidence({ cwd }),
    )
    expect(result).toEqual([])
  })
})

describe("listDetections", () => {
  test("calls runThruntCommand with ['detection', 'list', '--raw'] and returns DetectionCandidate[]", async () => {
    const mockData = [
      {
        candidate_version: "1.0",
        candidate_id: "DET-20260329123456-ABCD1234",
        source_finding_id: "F-001",
        source_phase: "23",
        technique_ids: ["T1059", "T1059.001"],
        detection_logic: {
          title: "Test detection",
          description: "A test",
          logsource: { category: "process_creation" },
          detection: { selection: {}, condition: "selection" },
          false_positives: [],
        },
        target_format: "sigma",
        confidence: "high",
        promotion_readiness: 0.85,
        evidence_links: [{ type: "finding", id: "F-001", claim_status: "verified" }],
        metadata: {
          author: "test",
          created_at: "2026-03-29",
          last_updated: "2026-03-29",
          status: "candidate",
          notes: "",
        },
        content_hash: "sha256:abc123",
      },
    ]

    const result = await withSingleResponse(
      ["detection", "list", "--raw"],
      { stdout: mockData },
      (cwd) => listDetections({ cwd }),
    )

    expect(result).toHaveLength(1)
    expect(result[0].candidate_id).toBe("DET-20260329123456-ABCD1234")
    expect(result[0].technique_ids).toEqual(["T1059", "T1059.001"])
    expect(result[0].promotion_readiness).toBe(0.85)
  })

  test("filters out items that fail Zod validation (partial data resilience)", async () => {
    const mockData = [
      {
        candidate_version: "1.0",
        candidate_id: "DET-VALID",
        source_finding_id: "F-001",
        source_phase: null,
        technique_ids: ["T1059"],
        detection_logic: {
          title: "Valid",
          description: "Valid detection",
          logsource: { category: "test" },
          detection: { selection: {}, condition: "selection" },
          false_positives: [],
        },
        target_format: "sigma",
        confidence: "medium",
        promotion_readiness: 0.5,
        evidence_links: [],
        metadata: { author: "a", created_at: "x", last_updated: "x", status: "draft", notes: "" },
        content_hash: "sha256:valid",
      },
      { candidate_id: "DET-INVALID", bad_field: true },
    ]

    const result = await withSingleResponse(
      ["detection", "list", "--raw"],
      { stdout: mockData },
      (cwd) => listDetections({ cwd }),
    )
    expect(result).toHaveLength(1)
    expect(result[0].candidate_id).toBe("DET-VALID")
  })
})

describe("detectionStatus", () => {
  test("calls runThruntCommand with ['detection', 'status', '--raw'] and returns DetectionStatusResult", async () => {
    const mockData = {
      total: 5,
      by_status: { draft: 2, candidate: 2, approved: 1 },
      by_confidence: { high: 2, medium: 2, low: 1 },
    }

    const result = await withSingleResponse(
      ["detection", "status", "--raw"],
      { stdout: mockData },
      (cwd) => detectionStatus({ cwd }),
    )

    expect(result).not.toBeNull()
    expect(result!.total).toBe(5)
    expect(result!.by_status).toEqual({ draft: 2, candidate: 2, approved: 1 })
  })
})

describe("listPacks", () => {
  test("calls runThruntCommand with ['pack', 'list', '--raw'] and returns PackListEntry[]", async () => {
    const mockData = {
      packs: [
        {
          id: "lateral-movement-smb",
          kind: "technique",
          title: "SMB Lateral Movement",
          stability: "stable",
          source: "built-in",
          required_connectors: ["crowdstrike"],
          supported_datasets: ["process_creation"],
        },
      ],
      overrides: {},
      paths: ["/packs"],
    }

    const result = await withSingleResponse(
      ["pack", "list", "--raw"],
      { stdout: mockData },
      (cwd) => listPacks({ cwd }),
    )

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("lateral-movement-smb")
    expect(result[0].required_connectors).toEqual(["crowdstrike"])
  })
})

describe("showPack", () => {
  test("calls runThruntCommand with ['pack', 'show', packId, '--raw'] and returns PackShowResult", async () => {
    const mockData = {
      found: true,
      pack_id: "lateral-movement-smb",
      pack: {
        id: "lateral-movement-smb",
        kind: "technique",
        title: "SMB Lateral Movement",
        description: "Detects lateral movement via SMB",
        stability: "stable",
        parameters: [
          { name: "lookback_days", type: "integer", required: false, description: "Days to look back", default: 7 },
        ],
        targets: [{ connector: "crowdstrike", dataset: "process_creation", query_template: "SELECT * ..." }],
        attack: ["T1021.002"],
        metadata: {},
      },
    }

    const result = await withSingleResponse(
      ["pack", "show", "lateral-movement-smb", "--raw"],
      { stdout: mockData },
      (cwd) => showPack("lateral-movement-smb", { cwd }),
    )

    expect(result).not.toBeNull()
    expect(result!.found).toBe(true)
    expect(result!.pack!.parameters).toHaveLength(1)
  })

  test("returns null when subprocess fails", async () => {
    const result = await withSingleResponse(
      ["pack", "show", "nonexistent", "--raw"],
      { stderr: "not found", exitCode: 1 },
      (cwd) => showPack("nonexistent", { cwd }),
    )
    expect(result).toBeNull()
  })
})

describe("listConnectors", () => {
  test("calls runThruntCommand with ['runtime', 'list-connectors', '--raw'] and returns ConnectorEntry[]", async () => {
    const mockData = {
      connectors: [
        {
          id: "crowdstrike",
          name: "CrowdStrike Falcon",
          auth_types: ["api_key"],
          supported_datasets: ["process_creation", "network_connection"],
          supported_languages: ["kql"],
          pagination_modes: ["offset"],
        },
      ],
    }

    const result = await withSingleResponse(
      ["runtime", "list-connectors", "--raw"],
      { stdout: mockData },
      (cwd) => listConnectors({ cwd }),
    )

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("crowdstrike")
    expect(result[0].auth_types).toEqual(["api_key"])
  })
})

describe("runtimeDoctor", () => {
  test("calls runThruntCommand with ['runtime', 'doctor', '--raw'] and returns RuntimeDoctorResult", async () => {
    const mockData = {
      summary: { total: 3, healthy: 2, degraded: 1, unavailable: 0 },
      connectors: [
        {
          id: "crowdstrike",
          name: "CrowdStrike Falcon",
          configured: true,
          health: "healthy",
          score: 95,
          checks: [{ name: "auth", passed: true, message: "API key valid" }],
        },
      ],
    }

    const result = await withSingleResponse(
      ["runtime", "doctor", "--raw"],
      { stdout: mockData },
      (cwd) => runtimeDoctor({ cwd }),
    )

    expect(result).not.toBeNull()
    expect(result!.summary.healthy).toBe(2)
    expect(result!.connectors[0].health).toBe("healthy")
  })
})

describe("analyzeHuntmap", () => {
  test("calls runThruntCommand with ['huntmap', 'analyze', '--raw'] and returns HuntmapAnalysis", async () => {
    const mockData = {
      milestones: [{ heading: "v1.5 TUI", version: "v1.5" }],
      phases: [
        {
          number: "23",
          name: "bridge-foundation",
          goal: "Build TUI bridge",
          depends_on: null,
          plan_count: 2,
          summary_count: 2,
          has_context: true,
          has_research: true,
          disk_status: "complete",
          roadmap_complete: true,
        },
      ],
      phase_count: 4,
      completed_phases: 1,
      total_plans: 8,
      total_summaries: 2,
      progress_percent: 25,
      current_phase: "24",
      next_phase: "25",
      missing_phase_details: null,
    }

    const result = await withSingleResponse(
      ["huntmap", "analyze", "--raw"],
      { stdout: mockData },
      (cwd) => analyzeHuntmap({ cwd }),
    )

    expect(result).not.toBeNull()
    expect(result!.phase_count).toBe(4)
    expect(result!.phases[0].number).toBe("23")
    expect(result!.progress_percent).toBe(25)
  })
})

describe("getPhaseDetail", () => {
  test("calls runThruntCommand with ['huntmap', 'get-phase', phaseNum, '--raw'] and returns HuntmapPhaseDetail", async () => {
    const mockData = {
      found: true,
      phase_number: "23",
      phase_name: "bridge-foundation",
      goal: "Build TUI bridge to thrunt-tools.cjs",
      success_criteria: ["Executor works", "Streaming works"],
      section: "## Phase 23: Bridge Foundation\n...",
    }

    const result = await withSingleResponse(
      ["huntmap", "get-phase", "23", "--raw"],
      { stdout: mockData },
      (cwd) => getPhaseDetail("23", { cwd }),
    )

    expect(result).not.toBeNull()
    expect(result!.found).toBe(true)
    expect(result!.phase_name).toBe("bridge-foundation")
    expect(result!.success_criteria).toHaveLength(2)
  })

  test("returns null when subprocess fails", async () => {
    const result = await withSingleResponse(
      ["huntmap", "get-phase", "99", "--raw"],
      { stderr: "not found", exitCode: 1 },
      (cwd) => getPhaseDetail("99", { cwd }),
    )
    expect(result).toBeNull()
  })
})
