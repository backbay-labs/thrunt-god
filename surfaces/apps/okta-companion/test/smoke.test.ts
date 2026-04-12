import { describe, test, expect } from 'bun:test';
import { OktaCompanion } from '../src/index.ts';

describe('OktaCompanion', () => {
  const companion = new OktaCompanion();

  test('can be instantiated', () => {
    expect(companion).toBeInstanceOf(OktaCompanion);
  });

  test('buildSystemLogQuery returns valid QuerySpec with defaults', () => {
    const query = companion.buildSystemLogQuery({});

    expect(query).toBeDefined();
    expect(query.connector?.id).toBe('okta');
    expect(query.dataset?.kind).toBe('events');
    expect(query.dataset?.name).toBe('system_log');
    expect(query.time_window?.start).toBeDefined();
    expect(query.time_window?.end).toBeDefined();
    expect(query.pagination?.mode).toBe('cursor');
  });

  test('buildSystemLogQuery includes actor filter', () => {
    const query = companion.buildSystemLogQuery({
      actorId: 'user-123',
      eventTypes: ['user.session.start'],
    });

    expect(query.query?.statement).toContain('actor.id eq "user-123"');
    expect(query.query?.statement).toContain('eventType eq "user.session.start"');
  });

  test('buildSystemLogQuery includes free-text query', () => {
    const query = companion.buildSystemLogQuery({
      q: 'suspicious login',
    });

    expect(query.parameters).toHaveProperty('q', 'suspicious login');
  });

  test('enrichEntity returns valid enrichment result', () => {
    const result = companion.enrichEntity('user', 'john.doe@example.com');

    expect(result).toBeDefined();
    expect(result.entityType).toBe('user');
    expect(result.value).toBe('john.doe@example.com');
    expect(result.vendor).toBe('okta');
    expect(result.enrichedAt).toBeDefined();
    expect(typeof result.data).toBe('object');
  });

  test('enrichEntity handles different entity types', () => {
    const userResult = companion.enrichEntity('user', 'test@example.com');
    const groupResult = companion.enrichEntity('group', 'admins');
    const appResult = companion.enrichEntity('app', 'app-456');

    expect(userResult.entityType).toBe('user');
    expect(groupResult.entityType).toBe('group');
    expect(appResult.entityType).toBe('app');
  });
});
