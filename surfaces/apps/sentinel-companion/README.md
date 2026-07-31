# @thrunt-surfaces/sentinel-companion

Companion integration for Microsoft Sentinel that provides workbook templates and playbook skeletons for THRUNT hunt workflows.

## What This Does

This companion generates JSON skeletons that can be deployed into a Microsoft Sentinel environment:

- **Workbook Template** — An Azure Workbook JSON structure that displays THRUNT case data (hypotheses, queries, findings, progress) alongside native Sentinel data. Import it into Sentinel as a custom workbook or deploy via ARM template.
- **Playbook Skeleton** — A Logic App definition that triggers on Sentinel incidents and calls the THRUNT surface-bridge API to open hunt cases. Deploy as an ARM template and configure the Sentinel automation rule to invoke it.

## How Sentinel Extensibility Works

Microsoft Sentinel does **not** have a traditional plugin model. There is no plugin SDK, no app store for custom panels, and no way to embed third-party UI directly in the Sentinel portal.

Sentinel extensibility is achieved through:

1. **Workbooks** — Built on Azure Monitor Workbooks. They display KQL queries, metrics, and custom visualizations. They can reference external data sources but run within the Azure portal.
2. **Playbooks** — Logic Apps triggered by Sentinel automation rules. They can call external APIs, enrich incidents, and take response actions.
3. **Data Connectors** — Ingest external data into the Log Analytics workspace so Sentinel can query it.
4. **Analytics Rules** — KQL-based detection rules that generate incidents.
5. **Hunting Queries** — Saved KQL queries for manual threat hunting.

This companion targets workbooks and playbooks because they are the most practical integration points for bridging THRUNT case state into the Sentinel workflow.

## Limitations

- The workbook template references the surface-bridge API endpoints. The bridge must be running and network-reachable from the workbook's custom API data source (which may require Azure Function proxying for production use).
- The playbook skeleton assumes a direct HTTP connection to the bridge. In production, you would replace the localhost URL with an Azure Function or API Management endpoint.
- Workbook custom API data sources are limited in capability compared to native KQL queries.
- This companion generates static templates — it does not dynamically sync state.

## Integration Architecture

```
Sentinel Portal
  ├── Workbook (displays THRUNT case data via custom API)
  ├── Playbook / Logic App (incident → bridge API → open case)
  └── Browser Extension Sentinel Adapter (primary in-console surface)
        └── surface-bridge API (localhost:7483)
              └── THRUNT case state (.planning/)
```

The **browser extension's Sentinel adapter** is the primary integration surface for analysts working in the Sentinel console. This companion provides the server-side/infrastructure templates that complement the browser-side experience.

## Future Path

- **Azure Function bridge proxy** — Deploy the surface-bridge as an Azure Function so workbooks and playbooks can reach it without localhost networking.
- **Custom Data Connector** — Ingest THRUNT case state (hypotheses, findings, receipts) into the Log Analytics workspace so native KQL queries can reference hunt data.
- **Bi-directional sync** — Sentinel incidents update THRUNT case state, and THRUNT findings create Sentinel incidents or bookmarks.
- **Hunting query library** — Generate saved hunting queries from THRUNT query logs so analysts can replay hunt queries natively in Sentinel.

## Usage

```typescript
import { SentinelCompanion } from '@thrunt-surfaces/sentinel-companion';

const companion = new SentinelCompanion();

// Generate a workbook template for deployment
const workbook = companion.generateWorkbookTemplate();
console.log(JSON.stringify(workbook, null, 2));

// Generate a playbook skeleton for deployment
const playbook = companion.generatePlaybookSkeleton();
console.log(JSON.stringify(playbook, null, 2));
```
