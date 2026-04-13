import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type ThruntGodPlugin from './main';
import type { McpClient } from './mcp-client';
import { DEFAULT_SIDEBAR_STATE, type SidebarState } from './sidebar-state';

// Re-export sidebar state types/values for convenience
export { DEFAULT_SIDEBAR_STATE, getEffectiveExpandedSections, type SidebarState } from './sidebar-state';

export interface ThruntGodPluginSettings {
  planningDir: string;
  mcpServerUrl: string;
  mcpEnabled: boolean;
  sidebarState: SidebarState;
  halfLifeDays: number;
  staleCoverageDays: number;
  liveCanvasEnabled: boolean;
  autoIngestionEnabled: boolean;
  autoIngestDebounceMs: number;
  huntPulseEnabled: boolean;
  mcpEventPollingEnabled: boolean;
  priorHuntSuggestionsEnabled: boolean;
  mcpPollIntervalMs: number;
  suggestionMinHunts: number;
}

export const DEFAULT_SETTINGS: ThruntGodPluginSettings = {
  planningDir: '.planning',
  mcpServerUrl: 'http://localhost:3100',
  mcpEnabled: false,
  sidebarState: DEFAULT_SIDEBAR_STATE,
  halfLifeDays: 90,
  staleCoverageDays: 90,
  liveCanvasEnabled: true,
  autoIngestionEnabled: true,
  autoIngestDebounceMs: 2000,
  huntPulseEnabled: true,
  mcpEventPollingEnabled: false,
  priorHuntSuggestionsEnabled: false,
  mcpPollIntervalMs: 10000,
  suggestionMinHunts: 2,
};

export class ThruntGodSettingTab extends PluginSettingTab {
  plugin: ThruntGodPlugin;

  constructor(app: App, plugin: ThruntGodPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Planning directory')
      .setDesc('Vault-relative THRUNT artifact directory, such as .planning or .hunt.')
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.planningDir)
          .setValue(this.plugin.settings.planningDir)
          .onChange(async (value) => {
            this.plugin.settings.planningDir = value.trim() || DEFAULT_SETTINGS.planningDir;
            await this.plugin.saveSettings();
          }),
      );

    // --- MCP Connection ---

    containerEl.createEl('h3', { text: 'MCP Connection' });

    new Setting(containerEl)
      .setName('Enable MCP')
      .setDesc('Connect to the THRUNT MCP server for enrichment features.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.mcpEnabled)
          .onChange(async (value) => {
            this.plugin.settings.mcpEnabled = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('MCP server URL')
      .setDesc('URL of the THRUNT MCP HTTP server.')
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.mcpServerUrl)
          .setValue(this.plugin.settings.mcpServerUrl)
          .onChange(async (value) => {
            this.plugin.settings.mcpServerUrl = value.trim() || DEFAULT_SETTINGS.mcpServerUrl;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Test connection')
      .setDesc('Verify the MCP server is reachable.')
      .addButton((button) =>
        button
          .setButtonText('Test')
          .onClick(async () => {
            const mcpClient = (this.plugin as unknown as { mcpClient?: McpClient }).mcpClient;
            if (!mcpClient) {
              new Notice('MCP client not initialized');
              return;
            }
            await mcpClient.connect();
            const health = await mcpClient.checkHealth();
            if (health && health.status === 'healthy') {
              new Notice(`MCP connected: ${health.toolCount} tools available (v${health.serverVersion})`);
            } else {
              new Notice('MCP connection failed. Check URL and server status.');
            }
          }),
      );

    // --- Intelligence ---

    containerEl.createEl('h3', { text: 'Intelligence' });

    new Setting(containerEl)
      .setName('Confidence decay half-life (days)')
      .setDesc('Days until confidence score decays to 50%. Default: 90.')
      .addText((text) =>
        text
          .setPlaceholder('90')
          .setValue(String(this.plugin.settings.halfLifeDays))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            this.plugin.settings.halfLifeDays = parsed > 0 ? parsed : DEFAULT_SETTINGS.halfLifeDays;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Stale coverage threshold (days)')
      .setDesc('Techniques not hunted within this many days are flagged stale. Default: 90.')
      .addText((text) =>
        text
          .setPlaceholder('90')
          .setValue(String(this.plugin.settings.staleCoverageDays))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            this.plugin.settings.staleCoverageDays = parsed > 0 ? parsed : DEFAULT_SETTINGS.staleCoverageDays;
            await this.plugin.saveSettings();
          }),
      );

    // --- Canvas ---

    containerEl.createEl('h3', { text: 'Canvas' });

    new Setting(containerEl)
      .setName('Live canvas updates')
      .setDesc('Auto-populate live hunt canvas and reactively update dashboard canvas.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.liveCanvasEnabled)
          .onChange(async (value) => {
            this.plugin.settings.liveCanvasEnabled = value;
            if (value) {
              this.plugin.enableLiveCanvas();
            } else {
              this.plugin.disableLiveCanvas();
            }
            await this.plugin.saveSettings();
          }),
      );

    // --- Live Hunt ---

    containerEl.createEl('h3', { text: 'Live Hunt' });

    new Setting(containerEl)
      .setName('Auto-ingestion')
      .setDesc('Automatically ingest new receipts and queries when they appear.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoIngestionEnabled)
          .onChange(async (value) => {
            this.plugin.settings.autoIngestionEnabled = value;
            if (value) {
              this.plugin.enableAutoIngestion();
            } else {
              this.plugin.disableAutoIngestion();
            }
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Auto-ingest debounce (ms)')
      .setDesc('Debounce interval for auto-ingestion. Default: 2000.')
      .addText((text) =>
        text
          .setPlaceholder('2000')
          .setValue(String(this.plugin.settings.autoIngestDebounceMs))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            this.plugin.settings.autoIngestDebounceMs = parsed > 0 ? parsed : DEFAULT_SETTINGS.autoIngestDebounceMs;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Hunt pulse')
      .setDesc('Show hunt activity indicator in the status bar.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.huntPulseEnabled)
          .onChange(async (value) => {
            this.plugin.settings.huntPulseEnabled = value;
            if (value) {
              this.plugin.enableHuntPulse();
            } else {
              this.plugin.disableHuntPulse();
            }
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('MCP event polling')
      .setDesc('Poll MCP server for CLI lifecycle events.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.mcpEventPollingEnabled)
          .onChange(async (value) => {
            this.plugin.settings.mcpEventPollingEnabled = value;
            if (value) {
              this.plugin.enableMcpEventPolling();
            } else {
              this.plugin.disableMcpEventPolling();
            }
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('MCP poll interval (ms)')
      .setDesc('How often to poll for CLI events. Default: 10000.')
      .addText((text) =>
        text
          .setPlaceholder('10000')
          .setValue(String(this.plugin.settings.mcpPollIntervalMs))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            this.plugin.settings.mcpPollIntervalMs = parsed > 0 ? parsed : DEFAULT_SETTINGS.mcpPollIntervalMs;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Prior-hunt suggestions')
      .setDesc('Show suggestions when entities match past hunts.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.priorHuntSuggestionsEnabled)
          .onChange(async (value) => {
            this.plugin.settings.priorHuntSuggestionsEnabled = value;
            if (value) {
              this.plugin.enablePriorHuntSuggestions();
            } else {
              this.plugin.disablePriorHuntSuggestions();
            }
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Suggestion minimum hunts')
      .setDesc('Minimum past hunts before suggestions appear. Default: 2.')
      .addText((text) =>
        text
          .setPlaceholder('2')
          .setValue(String(this.plugin.settings.suggestionMinHunts))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            this.plugin.settings.suggestionMinHunts = parsed > 0 ? parsed : DEFAULT_SETTINGS.suggestionMinHunts;
            await this.plugin.saveSettings();
          }),
      );
  }
}
