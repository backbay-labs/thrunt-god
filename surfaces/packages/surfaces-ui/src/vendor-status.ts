/**
 * Vendor status indicators — shows connection state for each platform.
 */

export type VendorConnectionStatus = 'connected' | 'detected' | 'unavailable' | 'unknown';

export interface VendorStatusViewModel {
  vendorId: string;
  displayName: string;
  status: VendorConnectionStatus;
  statusIcon: string;
  lastSeen: string | null;
}

const VENDOR_DISPLAY_NAMES: Record<string, string> = {
  splunk: 'Splunk',
  elastic: 'Elastic / Kibana',
  sentinel: 'Microsoft Sentinel',
  okta: 'Okta',
  m365_defender: 'M365 Defender',
  crowdstrike: 'CrowdStrike Falcon',
  aws: 'AWS Console',
  gcp: 'GCP Console',
  jira: 'Jira',
  confluence: 'Confluence',
  servicenow: 'ServiceNow',
};

export function toVendorStatus(
  vendorId: string,
  status: VendorConnectionStatus,
  lastSeen: string | null = null,
): VendorStatusViewModel {
  const icons: Record<VendorConnectionStatus, string> = {
    connected: '\u25CF',
    detected: '\u25D0',
    unavailable: '\u25CB',
    unknown: '?',
  };
  return {
    vendorId,
    displayName: VENDOR_DISPLAY_NAMES[vendorId] ?? vendorId,
    status,
    statusIcon: icons[status],
    lastSeen,
  };
}
