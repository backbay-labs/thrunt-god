# Native & Companion Integrations

## Integration Strategy

Not all platforms are created equal. The integration depth for each vendor is determined by:

1. **Does the platform have a plugin/app framework?** (Splunk yes, AWS no)
2. **Is the framework accessible without partner enrollment?** (Splunk yes, CrowdStrike no)
3. **Is the framework stable across versions?** (Splunk yes, Kibana partially)
4. **Does native integration provide value beyond the browser extension?** (Sometimes)

## Splunk App

**Type:** Native Splunk app

Splunk's app framework is well-documented and accessible. The scaffold includes:
- `app.conf` with metadata
- Dashboard XML with panels for case status, queries, and hypotheses
- Client-side JavaScript that fetches from the surface bridge
- Navigation XML for the app menu

**What it can do:**
- Display THRUNT case state in a Splunk dashboard
- Show recent queries and hypothesis status

**What it cannot do (yet):**
- Execute THRUNT queries through Splunk custom search commands
- Stream bridge events into Splunk indexes
- Trigger hunts from Splunk alerts

**Path to production:** Custom search commands → modular input → alert action → Splunkbase submission

## Elastic / Kibana Plugin

**Type:** Native Kibana plugin (version-coupled)

Kibana's plugin system requires matching the exact Kibana version. The scaffold includes:
- `kibana.json` plugin descriptor
- Plugin class with application registration
- Minimal app component that reads from the bridge

**Critical limitation:** The plugin must be rebuilt for each Kibana version. This makes maintenance expensive.

**Recommendation:** Invest in the browser extension's Elastic adapter first. The native plugin becomes worthwhile only when deep Kibana integration (saved objects, alerting, Lens) is needed.

## Microsoft Sentinel

**Type:** Companion package (no native plugin model)

Azure Sentinel extensibility is through Azure services, not embeddable plugins:
- **Workbooks** — Azure Monitor-based dashboards (JSON templates)
- **Playbooks** — Logic Apps triggered from incidents (ARM templates)
- **Data Connectors** — Ingest external data into the Sentinel workspace

The companion provides template generation for these artifacts. Real deployment requires an Azure subscription and permissions.

## Okta

**Type:** Companion package (no admin console plugin framework)

Okta's admin console has no plugin or extension mechanism. Integration options:
- **System Log API** — Programmatic query access
- **Okta Workflows** — Low-code automation (future integration)
- **Browser extension** — DOM extraction from the admin console

The companion provides query helpers for the System Log API format.

## M365 Defender

**Type:** Companion package

M365 Defender provides:
- **Advanced Hunting** — KQL query interface (accessible via API and browser)
- **Microsoft Graph Security API** — Programmatic incident access

The companion provides KQL query templates and Graph API helpers. The browser extension handles in-console evidence capture.

## CrowdStrike Falcon

**Type:** Companion package (Marketplace requires partner enrollment)

CrowdStrike's Falcon Marketplace allows third-party apps, but requires:
- Partner enrollment and approval
- Falcon Store listing process
- OAuth2 API client registration

The companion provides Falcon Event Search query helpers. The browser extension handles in-console capture from the Falcon UI.

## AWS Console

**Type:** Companion package (no console plugin model)

AWS has no mechanism for embedding third-party UI in the AWS Console. Integration is entirely API-driven:
- **CloudTrail** — Event history and Lake queries
- **Athena** — SQL queries over CloudTrail logs
- **EventBridge** — Event-driven automation

The companion provides CloudTrail query templates and IAM entity enrichment helpers.

## GCP Console

**Type:** Companion package (no console plugin model)

Same as AWS — no console plugin mechanism. Integration through:
- **Cloud Logging** — Filter-based log queries
- **Cloud Functions** — Event-driven automation
- **Chronicle SIEM** — If the customer uses Chronicle

The companion provides Cloud Logging filter helpers and service account enrichment.
