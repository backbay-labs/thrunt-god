import { describe, test, expect } from 'bun:test';
import { AwsCompanion } from '../src/index.ts';

describe('AwsCompanion', () => {
  const companion = new AwsCompanion();

  test('can be instantiated', () => {
    expect(companion).toBeInstanceOf(AwsCompanion);
  });

  test('buildCloudTrailQuery returns valid lookup query by default', () => {
    const query = companion.buildCloudTrailQuery({
      eventSource: 'iam.amazonaws.com',
      eventName: 'AssumeRole',
    });

    expect(query).toBeDefined();
    expect(typeof query).toBe('string');

    const parsed = JSON.parse(query);
    expect(parsed._type).toBe('cloudtrail_lookup');
    expect(parsed.LookupAttributes).toBeArray();
    expect(parsed.LookupAttributes.length).toBe(2);
    expect(parsed.MaxResults).toBe(50);
  });

  test('buildCloudTrailQuery lookup includes time range', () => {
    const query = companion.buildCloudTrailQuery({
      startTime: '2025-01-01T00:00:00Z',
      endTime: '2025-01-31T23:59:59Z',
    });

    const parsed = JSON.parse(query);
    expect(parsed.StartTime).toBe('2025-01-01T00:00:00Z');
    expect(parsed.EndTime).toBe('2025-01-31T23:59:59Z');
  });

  test('buildCloudTrailQuery athena mode returns SQL', () => {
    const query = companion.buildCloudTrailQuery({
      mode: 'athena',
      eventSource: 's3.amazonaws.com',
      eventName: 'PutObject',
      sourceIpAddress: '10.0.0.1',
    });

    expect(query).toContain('SELECT');
    expect(query).toContain('FROM');
    expect(query).toContain("eventsource = 's3.amazonaws.com'");
    expect(query).toContain("eventname = 'PutObject'");
    expect(query).toContain("sourceipaddress = '10.0.0.1'");
    expect(query).toContain('ORDER BY eventtime DESC');
    expect(query).toContain('LIMIT');
  });

  test('buildCloudTrailQuery athena mode uses custom database/table', () => {
    const query = companion.buildCloudTrailQuery({
      mode: 'athena',
      athenaDatabase: 'security_lake',
      athenaTable: 'ct_events',
    });

    expect(query).toContain('"security_lake"."ct_events"');
  });

  test('enrichIamEntity returns valid result for user ARN', () => {
    const result = companion.enrichIamEntity('arn:aws:iam::123456789012:user/admin');

    expect(result).toBeDefined();
    expect(result.arn).toBe('arn:aws:iam::123456789012:user/admin');
    expect(result.vendor).toBe('aws');
    expect(result.entityType).toBe('user');
    expect(result.enrichedAt).toBeDefined();
    expect(typeof result.data).toBe('object');
  });

  test('enrichIamEntity detects role ARN', () => {
    const result = companion.enrichIamEntity('arn:aws:iam::123456789012:role/LambdaExecutionRole');

    expect(result.entityType).toBe('role');
  });

  test('enrichIamEntity detects policy ARN', () => {
    const result = companion.enrichIamEntity('arn:aws:iam::aws:policy/AdministratorAccess');

    expect(result.entityType).toBe('policy');
  });

  test('enrichIamEntity handles unknown ARN format', () => {
    const result = companion.enrichIamEntity('arn:aws:s3:::my-bucket');

    expect(result.entityType).toBe('unknown');
  });
});
