import { App, PluginSettingTab, Setting } from 'obsidian';
import type ThruntGodPlugin from './main';

export interface ThruntGodPluginSettings {
  planningDir: string;
}

export const DEFAULT_SETTINGS: ThruntGodPluginSettings = {
  planningDir: '.planning',
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
  }
}
