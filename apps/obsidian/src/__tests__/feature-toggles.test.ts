import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, type ThruntGodPluginSettings } from '../settings';

describe('Feature toggle settings', () => {
  it('DEFAULT_SETTINGS has autoIngestionEnabled: true', () => {
    expect(DEFAULT_SETTINGS.autoIngestionEnabled).toBe(true);
  });

  it('DEFAULT_SETTINGS has autoIngestDebounceMs: 2000', () => {
    expect(DEFAULT_SETTINGS.autoIngestDebounceMs).toBe(2000);
  });

  it('DEFAULT_SETTINGS has huntPulseEnabled: true', () => {
    expect(DEFAULT_SETTINGS.huntPulseEnabled).toBe(true);
  });

  it('DEFAULT_SETTINGS has mcpEventPollingEnabled: false', () => {
    expect(DEFAULT_SETTINGS.mcpEventPollingEnabled).toBe(false);
  });

  it('DEFAULT_SETTINGS has priorHuntSuggestionsEnabled: false', () => {
    expect(DEFAULT_SETTINGS.priorHuntSuggestionsEnabled).toBe(false);
  });

  it('ThruntGodPluginSettings interface includes all 5 new fields', () => {
    // Compile-time check: this object must satisfy the full interface
    const settings: ThruntGodPluginSettings = {
      ...DEFAULT_SETTINGS,
      autoIngestionEnabled: false,
      autoIngestDebounceMs: 500,
      huntPulseEnabled: false,
      mcpEventPollingEnabled: true,
      priorHuntSuggestionsEnabled: true,
    };

    expect(settings.autoIngestionEnabled).toBe(false);
    expect(settings.autoIngestDebounceMs).toBe(500);
    expect(settings.huntPulseEnabled).toBe(false);
    expect(settings.mcpEventPollingEnabled).toBe(true);
    expect(settings.priorHuntSuggestionsEnabled).toBe(true);
  });
});
