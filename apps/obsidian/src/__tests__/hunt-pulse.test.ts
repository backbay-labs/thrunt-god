import { describe, it, expect } from 'vitest';
import { formatHuntPulse } from '../hunt-pulse';

describe('formatHuntPulse', () => {
  it('returns "lightning idle" when lastActivityTimestamp is 0', () => {
    const result = formatHuntPulse(0, Date.now(), 0);
    expect(result).toBe('\u26A1 idle');
  });

  it('returns "lightning idle" when now - lastActivityTimestamp > 300000 (5 min)', () => {
    const now = 1000000;
    const lastActivity = now - 300001; // just over 5 minutes
    const result = formatHuntPulse(lastActivity, now, 1);
    expect(result).toBe('\u26A1 idle');
  });

  it('returns "lightning 1 artifact (30s ago)" for single recent artifact at 30s', () => {
    const now = 1000000;
    const lastActivity = now - 30000; // 30 seconds ago
    const result = formatHuntPulse(lastActivity, now, 1);
    expect(result).toBe('\u26A1 1 artifact (30s ago)');
  });

  it('returns "lightning 3 artifacts (120s ago)" for plural artifacts at 120s', () => {
    const now = 1000000;
    const lastActivity = now - 120000; // 120 seconds ago
    const result = formatHuntPulse(lastActivity, now, 3);
    expect(result).toBe('\u26A1 3 artifacts (120s ago)');
  });

  it('returns "lightning 1 artifact (0s ago)" at exact timestamp match', () => {
    const now = 1000000;
    const result = formatHuntPulse(now, now, 1);
    expect(result).toBe('\u26A1 1 artifact (0s ago)');
  });

  it('returns "lightning idle" at exactly 300001ms (just over boundary)', () => {
    const now = 1000000;
    const lastActivity = now - 300001;
    const result = formatHuntPulse(lastActivity, now, 1);
    expect(result).toBe('\u26A1 idle');
  });

  it('returns "lightning 1 artifact (299s ago)" at exactly 299999ms (just under boundary)', () => {
    const now = 1000000;
    const lastActivity = now - 299999;
    const result = formatHuntPulse(lastActivity, now, 1);
    expect(result).toBe('\u26A1 1 artifact (299s ago)');
  });
});
