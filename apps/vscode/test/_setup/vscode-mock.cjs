/**
 * Minimal vscode module mock for unit and smoke tests.
 *
 * The built CJS bundle (dist/extension.js) requires 'vscode' at the top level.
 * In the VS Code runtime this is provided by the host. For Node.js tests we
 * register a lightweight stub so require('vscode') resolves without error.
 *
 * Usage: require this file before requiring dist/extension.js, or pass
 *        --require test/_setup/vscode-mock.cjs to node.
 */
'use strict';

const Module = require('module');
const path = require('path');

// Only install if not already present (e.g. running inside VS Code)
try {
  require.resolve('vscode');
} catch {
  /**
   * Minimal EventEmitter matching VS Code's vscode.EventEmitter interface.
   */
  class MockEventEmitter {
    constructor() {
      this._listeners = [];
      this._disposed = false;
      this.event = (listener, thisArg, disposables) => {
        const wrapped = thisArg ? listener.bind(thisArg) : listener;
        this._listeners.push(wrapped);
        const disposable = { dispose: () => {
          const idx = this._listeners.indexOf(wrapped);
          if (idx >= 0) this._listeners.splice(idx, 1);
        }};
        if (Array.isArray(disposables)) {
          disposables.push(disposable);
        }
        return disposable;
      };
    }
    fire(data) {
      if (this._disposed) return;
      for (const listener of [...this._listeners]) {
        listener(data);
      }
    }
    dispose() {
      this._disposed = true;
      this._listeners.length = 0;
    }
  }

  /**
   * Mock FileSystemWatcher -- stores callbacks but never fires them
   * (test code drives changes explicitly via the store/watcher API).
   */
  class MockFileSystemWatcher {
    constructor() {
      this._onCreate = new MockEventEmitter();
      this._onChange = new MockEventEmitter();
      this._onDelete = new MockEventEmitter();
    }
    get onDidCreate() { return this._onCreate.event; }
    get onDidChange() { return this._onChange.event; }
    get onDidDelete() { return this._onDelete.event; }
    dispose() {
      this._onCreate.dispose();
      this._onChange.dispose();
      this._onDelete.dispose();
    }
  }

  // Track mock filesystem state for tests
  const _mockFiles = new Map();
  const _registeredCommands = new Map();
  const _executedCommands = [];
  const _createdWebviewPanels = [];
  const _registeredWebviewSerializers = new Map();
  const _themeEmitter = new MockEventEmitter();
  const _visibleEditorsEmitter = new MockEventEmitter();
  const _textDocumentEmitter = new MockEventEmitter();
  const _clipboardState = { text: '' };
  const _configurationValues = new Map();

  function createMemento(initialState = {}) {
    const values = new Map(Object.entries(initialState));
    return {
      _values: values,
      get(key, defaultValue) {
        return values.has(key) ? values.get(key) : defaultValue;
      },
      update(key, value) {
        values.set(key, value);
        return Promise.resolve();
      },
    };
  }

  function createMockTextDocument(input) {
    const text =
      typeof input === 'object' && input && 'content' in input && typeof input.content === 'string'
        ? input.content
        : '';
    const lines = text.length > 0 ? text.split(/\r?\n/) : [''];
    const languageId =
      typeof input === 'object' && input && 'language' in input && typeof input.language === 'string'
        ? input.language
        : 'plaintext';
    const uri =
      typeof input === 'string'
        ? { fsPath: input, scheme: 'file' }
        : (input && input.fsPath)
          ? input
          : { fsPath: '', scheme: 'untitled' };

    return {
      uri,
      languageId,
      lineCount: lines.length,
      lineAt: (line) => ({ text: lines[line] ?? '' }),
      getText: () => text,
    };
  }

  function getConfigurationValue(sectionPath, fallback) {
    if (_configurationValues.has(sectionPath)) {
      return _configurationValues.get(sectionPath);
    }
    return fallback;
  }

  function createWebviewPanel(viewType, title, showOptions, options) {
    const disposeEmitter = new MockEventEmitter();
    const messageEmitter = new MockEventEmitter();
    const panel = {
      viewType,
      title,
      options,
      showOptions,
      visible: true,
      _disposed: false,
      webview: {
        html: '',
        options,
        cspSource: 'vscode-resource:',
        _messages: [],
        asWebviewUri: (uri) => ({
          fsPath: uri.fsPath,
          path: uri.path,
          scheme: 'vscode-webview-resource',
          toString() {
            return `vscode-webview-resource:${uri.fsPath}`;
          },
        }),
        postMessage(message) {
          this._messages.push(message);
          return Promise.resolve(true);
        },
        onDidReceiveMessage: messageEmitter.event,
        _fireMessage(message) {
          messageEmitter.fire(message);
        },
      },
      onDidDispose: disposeEmitter.event,
      reveal(viewColumn, preserveFocus) {
        this.visible = true;
        this.showOptions = { viewColumn, preserveFocus };
      },
      dispose() {
        if (this._disposed) return;
        this._disposed = true;
        this.visible = false;
        disposeEmitter.fire();
        disposeEmitter.dispose();
        messageEmitter.dispose();
      },
    };
    _createdWebviewPanels.push(panel);
    return panel;
  }

  function createTreeView(id, options) {
    const selectionEmitter = new MockEventEmitter();
    return {
      id,
      options,
      selection: [],
      onDidChangeSelection: selectionEmitter.event,
      reveal: () => Promise.resolve(),
      dispose() {
        selectionEmitter.dispose();
      },
      _fireSelection(selection) {
        this.selection = selection;
        selectionEmitter.fire({ selection });
      },
    };
  }

  /**
   * Mock ThemeColor -- stores ID for assertion.
   */
  class MockThemeColor {
    constructor(id) {
      this.id = id;
    }
  }

  /**
   * Mock ThemeIcon -- stores ID and optional color for assertion.
   */
  class MockThemeIcon {
    constructor(id, color) {
      this.id = id;
      this.color = color;
    }
  }

  /**
   * Mock TreeItem -- base class for tree items.
   */
  class MockTreeItem {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  const mock = {
    // Expose MockEventEmitter for direct construction in extension code
    EventEmitter: MockEventEmitter,

    // Expose RelativePattern as a simple constructor
    RelativePattern: function RelativePattern(base, pattern) {
      this.base = base;
      this.pattern = pattern;
    },

    // Theme classes
    ThemeColor: MockThemeColor,
    ThemeIcon: MockThemeIcon,
    TreeItem: MockTreeItem,
    MarkdownString: function MarkdownString(value) {
      this.value = value;
    },

    // TreeItemCollapsibleState enum
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },

    // StatusBarAlignment enum
    StatusBarAlignment: {
      Left: 1,
      Right: 2,
    },

    ViewColumn: {
      Active: -1,
      Beside: 2,
    },

    ColorThemeKind: {
      Light: 1,
      Dark: 2,
      HighContrast: 3,
      HighContrastLight: 4,
    },

    // TextEditorRevealType enum
    TextEditorRevealType: {
      Default: 0,
      InCenterIfOutsideViewport: 1,
      InCenter: 2,
      AtTop: 3,
    },

    // Range constructor
    Range: function Range(startLine, startChar, endLine, endChar) {
      this.start = { line: startLine, character: startChar };
      this.end = { line: endLine, character: endChar };
    },

    Position: function Position(line, character) {
      this.line = line;
      this.character = character;
    },

    // Selection constructor
    Selection: function Selection(anchor, active) {
      this.anchor = anchor;
      this.active = active;
    },

    // CodeLens constructor
    CodeLens: function CodeLens(range, command) {
      this.range = range;
      this.command = command;
    },

    CodeAction: function CodeAction(title, kind) {
      this.title = title;
      this.kind = kind;
      this.diagnostics = [];
      this.edit = null;
    },

    WorkspaceEdit: function WorkspaceEdit() {
      this._edits = [];
    },

    Diagnostic: function Diagnostic(range, message, severity) {
      this.range = range;
      this.message = message;
      this.severity = severity;
      this.source = '';
    },

    CodeActionKind: {
      QuickFix: 'quickfix',
      Refactor: 'refactor',
    },

    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
      Information: 2,
      Hint: 3,
    },

    workspace: {
      workspaceFolders: undefined,
      getConfiguration: (section) => ({
        get: (key, defaultValue) => {
          if (!section) {
            return getConfigurationValue(key, defaultValue);
          }
          const pathKey = key ? `${section}.${key}` : section;
          return getConfigurationValue(pathKey, defaultValue);
        },
      }),
      createFileSystemWatcher: (_pattern, _ignoreCreate, _ignoreChange, _ignoreDelete) => {
        return new MockFileSystemWatcher();
      },
      fs: {
        stat: (uri) => {
          const p = typeof uri === 'string' ? uri : (uri.fsPath || uri.path || '');
          const entry = _mockFiles.get(p);
          if (entry) {
            return Promise.resolve({
              type: 1, // vscode.FileType.File
              ctime: entry.ctime || Date.now(),
              mtime: entry.mtime || Date.now(),
              size: entry.size || 0,
            });
          }
          return Promise.reject(new Error('mock: file not found: ' + p));
        },
        readFile: (uri) => {
          const p = typeof uri === 'string' ? uri : (uri.fsPath || uri.path || '');
          const entry = _mockFiles.get(p);
          if (entry && entry.content !== undefined) {
            // Return Uint8Array like VS Code does
            const buf = Buffer.from(entry.content, 'utf-8');
            return Promise.resolve(buf);
          }
          return Promise.reject(new Error('mock: file not found: ' + p));
        },
        readDirectory: (uri) => {
          // Return empty array -- tests populate via _mockFiles
          return Promise.resolve([]);
        },
      },
      openTextDocument: (uri) => Promise.resolve(createMockTextDocument(uri)),
      findFiles: (pattern) => {
        const basePath =
          pattern && typeof pattern === 'object'
            ? (pattern.base?.fsPath || pattern.base || '')
            : '';
        const files = [..._mockFiles.keys()]
          .filter((filePath) => filePath.endsWith('.md'))
          .filter((filePath) => (basePath ? filePath.startsWith(basePath) : true))
          .map((filePath) => ({ fsPath: filePath, path: filePath, scheme: 'file' }));
        return Promise.resolve(files);
      },
      onDidChangeTextDocument: _textDocumentEmitter.event,
      // Expose mock file store for test setup
      _mockFiles,
      _configurationValues,
      createMemento,
    },
    window: {
      _createdWebviewPanels,
      _themeEmitter,
      _visibleEditorsEmitter,
      activeColorTheme: { kind: 1 },
      activeTextEditor: undefined,
      visibleTextEditors: [],
      createOutputChannel: () => ({
        appendLine: () => {},
        show: () => {},
        clear: () => {},
        dispose: () => {},
      }),
      showInformationMessage: () => Promise.resolve(undefined),
      showWarningMessage: () => Promise.resolve(undefined),
      showErrorMessage: () => Promise.resolve(undefined),
      showInputBox: () => Promise.resolve(undefined),
      showQuickPick: () => Promise.resolve(undefined),
      showTextDocument: (doc) => {
        const editor = {
          revealRange: () => {},
          selection: null,
          document: doc,
          setDecorations: () => {},
        };
        mock.window.activeTextEditor = editor;
        mock.window.visibleTextEditors = [editor];
        return Promise.resolve(editor);
      },
      createWebviewPanel,
      createTreeView,
      onDidChangeActiveColorTheme: _themeEmitter.event,
      onDidChangeVisibleTextEditors: _visibleEditorsEmitter.event,
      registerTreeDataProvider: () => ({ dispose: () => {} }),
      createTextEditorDecorationType: (options = {}) => ({
        options,
        dispose: () => {},
      }),
      registerWebviewPanelSerializer: (viewType, serializer) => {
        _registeredWebviewSerializers.set(viewType, serializer);
        return {
          dispose: () => {
            _registeredWebviewSerializers.delete(viewType);
          },
        };
      },
      createStatusBarItem: (alignment, priority) => ({
        alignment,
        priority,
        text: '',
        tooltip: '',
        command: '',
        backgroundColor: undefined,
        color: undefined,
        show: function() { this._visible = true; },
        hide: function() { this._visible = false; },
        dispose: function() { this._disposed = true; },
        _visible: false,
        _disposed: false,
      }),
    },
    languages: {
      createDiagnosticCollection: (name) => {
        const diagnostics = new Map();
        return {
          name,
          set: (uri, entries) => {
            diagnostics.set(uri.fsPath, entries);
          },
          get: (uri) => diagnostics.get(uri.fsPath),
          delete: (uri) => diagnostics.delete(uri.fsPath),
          clear: () => diagnostics.clear(),
          forEach: (callback) => diagnostics.forEach((value, key) => callback(value, key)),
          dispose: function() {
            diagnostics.clear();
            this._disposed = true;
          },
          _disposed: false,
        };
      },
      registerCodeLensProvider: () => ({ dispose: () => {} }),
      registerCodeActionsProvider: () => ({ dispose: () => {} }),
    },
    commands: {
      _registry: _registeredCommands,
      _executed: _executedCommands,
      registerCommand: (name, callback) => {
        _registeredCommands.set(name, callback);
        return {
          dispose: () => {
            _registeredCommands.delete(name);
          },
        };
      },
      executeCommand: (name, ...args) => {
        _executedCommands.push({ name, args });
        const callback = _registeredCommands.get(name);
        if (callback) {
          return Promise.resolve(callback(...args));
        }
        return Promise.resolve(undefined);
      },
    },
    env: {
      clipboard: {
        writeText: (value) => {
          _clipboardState.text = value;
          return Promise.resolve();
        },
        readText: () => Promise.resolve(_clipboardState.text),
      },
    },
    Uri: {
      file: (fsPath) => ({ fsPath, path: fsPath, scheme: 'file' }),
      joinPath: (base, ...parts) => {
        const basePath = typeof base === 'string' ? base : (base.fsPath || '');
        const joined = path.join(basePath, ...parts);
        return { fsPath: joined, path: joined, scheme: 'file' };
      },
    },
    extensions: {
      getExtension: () => undefined,
    },
    _registeredWebviewSerializers,
    // File type enum stub
    FileType: {
      Unknown: 0,
      File: 1,
      Directory: 2,
      SymbolicLink: 64,
    },
  };

  mock.WorkspaceEdit.prototype.insert = function insert(uri, position, text) {
    this._edits.push({ uri, position, text });
  };

  // Inject into Node module cache so require('vscode') returns our mock
  const vscodeId = 'vscode';
  const resolveFilename = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === vscodeId) {
      return vscodeId;
    }
    return resolveFilename.call(this, request, parent, isMain, options);
  };

  require.cache[vscodeId] = {
    id: vscodeId,
    filename: vscodeId,
    loaded: true,
    exports: mock,
    paths: [],
    children: [],
    parent: null,
  };
}
