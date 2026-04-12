# THRUNT Surface Bridge

Local-first HTTP + WebSocket service that exposes THRUNT case state to external surfaces (browser extension, SIEM companions, etc.).

## Quick Start

```bash
# From the surfaces workspace root
bun install

# Start in dev mode (auto-reload)
bun run dev:bridge

# Or start directly
cd apps/surface-bridge
bun run dev

# Start in mock mode (no .planning/ required)
THRUNT_MOCK_MODE=true bun run dev
```

## API

All endpoints return JSON. The bridge binds to `127.0.0.1:7483` by default.

### Read Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Bridge health and status |
| GET | `/api/case` | Current case summary |
| GET | `/api/case/progress` | Phase progress |
| GET | `/api/case/hypotheses` | Hypothesis list |
| GET | `/api/case/queries` | Recent query logs |
| GET | `/api/case/receipts` | Recent receipts |
| GET | `/api/case/findings` | Published findings |
| GET | `/api/case/view` | Full case view model |

### Write Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/case/open` | Open a new case from signal |
| POST | `/api/evidence/attach` | Attach evidence from a surface |
| POST | `/api/execute/pack` | Run a hunt pack (mock mode) |
| POST | `/api/execute/target` | Run a targeted query (mock mode) |
| POST | `/api/execute/next` | Execute recommended next step |

### WebSocket

Connect to `ws://127.0.0.1:7483/ws` for real-time updates.

## Configuration

Copy `.env.example` to `.env` and adjust:

- `THRUNT_BRIDGE_PORT` — HTTP port (default: 7483)
- `THRUNT_BRIDGE_HOST` — Bind address (default: 127.0.0.1)
- `THRUNT_PROJECT_ROOT` — Project root with .planning/ (default: cwd)
- `THRUNT_MOCK_MODE` — Use fixture data instead of real artifacts

## Architecture

The bridge reads `.planning/` artifacts on demand with in-memory caching. It does not maintain its own database. For mutation operations, it delegates to `thrunt-tools.cjs` via subprocess.

```
Browser Extension / SIEM Companion
        │
        ▼
  ┌─────────────┐
  │ Surface      │  HTTP + WebSocket
  │ Bridge       │  localhost:7483
  └─────┬───────┘
        │
        ▼
  ┌─────────────┐
  │ .planning/   │  File-based artifacts
  │ MISSION.md   │  STATE.md, HUNTMAP.md
  │ QUERIES/     │  RECEIPTS/, FINDINGS.md
  └─────────────┘
```
