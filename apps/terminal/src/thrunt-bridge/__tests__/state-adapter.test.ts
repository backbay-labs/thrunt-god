import { afterEach, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

async function writeExecutableScript(
  dir: string,
  name: string,
  contents: string,
): Promise<string> {
  const scriptPath = path.join(dir, name)
  await fs.writeFile(scriptPath, contents, { mode: 0o755 })
  await fs.chmod(scriptPath, 0o755)
  return scriptPath
}

let tempDirs: string[] = []

afterEach(async () => {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
  tempDirs = []
})

async function createMockProject(
  prefix: string,
  scriptContents: string,
): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.push(tempDir)

  const projectRoot = path.join(tempDir, "project")
  const toolsDir = path.join(projectRoot, "thrunt-god", "bin")
  await fs.mkdir(toolsDir, { recursive: true })
  await writeExecutableScript(toolsDir, "thrunt-tools.cjs", scriptContents)

  return projectRoot
}

describe("loadThruntState", () => {
  test("returns ThruntHuntContext with phase/plan/status from state-snapshot", async () => {
    const { loadThruntState } = await import("../state-adapter")
    const projectRoot = await createMockProject(
      "thrunt-state-",
      `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === 'state-snapshot') {
  fs.writeSync(1, JSON.stringify({
    current_phase: "23",
    current_phase_name: "bridge-foundation",
    total_phases: 4,
    current_plan: 1,
    total_plans_in_phase: 3,
    status: "Executing",
    progress_percent: 33,
    last_activity: "2026-03-29 -- Test",
    last_activity_desc: null,
    decisions: [],
    blockers: ["blocker1"],
    session: {}
  }));
} else if (args[0] === 'progress' && args[1] === 'json') {
  fs.writeSync(1, JSON.stringify({
    milestone_version: "v1.5",
    milestone_name: "TUI Console",
    phases: [{ number: "23", name: "bridge", plans: 3, summaries: 1, status: "In Progress" }],
    total_plans: 3,
    total_summaries: 1,
    percent: 33
  }));
} else {
  fs.writeSync(2, 'Unknown command: ' + args.join(' '));
  process.exit(1);
}
`,
    )

    const ctx = await loadThruntState({ cwd: projectRoot })

    expect(ctx.phase.number).toBe("23")
    expect(ctx.phase.name).toBe("bridge-foundation")
    expect(ctx.phase.totalPhases).toBe(4)
    expect(ctx.plan.current).toBe(1)
    expect(ctx.plan.total).toBe(3)
    expect(ctx.status).toBe("Executing")
    expect(ctx.progressPercent).toBe(33)
    expect(ctx.lastActivity).toBe("2026-03-29 -- Test")
    expect(ctx.blockers).toEqual(["blocker1"])
    expect(ctx.error).toBeNull()
  })

  test("includes roadmap phases from progress json output", async () => {
    const { loadThruntState } = await import("../state-adapter")
    const projectRoot = await createMockProject(
      "thrunt-state-",
      `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === 'state-snapshot') {
  fs.writeSync(1, JSON.stringify({
    current_phase: "23", current_phase_name: "bridge", total_phases: 4,
    current_plan: 2, total_plans_in_phase: 3, status: "Executing",
    progress_percent: 50, last_activity: "test", decisions: [], blockers: [], session: {}
  }));
} else if (args[0] === 'progress' && args[1] === 'json') {
  fs.writeSync(1, JSON.stringify({
    milestone_version: "v1.5",
    milestone_name: "TUI Console",
    phases: [
      { number: "23", name: "bridge", plans: 3, summaries: 1, status: "In Progress" },
      { number: "24", name: "screens", plans: 5, summaries: 0, status: "Pending" }
    ],
    total_plans: 8,
    total_summaries: 1,
    percent: 12
  }));
}
`,
    )

    const ctx = await loadThruntState({ cwd: projectRoot })

    expect(ctx.roadmap).not.toBeNull()
    expect(ctx.roadmap!.milestoneVersion).toBe("v1.5")
    expect(ctx.roadmap!.phases).toHaveLength(2)
    expect(ctx.roadmap!.phases[0].number).toBe("23")
    expect(ctx.roadmap!.phases[0].name).toBe("bridge")
    expect(ctx.roadmap!.phases[0].plans).toBe(3)
    expect(ctx.roadmap!.phases[0].summaries).toBe(1)
    expect(ctx.roadmap!.totalPlans).toBe(8)
    expect(ctx.roadmap!.totalSummaries).toBe(1)
    expect(ctx.roadmap!.percent).toBe(12)
  })

  test("sets error field when state-snapshot subprocess fails", async () => {
    const { loadThruntState } = await import("../state-adapter")
    const projectRoot = await createMockProject(
      "thrunt-state-",
      `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === 'state-snapshot') {
  fs.writeSync(2, 'STATE.md not found');
  process.exit(1);
} else if (args[0] === 'progress' && args[1] === 'json') {
  fs.writeSync(1, JSON.stringify({ phases: [], total_plans: 0, total_summaries: 0, percent: 0 }));
}
`,
    )

    const ctx = await loadThruntState({ cwd: projectRoot })

    expect(ctx.error).toBeTruthy()
    expect(ctx.phase.number).toBeNull()
    expect(ctx.plan.current).toBeNull()
    expect(ctx.status).toBeNull()
    expect(ctx.roadmap).toBeNull()
  })

  test("returns sensible defaults when state-snapshot returns nulls", async () => {
    const { loadThruntState } = await import("../state-adapter")
    const projectRoot = await createMockProject(
      "thrunt-state-",
      `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === 'state-snapshot') {
  fs.writeSync(1, JSON.stringify({
    current_phase: null,
    current_phase_name: null,
    total_phases: null,
    current_plan: null,
    total_plans_in_phase: null,
    status: "Ready to plan",
    progress_percent: null,
    last_activity: null,
    decisions: [],
    blockers: [],
    session: { last_date: null, stopped_at: null, resume_file: null }
  }));
} else if (args[0] === 'progress' && args[1] === 'json') {
  fs.writeSync(1, JSON.stringify({
    milestone_version: "v1.0",
    phases: [{ number: "23", name: "bridge", plans: 0, summaries: 0, status: "Pending" }],
    total_plans: 0,
    total_summaries: 0,
    percent: 0
  }));
}
`,
    )

    const ctx = await loadThruntState({ cwd: projectRoot })

    expect(ctx.phase.number).toBeNull()
    expect(ctx.phase.name).toBeNull()
    expect(ctx.phase.totalPhases).toBeNull()
    expect(ctx.plan.current).toBeNull()
    expect(ctx.plan.total).toBeNull()
    expect(ctx.status).toBe("Ready to plan")
    expect(ctx.progressPercent).toBeNull()
    expect(ctx.lastActivity).toBeNull()
    expect(ctx.blockers).toEqual([])
    expect(ctx.decisions).toEqual([])
    expect(ctx.error).toBeNull()
    expect(ctx.roadmap).not.toBeNull()
    expect(ctx.roadmap!.percent).toBe(0)
  })

  test("populates lastRefreshedAt as a Date", async () => {
    const { loadThruntState } = await import("../state-adapter")
    const projectRoot = await createMockProject(
      "thrunt-state-",
      `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === 'state-snapshot') {
  fs.writeSync(1, JSON.stringify({
    current_phase: "1", current_phase_name: "test", total_phases: 1,
    current_plan: 1, total_plans_in_phase: 1, status: "Executing",
    progress_percent: 50, last_activity: "test", decisions: [], blockers: [], session: {}
  }));
} else if (args[0] === 'progress' && args[1] === 'json') {
  fs.writeSync(1, JSON.stringify({ phases: [], total_plans: 0, total_summaries: 0, percent: 0 }));
}
`,
    )

    const before = new Date()
    const ctx = await loadThruntState({ cwd: projectRoot })
    const after = new Date()

    expect(ctx.lastRefreshedAt).toBeInstanceOf(Date)
    expect(ctx.lastRefreshedAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(ctx.lastRefreshedAt.getTime()).toBeLessThanOrEqual(after.getTime())
  })
})
