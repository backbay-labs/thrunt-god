// Lightweight stub of the Obsidian API for unit tests.
// The real "obsidian" npm package is types-only (no JS entrypoint).

export class Notice {
  constructor(_message: string, _timeout?: number) {}
}

export class Modal {
  app: any;
  constructor(app: any) {
    this.app = app;
  }
  open() {}
  close() {}
}

export class Setting {
  constructor(_containerEl: any) {}
  setName(_name: string) { return this; }
  setDesc(_desc: string) { return this; }
  addText(_cb: any) { return this; }
  addToggle(_cb: any) { return this; }
  addDropdown(_cb: any) { return this; }
  addButton(_cb: any) { return this; }
}

export class PluginSettingTab {
  app: any;
  plugin: any;
  containerEl: any = { empty() {}, createEl() { return {}; } };
  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
  }
  display() {}
}

export class Plugin {
  app: any = {};
  addCommand(_cmd: any) {}
  addSettingTab(_tab: any) {}
  registerView(_type: string, _factory: any) {}
  loadData() { return Promise.resolve({}); }
  saveData(_data: any) { return Promise.resolve(); }
}

export class TFile {
  path = '';
  name = '';
  basename = '';
  extension = '';
}

export class TFolder {
  path = '';
  name = '';
  children: any[] = [];
}

export class ItemView {
  app: any;
  containerEl: any = { empty() {}, children: [] };
  constructor(leaf: any) {
    this.app = leaf?.app;
  }
  getViewType() { return ''; }
  getDisplayText() { return ''; }
}

export type WorkspaceLeaf = any;
export type App = any;

export function requestUrl(_opts: any) {
  return Promise.resolve({ json: {}, text: '' });
}
