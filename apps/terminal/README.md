# THRUNT GOD TUI

**Search-first hunt cockpit for live investigation and agent handoff**

THRUNT GOD TUI is the terminal package for the THRUNT hunt workflow. The current product direction is lightweight and watch-oriented:

- search reports, packs, connectors, phases, findings, and copyable prompt starters
- watch live hunt activity and exported report history
- let an external agent post status, log, and copy events into the watch surface
- keep heavy agent execution in a normal terminal or tmux pane instead of inside the TUI

The CLI still exposes `dispatch` and `gate` commands, and CLI dispatch can still use worktree-backed isolation. The interactive TUI is intentionally moving away from owning dispatch/runtime lifecycle directly.

## Current Surfaces

- **Home**: search bar, quick navigation, copyable prompts, recent agent activity
- **Watch**: live hunt stream with agent activity summary
- **Query**: hunt query surface
- **Report / History**: evidence handoff and exported report bundles
- **Packs / Connectors / Phases / Evidence / Detections**: read-first investigation support
- **Integrations / Security / Audit / Policy**: local environment and review surfaces

## Interactive TUI

Launch through the main CLI with `thrunt-god tui`, or use the package-local binary as `thrunt-god-tui`.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Type` | Search prompts, reports, findings, packs, connectors, and phases |
| `Enter` | Open or copy the selected search result |
| `y` / `c` | Copy the selected search result |
| `Tab` | Switch between search and quick actions |
| `Esc` | Clear search or return focus to the search bar |
| `Ctrl+N` | Cycle target agent label |
| `Ctrl+P` | Open command palette |
| `Ctrl+S` | Security overview |
| `W` / `Q` / `H` / `P` / `E` / `T` / `K` / `C` | Watch / Query / History / Phases / Evidence / Detections / Packs / Connectors |
| `g` | Run quality gates |
| `i` | Integrations |
| `?` | Help |
| `q` | Quit |
| `↑/↓` | Move through search results |

### Agent Bridge

External agents can post structured updates into `.thrunt-god/ui/events.jsonl`. The current bridge supports:

- `status`
- `note`
- `search`
- `copy`
- `warning`
- `error`

Use the CLI helper:

```bash
thrunt-god tui ui-post status "Running Elastic hunt" "Collecting suspicious shell launches"
thrunt-god tui ui-post copy "prompt" "Summarize the current watch anomalies and rank them by confidence."
```

## Installation

```bash
cd apps/terminal
bun install
```

The package currently requires `bun` on the machine running `thrunt-god tui`.

### Wrapper And Doctor Notes

- `thrunt-god tui doctor --json` reports the active runtime under `runtime.source`, `runtime.script_path`, and `runtime.bun_version`.
- The Rust wrapper resolves the TUI runtime in this order:
  1. `THRUNT_TUI_DIR`
  2. installed bundle beside the CLI binary at `../share/thrunt-god/tui/cli.js`
  3. repo source fallback at `apps/terminal/src/cli/index.ts`
- If `bun` on `PATH` is a crashing shim layer, `doctor` will still show the selected runtime, but launch can fail before the TUI starts. In that case, put the real Bun binary earlier on `PATH` than the shim.

## Codex Agent Pack

The terminal subtree includes a Codex agent pack for live dogfooding, UI polish,
release hardening, and multi-agent debugging.

- Usage guide: [docs/codex-agent-pack.md](./docs/codex-agent-pack.md)
- Repo-wide swarm playbook: [../../docs/plans/multi-agent/codex-swarm-playbook.md](../../docs/plans/multi-agent/codex-swarm-playbook.md)
- Project config: [.codex/config.toml](../../.codex/config.toml)
- Terminal working agreement: [AGENTS.md](./AGENTS.md)

## Archived Planning Docs

These docs capture older dispatch-heavy TUI planning and are still useful as background, but they do not describe the current shipped interaction model:

- [docs/dispatch-ux-spec.md](./docs/dispatch-ux-spec.md)
- [docs/dispatch-ux-plan.md](./docs/dispatch-ux-plan.md)
- [docs/embedded-pty-surface-spec.md](./docs/embedded-pty-surface-spec.md)
- [docs/embedded-pty-surface-plan.md](./docs/embedded-pty-surface-plan.md)

## CLI Usage

```bash
# Run via the main Rust CLI
thrunt-god tui <command>

# In a repo checkout, this exercises the current branch even if a globally
# installed thrunt-god binary is older:
cargo run -q -p hush-cli --bin thrunt-god -- tui --cwd apps/terminal

# Or run the package-local TUI binary
bun run cli <command>
bun link
thrunt-god-tui <command>
```

### Commands

```bash
thrunt-god tui                   # Launch the interactive TUI
thrunt-god tui dispatch <prompt> # Submit task for AI execution from the CLI
thrunt-god tui gate [gates...]   # Run quality gates
thrunt-god tui status            # Show kernel status
thrunt-god tui ui-post ...       # Post an agent event into the watch surface
thrunt-god tui init              # Initialize in current directory
thrunt-god tui doctor            # Inspect local environment and services
thrunt-god tui help              # Show CLI help
```

### Supported vs Experimental

Supported beta screens:
- main search surface
- integrations
- security
- audit
- policy
- hunt watch
- hunt scan
- hunt timeline
- hunt query
- hunt report
- hunt report history
- hunt phases
- hunt evidence
- hunt detections
- hunt packs
- hunt connectors

Experimental screens:
- hunt rule builder
- hunt diff
- hunt mitre
- hunt playbook

### Options

```bash
-t, --toolchain <name>   # Force toolchain (codex, claude, opencode, crush)
-g, --gate <name>        # Gates to run (can repeat)
--timeout <ms>           # Execution timeout
-j, --json               # JSON output
--no-color               # Disable colors
--cwd <path>             # Working directory
-p, --project <id>       # Project identifier
```

### Examples

```bash
# Launch the TUI
thrunt-god tui

# Initialize and inspect a repo before opening the TUI
thrunt-god tui init
thrunt-god tui doctor --json

# Dispatch from the CLI while keeping the TUI read-first
thrunt-god tui dispatch -t claude "Add unit tests for utils.ts"

# Post agent progress into the watch pane
thrunt-god tui ui-post status "Running Elastic hunt" "Collecting suspicious shell launches"

# Run current gate set
thrunt-god tui gate evidence-integrity receipt-completeness
```

## Programmatic Usage

The package API remains unstable during beta. The supported public interface is the CLI.

```typescript
import {
  init,
  shutdown,
  Router,
  Dispatcher,
  Workcell,
  Verifier,
  Telemetry,
  tools,
  executeTool,
} from "@thrunt-god/tui"

// Initialize runtime support
await init({
  telemetryDir: ".thrunt-god/runs",
})

// Route a task
const routing = await Router.route({
  prompt: "Fix the bug in auth.ts",
  context: { cwd: process.cwd(), projectId: "my-project" },
})

// Execute via tool
const result = await executeTool("dispatch", {
  prompt: "Fix the bug",
  toolchain: "claude",
})

// Cleanup
await shutdown()
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CLI / Tools                                                │
│  tui, dispatch, gate, status, ui-post                       │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  Search / Watch TUI                                          │
│  Read-first investigation and agent handoff                  │
└────────────────────────────┬────────────────────────────────┘
                             │
      ┌──────────────────────┼──────────────────────┐
      │                      │                      │
┌─────▼──────────┐  ┌────────▼─────────┐  ┌────────▼─────────┐
│ Hunt Surfaces  │  │ UI Event Bridge  │  │ CLI Dispatch     │
│ watch/query/   │  │ .thrunt-god/ui   │  │ optional runtime  │
│ report/history │  │ JSONL handoff    │  │ execution         │
└─────┬──────────┘  └────────┬─────────┘  └────────┬─────────┘
      │                      │                     │
┌─────▼──────────────────────▼─────────────────────▼─────────┐
│ Local runtime + workcell / verifier plumbing                │
│ used by CLI execution and supporting integrations           │
└─────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
```

## Toolchains

| Toolchain | CLI | Best For |
|-----------|-----|----------|
| `codex` | OpenAI Codex CLI | Complex reasoning, architecture |
| `claude` | Claude Code | General purpose, fast |
| `opencode` | OpenCode | Local execution, no network |
| `crush` | Multi-provider | Fallback with retries |

## Vote Strategies

When using `speculate`, multiple agents run in parallel and results are voted on:

| Strategy | Description |
|----------|-------------|
| `first_pass` | First result passing all gates wins (fastest) |
| `best_score` | Highest gate score wins (best quality) |
| `consensus` | Most similar patch wins (most deterministic) |

## Quality Gates

| Gate | Critical | Description |
|------|----------|-------------|
| `pytest` | Yes | Run Python tests |
| `mypy` | Yes | Type check Python |
| `ruff` | No | Lint and format Python |
| `thrunt-god` | No | Policy check via hushd (patch integrity, secret leak) |

## Module Structure

```
src/
├── cli/           # Command-line interface
├── router/        # Task routing rules
├── dispatcher/    # Toolchain adapters
│   └── adapters/  # codex, claude, opencode, crush
├── workcell/      # Git worktree management
├── verifier/      # Quality gates
│   └── gates/     # pytest, mypy, ruff, thrunt-god
├── speculate/     # Parallel execution + voting
├── beads/         # Work graph (JSONL)
├── hushd/         # Security daemon client
│   ├── types.ts   # hushd API types
│   ├── client.ts  # HTTP + SSE client
│   └── index.ts   # Namespace entry point
├── telemetry/     # Execution tracking
├── health/        # Integration health checks
├── tui/           # Terminal UI and formatting
│   ├── index.ts   # TUI formatting utilities
│   └── app.ts     # Interactive TUI application
├── mcp/           # MCP server (JSON-RPC)
├── tools/         # MCP tool definitions
├── patch/         # Patch lifecycle
├── types.ts       # Zod schemas
└── index.ts       # Main exports
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `THRUNT_HUSHD_URL` | `http://127.0.0.1:9876` | hushd daemon URL |
| `THRUNT_SANDBOX` | - | Sandbox mode for codex adapter |
| `NO_COLOR` | - | Disable color output |

## Development

```bash
# Run tests
bun test

# Type check
bun run typecheck

# Run CLI in dev mode
bun run cli help

# Launch TUI
bun run cli
```

## Testing

335 tests covering:
- Type validation and Zod schemas
- Router rules and routing decisions
- Dispatcher adapters (codex, claude, opencode, crush)
- Workcell pool management and git operations
- Verifier gates and scoring (including thrunt-god gate)
- Speculate voting strategies
- Beads JSONL operations
- Telemetry tracking
- hushd client (mocked fetch)
- Health check integrations
- TUI formatting
- MCP server protocol
- CLI argument parsing and integration

```bash
bun test                 # All tests
bun test test/router     # Router tests only
bun test -t "hushd"      # hushd client tests
bun test -t "speculate"  # Tests matching pattern
```

## License

MIT
