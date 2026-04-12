# @thrunt-surfaces/m365-defender-companion

Companion integration for Microsoft 365 Defender that provides Advanced Hunting KQL query helpers and incident correlation within THRUNT hunt workflows.

## What This Does

- **Advanced Hunting Query Builder** — Generates valid KQL queries from structured parameters (table, time range, filters, entity search, projection). The output can be pasted into the Defender Advanced Hunting console or executed via the Microsoft Graph Security API.
- **Incident Correlation** — Stub for correlating Defender incidents with THRUNT hunt cases and hypotheses. In production, this matches incident entities against active hunt state.

## How M365 Defender Extensibility Works

Microsoft 365 Defender does **not** have an embeddable plugin model. There is no plugin SDK, no custom panel framework, and no way to add third-party UI into the Defender portal.

Integration with M365 Defender is achieved through:

1. **Advanced Hunting API** — Execute KQL queries via the Microsoft Graph Security API (`/security/runHuntingQuery`).
2. **Incidents API** — Read and update security incidents via Microsoft Graph.
3. **Custom Detection Rules** — Saved KQL queries that generate alerts when matches are found.
4. **Streaming API** — Event streaming to Azure Event Hub or Azure Storage for external processing.
5. **Microsoft Sentinel integration** — Defender data flows into Sentinel for cross-product correlation.

For threat hunting, Advanced Hunting is the primary query surface. This companion focuses on making it easy to construct KQL queries programmatically.

## Limitations

- The query builder generates KQL strings but does not execute them. Execution requires Graph API credentials with `ThreatHunting.Read.All` permission.
- Incident correlation is a stub. Active correlation requires the surface-bridge to be running with a live case.
- Advanced Hunting queries have a 30-day lookback limit and a 10,000-row result limit in the Defender portal.
- Entity search across common fields uses `has` operator which may not match all naming conventions across tables.
- Not all Advanced Hunting tables have the same column schema. The entity search filter references common columns that may not exist in every table.

## Integration Architecture

```
M365 Defender Portal
  ├── Advanced Hunting (paste generated KQL queries)
  ├── Incidents (correlate with THRUNT cases)
  └── Browser Extension M365 Defender Adapter (primary in-console surface)
        └── surface-bridge API (localhost:7483)
              └── THRUNT case state (.planning/)

Microsoft Graph Security API (server-side)
  ├── /security/runHuntingQuery → m365-defender-companion query builder
  └── /security/incidents → m365-defender-companion incident correlation
```

The **browser extension's M365 Defender adapter** is the primary integration surface for analysts working in the Defender console. This companion provides the query construction and correlation logic used server-side.

## Future Path

- **Live query execution** — Execute Advanced Hunting queries via the Graph Security API and return structured results to THRUNT connectors.
- **Bi-directional incident sync** — Defender incidents update THRUNT case state, and THRUNT findings create Defender custom detections.
- **Custom Detection Rule generation** — Convert validated hunt queries into Defender Custom Detection Rules for continuous monitoring.
- **Streaming API consumer** — Ingest Defender streaming events for real-time correlation with active hunts.

## Usage

```typescript
import { M365DefenderCompanion } from '@thrunt-surfaces/m365-defender-companion';

const companion = new M365DefenderCompanion();

// Build an Advanced Hunting KQL query
const kql = companion.buildAdvancedHuntingQuery({
  table: 'DeviceProcessEvents',
  lookbackDays: 14,
  filters: ['FileName == "powershell.exe"', 'ProcessCommandLine has "-EncodedCommand"'],
  columns: ['Timestamp', 'DeviceName', 'AccountName', 'ProcessCommandLine'],
  limit: 200,
});

// Correlate a Defender incident
const correlation = companion.correlateIncident('INC-12345');
```
