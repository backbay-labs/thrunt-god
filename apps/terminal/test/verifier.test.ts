import { afterEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import type { GateResult, WorkcellInfo } from "../src/types"
const { Verifier } = await import("../src/verifier")
const { EvidenceIntegrityGate } = await import("../src/verifier/gates/evidence-integrity")
const { ReceiptCompletenessGate } = await import("../src/verifier/gates/receipt-completeness")

const THRUNT_TOOLS_ENV = "THRUNT_TOOLS_PATH"

type ThruntScriptResponse = {
  stdout?: unknown
  stderr?: string
  exitCode?: number
}

let tempDirs: string[] = []

afterEach(async () => {
  delete process.env[THRUNT_TOOLS_ENV]
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
  tempDirs = []
})

async function installThruntTools(
  responses: Record<string, ThruntScriptResponse>,
): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "thrunt-verifier-"))
  tempDirs.push(tempDir)

  const scriptPath = path.join(tempDir, "thrunt-tools.cjs")
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

  await fs.writeFile(scriptPath, script, { mode: 0o755 })
  await fs.chmod(scriptPath, 0o755)
  process.env[THRUNT_TOOLS_ENV] = scriptPath
}

// Helper to create minimal workcell info
function makeWorkcell(overrides: Partial<WorkcellInfo> = {}): WorkcellInfo {
  return {
    id: crypto.randomUUID(),
    name: "test-workcell",
    directory: "/tmp/test-workcell",
    branch: "test-branch",
    status: "warm",
    projectId: "test-project",
    createdAt: Date.now(),
    useCount: 0,
    ...overrides,
  }
}

describe("Built-in THRUNT gates", () => {
  test("exposes only the evidence-focused built-in gates", () => {
    const gates = Verifier.getAvailableGates()

    expect(gates.map((gate) => gate.info.id)).toEqual([
      "evidence-integrity",
      "receipt-completeness",
    ])
  })
})

describe("Verifier namespace", () => {
  describe("listGates", () => {
    test("lists all registered gates", () => {
      const gates = Verifier.listGates()

      expect(gates).toHaveLength(2)
      expect(gates.map((g) => g.id)).toContain("evidence-integrity")
      expect(gates.map((g) => g.id)).toContain("receipt-completeness")
    })

    test("includes gate metadata", () => {
      const gates = Verifier.listGates()
      const evidenceGate = gates.find((g) => g.id === "evidence-integrity")

      expect(evidenceGate).toBeDefined()
      expect(evidenceGate?.name).toBe("Evidence Integrity")
      expect(evidenceGate?.description).toBeDefined()
      expect(evidenceGate?.critical).toBe(false)
    })
  })

  describe("getGate", () => {
    test("returns gate by ID", () => {
      const gate = Verifier.getGate("evidence-integrity")
      expect(gate).toBeDefined()
      expect(gate?.info.id).toBe("evidence-integrity")
    })

    test("returns undefined for unknown gate", () => {
      const gate = Verifier.getGate("unknown")
      expect(gate).toBeUndefined()
    })
  })

  describe("registerGate / unregisterGate", () => {
    test("can register and unregister custom gate", () => {
      const customGate = {
        info: {
          id: "custom-test",
          name: "Custom Test",
          description: "A custom test gate",
          critical: false,
        },
        isAvailable: async () => true,
        run: async () => ({
          gate: "custom-test",
          passed: true,
          critical: false,
          output: "OK",
          timing: { startedAt: Date.now(), completedAt: Date.now() },
        }),
      }

      Verifier.registerGate(customGate)
      expect(Verifier.getGate("custom-test")).toBeDefined()

      Verifier.unregisterGate("custom-test")
      expect(Verifier.getGate("custom-test")).toBeUndefined()
    })
  })

  describe("calculateScore", () => {
    test("returns 100 for all passing gates", () => {
      const results: GateResult[] = [
        {
          gate: "pytest",
          passed: true,
          critical: true,
          output: "OK",
          timing: { startedAt: 0, completedAt: 0 },
        },
        {
          gate: "mypy",
          passed: true,
          critical: false,
          output: "OK",
          timing: { startedAt: 0, completedAt: 0 },
        },
      ]

      expect(Verifier.calculateScore(results)).toBe(100)
    })

    test("deducts 10 points per error", () => {
      const results: GateResult[] = [
        {
          gate: "mypy",
          passed: false,
          critical: false,
          output: "errors",
          diagnostics: [
            { file: "a.py", line: 1, severity: "error", message: "error 1" },
            { file: "b.py", line: 2, severity: "error", message: "error 2" },
          ],
          timing: { startedAt: 0, completedAt: 0 },
        },
      ]

      expect(Verifier.calculateScore(results)).toBe(80) // 100 - 2*10
    })

    test("deducts 2 points per warning", () => {
      const results: GateResult[] = [
        {
          gate: "ruff",
          passed: false,
          critical: false,
          output: "warnings",
          diagnostics: [
            { file: "a.py", line: 1, severity: "warning", message: "warning 1" },
            { file: "b.py", line: 2, severity: "warning", message: "warning 2" },
            { file: "c.py", line: 3, severity: "warning", message: "warning 3" },
          ],
          timing: { startedAt: 0, completedAt: 0 },
        },
      ]

      expect(Verifier.calculateScore(results)).toBe(94) // 100 - 3*2
    })

    test("penalizes failed gates without diagnostics", () => {
      const results: GateResult[] = [
        {
          gate: "pytest",
          passed: false,
          critical: true,
          output: "failed",
          timing: { startedAt: 0, completedAt: 0 },
        },
      ]

      expect(Verifier.calculateScore(results)).toBe(50) // 100 - 50 (critical)
    })

    test("minimum score is 0", () => {
      const results: GateResult[] = [
        {
          gate: "mypy",
          passed: false,
          critical: false,
          output: "many errors",
          diagnostics: Array(20)
            .fill(null)
            .map((_, i) => ({ file: `f${i}.py`, line: i, severity: "error" as const, message: `error ${i}` })),
          timing: { startedAt: 0, completedAt: 0 },
        },
      ]

      expect(Verifier.calculateScore(results)).toBe(0) // 100 - 20*10 = -100, capped at 0
    })
  })

  describe("generateSummary", () => {
    test("generates summary for all passed", () => {
      const summary = Verifier.generateSummary({
        allPassed: true,
        criticalPassed: true,
        results: [
          {
            gate: "pytest",
            passed: true,
            critical: true,
            output: "OK",
            timing: { startedAt: 0, completedAt: 100 },
          },
        ],
        score: 100,
        summary: "",
      })

      expect(summary).toContain("All gates passed")
      expect(summary).toContain("Score: 100/100")
      expect(summary).toContain("pytest")
    })

    test("generates summary for critical failure", () => {
      const summary = Verifier.generateSummary({
        allPassed: false,
        criticalPassed: false,
        results: [
          {
            gate: "pytest",
            passed: false,
            critical: true,
            output: "failed",
            timing: { startedAt: 0, completedAt: 100 },
          },
        ],
        score: 50,
        summary: "",
      })

      expect(summary).toContain("Critical gate(s) failed")
      expect(summary).toContain("Score: 50/100")
    })

    test("generates summary with diagnostic counts", () => {
      const summary = Verifier.generateSummary({
        allPassed: false,
        criticalPassed: true,
        results: [
          {
            gate: "mypy",
            passed: false,
            critical: false,
            output: "errors",
            diagnostics: [
              { file: "a.py", line: 1, severity: "error", message: "err" },
              { file: "b.py", line: 2, severity: "warning", message: "warn" },
              { file: "c.py", line: 3, severity: "warning", message: "warn" },
            ],
            timing: { startedAt: 0, completedAt: 100 },
          },
        ],
        score: 86,
        summary: "",
      })

      expect(summary).toContain("1 error")
      expect(summary).toContain("2 warnings")
    })
  })

  describe("runGate", () => {
    test("returns skipped result for unknown gate", async () => {
      const workcell = makeWorkcell()
      const result = await Verifier.runGate(workcell, "unknown-gate")

      expect(result.passed).toBe(false)
      expect(result.output).toContain("not found")
    })

    test("returns skipped result for unavailable gate", async () => {
      // Register a gate that's never available
      const unavailableGate = {
        info: {
          id: "unavailable-test",
          name: "Unavailable",
          description: "Never available",
          critical: false,
        },
        isAvailable: async () => false,
        run: async () => ({
          gate: "unavailable-test",
          passed: false,
          critical: false,
          output: "should not run",
          timing: { startedAt: 0, completedAt: 0 },
        }),
      }

      Verifier.registerGate(unavailableGate)
      const result = await Verifier.runGate(makeWorkcell(), "unavailable-test")
      Verifier.unregisterGate("unavailable-test")

      expect(result.passed).toBe(true) // skipped gates pass
      expect(result.output).toContain("skipped")
    })
  })

  describe("run", () => {
    test("runs multiple gates and aggregates results", async () => {
      // Register mock gates for testing
      const mockGate1 = {
        info: { id: "mock1", name: "Mock 1", description: "test", critical: false },
        isAvailable: async () => true,
        run: async () => ({
          gate: "mock1",
          passed: true,
          critical: false,
          output: "OK",
          timing: { startedAt: Date.now(), completedAt: Date.now() },
        }),
      }
      const mockGate2 = {
        info: { id: "mock2", name: "Mock 2", description: "test", critical: false },
        isAvailable: async () => true,
        run: async () => ({
          gate: "mock2",
          passed: true,
          critical: false,
          output: "OK",
          timing: { startedAt: Date.now(), completedAt: Date.now() },
        }),
      }

      Verifier.registerGate(mockGate1)
      Verifier.registerGate(mockGate2)

      const results = await Verifier.run(makeWorkcell(), {
        gates: ["mock1", "mock2"],
      })

      Verifier.unregisterGate("mock1")
      Verifier.unregisterGate("mock2")

      expect(results.allPassed).toBe(true)
      expect(results.criticalPassed).toBe(true)
      expect(results.results).toHaveLength(2)
      expect(results.score).toBe(100)
      expect(results.summary).toContain("All gates passed")
    })

    test("fail-fast stops on critical failure", async () => {
      let gate2Ran = false

      const failingGate = {
        info: { id: "failing", name: "Failing", description: "test", critical: true },
        isAvailable: async () => true,
        run: async () => ({
          gate: "failing",
          passed: false,
          critical: true,
          output: "FAIL",
          timing: { startedAt: Date.now(), completedAt: Date.now() },
        }),
      }
      const secondGate = {
        info: { id: "second", name: "Second", description: "test", critical: false },
        isAvailable: async () => true,
        run: async () => {
          gate2Ran = true
          return {
            gate: "second",
            passed: true,
            critical: false,
            output: "OK",
            timing: { startedAt: Date.now(), completedAt: Date.now() },
          }
        },
      }

      Verifier.registerGate(failingGate)
      Verifier.registerGate(secondGate)

      const results = await Verifier.run(makeWorkcell(), {
        gates: ["failing", "second"],
        failFast: true,
      })

      Verifier.unregisterGate("failing")
      Verifier.unregisterGate("second")

      expect(results.allPassed).toBe(false)
      expect(results.criticalPassed).toBe(false)
      expect(results.results).toHaveLength(1) // only first gate ran
      expect(gate2Ran).toBe(false)
    })

    test("continues on non-critical failure with fail-fast", async () => {
      const nonCriticalFail = {
        info: { id: "noncrit", name: "NonCrit", description: "test", critical: false },
        isAvailable: async () => true,
        run: async () => ({
          gate: "noncrit",
          passed: false,
          critical: false,
          output: "FAIL",
          timing: { startedAt: Date.now(), completedAt: Date.now() },
        }),
      }
      const secondGate = {
        info: { id: "second2", name: "Second", description: "test", critical: false },
        isAvailable: async () => true,
        run: async () => ({
          gate: "second2",
          passed: true,
          critical: false,
          output: "OK",
          timing: { startedAt: Date.now(), completedAt: Date.now() },
        }),
      }

      Verifier.registerGate(nonCriticalFail)
      Verifier.registerGate(secondGate)

      const results = await Verifier.run(makeWorkcell(), {
        gates: ["noncrit", "second2"],
        failFast: true,
      })

      Verifier.unregisterGate("noncrit")
      Verifier.unregisterGate("second2")

      expect(results.results).toHaveLength(2) // both gates ran
      expect(results.criticalPassed).toBe(true) // no critical gates
    })
  })
})

// =============================================================================
// THRUNT GATE TESTS
// =============================================================================

describe("EvidenceIntegrityGate", () => {
  test("info has id 'evidence-integrity' and critical false", () => {
    expect(EvidenceIntegrityGate.info.id).toBe("evidence-integrity")
    expect(EvidenceIntegrityGate.info.critical).toBe(false)
  })

  test("isAvailable returns true always", async () => {
    const workcell = makeWorkcell()
    const available = await EvidenceIntegrityGate.isAvailable(workcell)
    expect(available).toBe(true)
  })

  test("run returns passed=true when all manifests have valid integrity", async () => {
    await installThruntTools({
      "audit-evidence --raw": {
        stdout: [
          {
            phase: "01",
            phase_dir: "/tmp",
            file: "manifest.json",
            file_path: "/tmp/manifest.json",
            type: "manifest",
            status: "ok",
            items: [],
            integrity: {
              valid: true,
              manifest_hash_valid: true,
              artifacts_valid: true,
              artifact_errors: [],
            },
          },
        ],
      },
    })

    const workcell = makeWorkcell()
    const result = await EvidenceIntegrityGate.run(
      workcell,
      new AbortController().signal,
    )

    expect(result.passed).toBe(true)
    expect(result.gate).toBe("evidence-integrity")
    expect(result.critical).toBe(false)
  })

  test("run returns passed=false with diagnostics when integrity.valid is false", async () => {
    await installThruntTools({
      "audit-evidence --raw": {
        stdout: [
          {
            phase: "01",
            phase_dir: "/tmp",
            file: "manifest.json",
            file_path: "/tmp/manifest.json",
            type: "manifest",
            status: "invalid",
            items: [],
            integrity: {
              valid: false,
              manifest_hash_valid: false,
              artifacts_valid: false,
              artifact_errors: ["hash mismatch: evidence-01.json"],
            },
          },
        ],
      },
    })

    const workcell = makeWorkcell()
    const result = await EvidenceIntegrityGate.run(
      workcell,
      new AbortController().signal,
    )

    expect(result.passed).toBe(false)
    expect(result.diagnostics).toBeDefined()
    expect(result.diagnostics!.length).toBeGreaterThan(0)
    expect(result.diagnostics![0].severity).toBe("warning")
  })

  test("run returns passed=true when audit evidence subprocess fails", async () => {
    await installThruntTools({
      "audit-evidence --raw": { stderr: "subprocess crash", exitCode: 1 },
    })

    const workcell = makeWorkcell()
    const result = await EvidenceIntegrityGate.run(
      workcell,
      new AbortController().signal,
    )

    expect(result.passed).toBe(true)
    expect(result.output).toContain("Checked 0 manifests")
  })
})

describe("ReceiptCompletenessGate", () => {
  test("info has id 'receipt-completeness' and critical false", () => {
    expect(ReceiptCompletenessGate.info.id).toBe("receipt-completeness")
    expect(ReceiptCompletenessGate.info.critical).toBe(false)
  })

  test("run returns passed=true when all manifest items have receipt linkage", async () => {
    await installThruntTools({
      "audit-evidence --raw": {
        stdout: [
          {
            phase: "01",
            phase_dir: "/tmp",
            file: "manifest.json",
            file_path: "/tmp/manifest.json",
            type: "manifest",
            status: "ok",
            items: [
              { id: "item-1", text: "evidence item", status: "linked" },
            ],
            integrity: {
              valid: true,
              manifest_hash_valid: true,
              artifacts_valid: true,
              artifact_errors: [],
            },
          },
        ],
      },
    })

    const workcell = makeWorkcell()
    const result = await ReceiptCompletenessGate.run(
      workcell,
      new AbortController().signal,
    )

    expect(result.passed).toBe(true)
    expect(result.gate).toBe("receipt-completeness")
    expect(result.critical).toBe(false)
  })

  test("run returns passed=false with diagnostics when items lack receipt linkage", async () => {
    await installThruntTools({
      "audit-evidence --raw": {
        stdout: [
          {
            phase: "01",
            phase_dir: "/tmp",
            file: "manifest.json",
            file_path: "/tmp/manifest.json",
            type: "manifest",
            status: "gaps",
            items: [
              { id: "item-1", text: "evidence item", status: "missing" },
              { id: "item-2", text: "another item", status: "gap" },
            ],
            integrity: {
              valid: true,
              manifest_hash_valid: true,
              artifacts_valid: false,
              artifact_errors: [],
            },
          },
        ],
      },
    })

    const workcell = makeWorkcell()
    const result = await ReceiptCompletenessGate.run(
      workcell,
      new AbortController().signal,
    )

    expect(result.passed).toBe(false)
    expect(result.diagnostics).toBeDefined()
    expect(result.diagnostics!.length).toBeGreaterThan(0)
  })

  test("run returns passed=true when audit evidence subprocess fails", async () => {
    await installThruntTools({
      "audit-evidence --raw": { stderr: "subprocess crash", exitCode: 1 },
    })

    const workcell = makeWorkcell()
    const result = await ReceiptCompletenessGate.run(
      workcell,
      new AbortController().signal,
    )

    expect(result.passed).toBe(true)
    expect(result.output).toContain("Checked 0 manifests")
  })
})
