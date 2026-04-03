import * as vscode from 'vscode';
import { resolveArtifactType } from './watcher';
import { findIOCMatchesInText, formatIOCTypeLabel } from './iocRegistry';
import type { IOCRegistry } from './iocRegistry';

const MAX_DECORATIONS_PER_IOC = 500;

function isDecoratedDocument(document: vscode.TextDocument): boolean {
  if (document.uri.scheme !== 'file') {
    return false;
  }

  const resolved = resolveArtifactType(document.uri.fsPath);
  return resolved?.type === 'query' || resolved?.type === 'receipt';
}

function toPosition(text: string, offset: number): vscode.Position {
  let line = 0;
  let character = 0;

  for (let index = 0; index < offset; index += 1) {
    if (text[index] === '\n') {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }

  return new vscode.Position(line, character);
}

export class IOCDecorationManager implements vscode.Disposable {
  private readonly decorationType: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly registry: IOCRegistry) {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      border: '1px solid rgba(255, 165, 0, 0.6)',
      backgroundColor: 'rgba(255, 165, 0, 0.18)',
      overviewRulerColor: 'rgba(255, 165, 0, 0.8)',
    });

    this.disposables.push(
      this.registry.onDidChange(() => {
        this.applyAll();
      })
    );
    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors(() => {
        this.applyAll();
      })
    );
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.visibleTextEditors.find(
          (candidate) => candidate.document.uri.fsPath === event.document.uri.fsPath
        );
        if (editor) {
          this.applyToEditor(editor);
        }
      })
    );

    this.applyAll();
  }

  applyAll(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.applyToEditor(editor);
    }
  }

  dispose(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
    this.decorationType.dispose();
  }

  private applyToEditor(editor: vscode.TextEditor): void {
    if (!isDecoratedDocument(editor.document)) {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const text = editor.document.getText();
    const decorations: vscode.DecorationOptions[] = [];

    for (const entry of this.registry.list()) {
      const matches = findIOCMatchesInText(
        text,
        entry.value,
        entry.type,
        MAX_DECORATIONS_PER_IOC
      );

      for (const match of matches) {
        const start = toPosition(text, match.index);
        const end = toPosition(text, match.index + match.length);
        decorations.push({
          range: new vscode.Range(
            start.line,
            start.character,
            end.line,
            end.character
          ),
          hoverMessage: new vscode.MarkdownString(
            `IOC: ${entry.value} (${formatIOCTypeLabel(entry.type)})`
          ),
        });
      }
    }

    editor.setDecorations(this.decorationType, decorations);
  }
}
