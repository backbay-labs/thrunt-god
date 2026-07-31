# @thrunt-surfaces/aws-console-companion

Companion integration for AWS that provides CloudTrail query helpers and IAM context enrichment within THRUNT hunt workflows.

## What This Does

- **CloudTrail Query Builder** — Generates either CloudTrail LookupEvents API parameters or Athena SQL queries from structured parameters. Use `lookup` mode for the CloudTrail Event History API (last 90 days) or `athena` mode for querying CloudTrail logs stored in S3 via Athena (unlimited retention).
- **IAM Entity Enrichment** — Stub enrichment for IAM entities (users, roles, groups, policies) by ARN. In production, this resolves entity details, attached policies, and recent activity via the IAM API.

## How AWS Console Extensibility Works

The AWS Management Console does **not** have a plugin model. There is no SDK for embedding custom UI, no app marketplace for console extensions, and no way to inject third-party functionality into the console.

Integration with AWS for security operations is achieved through:

1. **AWS APIs (SDK/CLI)** — Programmatic access to all AWS services including CloudTrail, IAM, GuardDuty, Security Hub, and CloudWatch.
2. **CloudTrail** — API activity logs. Event History provides 90 days of management events; S3 delivery + Athena provides unlimited historical queries.
3. **Security Hub** — Aggregated security findings from GuardDuty, Inspector, Macie, and third-party tools. Has an API for findings management.
4. **GuardDuty** — Managed threat detection with findings for anomalous IAM, network, and S3 activity.
5. **Athena** — SQL queries over CloudTrail logs, VPC Flow Logs, and other security data stored in S3.
6. **CloudWatch Logs Insights** — Query language for CloudWatch log groups.

For threat hunting, CloudTrail and Athena are the primary data sources. This companion focuses on making it easy to construct queries against them.

## Limitations

- CloudTrail LookupEvents API only supports a single attribute filter per request. If multiple attributes are specified, the companion generates them all but only the first will be applied by the API.
- Athena queries require a properly configured CloudTrail table in Athena. The companion assumes the standard partition scheme (year/month/day).
- IAM entity enrichment is a stub. Live enrichment requires AWS credentials with appropriate IAM read permissions.
- CloudTrail Event History is limited to management events for the last 90 days. Data events (S3, Lambda) require separate trail configuration.
- ARN parsing handles standard IAM ARN formats but may not correctly categorize all ARN types (e.g., assumed-role session ARNs).

## Integration Architecture

```
AWS Management Console
  └── Browser Extension AWS Adapter (primary in-console surface)
        └── surface-bridge API (localhost:7483)
              └── THRUNT case state (.planning/)

AWS APIs (server-side)
  ├── CloudTrail LookupEvents → aws-companion query builder (lookup mode)
  ├── Athena → aws-companion query builder (athena mode)
  ├── IAM API → aws-companion entity enrichment
  └── Security Hub / GuardDuty → future: findings correlation
```

The **browser extension's AWS adapter** is the primary integration surface for analysts working in the AWS console. This companion provides the query construction and enrichment logic used server-side.

## Future Path

- **Live IAM enrichment** — Connect to IAM APIs to resolve user profiles, role trust policies, attached policies, and last-used timestamps.
- **Security Hub integration** — Correlate Security Hub findings with THRUNT hunt hypotheses and automatically import relevant findings as evidence.
- **GuardDuty findings correlation** — Match GuardDuty detections against active hunt hypotheses.
- **VPC Flow Log queries** — Athena query builder for VPC Flow Logs (network-level telemetry).
- **AWS Organizations context** — Enrich with account hierarchy and service control policy context.
- **CloudWatch Logs Insights queries** — Query builder for application-level logs.

## Usage

```typescript
import { AwsCompanion } from '@thrunt-surfaces/aws-console-companion';

const companion = new AwsCompanion();

// Build a CloudTrail lookup query
const lookupQuery = companion.buildCloudTrailQuery({
  eventSource: 'iam.amazonaws.com',
  eventName: 'AssumeRole',
  username: 'suspect-user',
  startTime: '2025-01-01T00:00:00Z',
});

// Build an Athena SQL query for historical CloudTrail logs
const athenaQuery = companion.buildCloudTrailQuery({
  mode: 'athena',
  eventSource: 's3.amazonaws.com',
  sourceIpAddress: '10.0.0.1',
  startTime: '2024-06-01T00:00:00Z',
});

// Enrich an IAM entity
const enrichment = companion.enrichIamEntity('arn:aws:iam::123456789012:role/SuspiciousRole');
```
