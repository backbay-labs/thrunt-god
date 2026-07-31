# @thrunt-surfaces/crowdstrike-falcon-companion

Companion integration for CrowdStrike Falcon that provides detection query helpers and detection correlation within THRUNT hunt workflows.

## What This Does

- **Detection Query Builder** — Generates Falcon Query Language (FQL) filter strings from structured parameters (host, MITRE ATT&CK tactics/techniques, severity, time range). The output can be used with the Falcon Detections API or pasted into Falcon Event Search.
- **Detection Correlation** — Stub for correlating Falcon detections with THRUNT hunt cases and hypotheses.

## How CrowdStrike Falcon Extensibility Works

CrowdStrike has a **Marketplace** with an app model, but it requires partner enrollment and approval through the CrowdStrike Store program. There is no open plugin SDK for arbitrary third-party integrations in the Falcon console.

Integration with CrowdStrike Falcon is achieved through:

1. **Falcon APIs** — RESTful APIs for detections, incidents, hosts, IOCs, Real-Time Response, and more. All use OAuth2 client credentials.
2. **Falcon Query Language (FQL)** — Structured query syntax used across Falcon APIs and the Event Search console.
3. **SIEM Connector / Streaming API** — Event streaming via the Falcon SIEM Connector or Streaming API for external consumption.
4. **Falcon Fusion SOAR** — Workflow automation for detection response (requires separate license).
5. **CrowdStrike Store** — Marketplace apps (requires partner enrollment).

For threat hunting, Event Search and the Detections API are the primary query surfaces. This companion focuses on constructing FQL queries programmatically.

## Limitations

- The query builder generates FQL filter strings but does not execute them. Execution requires Falcon API credentials with appropriate scopes (Detections: Read, Hosts: Read, etc.).
- Detection correlation is a stub. Active correlation requires the surface-bridge to be running with a live case.
- FQL syntax varies slightly between API endpoints. The builder targets the Detections API filter format.
- CrowdStrike Marketplace integration requires partner enrollment — this companion cannot be distributed through the CrowdStrike Store without formal partnership.
- Real-Time Response session management is not included in this companion (requires elevated privileges and careful session lifecycle handling).

## Integration Architecture

```
CrowdStrike Falcon Console
  ├── Event Search (paste generated FQL queries)
  ├── Detections (correlate with THRUNT cases)
  └── Browser Extension Falcon Adapter (primary in-console surface)
        └── surface-bridge API (localhost:7483)
              └── THRUNT case state (.planning/)

CrowdStrike Falcon API (server-side)
  ├── /detects/queries/detects/v1 → crowdstrike-companion query builder
  ├── /detects/entities/summaries/GET/v1 → detection correlation
  └── /incidents/queries/incidents/v1 → incident linkage
```

The **browser extension's Falcon adapter** is the primary integration surface for analysts working in the Falcon console. This companion provides the FQL query construction and correlation logic used server-side.

## Future Path

- **Live query execution** — Execute FQL queries via the Falcon Detections API and return structured results to THRUNT connectors.
- **Real-Time Response helpers** — Session management and command builders for RTR investigations.
- **IOC management** — Push THRUNT hunt findings as custom IOCs into Falcon for detection.
- **Falcon Fusion integration** — Trigger Falcon Fusion workflows from THRUNT hunt state changes.
- **CrowdStrike Store app** — If partner enrollment is pursued, package this as a Marketplace app.

## Usage

```typescript
import { CrowdStrikeCompanion } from '@thrunt-surfaces/crowdstrike-falcon-companion';

const companion = new CrowdStrikeCompanion();

// Build an FQL detection query
const query = companion.buildDetectionQuery({
  hostFilter: 'WORKSTATION-01',
  tacticIds: ['TA0003'],
  techniqueIds: ['T1053.005'],
  severities: ['Critical', 'High'],
  since: '2025-01-01T00:00:00Z',
  limit: 200,
});

// Correlate a Falcon detection
const correlation = companion.correlateDetection('ldt:abc123:456');
```
