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
}

export const DEFAULT_SETTINGS: ThruntGodPluginSettings = {
  planningDir: '.planning',
  mcpServerUrl: 'http://localhost:3100',
  mcpEnabled: false,
  sidebarState: DEFAULT_SIDEBAR_STATE,
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
  }
}
