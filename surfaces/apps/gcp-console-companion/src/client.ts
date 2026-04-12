/**
 * @thrunt-surfaces/gcp-console-companion — Cloud Logging query helpers and
 * service account enrichment for GCP within THRUNT hunt workflows.
 */

export interface CloudLoggingQueryParams {
  /** Resource type filter (e.g., 'gce_instance', 'gcs_bucket', 'k8s_container') */
  resource?: string;
  /** Minimum severity level (e.g., 'WARNING', 'ERROR', 'CRITICAL') */
  severity?: string;
  /** Principal email filter for audit logs */
  principalEmail?: string;
  /** Method name filter (e.g., 'google.iam.admin.v1.CreateServiceAccount') */
  methodName?: string;
  /** GCP project ID scope */
  projectId?: string;
  /** Lookback window in hours (default: 24) */
  lookbackHours?: number;
  /** Additional raw filter expression to append */
  rawFilter?: string;
}

export interface ServiceAccountEnrichmentResult {
  email: string;
  vendor: 'gcp';
  found: boolean;
  type: 'service_account' | 'user';
  projectId: string | null;
  name: string;
  data: Record<string, unknown>;
  enrichedAt: string;
}

export class GcpCompanion {
  /**
   * Build a Cloud Logging filter expression from structured parameters.
   *
   * Produces a filter string compatible with the Cloud Logging API's
   * `entries.list` method and the `gcloud logging read` CLI command.
   */
  buildLoggingQuery(params: CloudLoggingQueryParams): string {
    const filters: string[] = [];

    if (params.resource) {
      filters.push(`resource.type="${params.resource}"`);
    }
    if (params.severity) {
      filters.push(`severity>="${params.severity}"`);
    }
    if (params.principalEmail) {
      filters.push(`protoPayload.authenticationInfo.principalEmail="${params.principalEmail}"`);
    }
    if (params.methodName) {
      filters.push(`protoPayload.methodName="${params.methodName}"`);
    }
    if (params.projectId) {
      filters.push(`logName="projects/${params.projectId}/logs/cloudaudit.googleapis.com%2Factivity"`);
    }
    if (params.rawFilter) {
      filters.push(params.rawFilter);
    }

    const hours = params.lookbackHours ?? 24;
    filters.push(`timestamp>="${new Date(Date.now() - hours * 3600000).toISOString()}"`);

    return filters.join(' AND ');
  }

  /**
   * Enrich a GCP identity by email address.
   *
   * Distinguishes service accounts (name@project.iam.gserviceaccount.com)
   * from user accounts. In production, this would call the IAM API to resolve
   * roles, permissions, and key metadata.
   */
  enrichServiceAccount(email: string): ServiceAccountEnrichmentResult {
    const match = email.match(/^(.+)@(.+)\.iam\.gserviceaccount\.com$/);

    if (match) {
      return {
        email,
        vendor: 'gcp',
        found: false,
        type: 'service_account',
        projectId: match[2],
        name: match[1],
        data: {
          _stub: true,
          _message: `GCP IAM enrichment for ${email} — not yet connected to live API. Configure GCP credentials to enable.`,
          suggestedApiCalls: [
            'iam.projects.serviceAccounts.get',
            'iam.projects.serviceAccounts.keys.list',
            'cloudresourcemanager.projects.getIamPolicy',
          ],
        },
        enrichedAt: new Date().toISOString(),
      };
    }

    return {
      email,
      vendor: 'gcp',
      found: false,
      type: 'user',
      projectId: null,
      name: email,
      data: {
        _stub: true,
        _message: `GCP user enrichment for ${email} — not yet connected to live API.`,
        suggestedApiCalls: [
          'admin.directory.users.get',
          'cloudresourcemanager.projects.getIamPolicy',
        ],
      },
      enrichedAt: new Date().toISOString(),
    };
  }
}
