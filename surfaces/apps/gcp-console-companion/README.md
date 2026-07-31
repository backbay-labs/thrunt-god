# @thrunt-surfaces/gcp-console-companion

Companion integration for GCP that provides Cloud Logging query helpers and service account enrichment within THRUNT hunt workflows.

## What This Does

- **Cloud Logging Query Builder** — Generates Cloud Logging filter expressions from structured parameters. The output is compatible with the Cloud Logging API's `entries.list` method, the `gcloud logging read` CLI command, and the Logs Explorer UI filter bar.
- **Service Account Enrichment** — Stub enrichment for GCP identities by email. Distinguishes service accounts from user accounts and extracts project context. In production, this resolves IAM bindings, key metadata, and role assignments via the IAM API.

## How GCP Console Extensibility Works

The Google Cloud Console does **not** have a plugin model. There is no SDK for embedding custom UI, no app marketplace for console extensions, and no way to inject third-party functionality into the console.

Integration with GCP for security operations is achieved through:

1. **GCP APIs (Client Libraries / gcloud CLI)** — Programmatic access to all GCP services including Cloud Logging, IAM, Security Command Center, and Cloud Audit Logs.
2. **Cloud Logging** — Centralized log storage and query engine. Admin Activity audit logs are enabled by default and retained for 400 days. Data Access audit logs require explicit enablement.
3. **Cloud Audit Logs** — Audit trails for API calls. Includes Admin Activity, Data Access, System Event, and Policy Denied log types.
4. **Security Command Center** — Aggregated security findings from Event Threat Detection, Container Threat Detection, and Web Security Scanner.
5. **IAM Recommender** — Identifies overprivileged roles and suggests least-privilege alternatives.
6. **Chronicle / Google SecOps** — SIEM platform for security telemetry correlation (separate product from Cloud Console).

For threat hunting, Cloud Logging and Cloud Audit Logs are the primary data sources accessible through the console. This companion focuses on making it easy to construct filter expressions for them.

## Limitations

- Cloud Logging filter syntax differs from SQL. This companion generates filter expressions, not SQL queries.
- Service account enrichment is a stub. Live enrichment requires GCP credentials with appropriate IAM read permissions (`iam.serviceAccounts.get`, `resourcemanager.projects.getIamPolicy`).
- Cloud Audit Logs retention depends on log type: Admin Activity (400 days), Data Access (30 days default), System Event (400 days). Historical queries beyond retention require log sinks to BigQuery or Cloud Storage.
- The query builder targets single-project scope. Cross-project queries require organization-level log sinks or aggregated exports.
- Data Access audit logs are disabled by default for most services and must be explicitly enabled per project.

## Integration Architecture

```
Google Cloud Console
  +-- Browser Extension GCP Adapter (primary in-console surface)
        +-- surface-bridge API (localhost:7483)
              +-- THRUNT case state (.planning/)

GCP APIs (server-side)
  |-- Cloud Logging API -> gcp-companion query builder
  |-- IAM API -> gcp-companion service account enrichment
  +-- Security Command Center -> future: findings correlation
```

The **browser extension's GCP adapter** is the primary integration surface for analysts working in the Google Cloud Console. This companion provides the query construction and enrichment logic used server-side.

## Future Path

- **Live IAM enrichment** — Connect to IAM APIs to resolve service account keys, role bindings, and last-authenticated timestamps.
- **Security Command Center integration** — Correlate SCC findings with THRUNT hunt hypotheses and import relevant findings as evidence.
- **BigQuery audit log queries** — Query builder for audit logs exported to BigQuery (SQL syntax, unlimited retention).
- **VPC Flow Log queries** — Filter builder for VPC Flow Logs stored in Cloud Logging.
- **Organization policy context** — Enrich with org policy constraints and IAM hierarchy context.
- **Chronicle integration** — Query builder for Chronicle YARA-L detection rules and UDM searches.

## Usage

```typescript
import { GcpCompanion } from '@thrunt-surfaces/gcp-console-companion';

const companion = new GcpCompanion();

// Build a Cloud Logging filter for suspicious activity
const filter = companion.buildLoggingQuery({
  resource: 'gce_instance',
  severity: 'WARNING',
  principalEmail: 'suspect@example.com',
  lookbackHours: 48,
});

// Build a project-scoped audit log filter
const auditFilter = companion.buildLoggingQuery({
  projectId: 'production-project',
  methodName: 'google.iam.admin.v1.CreateServiceAccountKey',
  lookbackHours: 72,
});

// Enrich a service account
const enrichment = companion.enrichServiceAccount(
  'my-sa@my-project.iam.gserviceaccount.com',
);
```
