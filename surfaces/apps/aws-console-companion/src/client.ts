/**
 * @thrunt-surfaces/aws-console-companion — CloudTrail query helpers and IAM
 * context enrichment for AWS within THRUNT hunt workflows.
 */

import { SurfaceClient, type SurfaceClientOptions } from '@thrunt-surfaces/sdk';

/** Escape a string for safe interpolation in Athena SQL (Presto SQL dialect). */
function escapeAthenaString(value: string): string {
  return String(value).replace(/'/g, "''");
}

/** Escape a SQL identifier (database/table name) — reject invalid characters. */
function escapeAthenaIdentifier(value: string): string {
  // Only allow alphanumeric, underscore, and dot (for qualified names)
  if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }
  return value;
}

function normalizePositiveInt(value: number | undefined, fallback: number, max?: number): number {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return fallback;
  }
  const normalized = Math.floor(value as number);
  return max ? Math.min(normalized, max) : normalized;
}

export interface CloudTrailQueryParams {
  /** Query mode: 'lookup' for CloudTrail Lookup Events, 'athena' for Athena SQL */
  mode?: 'lookup' | 'athena';
  /** Event source filter (e.g., 'iam.amazonaws.com', 's3.amazonaws.com') */
  eventSource?: string;
  /** Event name filter (e.g., 'AssumeRole', 'PutObject') */
  eventName?: string;
  /** IAM user or role name to filter by */
  username?: string;
  /** AWS access key ID to search for */
  accessKeyId?: string;
  /** Source IP address */
  sourceIpAddress?: string;
  /** Resource ARN involved in the event */
  resourceArn?: string;
  /** Start time (ISO date string) */
  startTime?: string;
  /** End time (ISO date string) */
  endTime?: string;
  /** Read-only events, write-only events, or both */
  readOnly?: boolean;
  /** Maximum results for Lookup Events API (max 50) */
  maxResults?: number;
  /** Athena database name (for athena mode) */
  athenaDatabase?: string;
  /** Athena table name (for athena mode) */
  athenaTable?: string;
}

export interface IamEnrichmentResult {
  arn: string;
  vendor: 'aws';
  found: boolean;
  entityType: 'user' | 'role' | 'group' | 'policy' | 'unknown';
  data: Record<string, unknown>;
  enrichedAt: string;
}

export class AwsCompanion {
  protected readonly bridge: SurfaceClient;

  constructor(options?: SurfaceClientOptions) {
    this.bridge = new SurfaceClient(options);
  }

  /**
   * Build a CloudTrail query — either a LookupEvents API parameter set
   * or an Athena SQL query for querying CloudTrail logs stored in S3.
   *
   * Default mode is 'lookup' which targets the CloudTrail LookupEvents API.
   * Use 'athena' mode for historical queries beyond the 90-day CloudTrail
   * Event History retention.
   */
  buildCloudTrailQuery(params: CloudTrailQueryParams): string {
    const mode = params.mode ?? 'lookup';

    if (mode === 'athena') {
      return this.buildAthenaQuery(params);
    }

    return this.buildLookupQuery(params);
  }

  private buildLookupQuery(params: CloudTrailQueryParams): string {
    const lookupAttributes: Array<{ key: string; value: string }> = [];

    if (params.eventSource) {
      lookupAttributes.push({ key: 'EventSource', value: params.eventSource });
    }
    if (params.eventName) {
      lookupAttributes.push({ key: 'EventName', value: params.eventName });
    }
    if (params.username) {
      lookupAttributes.push({ key: 'Username', value: params.username });
    }
    if (params.accessKeyId) {
      lookupAttributes.push({ key: 'AccessKeyId', value: params.accessKeyId });
    }
    // Note: CloudTrail LookupEvents API does not support filtering by sourceIpAddress.
    // sourceIpAddress filtering is handled by Athena queries only.
    if (params.resourceArn) {
      lookupAttributes.push({ key: 'ResourceName', value: params.resourceArn });
    }

    const query: Record<string, unknown> = {
      _type: 'cloudtrail_lookup',
      LookupAttributes: lookupAttributes.length > 0
        ? lookupAttributes.map((attr) => ({
            AttributeKey: attr.key,
            AttributeValue: attr.value,
          }))
        : undefined,
      StartTime: params.startTime ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      EndTime: params.endTime ?? new Date().toISOString(),
      MaxResults: normalizePositiveInt(params.maxResults, 50, 50),
    };

    if (params.readOnly !== undefined) {
      query.ReadOnly = params.readOnly;
    }

    return JSON.stringify(query, null, 2);
  }

  private buildAthenaQuery(params: CloudTrailQueryParams): string {
    const database = escapeAthenaIdentifier(params.athenaDatabase ?? 'cloudtrail_logs');
    const table = escapeAthenaIdentifier(params.athenaTable ?? 'cloudtrail');

    const conditions: string[] = [];

    // Time range using partition pruning (year/month must use nested logic for cross-year correctness)
    if (params.startTime) {
      const start = new Date(params.startTime);
      const y = start.getUTCFullYear();
      const m = String(start.getUTCMonth() + 1).padStart(2, '0');
      conditions.push(
        `(year > '${y}' OR (year = '${y}' AND month >= '${m}'))`,
      );
      conditions.push(`eventtime >= '${escapeAthenaString(params.startTime)}'`);
    }
    if (params.endTime) {
      conditions.push(`eventtime <= '${escapeAthenaString(params.endTime)}'`);
    }

    if (params.eventSource) {
      conditions.push(`eventsource = '${escapeAthenaString(params.eventSource)}'`);
    }
    if (params.eventName) {
      conditions.push(`eventname = '${escapeAthenaString(params.eventName)}'`);
    }
    if (params.username) {
      conditions.push(`useridentity.username = '${escapeAthenaString(params.username)}'`);
    }
    if (params.accessKeyId) {
      conditions.push(`useridentity.accesskeyid = '${escapeAthenaString(params.accessKeyId)}'`);
    }
    if (params.sourceIpAddress) {
      conditions.push(`sourceipaddress = '${escapeAthenaString(params.sourceIpAddress)}'`);
    }
    if (params.resourceArn) {
      conditions.push(
        `json_array_contains(json_extract(requestparameters, '$.resources'), '${escapeAthenaString(params.resourceArn)}')`,
      );
    }
    if (params.readOnly !== undefined) {
      conditions.push(`readonly = '${params.readOnly ? 'true' : 'false'}'`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join('\n  AND ')}`
      : '';

    const limit = normalizePositiveInt(params.maxResults, 1000, 10_000);

    return [
      `SELECT`,
      `  eventtime,`,
      `  eventsource,`,
      `  eventname,`,
      `  useridentity.arn AS user_arn,`,
      `  useridentity.username AS username,`,
      `  sourceipaddress,`,
      `  useragent,`,
      `  requestparameters,`,
      `  responseelements,`,
      `  errorcode,`,
      `  errormessage`,
      `FROM "${database}"."${table}"`,
      whereClause,
      `ORDER BY eventtime DESC`,
      `LIMIT ${limit};`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Enrich an IAM entity (user, role, group, policy) by ARN.
   *
   * Returns a stub enrichment result. In production, this would call AWS IAM
   * APIs to resolve entity details, inline policies, attached policies, and
   * recent activity.
   */
  enrichIamEntity(arn: string): IamEnrichmentResult {
    const entityType = this.parseArnEntityType(arn);

    return {
      arn,
      vendor: 'aws',
      found: false,
      entityType,
      data: {
        _stub: true,
        _message: `AWS IAM enrichment for ${arn} — not yet connected to live API. Configure AWS credentials to enable.`,
        suggestedApiCalls: entityType === 'user'
          ? ['iam:GetUser', 'iam:ListAttachedUserPolicies', 'iam:ListUserPolicies', 'iam:GetLoginProfile']
          : entityType === 'role'
            ? ['iam:GetRole', 'iam:ListAttachedRolePolicies', 'iam:ListRolePolicies', 'iam:GetRolePolicy']
            : entityType === 'group'
              ? ['iam:GetGroup', 'iam:ListAttachedGroupPolicies', 'iam:ListGroupPolicies']
              : entityType === 'policy'
                ? ['iam:GetPolicy', 'iam:GetPolicyVersion', 'iam:ListEntitiesForPolicy']
                : ['sts:GetCallerIdentity'],
        parsedArn: this.parseArn(arn),
      },
      enrichedAt: new Date().toISOString(),
    };
  }

  private parseArnEntityType(arn: string): IamEnrichmentResult['entityType'] {
    if (arn.includes(':user/')) return 'user';
    if (arn.includes(':role/')) return 'role';
    if (arn.includes(':group/')) return 'group';
    if (arn.includes(':policy/')) return 'policy';
    return 'unknown';
  }

  private parseArn(arn: string): Record<string, string> {
    const parts = arn.split(':');
    return {
      partition: parts[1] ?? '',
      service: parts[2] ?? '',
      region: parts[3] ?? '',
      account: parts[4] ?? '',
      resource: parts.slice(5).join(':') ?? '',
    };
  }
}
