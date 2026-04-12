import { Modal, Notice, Setting } from 'obsidian';
import type { WorkspaceService } from './workspace';

// ---------------------------------------------------------------------------
// PromptModal -- simple multi-field text input modal
// ---------------------------------------------------------------------------

export interface PromptField {
  label: string;
  placeholder: string;
}

export class PromptModal extends Modal {
  private values: string[];

  constructor(
    app: import('obsidian').App,
    private title: string,
    private fields: PromptField[],
    private onSubmit: (values: string[]) => void,
  ) {
    super(app);
    this.values = fields.map(() => '');
  }

  onOpen(): void {
    this.titleEl.setText(this.title);

    for (let i = 0; i < this.fields.length; i++) {
      const field = this.fields[i]!;
      new Setting(this.contentEl)
        .setName(field.label)
        .addText((text) => {
          text.setPlaceholder(field.placeholder);
          text.onChange((value) => {
            this.values[i] = value;
          });
        });
    }

    new Setting(this.contentEl)
      .addButton((btn) => {
        btn.setButtonText('Submit')
          .setCta()
          .onClick(() => {
            this.close();
            this.onSubmit(this.values);
          });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
// CanvasTemplateModal -- template picker for canvas generation
// ---------------------------------------------------------------------------

export type CanvasTemplateName = 'kill-chain' | 'diamond' | 'lateral-movement' | 'hunt-progression';

export class CanvasTemplateModal extends Modal {
  constructor(
    app: import('obsidian').App,
    private onSelect: (template: CanvasTemplateName) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Generate Hunt Canvas');

    const templates: Array<{ label: string; value: CanvasTemplateName }> = [
      { label: 'ATT&CK Kill Chain', value: 'kill-chain' },
      { label: 'Diamond Model', value: 'diamond' },
      { label: 'Lateral Movement Map', value: 'lateral-movement' },
      { label: 'Hunt Progression', value: 'hunt-progression' },
    ];

    for (const tmpl of templates) {
      new Setting(this.contentEl)
        .setName(tmpl.label)
        .addButton((btn) => {
          btn.setButtonText('Generate')
            .setCta()
            .onClick(() => {
              this.close();
              this.onSelect(tmpl.value);
            });
        });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
// CompareHuntsModal -- hunt path picker for cross-hunt comparison (Phase 77)
// ---------------------------------------------------------------------------

export class CompareHuntsModal extends Modal {
  private huntAPath = '';
  private huntBPath = '';

  constructor(
    app: import('obsidian').App,
    private workspaceService: WorkspaceService,
    private onSubmit: (huntAPath: string, huntBPath: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Compare Hunts');

    new Setting(this.contentEl)
      .setName('Hunt A path')
      .setDesc('Vault-relative path to first hunt workspace')
      .addText((text) => {
        text.setPlaceholder('e.g. hunt-alpha');
        text.onChange((value) => { this.huntAPath = value; });
      });

    new Setting(this.contentEl)
      .setName('Hunt B path')
      .setDesc('Vault-relative path to second hunt workspace')
      .addText((text) => {
        text.setPlaceholder('e.g. hunt-bravo');
        text.onChange((value) => { this.huntBPath = value; });
      });

    new Setting(this.contentEl)
      .addButton((btn) => {
        btn.setButtonText('Compare')
          .setCta()
          .onClick(() => {
            if (!this.huntAPath || !this.huntBPath) {
              new Notice('Both hunt paths are required.');
              return;
            }
            this.close();
            this.onSubmit(this.huntAPath, this.huntBPath);
          });
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
