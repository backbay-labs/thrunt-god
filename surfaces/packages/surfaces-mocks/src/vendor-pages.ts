import type { VendorPageContext, ExtractedQuery, ExtractedTable, ExtractedEntity } from '@thrunt-surfaces/contracts';

export interface MockVendorPage {
  context: VendorPageContext;
  query: ExtractedQuery | null;
  table: ExtractedTable | null;
  entities: ExtractedEntity[];
}

export const mockVendorPages: Record<string, MockVendorPage> = {
  splunk: {
    context: {
      vendorId: 'splunk',
      consoleName: 'Splunk Enterprise',
      pageType: 'search',
      pageUrl: 'https://splunk.example.com/en-US/app/search/search',
      pageTitle: 'Search | Splunk',
      metadata: { app: 'search', view: 'search' },
    },
    query: {
      language: 'spl',
      statement: 'index=main sourcetype=okta:log action=user.session.refresh | stats count by actor.displayName, client.ipAddress',
      timeRange: { start: '2026-04-08T00:00:00Z', end: '2026-04-11T23:59:59Z' },
    },
    table: {
      headers: ['actor.displayName', 'client.ipAddress', 'count'],
      rows: [
        ['svc-analytics', '198.51.100.45', '1423'],
        ['svc-reporting', '198.51.100.46', '892'],
        ['svc-backup', '203.0.113.12', '567'],
      ],
      totalRows: 3,
      truncated: false,
    },
    entities: [
      { type: 'ip', value: '198.51.100.45', context: 'Suspicious token refresh source' },
      { type: 'ip', value: '198.51.100.46', context: 'Suspicious token refresh source' },
      { type: 'user', value: 'svc-analytics', context: 'Service account with anomalous refresh' },
    ],
  },
  elastic: {
    context: {
      vendorId: 'elastic',
      consoleName: 'Kibana',
      pageType: 'search',
      pageUrl: 'https://kibana.example.com/app/discover',
      pageTitle: 'Discover | Kibana',
      metadata: { space: 'security', dataView: 'logs-*' },
    },
    query: {
      language: 'esql',
      statement: 'FROM logs-okta* | WHERE event.action == "user.session.refresh" | STATS count = COUNT(*) BY user.name, source.ip',
      timeRange: { start: '2026-04-08T00:00:00Z', end: '2026-04-11T23:59:59Z' },
    },
    table: {
      headers: ['user.name', 'source.ip', 'count'],
      rows: [
        ['svc-analytics', '198.51.100.45', '1423'],
        ['svc-reporting', '198.51.100.46', '892'],
      ],
      totalRows: 2,
      truncated: false,
    },
    entities: [
      { type: 'ip', value: '198.51.100.45' },
      { type: 'user', value: 'svc-analytics' },
    ],
  },
  sentinel: {
    context: {
      vendorId: 'sentinel',
      consoleName: 'Microsoft Sentinel',
      pageType: 'log_viewer',
      pageUrl: 'https://portal.azure.com/#view/Microsoft_Azure_Security_Insights/MainMenuBlade/~/6',
      pageTitle: 'Logs | Microsoft Sentinel',
      metadata: { workspace: 'SOC-Prod' },
    },
    query: {
      language: 'kql',
      statement: 'SigninLogs | where AppDisplayName has "oauth" | summarize count() by UserPrincipalName, IPAddress',
      timeRange: { start: '2026-04-08T00:00:00Z', end: '2026-04-11T23:59:59Z' },
    },
    table: null,
    entities: [
      { type: 'user', value: 'svc-analytics@contoso.com' },
      { type: 'ip', value: '198.51.100.45' },
    ],
  },
  okta: {
    context: {
      vendorId: 'okta',
      consoleName: 'Okta Admin Console',
      pageType: 'log_viewer',
      pageUrl: 'https://admin.example.okta.com/admin/syslog',
      pageTitle: 'System Log | Okta',
      metadata: { org: 'example' },
    },
    query: null,
    table: null,
    entities: [
      { type: 'user', value: 'svc-analytics' },
      { type: 'ip', value: '198.51.100.45' },
    ],
  },
  aws: {
    context: {
      vendorId: 'aws',
      consoleName: 'AWS CloudTrail',
      pageType: 'log_viewer',
      pageUrl: 'https://console.aws.amazon.com/cloudtrail/home#/events',
      pageTitle: 'Event history | CloudTrail',
      metadata: { region: 'us-east-1', accountId: '123456789012' },
    },
    query: null,
    table: {
      headers: ['Event name', 'User name', 'Source IP address', 'Event time'],
      rows: [
        ['ListBuckets', 'svc-analytics', '198.51.100.45', '2026-04-11T08:45:00Z'],
        ['GetUser', 'svc-analytics', '198.51.100.45', '2026-04-11T08:46:00Z'],
      ],
      totalRows: 347,
      truncated: true,
    },
    entities: [
      { type: 'ip', value: '198.51.100.45' },
      { type: 'user', value: 'svc-analytics' },
    ],
  },
  gcp: {
    context: {
      vendorId: 'gcp',
      consoleName: 'Google Cloud Logging',
      pageType: 'log_viewer',
      pageUrl: 'https://console.cloud.google.com/logs/query',
      pageTitle: 'Logs Explorer | Google Cloud',
      metadata: { projectId: 'my-project-123' },
    },
    query: {
      language: 'logging_query',
      statement: 'resource.type="gce_instance" AND protoPayload.authenticationInfo.principalEmail="svc-analytics@my-project.iam.gserviceaccount.com"',
    },
    table: null,
    entities: [
      { type: 'email', value: 'svc-analytics@my-project.iam.gserviceaccount.com' },
    ],
  },
};
