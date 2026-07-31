import { describe, test, expect } from 'bun:test';
import { GcpCompanion } from '../src/index.ts';

describe('GcpCompanion', () => {
  const companion = new GcpCompanion();

  test('can be instantiated', () => {
    expect(companion).toBeInstanceOf(GcpCompanion);
  });

  test('buildLoggingQuery generates filter with resource type', () => {
    const query = companion.buildLoggingQuery({ resource: 'gce_instance' });

    expect(query).toContain('resource.type="gce_instance"');
    expect(query).toContain('timestamp>=');
  });

  test('buildLoggingQuery generates filter with severity', () => {
    const query = companion.buildLoggingQuery({ severity: 'ERROR' });

    expect(query).toContain('severity>="ERROR"');
  });

  test('buildLoggingQuery generates filter with principal email', () => {
    const query = companion.buildLoggingQuery({
      principalEmail: 'attacker@evil.com',
    });

    expect(query).toContain('protoPayload.authenticationInfo.principalEmail="attacker@evil.com"');
  });

  test('buildLoggingQuery combines multiple filters with AND', () => {
    const query = companion.buildLoggingQuery({
      resource: 'gcs_bucket',
      severity: 'WARNING',
      principalEmail: 'user@example.com',
    });

    expect(query).toContain(' AND ');
    expect(query).toContain('resource.type="gcs_bucket"');
    expect(query).toContain('severity>="WARNING"');
    expect(query).toContain('protoPayload.authenticationInfo.principalEmail="user@example.com"');
  });

  test('buildLoggingQuery respects lookbackHours', () => {
    const query = companion.buildLoggingQuery({ lookbackHours: 48 });

    // Should contain a timestamp filter; exact value depends on Date.now()
    expect(query).toContain('timestamp>=');
  });

  test('buildLoggingQuery includes project scoped log name', () => {
    const query = companion.buildLoggingQuery({ projectId: 'my-project-123' });

    expect(query).toContain('logName="projects/my-project-123/logs/cloudaudit.googleapis.com');
  });

  test('buildLoggingQuery escapes literal values before interpolation', () => {
    const query = companion.buildLoggingQuery({
      principalEmail: 'attacker" OR severity>="CRITICAL',
      methodName: 'google.iam.admin.v1.CreateServiceAccount\nresource.type="*"',
    });

    expect(query).toContain('protoPayload.authenticationInfo.principalEmail="attacker\\" OR severity>=\\"CRITICAL"');
    expect(query).toContain('protoPayload.methodName="google.iam.admin.v1.CreateServiceAccount resource.type=\\"*\\""');
  });

  test('enrichServiceAccount parses service account email', () => {
    const result = companion.enrichServiceAccount(
      'my-sa@my-project.iam.gserviceaccount.com',
    );

    expect(result.type).toBe('service_account');
    expect(result.projectId).toBe('my-project');
    expect(result.name).toBe('my-sa');
    expect(result.vendor).toBe('gcp');
    expect(result.enrichedAt).toBeDefined();
  });

  test('enrichServiceAccount handles user email', () => {
    const result = companion.enrichServiceAccount('analyst@company.com');

    expect(result.type).toBe('user');
    expect(result.projectId).toBeNull();
    expect(result.name).toBe('analyst@company.com');
  });

  test('enrichServiceAccount returns stub data', () => {
    const result = companion.enrichServiceAccount(
      'compute@my-project.iam.gserviceaccount.com',
    );

    expect(result.found).toBe(false);
    expect(result.data._stub).toBe(true);
  });
});
